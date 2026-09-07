import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const property = await prisma.property.create({
    data: {
      name: 'Boutique Harbor Hotel',
      slug: 'boutique-harbor',
      address1: '123 Harbor Blvd',
      city: 'San Diego',
      stateProv: 'California',
      country: 'USA',
      postalCode: '92101',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      phone: '+1-619-555-0123',
      email: 'info@boutiqueharbor.com',
      config: {
        roomsTotal: 48,
        floors: 4,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        taxRules: [
          { name: 'City TOT', rate: 0.105, appliesTo: ['ROOM', 'POS_FOOD', 'POS_BEVERAGE'] },
          { name: 'CA Tourism Fee', rate: 0.01, appliesTo: ['ROOM'] },
        ],
      },
    },
  });

  console.log(`  Created property: ${property.name} (${property.id})`);

  // Create rooms
  const rooms: Array<{
    propertyId: string;
    number: string;
    floor: number;
    type: 'STANDARD' | 'SUPERIOR' | 'DELUXE' | 'SUITE';
    baseRate: number;
    maxOccupancy: number;
    bedConfig: string;
    amenities: string[];
  }> = [];

  for (let floor = 1; floor <= 4; floor++) {
    for (let num = 1; num <= 12; num++) {
      const roomNum = `${floor}${String(num).padStart(2, '0')}`;
      let type: 'STANDARD' | 'SUPERIOR' | 'DELUXE' | 'SUITE';
      let baseRate: number;
      let bedConfig: string;
      let maxOccupancy: number;

      if (floor <= 2 && num <= 8) {
        type = 'STANDARD';
        baseRate = 189;
        bedConfig = 'queen';
        maxOccupancy = 2;
      } else if (floor <= 3 && num <= 10) {
        type = 'SUPERIOR';
        baseRate = 249;
        bedConfig = 'king';
        maxOccupancy = 2;
      } else if (num <= 10) {
        type = 'DELUXE';
        baseRate = 329;
        bedConfig = 'king';
        maxOccupancy = 3;
      } else {
        type = 'SUITE';
        baseRate = 489;
        bedConfig = 'king';
        maxOccupancy = 4;
      }

      rooms.push({
        propertyId: property.id,
        number: roomNum,
        floor,
        type,
        baseRate,
        maxOccupancy,
        bedConfig,
        amenities: floor >= 3 ? ['city_view', 'minibar'] : ['minibar'],
      });
    }
  }

  await prisma.room.createMany({ data: rooms });
  console.log(`  Created ${rooms.length} rooms`);

  // Create staff
  const staffUsers = await Promise.all([
    prisma.staffUser.create({
      data: {
        propertyId: property.id,
        email: 'manager@boutiqueharbor.com',
        firstName: 'Maria',
        lastName: 'Santos',
        role: 'GENERAL_MANAGER',
        phone: '+1-619-555-0100',
      },
    }),
    prisma.staffUser.create({
      data: {
        propertyId: property.id,
        email: 'frontdesk@boutiqueharbor.com',
        firstName: 'Alex',
        lastName: 'Chen',
        role: 'FRONT_DESK',
        phone: '+1-619-555-0101',
      },
    }),
    prisma.staffUser.create({
      data: {
        propertyId: property.id,
        email: 'housekeeping@boutiqueharbor.com',
        firstName: 'Rosa',
        lastName: 'Garcia',
        role: 'HOUSEKEEPING_SUPERVISOR',
        phone: '+1-619-555-0102',
      },
    }),
  ]);

  console.log(`  Created ${staffUsers.length} staff users`);

  // Create a rate plan
  await prisma.ratePlan.createMany({
    data: [
      {
        propertyId: property.id,
        name: 'Best Available Rate',
        roomType: 'STANDARD',
        baseRate: 189,
        includesBreakfast: false,
        cancellationPolicy: 'flexible',
        minStay: 1,
      },
      {
        propertyId: property.id,
        name: 'Superior B&B',
        roomType: 'SUPERIOR',
        baseRate: 249,
        includesBreakfast: true,
        cancellationPolicy: 'moderate',
        minStay: 1,
      },
      {
        propertyId: property.id,
        name: 'Deluxe Suite',
        roomType: 'SUITE',
        baseRate: 489,
        includesBreakfast: true,
        cancellationPolicy: 'strict',
        minStay: 2,
      },
    ],
  });

  console.log('  Created rate plans');

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
