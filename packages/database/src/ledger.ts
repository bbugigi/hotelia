import { Prisma, type Folio, type FolioLineItem } from '@prisma/client';
import { prisma } from './client';

export class LedgerError extends Error {
  constructor(
    public code:
      | 'BUSINESS_DAY_CLOSED'
      | 'FOLIO_CLOSED'
      | 'ITEM_NOT_FOUND'
      | 'ITEM_ALREADY_REVERSED'
      | 'FOLIO_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export interface PostLineItemInput {
  folioId: string;
  propertyId: string;
  sourceModule: FolioLineItem['sourceModule'];
  description: string;
  quantity?: number;
  unitPrice: number;
  taxRate?: number;
  discountAmount?: number;
  postedBy?: string;
  businessDate?: Date;
}

export interface ReverseLineItemInput {
  propertyId: string;
  lineItemId: string;
  reversedBy: string;
  reason: string;
}

export interface TransferItemInput {
  propertyId: string;
  lineItemId: string;
  fromFolioId: string;
  toFolioId: string;
  reason: string;
  transferredBy: string;
}

/**
 * Loophole #5 / #2 fixes — immutable ledger core.
 *
 * Once the night audit closes a business day, that day's line items are
 * immutable. The only correction path is a REVERSAL line item stamped on the
 * CURRENT active business date; retroactive UPDATE/DELETE is refused at the
 * service layer here (and enforced by ACLs + the closed day's `status` row).
 */
export async function assertBusinessDayOpen(propertyId: string, businessDate: Date): Promise<void> {
  const day = await prisma.businessDay.findFirst({ where: { propertyId, businessDate } });
  if (day && day.status === 'CLOSED') {
    throw new LedgerError(
      'BUSINESS_DAY_CLOSED',
      `Business day ${businessDate.toISOString().slice(0, 10)} is CLOSED — corrections must be posted as reversals on the active business date`,
    );
  }
}

export async function postLineItem(input: PostLineItemInput): Promise<any> {
  return prisma.$transaction(async (tx) => {
    const folio = await tx.folio.findFirst({
      where: { id: input.folioId, propertyId: input.propertyId },
    });
    if (!folio) throw new LedgerError('FOLIO_MISMATCH', `Folio ${input.folioId} does not exist`);
    if (folio.status !== 'OPEN')
      throw new LedgerError('FOLIO_CLOSED', `Folio ${input.folioId} is not OPEN`);

    const businessDate = input.businessDate ?? new Date();
    await assertBusinessDayOpen(input.propertyId, businessDate);
    if (!input.businessDate) {
      const active = await tx.businessDay.findFirst({
        where: { propertyId: input.propertyId, status: 'OPEN' },
        orderBy: { businessDate: 'desc' },
      });
      if (active && active.businessDate.toDateString() !== businessDate.toDateString()) {
        // Posting happens on the *active* business day, never a closed one.
        businessDate.setDate(active.businessDate.getDate());
        businessDate.setHours(0, 0, 0, 0);
      }
    }

    const quantity = input.quantity ?? 1;
    const taxRate = input.taxRate ?? 0;
    const gross = Math.round(input.unitPrice * quantity * 100) / 100;
    const discount = input.discountAmount ?? 0;
    const taxAmount = Math.round((gross - discount) * taxRate * 100) / 100;
    const total = gross - discount + taxAmount;

    const item = await tx.folioLineItem.create({
      data: {
        folioId: input.folioId,
        kind: 'CHARGE',
        sourceModule: input.sourceModule,
        description: input.description,
        quantity,
        unitPrice: input.unitPrice,
        taxRate,
        taxAmount,
        discountAmount: discount,
        total,
        businessDate,
        metadata: { postedBy: input.postedBy },
        postedBy: input.postedBy,
      },
    });

    await tx.folio.update({
      where: { id: input.folioId },
      data: { balance: { increment: total } },
    });
    return item;
  });
}

/**
 * The ONLY allowed mutation of a closed original item. Posts a new REVERSAL
 * line item on the active business day and slips the balance the other way.
 * The original row itself is untouched (immutability preserved for audits).
 */
export async function reverseLineItem(input: ReverseLineItemInput): Promise<any> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.folioLineItem.findUnique({
      where: { id: input.lineItemId },
      include: { folio: true },
    });
    if (!original)
      throw new LedgerError('ITEM_NOT_FOUND', `Line item ${input.lineItemId} not found`);
    if (original.kind === 'REVERSAL')
      throw new LedgerError(
        'ITEM_ALREADY_REVERSED',
        `Line item ${input.lineItemId} is already a reversal`,
      );

    // Refuse to un-void a closed business day by editing it; reversals always
    // land on the current business date.
    const sameDayReverse = await tx.folioLineItem.findFirst({
      where: {
        reversesItemId: original.id,
        kind: 'REVERSAL',
      },
    });
    if (sameDayReverse)
      throw new LedgerError(
        'ITEM_ALREADY_REVERSED',
        `Line item already reversed (${sameDayReverse.id})`,
      );

    const reversal = await tx.folioLineItem.create({
      data: {
        folioId: original.folioId,
        kind: 'REVERSAL',
        sourceModule: original.sourceModule,
        description: `REVERSAL: ${original.description}`,
        quantity: original.quantity,
        unitPrice: original.unitPrice,
        taxRate: original.taxRate,
        taxAmount: -original.taxAmount,
        discountAmount: -original.discountAmount,
        total: -original.total,
        businessDate: new Date(),
        metadata: {
          reason: input.reason,
          reversedBy: input.reversedBy,
          originalItemId: original.id,
        },
        postedBy: input.reversedBy,
        reversesItemId: original.id,
      },
    });

    await tx.folio.update({
      where: { id: original.folioId },
      data: { balance: { increment: -original.total } },
    });
    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: input.reversedBy,
        action: 'VALIDATED_REVERSAL',
        entityType: 'folio_line_items',
        entityId: reversal.id,
        newValue: Prisma.JsonNull,
        oldValue: Prisma.JsonNull,
      },
    });
    return { reversal, original };
  });
}

/**
 * Loophole #2 fix — move a line item between folios atomically
 * (roommates splitting a dinner, or handover to the company folio).
 * The item's balance is removed from the source folio and added to the target.
 */
export async function transferFolioItem(input: TransferItemInput): Promise<any> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.folioLineItem.findUnique({ where: { id: input.lineItemId } });
    if (!item) throw new LedgerError('ITEM_NOT_FOUND', `Line item ${input.lineItemId} not found`);
    if (item.folioId === input.toFolioId)
      throw new LedgerError('FOLIO_MISMATCH', 'Source and target folios are identical');

    const fromFolio = await tx.folio.findFirst({
      where: { id: input.fromFolioId, propertyId: input.propertyId },
    });
    const toFolio = await tx.folio.findFirst({
      where: { id: input.toFolioId, propertyId: input.propertyId },
    });
    if (!fromFolio || !toFolio)
      throw new LedgerError('FOLIO_MISMATCH', 'One of the folios does not exist in this property');

    await assertBusinessDayOpen(input.propertyId, item.businessDate);

    await tx.folioTransfer.create({
      data: {
        fromFolioId: input.fromFolioId,
        toFolioId: input.toFolioId,
        lineItemId: item.id,
        amount: item.total,
        reason: input.reason,
        transferredBy: input.transferredBy,
      },
    });
    await tx.folio.update({
      where: { id: input.fromFolioId },
      data: { balance: { decrement: item.total } },
    });
    await tx.folio.update({
      where: { id: input.toFolioId },
      data: { balance: { increment: item.total } },
    });
    return item;
  });
}

export interface CloseBusinessDayInput {
  propertyId: string;
  businessDate: Date;
  closedBy: string;
  cutoffTime?: string;
}

/**
 * Night audit — freeze a business day. Sums the day's posted/reversed line
 * items into a snapshot, then flips the BusinessDay row to CLOSED. After this
 * returns, `assertBusinessDayOpen` refuses every further write to that date
 * (loophole #5 fix).
 */
export async function closeBusinessDay(input: CloseBusinessDayInput): Promise<any> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.businessDay.findFirst({
      where: { propertyId: input.propertyId, businessDate: input.businessDate },
    });
    if (existing?.status === 'CLOSED') {
      throw new LedgerError(
        'BUSINESS_DAY_CLOSED',
        `Business day ${input.businessDate.toISOString().slice(0, 10)} already closed`,
      );
    }

    const window = {
      gte: new Date(
        input.businessDate.getFullYear(),
        input.businessDate.getMonth(),
        input.businessDate.getDate(),
      ),
      lt: new Date(
        input.businessDate.getFullYear(),
        input.businessDate.getMonth(),
        input.businessDate.getDate() + 1,
      ),
    };

    const items = await tx.folioLineItem.findMany({ where: { businessDate: window } });
    const netRevenue = items.reduce((acc, i) => acc + Number(i.total) - Number(i.taxAmount), 0);
    const taxCollected = items.reduce((acc, i) => acc + Number(i.taxAmount), 0);
    const roomRevenue = items
      .filter((i) => i.sourceModule === 'ROOM')
      .reduce((acc, i) => acc + Number(i.total), 0);

    const snapshot = {
      lineItemCount: items.length,
      charges: items.filter((i) => i.total.greaterThan(0)).length,
      reversals: items.filter((i) => i.kind === 'REVERSAL').length,
      closedAt: new Date().toISOString(),
    };

    const day = await tx.businessDay.upsert({
      where: {
        propertyId_businessDate: { propertyId: input.propertyId, businessDate: input.businessDate },
      },
      create: {
        propertyId: input.propertyId,
        businessDate: input.businessDate,
        status: 'CLOSED',
        cutoffTime: input.cutoffTime ?? '03:00',
        closedAt: new Date(),
        closedBy: input.closedBy,
        netRevenue: Math.round(netRevenue * 100) / 100,
        roomRevenue: Math.round(roomRevenue * 100) / 100,
        taxCollected: Math.round(taxCollected * 100) / 100,
        reportSnapshot: snapshot,
      },
      update: {
        status: 'CLOSED',
        cutoffTime: input.cutoffTime ?? '03:00',
        closedAt: new Date(),
        closedBy: input.closedBy,
        netRevenue: Math.round(netRevenue * 100) / 100,
        roomRevenue: Math.round(roomRevenue * 100) / 100,
        taxCollected: Math.round(taxCollected * 100) / 100,
        reportSnapshot: snapshot,
      },
    });

    await tx.auditLog.create({
      data: {
        propertyId: input.propertyId,
        userId: input.closedBy,
        action: 'NIGHT_AUDIT_CLOSED',
        entityType: 'business_days',
        entityId: day.id,
        newValue: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    return day;
  });
}
