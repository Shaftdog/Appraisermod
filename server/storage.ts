import { type User, type InsertUser, type Order, type InsertOrder, type Version, type InsertVersion, type OrderData, type TabKey, type RiskStatus, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, type PhotoMeta, type PhotoAddenda, type PhotosQcSummary, type PhotoCategory, type PhotoMasks, type MarketSettings, type MarketRecord, type McrMetrics, type TimeAdjustments } from "@shared/schema";
import { users, orders, versions } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { computeMarketMetrics } from "../client/src/lib/market/stats";
import { format, subMonths, addMonths } from "date-fns";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  authenticateUser(username: string, password: string): Promise<User | null>;
  
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
  computeMcrMetrics(orderId: string, settingsOverride?: Partial<MarketSettings>): Promise<McrMetrics>;
  getTimeAdjustments(orderId: string): Promise<TimeAdjustments>;
  updateTimeAdjustments(orderId: string, adjustments: Partial<TimeAdjustments>): Promise<TimeAdjustments>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeWithSampleData();
  }

  private async initializeWithSampleData() {
    try {
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

  async getUser(id: string): Promise<User | undefined> {
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

  async getUserByUsername(username: string): Promise<User | undefined> {
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

  async createUser(insertUser: InsertUser): Promise<User> {
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

  async authenticateUser(username: string, password: string): Promise<User | null> {
    // Get user with password for verification
    const [userWithPassword] = await db.select().from(users).where(eq(users.username, username));
    if (!userWithPassword) {
      return null;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, userWithPassword.password);
    if (!passwordMatch) {
      return null;
    }

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
  private sampleComps: CompProperty[] = [
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
    
    let compsWithLocation = [...this.sampleComps];
    
    // Add polygon and selection data to each comp
    compsWithLocation = compsWithLocation.map(comp => ({
      ...comp,
      isInsidePolygon: polygon ? isInsidePolygon(comp.latlng, polygon) : true,
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

  // Photos Module implementation
  private photosByOrder: Map<string, PhotoMeta[]> = new Map();
  private photoAddendas: Map<string, PhotoAddenda> = new Map();

  async getPhotos(orderId: string): Promise<PhotoMeta[]> {
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
    this.photosByOrder.set(orderId, photos);

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

    return updatedPhoto;
  }

  async deletePhoto(orderId: string, photoId: string): Promise<void> {
    const photos = await this.getPhotos(orderId);
    const filteredPhotos = photos.filter(p => p.id !== photoId);
    
    if (filteredPhotos.length === photos.length) {
      throw new Error('Photo not found');
    }

    this.photosByOrder.set(orderId, filteredPhotos);

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

    // Simulate processing delay in real implementation
    const blurredPath = photo.displayPath.replace('.jpg', '_blurred.jpg');
    
    return this.updatePhoto(orderId, photoId, {
      processing: {
        blurredPath,
        processingStatus: 'completed',
        lastProcessedAt: new Date().toISOString()
      }
    });
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

  async computeMcrMetrics(orderId: string, settingsOverride?: Partial<MarketSettings>): Promise<McrMetrics> {
    const settings = settingsOverride 
      ? { ...await this.getMarketSettings(orderId), ...settingsOverride }
      : await this.getMarketSettings(orderId);
    
    const records = await this.getMarketRecords(orderId);
    
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
    
    // Cache the computed metrics
    this.ensureMarketDataDir(orderId);
    const metricsPath = path.join(this.getMarketDataPath(orderId), 'mcr.json');
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
    
    return metrics;
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
    const defaultAdjustments: TimeAdjustments = {
      orderId,
      basis: 'salePrice',
      pctPerMonth: metrics.trendPctPerMonth,
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
}

export const storage = new DatabaseStorage();