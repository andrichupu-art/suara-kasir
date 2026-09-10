import { integer, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const products = pgTable("products", {
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  category: varchar("category", { length: 80 }).notNull(),
  color: varchar("color", { length: 120 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  createdAt: timestamp("createdAt").notNull(),
  total: integer("total").notNull(),
  payment: varchar("payment", { length: 32 }).notNull(),
});

export const transactionItems = pgTable("transaction_items", {
  id: varchar("id", { length: 160 }).primaryKey(),
  transactionId: varchar("transactionId", { length: 128 }).notNull(),
  productId: varchar("productId", { length: 128 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  price: integer("price").notNull(),
  quantity: integer("quantity").notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type TransactionItem = typeof transactionItems.$inferSelect;
export type InsertTransactionItem = typeof transactionItems.$inferInsert;
