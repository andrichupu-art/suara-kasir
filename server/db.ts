import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  products,
  transactionItems,
  transactions,
  users,
  type InsertProduct,
  type InsertTransaction,
  type InsertTransactionItem,
  type InsertUser,
} from "../drizzle/schema.js";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  await db
    .insert(users)
    .values({
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: user.lastSignedIn ?? new Date(),
      role: user.role ?? "user",
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: new Date(),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getStoreSnapshot() {
  const db = getDb();
  if (!db) throw new Error("Database belum dikonfigurasi.");
  const [productRows, transactionRows, itemRows] = await Promise.all([
    db.select().from(products),
    db.select().from(transactions),
    db.select().from(transactionItems),
  ]);
  return {
    products: productRows,
    transactions: transactionRows.map(transaction => ({
      ...transaction,
      items: itemRows.filter(item => item.transactionId === transaction.id),
    })),
  };
}

export async function migrateStoreData(
  productRows: InsertProduct[],
  transactionRows: InsertTransaction[],
  itemRows: InsertTransactionItem[],
) {
  const db = getDb();
  if (!db) throw new Error("Database belum dikonfigurasi.");

  if (productRows.length) {
    await db.insert(products).values(productRows).onConflictDoUpdate({
      target: products.id,
      set: {
        name: sql`excluded."name"`,
        price: sql`excluded."price"`,
        stock: sql`excluded."stock"`,
        category: sql`excluded."category"`,
        color: sql`excluded."color"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
    });
  }
  if (transactionRows.length) {
    await db.insert(transactions).values(transactionRows).onConflictDoNothing();
  }
  if (itemRows.length) {
    await db.insert(transactionItems).values(itemRows).onConflictDoNothing();
  }
  return getStoreSnapshot();
}
