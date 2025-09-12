import { type User, type InsertUser, type Order, type InsertOrder, type Version, type InsertVersion, type OrderData, type TabKey, type RiskStatus } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getOrder(id: string): Promise<OrderData | undefined>;
  createOrder(order: InsertOrder): Promise<OrderData>;
  updateOrder(id: string, order: Partial<OrderData>): Promise<OrderData>;
  
  getVersions(orderId: string, tabKey: TabKey): Promise<Version[]>;
  createVersion(version: InsertVersion): Promise<Version>;
  getVersion(id: string): Promise<Version | undefined>;
  
  signoffTab(orderId: string, tabKey: TabKey, signedBy: string, overrideReason?: string): Promise<OrderData>;
  updateTabQC(orderId: string, tabKey: TabKey, qc: any): Promise<OrderData>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private orders: Map<string, OrderData>;
  private versions: Map<string, Version>;
  private dataFile: string;

  constructor() {
    this.users = new Map();
    this.orders = new Map();
    this.versions = new Map();
    this.dataFile = path.resolve(process.cwd(), 'data', 'storage.json');
    this.loadSampleData();
  }

  private loadSampleData() {
    try {
      const samplePath = path.resolve(process.cwd(), 'client', 'src', 'data', 'order-sample.json');
      if (fs.existsSync(samplePath)) {
        const data = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
        this.orders.set(data.id, data);
      }
    } catch (error) {
      console.log('No sample data found, starting with empty storage');
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getOrder(id: string): Promise<OrderData | undefined> {
    return this.orders.get(id);
  }

  async createOrder(order: InsertOrder): Promise<OrderData> {
    const id = randomUUID();
    const orderData: OrderData = { 
      ...order, 
      id,
      dueDate: order.dueDate?.toISOString(),
      overallStatus: (order.overallStatus as RiskStatus) || 'green',
      tabs: {} as any 
    };
    this.orders.set(id, orderData);
    return orderData;
  }

  async updateOrder(id: string, updates: Partial<OrderData>): Promise<OrderData> {
    const existing = this.orders.get(id);
    if (!existing) {
      throw new Error('Order not found');
    }
    const updated = { ...existing, ...updates };
    this.orders.set(id, updated);
    return updated;
  }

  async getVersions(orderId: string, tabKey: TabKey): Promise<Version[]> {
    return Array.from(this.versions.values()).filter(
      v => v.orderId === orderId && v.tabKey === tabKey
    );
  }

  async createVersion(version: InsertVersion): Promise<Version> {
    const id = randomUUID();
    const versionData: Version = {
      ...version,
      id,
      createdAt: new Date()
    };
    this.versions.set(id, versionData);
    return versionData;
  }

  async getVersion(id: string): Promise<Version | undefined> {
    return this.versions.get(id);
  }

  async signoffTab(orderId: string, tabKey: TabKey, signedBy: string, overrideReason?: string): Promise<OrderData> {
    const order = this.orders.get(orderId);
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

    this.orders.set(orderId, order);
    return order;
  }

  async updateTabQC(orderId: string, tabKey: TabKey, qc: any): Promise<OrderData> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const tab = order.tabs[tabKey];
    if (!tab) {
      throw new Error('Tab not found');
    }

    tab.qc = { ...tab.qc, ...qc };
    order.overallStatus = this.calculateOverallStatus(order);

    this.orders.set(orderId, order);
    return order;
  }

  private calculateOverallStatus(order: OrderData): RiskStatus {
    const statuses = Object.values(order.tabs).map(tab => tab.qc.status);
    
    if (statuses.includes('red')) return 'red';
    if (statuses.includes('yellow')) return 'yellow';
    return 'green';
  }
}

export const storage = new MemStorage();
