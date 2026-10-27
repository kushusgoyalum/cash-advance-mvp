import { PrismaClient } from '@prisma/mongodb-client';

let client: PrismaClient | undefined;

/** Mongo holds non-money data (BRE traces, bureau reports, API logs, webhook inbox). */
export const getMongoDBClient = (): PrismaClient => {
  client ??= new PrismaClient();
  return client;
};

export const disconnectMongoDB = async (): Promise<void> => {
  await client?.$disconnect();
  client = undefined;
};
