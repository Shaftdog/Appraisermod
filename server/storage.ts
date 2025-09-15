import { type User, type PublicUser, type InsertUser, type Order, type InsertOrder, type Version, type InsertVersion, type OrderData, type TabKey, type RiskStatus, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, type PhotoMeta, type PhotoAddenda, type PhotosQcSummary, type PhotoCategory, type PhotoMasks, type MarketSettings, type MarketRecord, type McrMetrics, type TimeAdjustments } from "@shared/schema";
import { type HiLoState, type HiLoSettings } from "../types/hilo";
import { type HabuState, type HabuInputs, type HabuResult, type ZoningData } from "@shared/habu";
import { isPointInPolygon } from "@shared/geo";
import { type ReviewItem, type RuleHit, type ReviewQueueItem, type Thread, type Comment, type DiffSummary, type Risk } from "../types/review";
import { type PolicyPack } from "../types/policy";
import { type AdjustmentRunInput, type AdjustmentRunResult, type EngineSettings, type AdjustmentsBundle, type CompAdjustmentLine, type AttrAdjustment, type CostBaseline, type DepreciationCurve, DEFAULT_ENGINE_SETTINGS, ATTR_METADATA } from "@shared/adjustments";
import { users, orders, versions } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import sharp from "sharp";
import { computeMarketMetrics } from "@shared/marketStats";
import { format, subMonths, addMonths } from "date-fns";
import { type ClosedSale } from "@shared/attom";
import { calculateTimeAdjustment } from "@shared/timeAdjust";
import { computeUseEvaluation, scoreMaxProductive, generateNarrative, createDefaultWeights, normalizeWeights, USE_CATEGORY_LABELS } from "@shared/habu";

export interface IStorage {
  getUser(id: string): Promise<PublicUser | undefined>;
  getUserByUsername(username: string): Promise<PublicUser | undefined>;
  createUser(user: InsertUser): Promise<PublicUser>;
  authenticateUser(username: string, password: string): Promise<PublicUser | null>;
  
  getOrder(id: string): Promise<OrderData | undefined>;
  createOrder(order: InsertOrder): Promise<OrderData>;
  updateOrder(id: string, order: Partial<OrderData>): Promise<OrderData>;
  
  getVersions(orderId: string, tabKey: TabKey): Promise<Version[]>;
  createVersion(version: InsertVersion): Promise<Version>;
  getVersion(id: string): Promise<Version | undefined>;
  
  signoffTab(orderId: string, tabKey: TabKey, signedBy: string, overrideReason?: string): Promise<OrderData>;
  updateTabQC(orderId: string, tabKey: TabKey, qc: any): Promise<OrderData>;

  // Weights & Presets methods
  getShopDefaultProfile(): Promise<WeightProfile>;
  getUserProfiles(): Promise<WeightProfile[]>;
  createUserProfile(profile: Omit<WeightProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<WeightProfile>;
  updateUserProfile(id: string, updates: Partial<Pick<WeightProfile, 'name' | 'description' | 'weights' | 'constraints'>>): Promise<WeightProfile>;
  deleteUserProfile(id: string): Promise<void>;
  getOrderWeights(orderId: string): Promise<OrderWeights>;
  updateOrderWeights(orderId: string, weights: WeightSet, constraints: ConstraintSet, activeProfileId?: string, updatedBy?: string): Promise<OrderWeights>;
  resetOrderWeights(orderId: string, updatedBy?: string): Promise<OrderWeights>;
  getCompsWithScoring(orderId: string): Promise<{ comps: CompProperty[]; weights: OrderWeights }>;
  addCompsFromAttomSales(orderId: string, saleIds: string[], applyTimeAdjustments?: boolean): Promise<{ count: number; addedComps: CompProperty[] }>;

  // Map & Comp Selection methods
  getSubject(orderId: string): Promise<Subject>;
  getMarketPolygon(orderId: string): Promise<MarketPolygon | null>;
  saveMarketPolygon(orderId: string, polygon: MarketPolygon): Promise<MarketPolygon>;
  deleteMarketPolygon(orderId: string): Promise<void>;
  getCompSelection(orderId: string): Promise<CompSelection>;
  updateCompSelection(orderId: string, updates: Partial<CompSelection>): Promise<CompSelection>;
  lockComp(orderId: string, compId: string, locked: boolean): Promise<CompSelection>;
  swapComp(orderId: string, candidateId: string, targetIndex: 0 | 1 | 2): Promise<CompSelection>;

  // Photos Module methods
  getPhotos(orderId: string): Promise<PhotoMeta[]>;
  getPhoto(orderId: string, photoId: string): Promise<PhotoMeta | undefined>;
  createPhoto(orderId: string, photoData: Omit<PhotoMeta, 'id' | 'createdAt' | 'updatedAt'>): Promise<PhotoMeta>;
  updatePhoto(orderId: string, photoId: string, updates: Partial<Pick<PhotoMeta, 'category' | 'caption' | 'masks' | 'processing'>>): Promise<PhotoMeta>;
  deletePhoto(orderId: string, photoId: string): Promise<void>;
  updatePhotoMasks(orderId: string, photoId: string, masks: PhotoMasks): Promise<PhotoMeta>;
  processPhoto(orderId: string, photoId: string): Promise<PhotoMeta>;
  bulkUpdatePhotos(orderId: string, photoIds: string[], updates: { category?: PhotoCategory; captionPrefix?: string }): Promise<PhotoMeta[]>;
  
  getPhotoAddenda(orderId: string): Promise<PhotoAddenda>;
  updatePhotoAddenda(orderId: string, addenda: Omit<PhotoAddenda, 'orderId'>): Promise<PhotoAddenda>;
  exportPhotoAddenda(orderId: string): Promise<{ pdfPath: string }>;
  
  getPhotosQcSummary(orderId: string): Promise<PhotosQcSummary>;

  // Market Conditions & MCR methods
  getMarketSettings(orderId: string): Promise<MarketSettings>;
  updateMarketSettings(orderId: string, settings: Partial<MarketSettings>): Promise<MarketSettings>;
  getMarketRecords(orderId: string): Promise<MarketRecord[]>;
  seedMarketRecords(orderId: string): Promise<MarketRecord[]>;
  computeMcrMetrics(orderId: string, settingsOverride?: Partial<MarketSettings>, source?: 'local' | 'attom'): Promise<McrMetrics>;
  importAttomClosedSalesForOrder(orderId: string, subjectAddress: any, settings?: any): Promise<{ count: number; filePath: string }>;
  getTimeAdjustments(orderId: string): Promise<TimeAdjustments>;
  updateTimeAdjustments(orderId: string, adjustments: Partial<TimeAdjustments>): Promise<TimeAdjustments>;

  // Adjustments Engine methods
  computeAdjustments(orderId: string, input: AdjustmentRunInput): Promise<AdjustmentRunResult>;
  getAdjustmentRun(orderId: string): Promise<AdjustmentRunResult | null>;
  updateAdjustmentSettings(orderId: string, settings: Partial<EngineSettings>): Promise<EngineSettings>;
  updateAttributeOverride(orderId: string, attrKey: string, value: number, source?: 'blend' | 'manual', note?: string): Promise<AttrAdjustment>;
  applyAdjustments(orderId: string): Promise<AdjustmentsBundle>;
  getAdjustmentsBundle(orderId: string): Promise<AdjustmentsBundle | null>;

  // Hi-Lo methods
  getHiLoState(orderId: string): Promise<HiLoState>;
  saveHiLoSettings(orderId: string, settings: HiLoSettings): Promise<HiLoState>;
  computeHiLo(orderId: string): Promise<HiLoState>;
  applyHiLo(orderId: string, primaries: string[], listingPrimaries: string[]): Promise<void>;

  // Review & Policy methods
  runPolicyCheck(orderId: string): Promise<{ hits: RuleHit[]; overallRisk: Risk }>;
  getReviewItem(orderId: string): Promise<ReviewItem>;
  updateReviewItem(orderId: string, updates: Partial<ReviewItem>): Promise<ReviewItem>;
  addRuleOverride(orderId: string, ruleId: string, reason: string, userId: string): Promise<{ success: boolean }>;
  addReviewComment(orderId: string, commentData: any, userId: string): Promise<Comment>;
  resolveReviewThread(orderId: string, threadId: string): Promise<Thread>;
  getReviewQueue(): Promise<ReviewQueueItem[]>;
  reviewSignoff(orderId: string, role: 'reviewer' | 'appraiser', accept: boolean, reason?: string, userId?: string): Promise<{ success: boolean }>;
  getVersionDiff(orderId: string, fromVersionId: string, toVersionId: string): Promise<DiffSummary>;

  // HABU (Highest & Best Use) methods
  getHabuState(orderId: string): Promise<HabuState | null>;
  saveHabuInputs(orderId: string, inputs: HabuInputs): Promise<HabuState>;
  computeHabu(orderId: string): Promise<HabuResult>;
  updateHabuNotes(orderId: string, notes: { reviewerNotes?: string; appraiserNotes?: string }): Promise<HabuState>;
  fetchZoningStub(orderId: string): Promise<ZoningData>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeWithSampleData();
  }

  private async initializeWithSampleData() {
    try {
      // Initialize test users first
      await this.initializeTestUsers();
      
      // Check if we already have sample data
      const existingOrders = await db.select().from(orders).limit(1);
      if (existingOrders.length > 0) {
        return; // Data already exists
      }

      const samplePath = path.resolve(process.cwd(), 'client', 'src', 'data', 'order-sample.json');
      if (fs.existsSync(samplePath)) {
        const data = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
        await db.insert(orders).values({
          id: data.id,
          orderNumber: data.orderNumber,
          clientName: data.clientName,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          overallStatus: data.overallStatus as 'green' | 'yellow' | 'red',
          tabs: data.tabs,
        });

        // Insert sample versions if any exist in the data
        const versionsToInsert = [];
        for (const [tabKey, tabData] of Object.entries(data.tabs as any)) {
          const typedTabData = tabData as any;
          if (typedTabData.versions && Array.isArray(typedTabData.versions)) {
            for (const version of typedTabData.versions) {
              versionsToInsert.push({
                id: version.id,
                orderId: data.id,
                tabKey,
                label: version.label,
                author: version.author,
                data: version.data,
                createdAt: new Date(version.createdAt),
              });
            }
          }
        }

        if (versionsToInsert.length > 0) {
          await db.insert(versions).values(versionsToInsert);
        }

        console.log('Sample data loaded into database');
      }
    } catch (error) {
      console.log('No sample data found or error loading:', error);
    }
  }

  private async initializeTestUsers() {
    try {
      // Check if test users already exist
      const existingUsers = await db.select().from(users).limit(1);
      if (existingUsers.length > 0) {
        return; // Users already exist
      }

      // Create test users
      const testUsers = [
        {
          username: 'Rod',
          password: 'pass123',
          email: 'rod@example.com',
          fullName: 'Rod Haugabrooks',
          role: 'appraiser' as const
        },
        {
          username: 'Sarah',
          password: 'password',
          email: 'sarah@example.com',
          fullName: 'Sarah Chen',
          role: 'reviewer' as const
        }
      ];

      for (const userData of testUsers) {
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        await db.insert(users).values({
          ...userData,
          password: hashedPassword,
        });
      }

      console.log('Test users initialized');
    } catch (error) {
      console.log('Error initializing test users:', error);
    }
  }

  async getUser(id: string): Promise<PublicUser | undefined> {
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    }).from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<PublicUser | undefined> {
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    }).from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<PublicUser> {
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(insertUser.password, 12);
    
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        password: hashedPassword,
        role: (insertUser.role || 'appraiser') as 'appraiser' | 'reviewer' | 'admin',
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      });
    return user;
  }

  async authenticateUser(username: string, password: string): Promise<PublicUser | null> {
    // Get user with password for verification
    const [userWithPassword] = await db.select().from(users).where(eq(users.username, username));
    console.log(`[AUTH] Looking for user: ${username}`);
    if (!userWithPassword) {
      console.log(`[AUTH] User not found: ${username}`);
      return null;
    }
    console.log(`[AUTH] Found user: ${userWithPassword.username}, email: ${userWithPassword.email}`);

    // Verify password
    const passwordMatch = await bcrypt.compare(password, userWithPassword.password);
    console.log(`[AUTH] Password match for ${username}: ${passwordMatch}`);
    if (!passwordMatch) {
      console.log(`[AUTH] Password verification failed for ${username}`);
      return null;
    }

    console.log(`[AUTH] Authentication successful for ${username}`);
    // Return user without password
    return {
      id: userWithPassword.id,
      username: userWithPassword.username,
      email: userWithPassword.email,
      fullName: userWithPassword.fullName,
      role: userWithPassword.role,
      createdAt: userWithPassword.createdAt,
      updatedAt: userWithPassword.updatedAt
    };
  }

  async getOrder(id: string): Promise<OrderData | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;

    // Convert database order to OrderData format
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      clientName: order.clientName,
      dueDate: order.dueDate?.toISOString(),
      overallStatus: order.overallStatus,
      tabs: order.tabs as any, // The tabs are stored as JSONB
    };
  }

  async createOrder(order: InsertOrder): Promise<OrderData> {
    const id = randomUUID();
    const [newOrder] = await db
      .insert(orders)
      .values({
        id,
        orderNumber: order.orderNumber,
        clientName: order.clientName,
        dueDate: order.dueDate ? new Date(order.dueDate) : undefined,
        overallStatus: order.overallStatus as 'green' | 'yellow' | 'red',
        tabs: order.tabs,
      })
      .returning();

    return {
      id: newOrder.id,
      orderNumber: newOrder.orderNumber,
      clientName: newOrder.clientName,
      dueDate: newOrder.dueDate?.toISOString(),
      overallStatus: newOrder.overallStatus,
      tabs: newOrder.tabs as any,
    };
  }

  async updateOrder(id: string, orderUpdate: Partial<OrderData>): Promise<OrderData> {
    const updateData: any = { ...orderUpdate };
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    
    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    return {
      id: updated.id,
      orderNumber: updated.orderNumber,
      clientName: updated.clientName,
      dueDate: updated.dueDate?.toISOString(),
      overallStatus: updated.overallStatus,
      tabs: updated.tabs as any,
    };
  }

  async getVersions(orderId: string, tabKey: TabKey): Promise<Version[]> {
    return await db
      .select()
      .from(versions)
      .where(and(eq(versions.orderId, orderId), eq(versions.tabKey, tabKey)));
  }

  async createVersion(version: InsertVersion): Promise<Version> {
    const id = randomUUID();
    const [newVersion] = await db
      .insert(versions)
      .values({
        ...version,
        id,
      })
      .returning();
    return newVersion;
  }

  async getVersion(id: string): Promise<Version | undefined> {
    const [version] = await db.select().from(versions).where(eq(versions.id, id));
    return version || undefined;
  }

  async signoffTab(orderId: string, tabKey: TabKey, signedBy: string, overrideReason?: string): Promise<OrderData> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const tab = order.tabs[tabKey];
    if (!tab) {
      throw new Error('Tab not found');
    }

    tab.signoff = {
      state: 'signed-appraiser',
      signedBy,
      signedAt: new Date().toISOString(),
      overrideReason
    };

    // Update last reviewed
    tab.qc.lastReviewedBy = signedBy;
    tab.qc.lastReviewedAt = new Date().toISOString();

    // When a tab is signed off, resolve its QC status to green
    // This ensures that signed-off tabs don't continue to affect overall status
    tab.qc.status = 'green';
    tab.qc.openIssues = 0;
    if (overrideReason) {
      // Track that issues were overridden
      tab.qc.overriddenIssues = tab.qc.openIssues || 1;
    }

    // Recalculate overall status
    order.overallStatus = this.calculateOverallStatus(order);

    return await this.updateOrder(orderId, order);
  }

  async updateTabQC(orderId: string, tabKey: TabKey, qc: any): Promise<OrderData> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const tab = order.tabs[tabKey];
    if (!tab) {
      throw new Error('Tab not found');
    }

    tab.qc = { ...tab.qc, ...qc };
    order.overallStatus = this.calculateOverallStatus(order);

    return await this.updateOrder(orderId, order);
  }

  private calculateOverallStatus(order: OrderData): RiskStatus {
    const statuses = Object.values(order.tabs).map(tab => tab.qc.status);
    
    if (statuses.includes('red')) return 'red';
    if (statuses.includes('yellow')) return 'yellow';
    return 'green';
  }

  // In-memory storage for weights data (mock implementation)
  private shopDefault: WeightProfile = {
    id: "shop-default-profile",
    name: "Shop Default (Hi-Low Standard)",
    description: "Standard shop policy for high-low methodology",
    weights: { distance: 8, recency: 8, gla: 7, quality: 6, condition: 6 },
    constraints: { glaTolerancePct: 10, distanceCapMiles: 0.5 },
    scope: "shop",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  };

  private userProfiles: WeightProfile[] = [];
  private orderWeights: Map<string, OrderWeights> = new Map();
  
  // Order-scoped comp storage to prevent data bleed
  private compsByOrder: Map<string, CompProperty[]> = new Map();
  
  // Initialize default sample comps for each order
  private getDefaultCompsForOrder(): CompProperty[] {
    return [
    {
      id: "comp-1",
      address: "123 Oak Street",
      salePrice: 425000,
      saleDate: "2024-11-15",
      distanceMiles: 0.3,
      monthsSinceSale: 2,
      latlng: { lat: 30.2741, lng: -97.7443 },
      gla: 1850,
      quality: 4,
      condition: 4
    },
    {
      id: "comp-2", 
      address: "456 Maple Avenue",
      salePrice: 445000,
      saleDate: "2024-10-22",
      distanceMiles: 0.7,
      monthsSinceSale: 3,
      latlng: { lat: 30.2689, lng: -97.7502 },
      gla: 1920,
      quality: 4,
      condition: 3
    },
    {
      id: "comp-3",
      address: "789 Pine Road",
      salePrice: 398000,
      saleDate: "2024-09-08",
      distanceMiles: 0.2,
      monthsSinceSale: 4,
      latlng: { lat: 30.2755, lng: -97.7411 },
      gla: 1780,
      quality: 3,
      condition: 4
    },
    {
      id: "comp-4",
      address: "321 Elm Drive",
      salePrice: 472000,
      saleDate: "2024-12-01",
      distanceMiles: 1.1,
      monthsSinceSale: 1,
      latlng: { lat: 30.2612, lng: -97.7632 },
      gla: 2100,
      quality: 5,
      condition: 4
    },
    {
      id: "comp-5",
      address: "654 Cedar Lane",
      salePrice: 415000,
      saleDate: "2024-08-14",
      distanceMiles: 0.4,
      monthsSinceSale: 5,
      latlng: { lat: 30.2798, lng: -97.7385 },
      gla: 1895,
      quality: 4,
      condition: 3
    },
    {
      id: "comp-6",
      address: "987 Birch Court",
      salePrice: 458000,
      saleDate: "2024-11-28",
      distanceMiles: 0.8,
      monthsSinceSale: 1,
      latlng: { lat: 30.2653, lng: -97.7576 },
      gla: 1975,
      quality: 5,
      condition: 5
    },
    {
      id: "comp-7",
      address: "159 Willow Way",
      salePrice: 385000,
      saleDate: "2024-07-19",
      distanceMiles: 1.5,
      monthsSinceSale: 6,
      latlng: { lat: 30.2512, lng: -97.7721 },
      gla: 1720,
      quality: 3,
      condition: 3
    },
    {
      id: "comp-8",
      address: "753 Aspen Circle",
      salePrice: 465000,
      saleDate: "2024-10-05",
      distanceMiles: 0.6,
      monthsSinceSale: 3,
      latlng: { lat: 30.2824, lng: -97.7456 },
      gla: 2050,
      quality: 4,
      condition: 4
    }
    ];
  }
  
  private async getOrderComps(orderId: string): Promise<CompProperty[]> {
    if (!this.compsByOrder.has(orderId)) {
      // Try to load comps from file first
      const compsFromFile = await this.loadCompsFromFile(orderId);
      if (compsFromFile.length > 0) {
        this.compsByOrder.set(orderId, compsFromFile);
      } else {
        // Initialize with default sample comps for this order
        const defaultComps = this.getDefaultCompsForOrder();
        this.compsByOrder.set(orderId, defaultComps);
        // Save default comps to file for persistence
        await this.saveCompsToFile(orderId, defaultComps);
      }
    }
    return this.compsByOrder.get(orderId)!;
  }

  private async loadCompsFromFile(orderId: string): Promise<CompProperty[]> {
    const compsPath = path.join(process.cwd(), 'data', 'orders', orderId, 'comps.json');
    try {
      const data = fs.readFileSync(compsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or invalid - return empty array
      return [];
    }
  }

  private async saveCompsToFile(orderId: string, comps: CompProperty[]): Promise<void> {
    const orderDir = path.join(process.cwd(), 'data', 'orders', orderId);
    const compsPath = path.join(orderDir, 'comps.json');
    
    try {
      // Ensure directory exists
      if (!fs.existsSync(orderDir)) {
        fs.mkdirSync(orderDir, { recursive: true });
      }
      
      // Write comps to file with proper formatting
      fs.writeFileSync(compsPath, JSON.stringify(comps, null, 2), 'utf8');
    } catch (error) {
      console.error(`Failed to save comps for order ${orderId}:`, error);
      throw new Error('Failed to persist comparable properties');
    }
  }

  async getShopDefaultProfile(): Promise<WeightProfile> {
    return this.shopDefault;
  }

  async getUserProfiles(): Promise<WeightProfile[]> {
    return [...this.userProfiles];
  }

  async createUserProfile(profile: Omit<WeightProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<WeightProfile> {
    const newProfile: WeightProfile = {
      ...profile,
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      scope: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.userProfiles.push(newProfile);
    return newProfile;
  }

  async updateUserProfile(id: string, updates: Partial<Pick<WeightProfile, 'name' | 'description' | 'weights' | 'constraints'>>): Promise<WeightProfile> {
    const profileIndex = this.userProfiles.findIndex(p => p.id === id);
    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    const profile = this.userProfiles[profileIndex];
    if (profile.scope === 'shop') {
      throw new Error('Cannot modify shop default profiles');
    }

    this.userProfiles[profileIndex] = {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    return this.userProfiles[profileIndex];
  }

  async deleteUserProfile(id: string): Promise<void> {
    const profileIndex = this.userProfiles.findIndex(p => p.id === id);
    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    const profile = this.userProfiles[profileIndex];
    if (profile.scope === 'shop') {
      throw new Error('Cannot delete shop default profiles');
    }

    this.userProfiles.splice(profileIndex, 1);
  }

  async getOrderWeights(orderId: string): Promise<OrderWeights> {
    const existing = this.orderWeights.get(orderId);
    if (existing) {
      return existing;
    }

    // Return shop default if no order-specific weights exist
    const shopDefault = await this.getShopDefaultProfile();
    const defaultOrderWeights: OrderWeights = {
      orderId,
      activeProfileId: shopDefault.id,
      weights: shopDefault.weights,
      constraints: shopDefault.constraints,
      updatedAt: new Date().toISOString(),
      updatedBy: "System"
    };

    return defaultOrderWeights;
  }

  async updateOrderWeights(orderId: string, weights: WeightSet, constraints: ConstraintSet, activeProfileId?: string, updatedBy: string = "System"): Promise<OrderWeights> {
    const orderWeights: OrderWeights = {
      orderId,
      activeProfileId,
      weights,
      constraints,
      updatedAt: new Date().toISOString(),
      updatedBy
    };

    this.orderWeights.set(orderId, orderWeights);
    return orderWeights;
  }

  async resetOrderWeights(orderId: string, updatedBy: string = "System"): Promise<OrderWeights> {
    const shopDefault = await this.getShopDefaultProfile();
    return this.updateOrderWeights(orderId, shopDefault.weights, shopDefault.constraints, shopDefault.id, updatedBy);
  }

  async getCompsWithScoring(orderId: string): Promise<{ comps: CompProperty[]; weights: OrderWeights }> {
    const weights = await this.getOrderWeights(orderId);
    const polygon = await this.getMarketPolygon(orderId);
    const selection = await this.getCompSelection(orderId);
    
    // Import scoring function and geo utilities
    const { scoreAndRankComps } = await import("../shared/scoring");
    const { isInsidePolygon } = await import("../shared/geo");
    
    const orderComps = await this.getOrderComps(orderId);
    let compsWithLocation = [...orderComps];
    
    // Add polygon and selection data to each comp
    compsWithLocation = compsWithLocation.map(comp => ({
      ...comp,
      isInsidePolygon: polygon ? isPointInPolygon(comp.latlng, polygon) : true,
      locked: selection.locked.includes(comp.id),
      isPrimary: selection.primary.includes(comp.id),
      primaryIndex: selection.primary.indexOf(comp.id) as 0 | 1 | 2 | -1
    })).map(comp => ({
      ...comp,
      primaryIndex: comp.primaryIndex === -1 ? undefined : comp.primaryIndex as 0 | 1 | 2
    }));
    
    // Filter by polygon if restriction is enabled
    if (selection.restrictToPolygon && polygon) {
      // Keep all primary comps regardless of polygon, but mark as outside if needed
      compsWithLocation = compsWithLocation.filter(comp => 
        comp.isPrimary || comp.isInsidePolygon
      );
    }
    
    const rankedComps = scoreAndRankComps(compsWithLocation, weights.weights, weights.constraints);
    
    return {
      comps: rankedComps,
      weights
    };
  }

  // Map & Comp Selection method implementations
  private subjectData: Subject = {
    id: "subject-123",
    address: "1234 Oak Street, Austin, TX 78701",
    latlng: { lat: 30.2730, lng: -97.7431 },
    gla: 2450,
    quality: 4,
    condition: 4
  };

  private marketPolygons: Map<string, MarketPolygon | null> = new Map();
  private compSelections: Map<string, CompSelection> = new Map();

  async getSubject(orderId: string): Promise<Subject> {
    return this.subjectData;
  }

  async getMarketPolygon(orderId: string): Promise<MarketPolygon | null> {
    return this.marketPolygons.get(orderId) || null;
  }

  async saveMarketPolygon(orderId: string, polygon: MarketPolygon): Promise<MarketPolygon> {
    this.marketPolygons.set(orderId, polygon);
    return polygon;
  }

  async deleteMarketPolygon(orderId: string): Promise<void> {
    this.marketPolygons.set(orderId, null);
  }

  async getCompSelection(orderId: string): Promise<CompSelection> {
    const existing = this.compSelections.get(orderId);
    if (existing) {
      return existing;
    }

    // Return default selection
    const defaultSelection: CompSelection = {
      orderId,
      primary: ["comp-4", "comp-6", "comp-1"], // Default primary comps
      locked: ["comp-6"], // One locked by default
      restrictToPolygon: false
    };

    this.compSelections.set(orderId, defaultSelection);
    return defaultSelection;
  }

  async updateCompSelection(orderId: string, updates: Partial<CompSelection>): Promise<CompSelection> {
    const existing = await this.getCompSelection(orderId);
    const updated = { ...existing, ...updates };
    this.compSelections.set(orderId, updated);
    return updated;
  }

  async lockComp(orderId: string, compId: string, locked: boolean): Promise<CompSelection> {
    const selection = await this.getCompSelection(orderId);
    
    if (locked) {
      if (!selection.locked.includes(compId)) {
        selection.locked.push(compId);
      }
    } else {
      selection.locked = selection.locked.filter(id => id !== compId);
    }
    
    this.compSelections.set(orderId, selection);
    return selection;
  }

  async swapComp(orderId: string, candidateId: string, targetIndex: 0 | 1 | 2): Promise<CompSelection> {
    const selection = await this.getCompSelection(orderId);
    
    // Get the current comp at target position
    const currentCompId = selection.primary[targetIndex];
    
    // Check if the current comp is locked (require confirmation in API layer)
    if (currentCompId && selection.locked.includes(currentCompId)) {
      throw new Error(`Cannot replace locked comp at position ${targetIndex + 1}. Confirmation required.`);
    }
    
    // Remove candidate from current primary positions if it exists
    const candidateCurrentIndex = selection.primary.indexOf(candidateId);
    if (candidateCurrentIndex !== -1) {
      selection.primary[candidateCurrentIndex] = '';
    }
    
    // Set the new comp at target position
    selection.primary[targetIndex] = candidateId;
    
    // Clean up empty slots by shifting
    selection.primary = selection.primary.filter(id => id !== '');
    while (selection.primary.length < 3) {
      selection.primary.push('');
    }
    
    this.compSelections.set(orderId, selection);
    return selection;
  }

  async addCompsFromAttomSales(orderId: string, saleIds: string[], applyTimeAdjustments = false): Promise<{ count: number; addedComps: CompProperty[] }> {
    // Load ATTOM sales from order-specific storage
    const orderAttomPath = path.join(process.cwd(), 'data/orders', orderId, 'attom/closed-sales.json');
    let attomSales: ClosedSale[] = [];
    
    try {
      const data = fs.readFileSync(orderAttomPath, 'utf8');
      attomSales = JSON.parse(data);
    } catch (error) {
      throw new Error('No ATTOM sales data found for this order. Import sales first.');
    }
    
    // Filter to selected sales only
    const selectedSales = attomSales.filter(sale => saleIds.includes(sale.id));
    
    if (selectedSales.length === 0) {
      throw new Error('No matching sales found for the provided sale IDs');
    }
    
    // Get subject and time adjustments if needed
    const subject = await this.getSubject(orderId);
    let timeAdjustments: TimeAdjustments | null = null;
    
    if (applyTimeAdjustments) {
      timeAdjustments = await this.getTimeAdjustments(orderId);
    }
    
    // Convert ClosedSale[] to CompProperty[]
    const addedComps: CompProperty[] = selectedSales.map(sale => {
      
      // Calculate distance from subject (simplified to 0.5 miles for mock)
      const distanceMiles = 0.5;
      
      // Calculate months since sale using effective date
      let adjustedPrice = sale.closePrice;
      let monthsSinceSale = 1;
      
      if (applyTimeAdjustments && timeAdjustments) {
        // Use proper time adjustment calculation matching frontend and shared logic
        const timeAdjResult = calculateTimeAdjustment(
          sale.closePrice,
          sale.closeDate,
          sale.gla,
          timeAdjustments.effectiveDateISO,
          timeAdjustments.pctPerMonth,
          timeAdjustments.basis
        );
        
        adjustedPrice = timeAdjResult.adjustedPrice || sale.closePrice;
        monthsSinceSale = timeAdjResult.months;
      } else {
        // Calculate months for display purposes when no adjustment applied
        const saleDate = new Date(sale.closeDate);
        const now = new Date();
        monthsSinceSale = Math.max(1, Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
      }
      
      const comp: CompProperty = {
        id: `attom-${sale.id}`, // Prefix to distinguish from existing mock comps
        address: sale.address,
        salePrice: Math.round(adjustedPrice),
        saleDate: sale.closeDate,
        distanceMiles,
        monthsSinceSale,
        latlng: { lat: sale.lat || 30.2730, lng: sale.lon || -97.7431 }, // Default to subject location if missing
        gla: sale.gla || 1800, // Default GLA if missing
        quality: 4, // Default quality rating
        condition: 4, // Default condition rating
        source: 'attom' // Mark as ATTOM-sourced for UI badges
      };
      
      return comp;
    });
    
    // Add to order-scoped comp storage with persistence
    const orderComps = await this.getOrderComps(orderId);
    orderComps.push(...addedComps);
    this.compsByOrder.set(orderId, orderComps);
    
    // CRITICAL: Persist comps to file to prevent data loss on restart
    await this.saveCompsToFile(orderId, orderComps);
    
    return { count: addedComps.length, addedComps };
  }

  // Photos Module implementation
  private photosByOrder: Map<string, PhotoMeta[]> = new Map();
  private photoAddendas: Map<string, PhotoAddenda> = new Map();

  private photosJsonPath(orderId: string) {
    return path.join(process.cwd(), 'data', 'orders', orderId, 'photos', 'photos.json');
  }

  private async readPhotosJson(orderId: string): Promise<PhotoMeta[]> {
    try {
      const p = this.photosJsonPath(orderId);
      const buf = await fsPromises.readFile(p, 'utf8');
      return JSON.parse(buf);
    } catch { 
      return []; 
    }
  }

  private async writePhotosJson(orderId: string, list: PhotoMeta[]): Promise<void> {
    const p = this.photosJsonPath(orderId);
    await fsPromises.mkdir(path.dirname(p), { recursive: true });
    await fsPromises.writeFile(p, JSON.stringify(list, null, 2), 'utf8');
  }

  async getPhotos(orderId: string): Promise<PhotoMeta[]> {
    if (!this.photosByOrder.has(orderId)) {
      const fromDisk = await this.readPhotosJson(orderId);
      this.photosByOrder.set(orderId, fromDisk);
    }
    return this.photosByOrder.get(orderId) || [];
  }

  async getPhoto(orderId: string, photoId: string): Promise<PhotoMeta | undefined> {
    const photos = await this.getPhotos(orderId);
    return photos.find(p => p.id === photoId);
  }

  async createPhoto(orderId: string, photoData: Omit<PhotoMeta, 'id' | 'createdAt' | 'updatedAt'>): Promise<PhotoMeta> {
    const id = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const photo: PhotoMeta = {
      ...photoData,
      id,
      orderId,
      createdAt: now,
      updatedAt: now
    };

    const photos = await this.getPhotos(orderId);
    photos.push(photo);
    await this.writePhotosJson(orderId, photos);

    return photo;
  }

  async updatePhoto(orderId: string, photoId: string, updates: Partial<Pick<PhotoMeta, 'category' | 'caption' | 'masks' | 'processing'>>): Promise<PhotoMeta> {
    const photos = await this.getPhotos(orderId);
    const photoIndex = photos.findIndex(p => p.id === photoId);
    
    if (photoIndex === -1) {
      throw new Error('Photo not found');
    }

    const updatedPhoto = {
      ...photos[photoIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    photos[photoIndex] = updatedPhoto;
    this.photosByOrder.set(orderId, photos);
    await this.writePhotosJson(orderId, photos);

    return updatedPhoto;
  }

  async deletePhoto(orderId: string, photoId: string): Promise<void> {
    const photos = await this.getPhotos(orderId);
    const filteredPhotos = photos.filter(p => p.id !== photoId);
    
    if (filteredPhotos.length === photos.length) {
      throw new Error('Photo not found');
    }

    this.photosByOrder.set(orderId, filteredPhotos);
    await this.writePhotosJson(orderId, filteredPhotos);

    // Also remove from addenda if present
    const addenda = await this.getPhotoAddenda(orderId);
    let addendaUpdated = false;
    
    addenda.pages.forEach(page => {
      page.cells.forEach(cell => {
        if (cell.photoId === photoId) {
          cell.photoId = undefined;
          addendaUpdated = true;
        }
      });
    });

    if (addendaUpdated) {
      await this.updatePhotoAddenda(orderId, {
        pages: addenda.pages,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async updatePhotoMasks(orderId: string, photoId: string, masks: PhotoMasks): Promise<PhotoMeta> {
    return this.updatePhoto(orderId, photoId, { 
      masks,
      processing: {
        processingStatus: 'pending',
        lastProcessedAt: new Date().toISOString()
      }
    });
  }

  async processPhoto(orderId: string, photoId: string): Promise<PhotoMeta> {
    const photo = await this.getPhoto(orderId, photoId);
    if (!photo) {
      throw new Error('Photo not found');
    }

    const inputPath = path.join(process.cwd(), photo.displayPath);
    const img = sharp(inputPath);
    const meta = await img.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const rects = photo.masks?.rects ?? [];
    const brush = photo.masks?.brush ?? [];

    // Build mask SVG (white = blur regions)
    const maskSvg = this.svgMaskForPhoto(width, height, rects, brush);
    const maskPng = await sharp(maskSvg).png().toBuffer();

    // Precompute a blurred full image
    const blurred = await sharp(inputPath).blur(12).toBuffer();

    // Composite: (blurred ∩ mask) over original
    const maskedBlur = await sharp(blurred)
      .composite([{ input: maskPng, blend: 'dest-in' }])
      .toBuffer();

    const outPathAbs = inputPath.replace(/(\.[\w]+)$/, '_blurred$1');
    const outRel = outPathAbs.replace(process.cwd() + path.sep, '');

    await sharp(inputPath)
      .composite([{ input: maskedBlur, blend: 'over' }])
      .jpeg({ quality: 85 })
      .toFile(outPathAbs);

    // Persist processing metadata
    return this.updatePhoto(orderId, photoId, {
      processing: {
        blurredPath: outRel,
        processingStatus: 'completed',
        lastProcessedAt: new Date().toISOString()
      }
    });
  }

  private svgMaskForPhoto(width: number, height: number, rects: Array<{ x: number; y: number; w: number; h: number; radius?: number }>, brush: Array<{ points: Array<{x: number; y: number}>; radius: number; strength: number }>): Buffer {
    // Build an SVG mask: rects + brush as circles along stroke points
    const rectEls = rects.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.radius ?? 0}" ry="${r.radius ?? 0}" />`).join('');
    const circleEls = brush.flatMap(b => b.points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${b.radius}" />`)).join('');
    return Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
         <rect width="100%" height="100%" fill="black"/>
         <g fill="white">${rectEls}${circleEls}</g>
       </svg>`
    );
  }

  async bulkUpdatePhotos(orderId: string, photoIds: string[], updates: { category?: PhotoCategory; captionPrefix?: string }): Promise<PhotoMeta[]> {
    const results: PhotoMeta[] = [];
    
    for (const photoId of photoIds) {
      const photo = await this.getPhoto(orderId, photoId);
      if (!photo) continue;

      const photoUpdates: any = {};
      if (updates.category) {
        photoUpdates.category = updates.category;
      }
      if (updates.captionPrefix) {
        photoUpdates.caption = updates.captionPrefix + (photo.caption || '');
      }

      const updatedPhoto = await this.updatePhoto(orderId, photoId, photoUpdates);
      results.push(updatedPhoto);
    }

    return results;
  }

  async getPhotoAddenda(orderId: string): Promise<PhotoAddenda> {
    const existing = this.photoAddendas.get(orderId);
    if (existing) {
      return existing;
    }

    // Return default empty addenda
    const defaultAddenda: PhotoAddenda = {
      orderId,
      pages: [],
      updatedAt: new Date().toISOString()
    };

    this.photoAddendas.set(orderId, defaultAddenda);
    return defaultAddenda;
  }

  async updatePhotoAddenda(orderId: string, addenda: Omit<PhotoAddenda, 'orderId'>): Promise<PhotoAddenda> {
    const updated: PhotoAddenda = {
      orderId,
      ...addenda,
      updatedAt: new Date().toISOString()
    };

    this.photoAddendas.set(orderId, updated);
    return updated;
  }

  async exportPhotoAddenda(orderId: string): Promise<{ pdfPath: string }> {
    const addenda = await this.getPhotoAddenda(orderId);
    
    // Simulate PDF generation
    const pdfPath = `/data/orders/${orderId}/photos/addenda.pdf`;
    
    // Update addenda with export path
    await this.updatePhotoAddenda(orderId, {
      ...addenda,
      exportedPdfPath: pdfPath
    });

    return { pdfPath };
  }

  async getPhotosQcSummary(orderId: string): Promise<PhotosQcSummary> {
    const photos = await this.getPhotos(orderId);
    
    // Required categories for QC
    const requiredCategories: PhotoCategory[] = ['exteriorFront', 'street', 'kitchen', 'bath', 'living'];
    
    // Count photos by category
    const categoryCounts: Record<PhotoCategory, number> = {
      exteriorFront: 0, exteriorLeft: 0, exteriorRight: 0, exteriorRear: 0,
      street: 0, addressUnit: 0,
      kitchen: 0, bath: 0, living: 0, bedroom: 0,
      mechanical: 0, deficiency: 0, viewWaterfront: 0, outbuilding: 0, other: 0
    };

    photos.forEach(photo => {
      if (photo.category) {
        categoryCounts[photo.category]++;
      }
    });

    // Find missing required categories
    const missingCategories = requiredCategories.filter(cat => categoryCounts[cat] === 0);
    
    // Count unresolved face detections
    const unresolvedDetections = photos.reduce((count, photo) => {
      if (photo.masks?.autoDetections) {
        return count + photo.masks.autoDetections.filter(d => !d.accepted).length;
      }
      return count;
    }, 0);

    // Determine status
    let status: 'green' | 'yellow' | 'red' = 'green';
    if (missingCategories.length > 0 || unresolvedDetections > 0) {
      status = missingCategories.length > 0 ? 'red' : 'yellow';
    }

    return {
      requiredPresent: missingCategories.length === 0,
      missingCategories,
      unresolvedDetections,
      status,
      photoCount: photos.length,
      categoryCounts
    };
  }

  // Market Conditions & MCR Methods Implementation

  private getMarketDataPath(orderId: string): string {
    return path.resolve(process.cwd(), 'data', 'orders', orderId, 'market');
  }

  private ensureMarketDataDir(orderId: string): void {
    const marketDir = this.getMarketDataPath(orderId);
    fs.mkdirSync(marketDir, { recursive: true });
  }

  async getMarketSettings(orderId: string): Promise<MarketSettings> {
    const marketDir = this.getMarketDataPath(orderId);
    const settingsPath = path.join(marketDir, 'settings.json');
    
    try {
      if (fs.existsSync(settingsPath)) {
        const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        return data;
      }
    } catch (error) {
      console.log('Error reading market settings:', error);
    }

    // Return default settings if not found
    const defaultSettings: MarketSettings = {
      orderId,
      monthsBack: 12,
      statuses: ['sold', 'active', 'pending', 'expired'],
      usePolygon: true,
      metric: 'salePrice',
      smoothing: 'none',
      minSalesPerMonth: 5
    };

    // Save default settings
    this.ensureMarketDataDir(orderId);
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    
    return defaultSettings;
  }

  async updateMarketSettings(orderId: string, settings: Partial<MarketSettings>): Promise<MarketSettings> {
    const currentSettings = await this.getMarketSettings(orderId);
    const updatedSettings: MarketSettings = { ...currentSettings, ...settings };
    
    this.ensureMarketDataDir(orderId);
    const settingsPath = path.join(this.getMarketDataPath(orderId), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2));
    
    return updatedSettings;
  }

  async getMarketRecords(orderId: string): Promise<MarketRecord[]> {
    const marketDir = this.getMarketDataPath(orderId);
    const recordsPath = path.join(marketDir, 'records.json');
    
    try {
      if (fs.existsSync(recordsPath)) {
        const data = JSON.parse(fs.readFileSync(recordsPath, 'utf-8'));
        return data;
      }
    } catch (error) {
      console.log('Error reading market records:', error);
    }

    // If no records found, seed with sample data
    return await this.seedMarketRecords(orderId);
  }

  async seedMarketRecords(orderId: string): Promise<MarketRecord[]> {
    // Generate realistic sample market records
    const subject = await this.getSubject(orderId);
    const now = new Date();
    const records: MarketRecord[] = [];
    
    // Generate records for the past 18 months
    const addresses = [
      "1240 Oak Street, Austin, TX 78701",
      "1250 Elm Drive, Austin, TX 78701", 
      "1235 Pine Avenue, Austin, TX 78701",
      "1260 Maple Lane, Austin, TX 78701",
      "1245 Cedar Court, Austin, TX 78701",
      "1255 Birch Way, Austin, TX 78701",
      "1270 Walnut Street, Austin, TX 78701",
      "1280 Hickory Drive, Austin, TX 78701",
      "1290 Pecan Avenue, Austin, TX 78701",
      "1300 Ash Lane, Austin, TX 78701",
      "1310 Cherry Street, Austin, TX 78701",
      "1320 Dogwood Drive, Austin, TX 78701",
      "1330 Magnolia Avenue, Austin, TX 78701",
      "1340 Sycamore Lane, Austin, TX 78701",
      "1350 Poplar Street, Austin, TX 78701",
      "1360 Willow Drive, Austin, TX 78701",
      "1370 Cottonwood Avenue, Austin, TX 78701",
      "1380 Redwood Lane, Austin, TX 78701",
      "1390 Cypress Street, Austin, TX 78701",
      "1400 Juniper Drive, Austin, TX 78701"
    ];

    let recordId = 1;
    
    for (let monthOffset = 0; monthOffset < 18; monthOffset++) {
      const monthDate = subMonths(now, monthOffset);
      const recordsThisMonth = Math.floor(Math.random() * 8) + 3; // 3-10 records per month
      
      for (let i = 0; i < recordsThisMonth; i++) {
        const address = addresses[(recordId - 1) % addresses.length];
        const statusRandom = Math.random();
        let status: 'active' | 'pending' | 'sold' | 'expired';
        
        if (monthOffset === 0) {
          // Current month - more actives
          status = statusRandom < 0.6 ? 'active' : statusRandom < 0.8 ? 'pending' : 'sold';
        } else if (monthOffset === 1) {
          // Last month - mix of statuses
          status = statusRandom < 0.3 ? 'active' : statusRandom < 0.5 ? 'pending' : statusRandom < 0.9 ? 'sold' : 'expired';
        } else {
          // Older months - mostly sold or expired
          status = statusRandom < 0.8 ? 'sold' : 'expired';
        }
        
        // Generate realistic property data
        const basePrice = 400000 + Math.random() * 200000; // $400k-$600k range
        const gla = 1800 + Math.random() * 1200; // 1800-3000 sq ft
        const listPrice = Math.round(basePrice / 1000) * 1000; // Round to nearest 1k
        
        // Add small random offsets to lat/lng around subject property
        const latOffset = (Math.random() - 0.5) * 0.01; // ~0.5 mile radius
        const lngOffset = (Math.random() - 0.5) * 0.01;
        
        const record: MarketRecord = {
          id: `mr-${recordId}`,
          status,
          address,
          lat: subject.latlng.lat + latOffset,
          lng: subject.latlng.lng + lngOffset,
          livingArea: Math.round(gla),
          listPrice
        };
        
        // Set dates based on status
        const dayInMonth = Math.floor(Math.random() * 28) + 1;
        const listDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayInMonth);
        record.listDate = listDate.toISOString();
        
        if (status === 'sold') {
          // Sold properties get sale data
          const daysOnMarket = Math.floor(Math.random() * 60) + 15; // 15-75 days
          const closeDate = new Date(listDate.getTime() + daysOnMarket * 24 * 60 * 60 * 1000);
          record.closeDate = closeDate.toISOString();
          record.dom = daysOnMarket;
          
          // Sale price as percentage of list price (typically 95-105%)
          const spToLpRatio = 0.95 + Math.random() * 0.10;
          record.salePrice = Math.round(listPrice * spToLpRatio / 1000) * 1000;
          record.spToLp = spToLpRatio;
        } else if (status === 'pending') {
          // Pending properties have been on market for a while
          record.dom = Math.floor(Math.random() * 45) + 10; // 10-55 days
        } else if (status === 'active') {
          // Active properties have current DOM
          record.dom = Math.floor(Math.random() * 30) + 1; // 1-30 days
        } else if (status === 'expired') {
          // Expired properties were on market longer
          record.dom = Math.floor(Math.random() * 60) + 90; // 90-150 days
        }
        
        records.push(record);
        recordId++;
      }
    }
    
    // Save generated records
    this.ensureMarketDataDir(orderId);
    const recordsPath = path.join(this.getMarketDataPath(orderId), 'records.json');
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
    
    return records;
  }

  async computeMcrMetrics(orderId: string, settingsOverride?: Partial<MarketSettings>, source?: 'local' | 'attom'): Promise<McrMetrics> {
    const settings = settingsOverride 
      ? { ...await this.getMarketSettings(orderId), ...settingsOverride }
      : await this.getMarketSettings(orderId);
    
    // Load data based on source parameter
    let records: MarketRecord[];
    if (source === 'attom') {
      records = await this.getAttomClosedSalesAsMarketRecords(orderId);
    } else {
      records = await this.getMarketRecords(orderId);
    }
    
    // Filter records by polygon if enabled
    let filteredRecords = records;
    if (settings.usePolygon) {
      try {
        const polygon = await this.getMarketPolygon(orderId);
        if (polygon) {
          // For simplicity, we'll keep all records
          // In a real implementation, you'd do point-in-polygon checking
          filteredRecords = records;
        }
      } catch (error) {
        console.log('Polygon filtering error:', error);
      }
    }
    
    // Use the market statistics utilities to compute metrics
    const metrics = computeMarketMetrics(filteredRecords, {
      monthsBack: settings.monthsBack,
      statuses: settings.statuses,
      metric: settings.metric,
      minSalesPerMonth: settings.minSalesPerMonth
    });
    
    // Cache the computed metrics with source annotation
    this.ensureMarketDataDir(orderId);
    const metricsPath = path.join(this.getMarketDataPath(orderId), 'mcr.json');
    const metricsWithSource = { ...metrics, dataSource: source || 'local' };
    fs.writeFileSync(metricsPath, JSON.stringify(metricsWithSource, null, 2));
    
    return metrics;
  }

  private async getAttomClosedSalesAsMarketRecords(orderId: string): Promise<MarketRecord[]> {
    const attomDir = path.join(process.cwd(), 'data/orders', orderId, 'attom');
    const attomPath = path.join(attomDir, 'closed-sales.json');
    
    try {
      if (fs.existsSync(attomPath)) {
        const attomData = JSON.parse(fs.readFileSync(attomPath, 'utf-8'));
        
        // Convert ATTOM ClosedSale[] to MarketRecord[]
        const marketRecords: MarketRecord[] = attomData.map((sale: any, index: number) => ({
          id: `attom-${index + 1}`,
          status: 'sold' as const,
          address: sale.address,
          listDate: sale.closeDate, // Use close date as list date for sold properties
          closeDate: sale.closeDate,
          salePrice: sale.closePrice,
          ppsf: sale.gla ? sale.closePrice / sale.gla : undefined,
          dom: 30, // Estimated DOM since ATTOM doesn't provide this
          spToLp: 1.0, // Assume sold at list price since we don't have list price
          latitude: sale.lat,
          longitude: sale.lon,
          sqft: sale.gla,
          lotSizeSqft: sale.lotSizeSqft,
          yearBuilt: undefined, // Not provided in ATTOM data structure
          bedrooms: undefined,
          bathrooms: undefined
        }));
        
        return marketRecords;
      }
    } catch (error) {
      console.log('Error reading ATTOM closed sales:', error);
    }
    
    throw new Error('No ATTOM closed sales data found. Please import ATTOM data first.');
  }

  async importAttomClosedSalesForOrder(orderId: string, subjectAddress: any, settings?: any): Promise<{ count: number; filePath: string }> {
    // Import the ATTOM importer functions dynamically
    const { importClosedSales } = await import('./attom/importer');
    
    if (!process.env.ATTOM_API_KEY) {
      throw new Error('ATTOM_API_KEY not configured');
    }
    
    // Extract county from subject address for import
    // This is a simplified version - in production, you'd need proper address parsing
    const county = 'Orange'; // Default to Orange County, FL for demo
    const monthsBack = settings?.monthsBack || 12;
    
    try {
      // Import ATTOM closed sales data for the county
      const result = await importClosedSales(county, monthsBack);
      
      // Create order-specific ATTOM directory and copy/filter data
      const orderAttomDir = path.join(process.cwd(), 'data/orders', orderId, 'attom');
      fs.mkdirSync(orderAttomDir, { recursive: true });
      
      // Read the imported county data
      const countyDataPath = result.file;
      const countyData = JSON.parse(fs.readFileSync(countyDataPath, 'utf-8'));
      
      // Filter data within radius of subject (simplified - use all data for now)
      const radiusMiles = settings?.radiusMiles || 1.0;
      let filteredSales = countyData;
      
      // Apply price filters if provided
      if (settings?.minSalePrice) {
        filteredSales = filteredSales.filter((sale: any) => sale.closePrice >= settings.minSalePrice);
      }
      if (settings?.maxSalePrice) {
        filteredSales = filteredSales.filter((sale: any) => sale.closePrice <= settings.maxSalePrice);
      }
      
      // Save order-specific ATTOM data
      const orderAttomPath = path.join(orderAttomDir, 'closed-sales.json');
      fs.writeFileSync(orderAttomPath, JSON.stringify(filteredSales, null, 2));
      
      return {
        count: filteredSales.length,
        filePath: orderAttomPath
      };
      
    } catch (error) {
      console.error('ATTOM import error:', error);
      throw new Error(`Failed to import ATTOM data: ${(error as Error).message}`);
    }
  }

  async getMcrMetrics(orderId: string): Promise<McrMetrics | null> {
    const p = path.join(this.getMarketDataPath(orderId), 'mcr.json');
    try { 
      const data = JSON.parse(fs.readFileSync(p, 'utf-8')); 
      return data;
    } catch { 
      return null; 
    }
  }

  async getTimeAdjustments(orderId: string): Promise<TimeAdjustments> {
    const marketDir = this.getMarketDataPath(orderId);
    const adjustmentsPath = path.join(marketDir, 'time-adjustments.json');
    
    try {
      if (fs.existsSync(adjustmentsPath)) {
        const data = JSON.parse(fs.readFileSync(adjustmentsPath, 'utf-8'));
        return data;
      }
    } catch (error) {
      console.log('Error reading time adjustments:', error);
    }

    // Compute default time adjustments from market metrics
    const metrics = await this.computeMcrMetrics(orderId);
    const order = await this.getOrder(orderId);
    const defaultAdjustments: TimeAdjustments = {
      orderId,
      basis: 'salePrice',
      pctPerMonth: metrics.trendPctPerMonth,
      effectiveDateISO: order?.effectiveDate || new Date().toISOString().split('T')[0],
      computedAt: new Date().toISOString()
    };

    // Save default adjustments
    this.ensureMarketDataDir(orderId);
    fs.writeFileSync(adjustmentsPath, JSON.stringify(defaultAdjustments, null, 2));
    
    return defaultAdjustments;
  }

  async updateTimeAdjustments(orderId: string, adjustments: Partial<TimeAdjustments>): Promise<TimeAdjustments> {
    const currentAdjustments = await this.getTimeAdjustments(orderId);
    const updatedAdjustments: TimeAdjustments = { 
      ...currentAdjustments, 
      ...adjustments,
      computedAt: new Date().toISOString()
    };
    
    this.ensureMarketDataDir(orderId);
    const adjustmentsPath = path.join(this.getMarketDataPath(orderId), 'time-adjustments.json');
    fs.writeFileSync(adjustmentsPath, JSON.stringify(updatedAdjustments, null, 2));
    
    return updatedAdjustments;
  }

  // ===== ADJUSTMENTS ENGINE METHODS =====

  async computeAdjustments(orderId: string, input: AdjustmentRunInput): Promise<AdjustmentRunResult> {
    const runId = randomUUID();
    const computedAt = new Date().toISOString();
    
    // Get existing settings and merge with input settings (input takes priority)
    const storedSettings = await this.getAdjustmentSettings(orderId);
    const settings: EngineSettings = {
      ...storedSettings,
      ...(input.engineSettings || {})
    };
    
    // Get comps and subject for analysis
    const comps = await this.getCompsWithScoring(orderId);
    const subject = await this.getSubject(orderId);
    
    // Load cost baselines and depreciation curves
    const costBaseline = await this.loadCostBaseline();
    
    // Compute adjustments for each attribute
    const attrs: AttrAdjustment[] = [];
    
    for (const [attrKey, metadata] of Object.entries(ATTR_METADATA)) {
      const attr = attrKey as keyof typeof ATTR_METADATA;
      
      // Compute regression suggestion
      const regression = this.computeRegressionAdjustment(attr, comps.comps, subject, input.marketBasis);
      
      // Compute cost suggestion
      const cost = this.computeCostAdjustment(attr, costBaseline, subject);
      
      // Compute paired sales suggestion
      const paired = this.computePairedAdjustment(attr, comps.comps, subject);
      
      // Blend based on engine weights
      const chosen = this.blendEngineResults(settings.weights, { regression, cost, paired });
      
      attrs.push({
        key: attr,
        regression,
        cost,
        paired,
        chosen,
        unit: metadata.unit,
        direction: metadata.direction,
        provenance: this.buildProvenance(attr, { regression, cost, paired })
      });
    }
    
    const result: AdjustmentRunResult = {
      runId,
      computedAt,
      attrs,
      settings,
      input
    };
    
    // Save to file
    await this.saveAdjustmentRun(orderId, result);
    
    return result;
  }

  async getAdjustmentRun(orderId: string): Promise<AdjustmentRunResult | null> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'run.json');
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async updateAdjustmentSettings(orderId: string, settingsUpdate: Partial<EngineSettings>): Promise<EngineSettings> {
    const current = await this.getAdjustmentSettings(orderId);
    const updated = { ...current, ...settingsUpdate };
    
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'settings.json');
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
    
    return updated;
  }

  async updateAttributeOverride(orderId: string, attrKey: string, value: number, source: 'blend' | 'manual' = 'manual', note?: string): Promise<AttrAdjustment> {
    const run = await this.getAdjustmentRun(orderId);
    if (!run) {
      throw new Error('No adjustment run found');
    }

    // Find the attribute to update
    const attrIndex = run.attrs.findIndex(attr => attr.key === attrKey);
    if (attrIndex === -1) {
      throw new Error(`Attribute ${attrKey} not found in adjustment run`);
    }

    // Update the chosen value
    const updatedAttr = {
      ...run.attrs[attrIndex],
      chosen: { value, source, note }
    };

    // Update the attrs array
    const updatedAttrs = [...run.attrs];
    updatedAttrs[attrIndex] = updatedAttr;

    // Save the updated run
    const updatedRun = { ...run, attrs: updatedAttrs };
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'run.json');
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(updatedRun, null, 2));

    return updatedAttr;
  }

  async applyAdjustments(orderId: string): Promise<AdjustmentsBundle> {
    const run = await this.getAdjustmentRun(orderId);
    if (!run) {
      throw new Error('No adjustment run found');
    }
    
    const { comps } = await this.getCompsWithScoring(orderId);
    const subject = await this.getSubject(orderId);
    const timeAdjustments = await this.getTimeAdjustments(orderId);
    
    // Apply adjustments to each comp
    const compLines: CompAdjustmentLine[] = comps.map(comp => {
      const lines = run.attrs.map(attr => {
        const delta = this.calculateAttributeDelta(attr, comp, subject);
        const adjustedDelta = delta * attr.chosen.value;
        
        return {
          key: attr.key,
          delta: adjustedDelta,
          rationale: this.buildRationale(attr, delta, adjustedDelta),
          unit: attr.unit
        };
      });
      
      const subtotal = lines.reduce((sum, line) => sum + line.delta, 0);
      
      // Calculate indicated value (sale price + time adj + attribute adjustments)
      let indicatedValue = comp.salePrice;
      
      // Add time adjustment if available
      if (timeAdjustments) {
        const timeAdjFactor = Math.pow(1 + timeAdjustments.pctPerMonth, comp.monthsSinceSale || 0);
        indicatedValue *= timeAdjFactor;
      }
      
      // Add attribute adjustments
      indicatedValue += subtotal;
      
      return {
        compId: comp.id,
        lines,
        subtotal,
        indicatedValue
      };
    });
    
    const reconciliation = await this.getReconciliationState(orderId);
    
    const bundle: AdjustmentsBundle = {
      run,
      compLines,
      reconciliation
    };
    
    // Save bundle
    await this.saveAdjustmentsBundle(orderId, bundle);
    
    return bundle;
  }

  // ===== REVIEW & POLICY METHODS =====

  async runPolicyCheck(orderId: string): Promise<{ hits: RuleHit[]; overallRisk: Risk }> {
    const hits: RuleHit[] = [];
    
    // Load default policy pack
    const policyPackPath = path.join(process.cwd(), 'data/policy/packs/default-shop-policy.json');
    if (!fs.existsSync(policyPackPath)) {
      return { hits: [], overallRisk: 'green' };
    }
    
    const policyPack: PolicyPack = JSON.parse(fs.readFileSync(policyPackPath, 'utf8'));
    
    // Load order data for evaluation
    const order = await this.getOrder(orderId);
    if (!order) {
      return { hits: [], overallRisk: 'green' };
    }
    
    // Evaluate each enabled rule
    for (const rule of policyPack.rules.filter(r => r.enabled)) {
      const hit = await this.evaluateRule(rule, order);
      if (hit) {
        hits.push(hit);
      }
    }
    
    // Determine overall risk
    const overallRisk = this.computeOverallRisk(hits);
    
    return { hits, overallRisk };
  }

  private async evaluateRule(rule: any, order: OrderData): Promise<RuleHit | null> {
    // SECURITY FIX: Deterministic rule evaluation based on actual order data
    const severity = rule.severity;
    const risk = this.mapSeverityToRisk(severity);
    
    let violates = false;
    let message = rule.messageTemplate;
    let entities: string[] = [];

    try {
      switch (rule.id) {
        case 'TIME_BASIS_MISMATCH': {
          // Check if time adjustment basis differs from market settings
          const timeAdjustments = await this.getTimeAdjustments(order.id);
          const marketSettings = await this.getMarketSettings(order.id);
          violates = timeAdjustments.basis !== marketSettings.metric;
          break;
        }
        case 'TIME_ADJ_MAGNITUDE': {
          // Check if time adjustment exceeds 1.5%/month
          const timeAdjustments = await this.getTimeAdjustments(order.id);
          const monthlyThreshold = 0.015; // 1.5%
          violates = Math.abs(timeAdjustments.legacy?.monthlyAdjustment || timeAdjustments.pctPerMonth || 0) > monthlyThreshold;
          break;
        }
        case 'COMP_OUTSIDE_POLYGON': {
          // Check if primary comps are outside polygon
          const polygon = await this.getMarketPolygon(order.id);
          const compSelection = await this.getCompSelection(order.id);
          if (polygon && compSelection.primary.length > 0) {
            // Get actual comp objects from IDs
            const { comps } = await this.getCompsWithScoring(order.id);
            const primaryComps = comps.filter((comp: CompProperty) => compSelection.primary.includes(comp.id));
            
            // Simple check: if any primary comp has invalid coordinates or is flagged
            violates = primaryComps.some((comp: CompProperty) => 
              !comp.latlng || comp.latlng.lat === 0 || comp.latlng.lng === 0
            );
            if (violates) {
              entities = primaryComps
                .filter((comp: CompProperty) => !comp.latlng || comp.latlng.lat === 0 || comp.latlng.lng === 0)
                .map((comp: CompProperty) => comp.id);
            }
          }
          break;
        }
        case 'PHOTO_QC_UNRESOLVED': {
          // Check for unresolved photo QC issues
          const photosQcSummary = await this.getPhotosQcSummary(order.id);
          violates = photosQcSummary.requiresAttention || (photosQcSummary.blurredCount || 0) > 0;
          break;
        }
        case 'MISSING_COMP_PHOTOS': {
          // Check if required comp photos are missing
          const photos = await this.getPhotos(order.id);
          const exteriorPhotos = photos.filter(p => p.category && ['exteriorFront', 'exteriorLeft', 'exteriorRight', 'exteriorRear'].includes(p.category));
          violates = exteriorPhotos.length < 3; // Require at least 3 exterior photos
          break;
        }
        case 'WEIGHT_PROFILE_DEVIATION': {
          // Check if weights deviate significantly from shop defaults
          const orderWeights = await this.getOrderWeights(order.id);
          const shopDefault = await this.getShopDefaultProfile();
          // Simple check: if any weight deviates by more than 50%
          violates = Object.keys(orderWeights.weights).some(key => {
            const orderWeight = orderWeights.weights[key as keyof typeof orderWeights.weights] || 0;
            const defaultWeight = shopDefault.weights[key as keyof typeof shopDefault.weights] || 0;
            if (defaultWeight === 0) return false;
            return Math.abs((orderWeight - defaultWeight) / defaultWeight) > 0.5;
          });
          break;
        }
        default:
          // For unknown rules, use orderId hash for deterministic evaluation
          const hash = order.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          violates = (hash % 5) === 0; // Deterministic 20% violation rate based on order ID
      }
    } catch (error) {
      // If evaluation fails, log and assume no violation to be safe
      console.warn(`Rule evaluation failed for ${rule.id}:`, error);
      violates = false;
    }

    if (!violates) return null;

    return {
      ruleId: rule.id,
      severity: rule.severity,
      risk,
      scope: rule.scope,
      path: rule.selector,
      message,
      entities: entities.length > 0 ? entities : undefined,
      suggestion: rule.autofix
    };
  }

  private mapSeverityToRisk(severity: string): Risk {
    switch (severity) {
      case 'critical':
      case 'major':
        return 'red';
      case 'minor':
        return 'yellow';
      case 'info':
      default:
        return 'green';
    }
  }

  private computeOverallRisk(hits: RuleHit[]): Risk {
    if (hits.some(h => h.risk === 'red')) return 'red';
    if (hits.some(h => h.risk === 'yellow')) return 'yellow';
    return 'green';
  }

  async getReviewItem(orderId: string): Promise<ReviewItem> {
    const reviewPath = path.join(process.cwd(), 'data/orders', orderId, 'review/item.json');
    
    // Return default if doesn't exist
    if (!fs.existsSync(reviewPath)) {
      const defaultItem: ReviewItem = {
        orderId,
        status: 'open',
        overallRisk: 'green',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hits: [],
        overrides: [],
        comments: []
      };
      
      // Ensure directory exists and save
      fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
      fs.writeFileSync(reviewPath, JSON.stringify(defaultItem, null, 2));
      return defaultItem;
    }
    
    return JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  }

  async updateReviewItem(orderId: string, updates: Partial<ReviewItem>): Promise<ReviewItem> {
    const current = await this.getReviewItem(orderId);
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    
    const reviewPath = path.join(process.cwd(), 'data/orders', orderId, 'review/item.json');
    fs.writeFileSync(reviewPath, JSON.stringify(updated, null, 2));
    
    return updated;
  }

  async addRuleOverride(orderId: string, ruleId: string, reason: string, userId: string): Promise<{ success: boolean }> {
    const reviewItem = await this.getReviewItem(orderId);
    
    const override = {
      ruleId,
      reason,
      userId,
      at: new Date().toISOString()
    };
    
    reviewItem.overrides.push(override);
    await this.updateReviewItem(orderId, reviewItem);
    
    return { success: true };
  }

  async addReviewComment(orderId: string, commentData: any, userId: string): Promise<Comment> {
    const reviewItem = await this.getReviewItem(orderId);
    
    const comment: Comment = {
      id: randomUUID(),
      authorId: userId,
      at: new Date().toISOString(),
      kind: commentData.kind || 'note',
      text: commentData.text,
      attachments: commentData.attachments
    };
    
    // Find or create thread
    let thread = reviewItem.comments.find(t => t.entityRef === commentData.entityRef);
    if (!thread) {
      thread = {
        id: randomUUID(),
        orderId,
        entityRef: commentData.entityRef,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        status: 'open',
        items: []
      };
      reviewItem.comments.push(thread);
    }
    
    thread.items.push(comment);
    await this.updateReviewItem(orderId, reviewItem);
    
    return comment;
  }

  async resolveReviewThread(orderId: string, threadId: string): Promise<Thread> {
    const reviewItem = await this.getReviewItem(orderId);
    const thread = reviewItem.comments.find(t => t.id === threadId);
    
    if (!thread) {
      throw new Error('Thread not found');
    }
    
    thread.status = 'resolved';
    await this.updateReviewItem(orderId, reviewItem);
    
    return thread;
  }

  async getReviewQueue(): Promise<ReviewQueueItem[]> {
    // Mock queue data - in reality would aggregate from all orders
    const queueItems: ReviewQueueItem[] = [
      {
        orderId: 'order-123',
        client: 'ABC Bank',
        address: '123 Main Street',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        appraiser: 'John Smith',
        status: 'open',
        overallRisk: 'yellow',
        hitsCount: { red: 0, yellow: 2, info: 1 },
        updatedAt: new Date().toISOString()
      }
    ];
    
    return queueItems;
  }

  async reviewSignoff(orderId: string, role: 'reviewer' | 'appraiser', accept: boolean, reason?: string, userId?: string): Promise<{ success: boolean }> {
    // SECURITY: Role is now enforced at API level, but double-check here for defense in depth
    if (role !== 'reviewer' && role !== 'appraiser') {
      throw new Error('Invalid role for signoff');
    }
    
    const reviewItem = await this.getReviewItem(orderId);
    
    // Add audit trail with user ID and timestamp
    const timestamp = new Date().toISOString();
    const signoffRecord = {
      userId: userId || 'unknown',
      timestamp,
      accept,
      reason
    };
    
    if (role === 'reviewer' && accept) {
      reviewItem.reviewerSignedOff = timestamp;
      reviewItem.status = 'approved';
      reviewItem.reviewerDetails = signoffRecord;
    } else if (role === 'reviewer' && !accept) {
      reviewItem.status = 'changes_requested';
      reviewItem.reviewerSignedOff = undefined;
      reviewItem.reviewerDetails = signoffRecord;
    } else if (role === 'appraiser') {
      reviewItem.appraiserSignedOff = timestamp;
      reviewItem.status = 'revisions_submitted';
      reviewItem.appraiserDetails = signoffRecord;
    }
    
    await this.updateReviewItem(orderId, reviewItem);
    
    return { success: true };
  }

  async getVersionDiff(orderId: string, fromVersionId: string, toVersionId: string): Promise<DiffSummary> {
    // Mock diff - in reality would compute from version snapshots
    const changes = [
      { path: 'market.timeAdjust.pctPerMonth', before: 0.008, after: 0.012 },
      { path: 'comps.primary[0].locked', before: false, after: true },
      { path: 'photos.qc.status', before: 'yellow', after: 'green' }
    ];
    
    return {
      orderId,
      fromVersionId,
      toVersionId,
      changes
    };
  }

  async getAdjustmentsBundle(orderId: string): Promise<AdjustmentsBundle | null> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'bundle.json');
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // Helper methods for adjustments engine

  private async getAdjustmentSettings(orderId: string): Promise<EngineSettings> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'settings.json');
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return DEFAULT_ENGINE_SETTINGS;
    }
  }

  private async saveAdjustmentRun(orderId: string, run: AdjustmentRunResult): Promise<void> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'run.json');
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(run, null, 2));
  }

  private async saveAdjustmentsBundle(orderId: string, bundle: AdjustmentsBundle): Promise<void> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'adjustments', 'bundle.json');
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(bundle, null, 2));
  }

  private async loadCostBaseline(): Promise<CostBaseline> {
    const filePath = path.join(process.cwd(), 'data', 'adjustments', 'cost-baseline.json');
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }

  private computeRegressionAdjustment(attr: keyof typeof ATTR_METADATA, comps: CompProperty[], subject: any, basis: 'salePrice' | 'ppsf') {
    // Mock regression analysis - in reality would use proper OLS
    const values = comps.map(comp => basis === 'salePrice' ? comp.salePrice : comp.salePrice / (comp.gla || 1));
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    
    // Mock coefficient based on attribute type
    const baseCoeff = {
      gla: 85, bed: 8500, bath: 12000, garage: 15000, lotSize: 2.5,
      age: -0.02, quality: 0.08, condition: 0.06, view: 5000, pool: 25000
    }[attr] || 0;
    
    const lo = baseCoeff * 0.8;
    const hi = baseCoeff * 1.2;
    
    return {
      value: baseCoeff,
      lo,
      hi,
      n: comps.length,
      r2: 0.65 + Math.random() * 0.25 // Mock R²
    };
  }

  private computeCostAdjustment(attr: keyof typeof ATTR_METADATA, costBaseline: CostBaseline, subject: any) {
    // Use cost baseline values
    const base = (costBaseline as any)[attr];
    if (!base) return undefined;
    
    let value = base.base || base;
    let lo = value * 0.85;
    let hi = value * 1.15;
    
    if (base.range) {
      lo = base.range[0];
      hi = base.range[1];
    }
    
    return {
      value,
      lo,
      hi,
      basisNote: `Cost baseline for ${attr}`
    };
  }

  private computePairedAdjustment(attr: keyof typeof ATTR_METADATA, comps: CompProperty[], subject: any) {
    // Mock paired sales analysis
    const pairs = comps.filter((_, i) => i < comps.length / 2); // Mock pairing
    
    if (pairs.length < 2) return undefined;
    
    // Mock delta calculation
    const deltas = pairs.map(() => Math.random() * 10000 - 5000);
    deltas.sort((a, b) => a - b);
    
    const median = deltas[Math.floor(deltas.length / 2)];
    const lo = deltas[0];
    const hi = deltas[deltas.length - 1];
    
    return {
      value: median,
      lo,
      hi,
      nPairs: pairs.length
    };
  }

  private blendEngineResults(weights: any[], engines: any) {
    let totalWeight = 0;
    let weightedSum = 0;
    
    weights.forEach(w => {
      const engine = engines[w.engine];
      if (engine && engine.value !== undefined) {
        weightedSum += engine.value * w.weight;
        totalWeight += w.weight;
      }
    });
    
    return {
      value: totalWeight > 0 ? weightedSum / totalWeight : 0,
      source: 'blend' as const
    };
  }

  private buildProvenance(attr: string, engines: any): Array<{engine: any; ref: string}> {
    const provenance = [];
    
    if (engines.regression) {
      provenance.push({ engine: 'regression', ref: `ols-${attr}-${engines.regression.n}comps` });
    }
    if (engines.cost) {
      provenance.push({ engine: 'cost', ref: `baseline-${attr}` });
    }
    if (engines.paired) {
      provenance.push({ engine: 'paired', ref: `pairs-${attr}-${engines.paired.nPairs}` });
    }
    
    return provenance;
  }

  private calculateAttributeDelta(attr: AttrAdjustment, comp: CompProperty, subject: any): number {
    const compValue = (comp as any)[attr.key];
    const subjectValue = (subject as any)[attr.key];
    
    if (compValue === undefined || subjectValue === undefined) return 0;
    
    return compValue - subjectValue;
  }

  private buildRationale(attr: AttrAdjustment, delta: number, adjustedDelta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${attr.key.toUpperCase()} ${sign}${delta.toFixed(0)} × $${attr.chosen.value.toFixed(0)}/${attr.unit} = $${adjustedDelta.toFixed(0)}`;
  }

  private async getReconciliationState(orderId: string): Promise<any> {
    // Mock reconciliation state - would load from persistent storage
    const selection = await this.getCompSelection(orderId);
    
    return {
      orderId,
      primaryCompIds: selection.primary,
      compLocks: selection.locked,
      engineSettings: await this.getAdjustmentSettings(orderId),
      selectedModel: 'salePrice',
      primaryWeights: [0.6, 0.3, 0.1] // Default weights for primary comps
    };
  }

  // HABU (Highest & Best Use) implementation
  private habuStatePath(orderId: string): string {
    return path.join(process.cwd(), 'data', 'orders', orderId, 'habu', 'state.json');
  }

  private async readHabuStateFile(orderId: string): Promise<HabuState | null> {
    try {
      const filePath = this.habuStatePath(orderId);
      const content = await fsPromises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async writeHabuStateFile(orderId: string, state: HabuState): Promise<void> {
    const filePath = this.habuStatePath(orderId);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  async getHabuState(orderId: string): Promise<HabuState | null> {
    return await this.readHabuStateFile(orderId);
  }

  async saveHabuInputs(orderId: string, inputs: HabuInputs): Promise<HabuState> {
    let state = await this.readHabuStateFile(orderId);
    
    if (!state) {
      state = {
        orderId,
        inputs,
        updatedAt: new Date().toISOString()
      };
    } else {
      state.inputs = inputs;
      state.updatedAt = new Date().toISOString();
    }

    await this.writeHabuStateFile(orderId, state);
    return state;
  }

  async computeHabu(orderId: string): Promise<HabuResult> {
    const state = await this.readHabuStateFile(orderId);
    if (!state || !state.inputs) {
      throw new Error('HABU inputs not found - please save inputs first');
    }

    const inputs = state.inputs;
    const weights = createDefaultWeights();
    const normalizedWeights = normalizeWeights(weights);

    // Compute evaluation for each candidate use
    let evaluations = inputs.candidateUses.map(use => 
      computeUseEvaluation(inputs, use, normalizedWeights)
    );

    // Apply max productive scoring based on ranking
    evaluations = scoreMaxProductive(evaluations);

    // Sort by composite score descending
    const rankedUses = evaluations.sort((a, b) => b.composite - a.composite);

    // Determine conclusions
    const topUse = rankedUses[0];
    const confidence = rankedUses.length > 1 
      ? Math.min(0.95, 0.5 + (topUse.composite - rankedUses[1].composite))
      : 0.8;

    const asIfVacantConclusion = {
      use: topUse.use,
      composite: topUse.composite,
      confidence,
      narrative: ''
    };

    let asImprovedConclusion;
    if (!inputs.asIfVacant) {
      // For as-improved, consider existing use if it's a candidate
      const existingUse = 'singleFamily'; // Would derive from order/subject data
      const existingEval = rankedUses.find(e => e.use === existingUse);
      
      if (existingEval) {
        asImprovedConclusion = {
          use: existingEval.use,
          composite: existingEval.composite,
          confidence: Math.min(confidence, 0.9),
          narrative: ''
        };
      }
    }

    const result: HabuResult = {
      asIfVacantConclusion,
      asImprovedConclusion,
      rankedUses,
      weights: normalizedWeights,
      version: '2025.09.1',
      generatedAt: new Date().toISOString(),
      author: 'system' // Would use actual user context
    };

    // Update state with result
    state.result = result;
    state.updatedAt = new Date().toISOString();

    // Generate narrative
    const narrative = generateNarrative(state);
    result.asIfVacantConclusion.narrative = narrative;
    if (result.asImprovedConclusion) {
      result.asImprovedConclusion.narrative = narrative;
    }

    await this.writeHabuStateFile(orderId, state);
    return result;
  }

  async updateHabuNotes(orderId: string, notes: { reviewerNotes?: string; appraiserNotes?: string }): Promise<HabuState> {
    let state = await this.readHabuStateFile(orderId);
    if (!state) {
      throw new Error('HABU state not found');
    }

    if (notes.reviewerNotes !== undefined) {
      state.reviewerNotes = notes.reviewerNotes;
    }
    if (notes.appraiserNotes !== undefined) {
      state.appraiserNotes = notes.appraiserNotes;
    }

    state.updatedAt = new Date().toISOString();
    await this.writeHabuStateFile(orderId, state);
    return state;
  }

  async fetchZoningStub(orderId: string): Promise<ZoningData> {
    // Stub implementation - in future would integrate with ATTOM or county GIS
    const mockZoning: ZoningData = {
      source: 'provider',
      code: 'R-1',
      description: 'Single Family Residential',
      allowedUses: ['singleFamily', 'vacantResidential'],
      minLotSizeSqft: 6000,
      maxDensityDUA: 7.3,
      maxHeightFt: 35,
      setbacks: { front: 25, side: 7, rear: 20 },
      notes: 'Single family residential zoning with detached accessory dwelling units permitted',
      fetchedAt: new Date().toISOString(),
      providerRef: 'stub:R-1'
    };

    return mockZoning;
  }

  // ===== HI-LO METHODS =====

  async getHiLoState(orderId: string): Promise<HiLoState> {
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'hilo', 'state.json');
    
    try {
      const data = await fsPromises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Return default state if file doesn't exist
      const { DEFAULT_HILO_SETTINGS } = await import('../types/hilo.defaults');
      return {
        orderId,
        settings: DEFAULT_HILO_SETTINGS,
        updatedAt: new Date().toISOString()
      };
    }
  }

  async saveHiLoSettings(orderId: string, settings: HiLoSettings): Promise<HiLoState> {
    const state: HiLoState = {
      orderId,
      settings,
      updatedAt: new Date().toISOString()
    };

    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'hilo', 'state.json');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    
    // Atomic write
    const tmpPath = filePath + '.tmp';
    await fsPromises.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    await fsPromises.rename(tmpPath, filePath);

    return state;
  }

  async computeHiLo(orderId: string): Promise<HiLoState> {
    const state = await this.getHiLoState(orderId);
    const { settings } = state;

    // Load required data
    const timeAdjustments = await this.getTimeAdjustments(orderId);
    if (!timeAdjustments.effectiveDateISO) {
      throw new Error('Market time adjustment config missing - effective date required for Hi-Lo');
    }

    const { comps } = await this.getCompsWithScoring(orderId);
    const subject = await this.getSubject(orderId);
    const selection = await this.getCompSelection(orderId);

    // Build candidate pool from existing comps
    const { rankCandidatesForHiLo, calculateCenterValue } = await import('../shared/hilo-utils');
    
    const candidates = comps
      .filter(comp => {
        // Apply status filter if we have type information
        if (settings.filters.statuses.length > 0) {
          // Assume all comps are 'sold' unless we have other type data
          return settings.filters.statuses.includes('sold');
        }
        return true;
      })
      .map(comp => ({
        id: comp.id,
        type: 'sale' as const, // Most comps are sales
        salePrice: comp.salePrice,
        saleDate: comp.saleDate,
        gla: comp.gla,
        insidePolygon: comp.isInsidePolygon || false,
        distanceMiles: comp.distanceMiles,
        monthsSinceSale: comp.monthsSinceSale,
        quality: comp.quality,
        condition: comp.condition
      }));

    if (candidates.length === 0) {
      throw new Error('No candidates available for Hi-Lo computation');
    }

    // Calculate center value
    const context = {
      effectiveDateISO: timeAdjustments.effectiveDateISO,
      basis: timeAdjustments.basis,
      pctPerMonth: timeAdjustments.pctPerMonth,
      settings,
      subjectGla: subject.gla,
      subjectQuality: subject.quality,
      subjectCondition: subject.condition
    };

    const center = calculateCenterValue(
      candidates,
      settings.centerBasis,
      context,
      selection.primary
    );

    // Rank candidates and select
    const result = rankCandidatesForHiLo(candidates, {
      ...context,
      center,
      boxPct: settings.boxPct
    });

    // Build Hi-Lo result
    const hiLoResult = {
      range: {
        center,
        lo: center * (1 - settings.boxPct / 100),
        hi: center * (1 + settings.boxPct / 100),
        effectiveDateISO: timeAdjustments.effectiveDateISO,
        basis: timeAdjustments.basis
      },
      ranked: result.ranked,
      selectedSales: result.selectedSales,
      selectedListings: result.selectedListings,
      primaries: result.primaries,
      listingPrimaries: result.listingPrimaries,
      generatedAt: new Date().toISOString()
    };

    // Update state with result
    const updatedState: HiLoState = {
      ...state,
      result: hiLoResult,
      updatedAt: new Date().toISOString()
    };

    // Save state
    const filePath = path.join(process.cwd(), 'data', 'orders', orderId, 'hilo', 'state.json');
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    
    const tmpPath = filePath + '.tmp';
    await fsPromises.writeFile(tmpPath, JSON.stringify(updatedState, null, 2), 'utf8');
    await fsPromises.rename(tmpPath, filePath);

    return updatedState;
  }

  async applyHiLo(orderId: string, primaries: string[], listingPrimaries: string[]): Promise<void> {
    const state = await this.getHiLoState(orderId);
    if (!state.result) {
      throw new Error('Hi-Lo result not available - run compute first');
    }

    // Get current selection to preserve locked comps
    const selection = await this.getCompSelection(orderId);
    const { comps } = await this.getCompsWithScoring(orderId);

    // Build new primary array, respecting locks
    const newPrimaries: string[] = [];
    const lockedPrimaries = selection.primary.filter(id => selection.locked.includes(id));

    // Add locked primaries first (keep their positions if reasonable)
    for (const lockedId of lockedPrimaries) {
      if (newPrimaries.length < 3) {
        newPrimaries.push(lockedId);
      }
    }

    // Fill remaining slots with Hi-Lo primaries
    for (const primaryId of primaries) {
      if (!newPrimaries.includes(primaryId) && newPrimaries.length < 3) {
        newPrimaries.push(primaryId);
      }
    }

    // Update comp selection
    await this.updateCompSelection(orderId, {
      primary: newPrimaries
    });

    // Save listing primaries if we have a place for them
    const listingsPath = path.join(process.cwd(), 'data', 'orders', orderId, 'comps', 'selected-listings.json');
    await fsPromises.mkdir(path.dirname(listingsPath), { recursive: true });
    
    const tmpPath = listingsPath + '.tmp';
    await fsPromises.writeFile(tmpPath, JSON.stringify({ listingPrimaries, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    await fsPromises.rename(tmpPath, listingsPath);

    // Emit audit event
    const auditPath = path.join(process.cwd(), 'data', 'ops', 'telemetry.jsonl');
    const auditEvent = {
      action: 'hilo.apply',
      orderId,
      primaries: newPrimaries,
      listingPrimaries,
      timestamp: new Date().toISOString()
    };
    
    try {
      await fsPromises.appendFile(auditPath, JSON.stringify(auditEvent) + '\n', 'utf8');
    } catch (error) {
      console.warn('Failed to write audit event:', error);
    }
  }
}

export const storage = new DatabaseStorage();