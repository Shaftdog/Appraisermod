import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").$type<'appraiser' | 'reviewer' | 'admin'>().notNull().default('appraiser'),
  fullName: text("full_name").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  clientName: text("client_name").notNull(),
  dueDate: timestamp("due_date"),
  overallStatus: text("overall_status").$type<'green' | 'yellow' | 'red'>().notNull().default('green'),
  tabs: jsonb("tabs").notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const versions = pgTable("versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  tabKey: text("tab_key").notNull(),
  label: text("label").notNull(),
  author: text("author").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  versions: many(versions),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  versions: many(versions),
}));

export const versionsRelations = relations(versions, ({ one }) => ({
  order: one(orders, {
    fields: [versions.orderId],
    references: [orders.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  role: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVersionSchema = createInsertSchema(versions).omit({
  id: true,
  createdAt: true,
});

// Login schema for authentication
export const loginUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertVersion = z.infer<typeof insertVersionSchema>;
export type Version = typeof versions.$inferSelect;
export type UserRole = 'appraiser' | 'reviewer' | 'admin';

// Frontend types
export type RiskStatus = 'green' | 'yellow' | 'red';

export type TabKey =
  | 'orderSummary'
  | 'subject'
  | 'market'
  | 'comps'
  | 'sketch'
  | 'photos'
  | 'cost'
  | 'reconciliation'
  | 'qcSignoff'
  | 'exports';

export interface TabQC {
  status: RiskStatus;
  openIssues: number;
  overriddenIssues: number;
  lastReviewedBy?: string;
  lastReviewedAt?: string; // ISO
}

export interface Signoff {
  state: 'unsigned' | 'signed-appraiser' | 'signed-reviewer';
  signedBy?: string;
  signedAt?: string; // ISO
  overrideReason?: string; // required if signing with red status
}

export interface VersionSnapshot {
  id: string;             // e.g., ISO timestamp or UUID
  label: string;          // "v1 • 2025-09-12 10:33"
  author: string;
  createdAt: string;      // ISO
  data: Record<string, any>; // arbitrary payload for the current tab
}

export interface TabState {
  key: TabKey;
  qc: TabQC;
  signoff: Signoff;
  versions: VersionSnapshot[];
  currentData: Record<string, any>;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  clientName: string;
  dueDate?: string;
  overallStatus: RiskStatus;
  tabs: Record<TabKey, TabState>;
}
