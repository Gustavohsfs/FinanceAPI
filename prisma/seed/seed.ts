import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client.js';

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error('DIRECT_URL is required to run the seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  await prisma.$queryRaw`SELECT 1`;
} finally {
  await prisma.$disconnect();
}
