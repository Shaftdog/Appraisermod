import { type User, type InsertUser, type Order, type InsertOrder, type Version, type InsertVersion, type OrderData, type TabKey, type RiskStatus } from "@shared/schema";
import { users, orders, versions } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
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
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        role: (insertUser.role || 'appraiser') as 'appraiser' | 'reviewer' | 'admin',
      })
      .returning();
    return user;
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
}

export const storage = new DatabaseStorage();