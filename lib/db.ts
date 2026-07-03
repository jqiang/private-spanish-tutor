import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// libSQL adapter works for both a local SQLite file (dev) and Turso (prod).
// Dev:  DATABASE_URL="file:./dev.db"
// Prod: DATABASE_URL="libsql://<db>.turso.io", TURSO_AUTH_TOKEN="<token>"
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
