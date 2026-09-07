export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxRule {
  id: string;
  name: string;
  /** Rate as decimal fraction, e.g. 0.10 for 10% */
  rate: number;
}

export interface TaxLine {
  ruleId: string;
  name: string;
  rate: number;
  amount: number;
}

export interface NormalizedRate {
  netAmount: number;
  grossAmount: number;
  taxAmount: number;
  taxItems: TaxLine[];
  /** true when the source amount already included tax (e.g. Booking.com gross) */
  wasInclusive: boolean;
  currency: string;
}

export interface RateNormalizationInput {
  amount: number;
  currency: string;
  /** false = the source sent NET (e.g. Expedia); true = source sent GROSS (e.g. Booking.com) */
  isGross: boolean;
  taxRules: TaxRule[];
}

/**
 * Loophole #6 fix — the ONE standard every OTA adapter must obey.
 *
 * Booking.com quotes *gross* (tax embedded in some regions), Expedia quotes
 * *net* (tax added at checkout). Before any price touches the PMS event bus,
 * the adapter pushes it through `normalizeRate` so the core only ever sees
 * `netAmount + itemizedTax[]`. The reverse (`taxesToGross`) regenerates the
 * quoted display price for the channel outbound.
 */
export class TaxEngine {
  static normalizeRate(input: RateNormalizationInput): NormalizedRate {
    const { amount, currency, isGross, taxRules } = input;
    const totalTaxRate = taxRules.reduce((acc, r) => acc + r.rate, 0);

    let netAmount: number;
    if (isGross) {
      // Gross = net * (1 + Σrates)
      netAmount = round2(amount / (1 + totalTaxRate));
    } else {
      netAmount = round2(amount);
    }

    const grossAmount = round2(netAmount * (1 + totalTaxRate));
    const taxItems: TaxLine[] = taxRules.map((r) => ({
      ruleId: r.id,
      name: r.name,
      rate: r.rate,
      amount: round2(netAmount * r.rate),
    }));
    const taxAmount = round2(taxItems.reduce((a, t) => a + t.amount, 0));

    return {
      netAmount,
      grossAmount,
      taxAmount,
      taxItems,
      wasInclusive: isGross,
      currency,
    };
  }

  /** Convenience guard: two numbers equal within 1 cent (avoids float drift). */
  static approxEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.005;
  }
}

/** For outbound: reconstruct the quoted gross price for a channel. */
export function taxesToGross(
  netAmount: number,
  taxRules: TaxRule[],
): { gross: number; taxes: TaxLine[] } {
  const n = TaxEngine.normalizeRate({
    amount: netAmount,
    currency: 'USD',
    isGross: false,
    taxRules,
  });
  return { gross: n.grossAmount, taxes: n.taxItems };
}
