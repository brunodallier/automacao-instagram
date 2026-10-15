import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createDatabaseClient(connectionString: string, max = 5) {
  const adapter = new PrismaPg({
    connectionString,
    max,
    connectionTimeoutMillis: 5000,
  });
  return new PrismaClient({ adapter });
}

// A conexão só é aberta na primeira consulta; o build não exige banco ativo.
export const db =
  globalForPrisma.prisma ??
  createDatabaseClient(
    process.env.DATABASE_URL ?? "postgresql://localhost/automacao_instagram",
  );
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
