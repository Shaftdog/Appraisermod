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

// Weights & Presets Types
export type WeightKey = 'distance' | 'recency' | 'gla' | 'quality' | 'condition';

export interface WeightSet {
  distance: number;   // 0..10
  recency: number;    // 0..10
  gla: number;        // 0..10
  quality: number;    // 0..10
  condition: number;  // 0..10
}

export interface ConstraintSet {
  glaTolerancePct: number;   // e.g., 5..20
  distanceCapMiles: number;  // e.g., 0.25..5.0
}

export interface WeightProfile {
  id: string;          // uuid
  name: string;        // "Recency First"
  description?: string;
  weights: WeightSet;
  constraints: ConstraintSet;
  scope: 'shop' | 'user'; // shop = read-only
  createdAt: string;
  updatedAt: string;
  author?: string;     // user display name for user profiles
}

export interface OrderWeights {
  orderId: string;
  activeProfileId?: string; // if derived from a saved profile
  weights: WeightSet;
  constraints: ConstraintSet;
  updatedAt: string;
  updatedBy: string;
}

// Map & Geo Types
export interface LatLng {
  lat: number;
  lng: number;
}

export type ScoreBand = 'high' | 'medium' | 'low';

export interface MarketPolygon {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties?: Record<string, any>;
}

export interface Subject {
  id: string;
  address: string;
  latlng: LatLng;
  gla: number; // Gross Living Area sq ft
  quality: number; // 1-5 rating
  condition: number; // 1-5 rating
}

export interface CompProperty {
  id: string;
  address: string;
  salePrice: number;
  saleDate: string;
  distanceMiles: number;
  monthsSinceSale: number;
  latlng: LatLng;
  gla: number; // Gross Living Area sq ft
  quality: number; // 1-5 rating
  condition: number; // 1-5 rating
  locked?: boolean;
  isPrimary?: boolean;
  primaryIndex?: 0 | 1 | 2;
  score?: number; // calculated score 0-1
  band?: ScoreBand;
  isInsidePolygon?: boolean;
  scoreBreakdown?: {
    distance: { similarity: number; weight: number; contribution: number; };
    recency: { similarity: number; weight: number; contribution: number; };
    gla: { similarity: number; weight: number; contribution: number; };
    quality: { similarity: number; weight: number; contribution: number; };
    condition: { similarity: number; weight: number; contribution: number; };
  };
}

// Comp Selection & Primary Tray Management
export interface CompSelection {
  orderId: string;
  primary: string[]; // comp IDs for positions #1, #2, #3
  locked: string[]; // comp IDs that are locked
  restrictToPolygon: boolean;
}

// Zod Schemas for Validation
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const scoreBandSchema = z.enum(['high', 'medium', 'low']);

export const marketPolygonSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()).length(2)))
  }),
  properties: z.record(z.any()).optional()
});

export const compSelectionUpdateSchema = z.object({
  primary: z.array(z.string()).max(3).optional(),
  locked: z.array(z.string()).optional(),
  restrictToPolygon: z.boolean().optional()
});

export const compLockSchema = z.object({
  compId: z.string().min(1),
  locked: z.boolean()
});

export const compSwapSchema = z.object({
  candidateId: z.string().min(1),
  targetIndex: z.number().int().min(0).max(2),
  confirm: z.boolean().optional()
});

// Photos Module Types
export type PhotoCategory =
  | 'exteriorFront' | 'exteriorLeft' | 'exteriorRight' | 'exteriorRear'
  | 'street' | 'addressUnit'
  | 'kitchen' | 'bath' | 'living' | 'bedroom'
  | 'mechanical' | 'deficiency' | 'viewWaterfront' | 'outbuilding' | 'other';

export interface PhotoExif {
  takenAt?: string;      // ISO datetime
  gps?: { lat: number; lng: number; };
  orientation?: number;
  camera?: string;
  width?: number;
  height?: number;
}

export interface BlurRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export interface BlurBrushStroke {
  points: Array<{x: number; y: number}>;
  radius: number;
  strength: number;
}

export interface FaceDetection {
  type: 'face';
  x: number;
  y: number;
  w: number;
  h: number;
  accepted: boolean;
  confidence?: number;
}

export interface PhotoMasks {
  rects: BlurRect[];
  brush: BlurBrushStroke[];
  autoDetections?: FaceDetection[];
}

export interface PhotoProcessing {
  blurredPath?: string;  // generated from displayPath + masks
  lastProcessedAt?: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface PhotoMeta {
  id: string;
  orderId: string;
  originalPath: string;    // /data/orders/<id>/photos/original/<id>.jpg
  displayPath: string;     // /data/orders/<id>/photos/display/<id>.jpg
  thumbPath: string;       // /data/orders/<id>/photos/thumb/<id>.jpg
  width: number;
  height: number;
  fileSize: number;        // bytes
  mimeType: string;        // image/jpeg, image/png, etc.
  exif?: PhotoExif;
  category?: PhotoCategory;
  caption?: string;
  masks?: PhotoMasks;
  processing?: PhotoProcessing;
  createdAt: string;
  updatedAt: string;
}

export type AddendaLayout = '2up' | '4up' | '6up';

export interface AddendaCell {
  photoId?: string;
  caption?: string;
}

export interface AddendaPage {
  id: string;
  layout: AddendaLayout;
  cells: AddendaCell[];
  title?: string;
}

export interface PhotoAddenda {
  orderId: string;
  pages: AddendaPage[];
  updatedAt: string;
  exportedPdfPath?: string;
}

export interface PhotosQcSummary {
  requiredPresent: boolean;
  missingCategories: PhotoCategory[];
  unresolvedDetections: number; // auto faces not reviewed
  status: 'green' | 'yellow' | 'red';
  photoCount: number;
  categoryCounts: Record<PhotoCategory, number>;
}

// Photo Zod Schemas for API Validation
export const photoCategorySchema = z.enum([
  'exteriorFront', 'exteriorLeft', 'exteriorRight', 'exteriorRear',
  'street', 'addressUnit',
  'kitchen', 'bath', 'living', 'bedroom',
  'mechanical', 'deficiency', 'viewWaterfront', 'outbuilding', 'other'
]);

export const addendaLayoutSchema = z.enum(['2up', '4up', '6up']);

export const photoExifSchema = z.object({
  takenAt: z.string().optional(),
  gps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  }).optional(),
  orientation: z.number().int().min(1).max(8).optional(),
  camera: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
}).optional();

export const blurRectSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  radius: z.number().positive().optional()
});

export const blurBrushStrokeSchema = z.object({
  points: z.array(z.object({
    x: z.number(),
    y: z.number()
  })),
  radius: z.number().positive(),
  strength: z.number().min(0).max(1)
});

export const faceDetectionSchema = z.object({
  type: z.literal('face'),
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  accepted: z.boolean(),
  confidence: z.number().min(0).max(1).optional()
});

export const photoMasksSchema = z.object({
  rects: z.array(blurRectSchema),
  brush: z.array(blurBrushStrokeSchema),
  autoDetections: z.array(faceDetectionSchema).optional()
});

export const photoUpdateSchema = z.object({
  category: photoCategorySchema.optional(),
  caption: z.string().max(500).optional(),
  masks: photoMasksSchema.optional()
});

export const addendaCellSchema = z.object({
  photoId: z.string().optional(),
  caption: z.string().max(200).optional()
});

export const addendaPageSchema = z.object({
  id: z.string(),
  layout: addendaLayoutSchema,
  cells: z.array(addendaCellSchema),
  title: z.string().max(100).optional()
});

export const photoAddendaSchema = z.object({
  orderId: z.string(),
  pages: z.array(addendaPageSchema),
  updatedAt: z.string()
});

export const bulkPhotoUpdateSchema = z.object({
  photoIds: z.array(z.string().min(1)),
  updates: z.object({
    category: photoCategorySchema.optional(),
    captionPrefix: z.string().max(100).optional()
  })
});
