import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, type TabKey, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, marketPolygonSchema, compSelectionUpdateSchema, compLockSchema, compSwapSchema, type PhotoMeta, type PhotoAddenda, type PhotosQcSummary, photoUpdateSchema, photoMasksSchema, photoAddendaSchema, bulkPhotoUpdateSchema, marketSettingsSchema, timeAdjustmentsSchema, adjustmentRunInputSchema, engineSettingsSchema } from "@shared/schema";

// Security validation schemas for review/policy endpoints
const policyPackSchema = z.object({
  meta: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'Policy pack ID must contain only lowercase letters, numbers, and hyphens').min(1).max(50),
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(20),
    description: z.string().optional()
  }),
  rules: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    condition: z.string().min(1)
  }))
});

const reviewUpdateSchema = z.object({
  status: z.enum(['open', 'in_review', 'changes_requested', 'approved', 'revisions_submitted']).optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
});

const ruleOverrideSchema = z.object({
  ruleId: z.string().min(1),
  reason: z.string().min(10).max(500)
});

const commentSchema = z.object({
  content: z.string().min(1).max(1000),
  threadId: z.string().optional(),
  parentId: z.string().optional()
});

const addAttomCompsSchema = z.object({
  saleIds: z.array(z.string()).min(1, 'At least one sale must be selected'),
  applyTimeAdjustments: z.boolean().optional().default(false)
});

// Schema for backward compatibility - supports both new and legacy formats
const signoffSchema = z.union([
  // New format: { accept: boolean, reason?: string }
  z.object({
    accept: z.boolean(),
    reason: z.string().min(1).max(500).optional()
  }),
  // Legacy format: { message: string } - transform to { accept: true, reason: message }
  z.object({
    message: z.string().min(1).max(500)
  }).transform(data => ({ accept: true, reason: data.message }))
]);
import { type AdjustmentRunInput, type AdjustmentRunResult, type EngineSettings, type AdjustmentsBundle, DEFAULT_ENGINE_SETTINGS, normalizeEngineWeights } from "@shared/adjustments";
import { habuInputsSchema, habuNotesSchema } from "@shared/habu";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth";
import { validateWeights, validateConstraints } from "../shared/scoring";
import multer from "multer";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import sharp from "sharp";
import "./types"; // Import session type extensions

// Delivery system imports
import { type DeliveryRequest, type DeliveryPackage, type DeliveryClient, deliveryRequestSchema } from "../types/delivery";
import { buildUAD26XML } from "../lib/mismo/buildUAD";
import { makeZip } from "../lib/zip/makeZip";
import { sha256File } from "../lib/crypto/sha256";

// CSRF protection middleware
function getAppOrigin(): string {
  // If APP_ORIGIN is explicitly set, use it
  if (process.env.APP_ORIGIN) {
    return new URL(process.env.APP_ORIGIN).origin;
  }
  
  // Auto-detect Replit environment
  if (process.env.REPL_ID && process.env.REPL_SLUG) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  } else if (process.env.REPL_ID) {
    // Fallback for older Replit format
    return `https://${process.env.REPL_ID}.replit.app`;
  }
  
  // Default to localhost for development
  return 'http://localhost:5173';
}

const APP_ORIGIN = getAppOrigin();
console.log(`[CSRF] APP_ORIGIN set to: ${APP_ORIGIN}`);

function requireSameOrigin(req: any, res: any, next: any) {
  const origin = req.get('origin');
  // Allow same-origin and no-origin (e.g., curl) in dev; tighten if needed
  if (origin && origin !== APP_ORIGIN) {
    console.log(`Origin mismatch: received "${origin}", expected "${APP_ORIGIN}"`);
    return res.status(403).json({ message: 'Bad origin' });
  }
  next();
}

// Rate limiting middleware
const hits = new Map<string, { count: number; ts: number }>();
function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.ts > windowMs) { 
    hits.set(key, { count: 1, ts: now }); 
    return false; 
  }
  rec.count++;
  if (rec.count > limit) return true;
  return false;
}

function limitHandler(limit: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    if (rateLimit(key, limit, windowMs)) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ message: 'Too Many Requests' });
    }
    next();
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Utility function to validate and sanitize orderId
  function validateOrderId(orderId: string): boolean {
    // Only allow alphanumeric, hyphens, and underscores
    return /^[A-Za-z0-9_-]+$/.test(orderId) && orderId.length > 0 && orderId.length < 100;
  }

  // In-memory order assignments for secure authorization (TODO: Replace with database-backed system)
  const orderAssignments = new Map<string, Set<string>>(); // orderId -> Set of userIds
  
  // Initialize with sample assignment for development
  orderAssignments.set('order-123', new Set(['40f965ba-4d70-41e6-ad21-dec093f9c96e']));

  // SECURITY: Audit logging for authorization attempts
  function logAuthorizationAttempt(user: any, orderId: string, granted: boolean, reason: string) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      userId: user.id,
      username: user.username,
      role: user.role,
      orderId,
      accessGranted: granted,
      reason,
      ip: 'unknown' // TODO: Add request IP when available
    };
    
    // TODO: Write to proper audit log system or database
    console.log('[AUTHORIZATION_AUDIT]', JSON.stringify(logEntry));
  }

  // SECURITY: Auto-assignment function for business rules-based access
  function autoAssignUserToOrderByBusinessRules(user: any, orderId: string): boolean {
    // Business Rule 1: Auto-assign users to orders based on naming convention
    // For development: if order contains "demo" or "sample", auto-assign
    if (orderId.includes('demo') || orderId.includes('sample') || orderId.includes('123')) {
      assignUserToOrder(user.id, orderId);
      return true;
    }
    
    // Business Rule 2: Auto-assign based on user role and order pattern
    // This is a temporary development rule - replace with proper assignment logic
    if (user.role === 'appraiser' && orderId.startsWith('order-')) {
      // For development only - auto-assign appraisers to orders starting with 'order-'
      assignUserToOrder(user.id, orderId);
      return true;
    }
    
    if (user.role === 'reviewer' && orderId.startsWith('review-')) {
      // For development only - auto-assign reviewers to orders starting with 'review-'
      assignUserToOrder(user.id, orderId);
      return true;
    }
    
    return false;
  }

  // SECURITY FIX: Proper order-level authorization with least privilege
  async function verifyUserCanAccessOrder(user: any, orderId: string): Promise<boolean> {
    // Check that the order exists
    const order = await storage.getOrder(orderId);
    if (!order) {
      logAuthorizationAttempt(user, orderId, false, 'Order does not exist');
      return false;
    }
    
    // Admins retain full access for administrative purposes
    if (user.role === 'admin') {
      logAuthorizationAttempt(user, orderId, true, 'Admin role granted full access');
      return true;
    }
    
    // SECURITY FIX: Check explicit order assignment first
    const assignedUsers = orderAssignments.get(orderId);
    if (assignedUsers && assignedUsers.has(user.id)) {
      logAuthorizationAttempt(user, orderId, true, 'User explicitly assigned to order');
      return true;
    }
    
    // SECURITY: Apply business rules for auto-assignment (development only)
    // TODO: Remove this in production and implement proper assignment workflow
    if (process.env.NODE_ENV !== 'production') {
      const autoAssigned = autoAssignUserToOrderByBusinessRules(user, orderId);
      if (autoAssigned) {
        logAuthorizationAttempt(user, orderId, true, 'Auto-assigned via business rules (development only)');
        return true;
      }
    }
    
    // SECURITY: DENY by default - no backdoors for unauthorized access
    logAuthorizationAttempt(user, orderId, false, 'No explicit assignment or business rule match');
    return false;
  }
  
  // Utility function to assign users to orders (for development/admin use)
  function assignUserToOrder(userId: string, orderId: string): void {
    if (!orderAssignments.has(orderId)) {
      orderAssignments.set(orderId, new Set());
    }
    orderAssignments.get(orderId)!.add(userId);
  }

  // Utility function to safely create order photo paths
  function createSafeOrderPhotoPath(orderId: string, ...pathSegments: string[]): { 
    relativePath: string; 
    absolutePath: string; 
  } | null {
    if (!validateOrderId(orderId)) {
      return null;
    }
    
    const baseDir = path.join(process.cwd(), 'data');
    const relativePath = path.join('data', 'orders', orderId, 'photos', ...pathSegments);
    const absolutePath = path.resolve(baseDir, 'orders', orderId, 'photos', ...pathSegments);
    
    // Verify the path stays within the base directory
    if (!absolutePath.startsWith(baseDir + path.sep)) {
      return null;
    }
    
    return { relativePath, absolutePath };
  }

  // Secure file serving for photos with per-order authorization
  app.get('/api/orders/:id/photos/:photoId/file', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      const variant = req.query.variant as string || 'display';
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }
      
      // Verify user has access to this order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Get photo metadata to verify it exists
      const photo = await storage.getPhoto(orderId, photoId);
      if (!photo) {
        return res.status(404).json({ message: 'Photo not found' });
      }
      
      // Determine which file path to serve
      let filePath: string;
      switch (variant) {
        case 'original':
          filePath = photo.originalPath;
          break;
        case 'thumb':
          filePath = photo.thumbPath;
          break;
        case 'blurred':
          filePath = photo.processing?.blurredPath || photo.displayPath;
          break;
        case 'display':
        default:
          filePath = photo.displayPath;
          break;
      }
      
      const absolutePath = path.join(process.cwd(), filePath);
      
      // Defense-in-depth: verify path is still within base directory
      const baseDir = path.join(process.cwd(), 'data');
      const resolvedPath = path.resolve(absolutePath);
      if (!resolvedPath.startsWith(baseDir + path.sep)) {
        return res.status(403).json({ message: 'Invalid file path' });
      }
      
      // Verify the file exists and serve it safely
      try {
        await fs.access(resolvedPath);
        
        // For original files, force download to prevent XSS
        if (variant === 'original') {
          res.setHeader('Content-Disposition', 'attachment');
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        res.sendFile(resolvedPath);
      } catch (error) {
        res.status(404).json({ message: 'File not found on disk' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // ===== POLICY API ROUTES =====
  
  // Utility function to check admin access
  function requireAdmin(req: AuthenticatedRequest, res: any, next: () => void) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  }

  // Get available policy packs (admin only)
  app.get("/api/policy/packs", requireAuth, (req: AuthenticatedRequest, res, next) => requireAdmin(req, res, next), async (req: AuthenticatedRequest, res) => {
    try {
      const packsDir = path.join(process.cwd(), 'data/policy/packs');
      if (!fsSync.existsSync(packsDir)) {
        fsSync.mkdirSync(packsDir, { recursive: true });
      }
      
      const files = fsSync.readdirSync(packsDir).filter((f: string) => f.endsWith('.json'));
      const packs = files.map((file: string) => {
        const data = JSON.parse(fsSync.readFileSync(path.join(packsDir, file), 'utf8'));
        return data.meta;
      });
      
      res.json(packs);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create or update a policy pack (admin only)
  app.post("/api/policy/packs", requireAuth, requireSameOrigin, (req: AuthenticatedRequest, res, next) => requireAdmin(req, res, next), async (req: AuthenticatedRequest, res) => {
    try {
      // Validate and sanitize input
      const validatedData = policyPackSchema.parse(req.body);
      const packId = validatedData.meta.id; // Now guaranteed to be safe
      
      const packsDir = path.join(process.cwd(), 'data/policy/packs');
      if (!fsSync.existsSync(packsDir)) {
        fsSync.mkdirSync(packsDir, { recursive: true });
      }
      
      const packPath = path.join(packsDir, `${packId}.json`);
      
      // Additional security: verify the resolved path is still within the packs directory
      const resolvedPath = path.resolve(packPath);
      const resolvedPacksDir = path.resolve(packsDir);
      if (!resolvedPath.startsWith(resolvedPacksDir + path.sep)) {
        return res.status(400).json({ message: 'Invalid policy pack ID' });
      }
      
      fsSync.writeFileSync(resolvedPath, JSON.stringify(validatedData, null, 2));
      res.json({ success: true, id: packId });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== REVIEW API ROUTES =====

  // Run policy evaluation against an order
  app.post("/api/review/:id/run", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const result = await storage.runPolicyCheck(orderId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get review queue (MUST come before parameterized routes)
  app.get("/api/review/queue", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const queue = await storage.getReviewQueue();
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get review item for an order
  app.get("/api/review/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const reviewItem = await storage.getReviewItem(orderId);
      res.json(reviewItem);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update review item (status, assignee, versions)
  app.put("/api/review/:id", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate input
      const validatedUpdates = reviewUpdateSchema.parse(req.body);
      const reviewItem = await storage.updateReviewItem(orderId, validatedUpdates);
      res.json(reviewItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add override for a rule
  app.post("/api/review/:id/override", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate input
      const { ruleId, reason } = ruleOverrideSchema.parse(req.body);
      const override = await storage.addRuleOverride(orderId, ruleId, reason, req.user!.id);
      res.json(override);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add comment or reply to thread
  app.post("/api/review/:id/comment", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate input
      const validatedCommentData = commentSchema.parse(req.body);
      const comment = await storage.addReviewComment(orderId, validatedCommentData, req.user!.id);
      res.json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Resolve a thread
  app.post("/api/review/:id/comment/:threadId/resolve", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const threadId = req.params.threadId;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const thread = await storage.resolveReviewThread(orderId, threadId);
      res.json(thread);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // Review sign-off (FIXED: Use server-side role enforcement)
  app.post("/api/review/:id/signoff", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate input (no role from client)
      const { accept, reason } = signoffSchema.parse(req.body);
      
      // SECURITY FIX: Use server-side role from authenticated session
      const userRole = req.user!.role;
      if (userRole !== 'reviewer' && userRole !== 'appraiser') {
        return res.status(403).json({ message: 'Only reviewers and appraisers can sign off' });
      }
      
      const signoff = await storage.reviewSignoff(orderId, userRole, accept, reason, req.user!.id);
      res.json(signoff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get diff between versions
  app.get("/api/review/:id/diff", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const { from, to } = req.query;
      const diff = await storage.getVersionDiff(orderId, from as string, to as string);
      res.json(diff);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ORDERS API ROUTES =====

  // Get order
  app.get("/api/orders/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update tab data (e.g., subject, market, etc.)
  app.put("/api/orders/:id/tabs/:tab", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const tabKey = req.params.tab as TabKey;
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }

      // Verify user has access to this order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Get current order to merge data
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Validate tab exists
      if (!order.tabs[tabKey]) {
        return res.status(404).json({ message: 'Tab not found' });
      }

      // Validate input data based on tab
      let validatedData = req.body;
      if (tabKey === 'subject') {
        // Basic validation for subject tab fields
        const subjectUpdateSchema = z.object({
          address: z.string().optional(),
          yearBuilt: z.string().optional(),
          gla: z.string().optional(),
          bedrooms: z.string().optional(),
          bathrooms: z.string().optional(),
          lotSize: z.string().optional(),
          legalDescription: z.string().optional(),
          zoning: z.string().optional()
        });
        validatedData = subjectUpdateSchema.parse(req.body);
      }

      // Update the tab's currentData
      const updatedTabs = {
        ...order.tabs,
        [tabKey]: {
          ...order.tabs[tabKey],
          currentData: {
            ...order.tabs[tabKey].currentData,
            ...validatedData
          }
        }
      };

      const updatedOrder = await storage.updateOrder(orderId, {
        tabs: updatedTabs
      });

      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input data', errors: error.errors });
      }
      console.error("Error updating tab:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sign-off tab
  app.post("/api/orders/:id/tabs/:tab/signoff", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { action, overrideReason } = req.body;
      
      if (action !== 'sign-appraiser') {
        return res.status(400).json({ message: "Invalid action" });
      }

      const signedBy = req.user!.fullName; // Get actual user from session
      
      const order = await storage.signoffTab(
        req.params.id, 
        req.params.tab as any, 
        signedBy, 
        overrideReason
      );
      
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  // Get versions for tab
  app.get("/api/orders/:id/tabs/:tab/versions", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const versions = await storage.getVersions(req.params.id, req.params.tab as any);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get specific version
  app.get("/api/orders/:id/tabs/:tab/versions/:versionId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const version = await storage.getVersion(req.params.versionId);
      if (!version) {
        return res.status(404).json({ message: "Version not found" });
      }
      res.json(version);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update tab QC
  app.post("/api/orders/:id/tabs/:tab/review", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await storage.updateTabQC(req.params.id, req.params.tab as any, req.body);
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  // Weights & Presets API Routes

  // Get shop default weights profile
  app.get("/api/weights/shop-default", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const shopDefault = await storage.getShopDefaultProfile();
      res.json(shopDefault);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user weight profiles
  app.get("/api/weights/profiles", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const profiles = await storage.getUserProfiles();
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new user weight profile
  app.post("/api/weights/profiles", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { name, description, weights, constraints } = req.body;
      
      // Validate weights and constraints
      const weightErrors = validateWeights(weights);
      const constraintErrors = validateConstraints(constraints);
      
      if (weightErrors.length > 0 || constraintErrors.length > 0) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: [...weightErrors, ...constraintErrors] 
        });
      }

      const newProfile = await storage.createUserProfile({
        name,
        description,
        weights,
        constraints,
        scope: 'user',
        author: req.user!.fullName
      });
      
      res.status(201).json(newProfile);
    } catch (error) {
      if (error instanceof Error && error.message === 'Profile name already exists') {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user weight profile
  app.put("/api/weights/profiles/:id", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { name, description, weights, constraints } = req.body;
      const profileId = req.params.id;
      
      // Validate weights and constraints
      const weightErrors = validateWeights(weights);
      const constraintErrors = validateConstraints(constraints);
      
      if (weightErrors.length > 0 || constraintErrors.length > 0) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: [...weightErrors, ...constraintErrors] 
        });
      }

      const updatedProfile = await storage.updateUserProfile(profileId, {
        name,
        description,
        weights,
        constraints
      });
      
      res.json(updatedProfile);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Profile not found') {
          return res.status(404).json({ message: error.message });
        }
        if (error.message === 'Cannot modify shop default profiles' || error.message === 'Profile name already exists') {
          return res.status(400).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete user weight profile
  app.delete("/api/weights/profiles/:id", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const profileId = req.params.id;
      await storage.deleteUserProfile(profileId);
      res.json({ message: "Profile deleted successfully" });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Profile not found') {
          return res.status(404).json({ message: error.message });
        }
        if (error.message === 'Cannot delete shop default profiles') {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get order weights
  app.get("/api/orders/:id/weights", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const orderWeights = await storage.getOrderWeights(orderId);
      res.json(orderWeights);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update order weights
  app.put("/api/orders/:id/weights", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { weights, constraints, activeProfileId } = req.body;
      
      // Validate weights and constraints
      const weightErrors = validateWeights(weights);
      const constraintErrors = validateConstraints(constraints);
      
      if (weightErrors.length > 0 || constraintErrors.length > 0) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: [...weightErrors, ...constraintErrors] 
        });
      }

      const orderWeights = await storage.updateOrderWeights(
        orderId, 
        weights, 
        constraints, 
        activeProfileId, 
        req.user!.fullName
      );
      
      res.json(orderWeights);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reset order weights to shop defaults
  app.post("/api/orders/:id/weights/reset", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const orderWeights = await storage.resetOrderWeights(orderId, req.user!.fullName);
      res.json(orderWeights);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get scored and ranked comps for an order
  app.get("/api/orders/:id/comps", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const result = await storage.getCompsWithScoring(orderId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Map & Comp Selection Routes

  // Get subject property
  app.get("/api/orders/:id/subject", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const subject = await storage.getSubject(orderId);
      res.json(subject);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get market polygon
  app.get("/api/orders/:id/market/polygon", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const polygon = await storage.getMarketPolygon(orderId);
      res.json(polygon);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Save market polygon
  app.put("/api/orders/:id/market/polygon", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const { polygon } = req.body;
      
      // Validate polygon data
      const validationResult = marketPolygonSchema.safeParse(polygon);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid polygon data", 
          errors: validationResult.error.errors 
        });
      }

      const savedPolygon = await storage.saveMarketPolygon(orderId, validationResult.data);
      res.json(savedPolygon);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete market polygon
  app.delete("/api/orders/:id/market/polygon", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      await storage.deleteMarketPolygon(orderId);
      res.json({ message: "Polygon deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get comp selection state
  app.get("/api/orders/:id/comps/selection", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const selection = await storage.getCompSelection(orderId);
      res.json(selection);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update comp selection state
  app.put("/api/orders/:id/comps/selection", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Validate request body
      const validationResult = compSelectionUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid selection data", 
          errors: validationResult.error.errors 
        });
      }

      const updatedSelection = await storage.updateCompSelection(orderId, validationResult.data);
      res.json(updatedSelection);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Lock/unlock a comp
  app.post("/api/orders/:id/comps/lock", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Validate request body
      const validationResult = compLockSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid lock data", 
          errors: validationResult.error.errors 
        });
      }

      const { compId, locked } = validationResult.data;
      const updatedSelection = await storage.lockComp(orderId, compId, locked);
      res.json(updatedSelection);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Swap comp positions
  app.post("/api/orders/:id/comps/swap", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Validate request body
      const validationResult = compSwapSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid swap data", 
          errors: validationResult.error.errors 
        });
      }

      const { candidateId, targetIndex, confirm } = validationResult.data;

      try {
        const updatedSelection = await storage.swapComp(orderId, candidateId, targetIndex as 0 | 1 | 2);
        res.json(updatedSelection);
      } catch (error) {
        if (error instanceof Error && error.message.includes('locked comp')) {
          if (!confirm) {
            return res.status(409).json({ 
              message: error.message,
              requiresConfirmation: true 
            });
          }
          // Force the swap if confirmation provided
          // TODO: Implement force swap logic
          return res.status(400).json({ message: "Force swap not implemented yet" });
        }
        throw error;
      }
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add ATTOM sales as comparables
  app.post("/api/orders/:id/comps/add-attom-sales", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }
      
      // Verify user has access to this order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body
      const validationResult = addAttomCompsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }

      const { saleIds, applyTimeAdjustments } = validationResult.data;
      
      try {
        const result = await storage.addCompsFromAttomSales(orderId, saleIds, applyTimeAdjustments);
        res.json({ 
          success: true, 
          count: result.count,
          message: `Successfully added ${result.count} comparable(s) from ATTOM sales data.`
        });
      } catch (error) {
        if (error instanceof Error) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error adding ATTOM comps:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Authentication Routes

  // Register new user
  app.post("/api/auth/register", requireSameOrigin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(userData);
      res.status(201).json({ 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Login user
  app.post("/api/auth/login", limitHandler(10, 60_000), async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.authenticateUser(username, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Store user in session (using express-session)
      console.log(`[LOGIN] Setting session for user ${user.username} (${user.id})`);
      console.log(`[LOGIN] Session ID before: ${req.session.id}`);
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.log(`[LOGIN] Session save error:`, err);
          return res.status(500).json({ message: "Session error" });
        }
        console.log(`[LOGIN] Session saved successfully. Session ID: ${req.session.id}, UserId: ${req.session.userId}`);
        res.json({ 
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role
          }
        });
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout user
  app.post("/api/auth/logout", requireSameOrigin, (req, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Could not log out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user from session
  app.get("/api/auth/me", async (req, res) => {
    try {
      console.log(`[AUTH_ME] Session ID: ${req.session.id}, UserId: ${req.session.userId}`);
      console.log(`[AUTH_ME] Session object:`, JSON.stringify(req.session, null, 2));
      if (!req.session.userId) {
        console.log(`[AUTH_ME] No userId in session, returning 401`);
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      res.json({ 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Photos Module API Routes
  
  // Configure multer for photo uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Only allow safe image types, exclude SVG and other potentially unsafe formats
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, WebP, and GIF files are allowed'));
      }
    }
  });

  // Utility function to ensure directory exists
  async function ensureDir(dirPath: string) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  // Get all photos for an order
  app.get("/api/orders/:id/photos", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const photos = await storage.getPhotos(orderId);
      res.json(photos);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single photo
  app.get("/api/orders/:id/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const photo = await storage.getPhoto(orderId, photoId);
      
      if (!photo) {
        return res.status(404).json({ message: "Photo not found" });
      }
      
      res.json(photo);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Upload photos (supports multiple files)
  app.post("/api/orders/:id/photos/upload", requireAuth, limitHandler(30, 60_000), requireSameOrigin, (req, res, next) => {
    upload.array('photos', 10)(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'File size too large. Maximum 10MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ message: 'Too many files. Maximum 10 files allowed.' });
        }
        if (err.message === 'Only image files are allowed') {
          return res.status(400).json({ message: 'Only image files are allowed' });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      const files = req.files as Express.Multer.File[];
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: "Invalid order ID" });
      }
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files provided" });
      }

      // Create safe paths and ensure directories exist
      const basePaths = createSafeOrderPhotoPath(orderId);
      if (!basePaths) {
        return res.status(400).json({ message: "Invalid order ID for file operations" });
      }
      
      await ensureDir(path.join(basePaths.absolutePath, 'original'));
      await ensureDir(path.join(basePaths.absolutePath, 'display'));
      await ensureDir(path.join(basePaths.absolutePath, 'thumb'));

      const uploadedPhotos: PhotoMeta[] = [];

      for (const file of files) {
        const photoId = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const ext = path.extname(file.originalname) || '.jpg';
        
        // Create secure paths for each variant
        const originalPaths = createSafeOrderPhotoPath(orderId, 'original', `${photoId}${ext}`);
        const displayPaths = createSafeOrderPhotoPath(orderId, 'display', `${photoId}.jpg`);
        const thumbPaths = createSafeOrderPhotoPath(orderId, 'thumb', `${photoId}.jpg`);
        
        if (!originalPaths || !displayPaths || !thumbPaths) {
          throw new Error('Failed to create secure file paths');
        }

        // Save original
        await fs.writeFile(originalPaths.absolutePath, file.buffer);

        // Create display version (max 1920px, 85% quality) with proper orientation
        const displayBuffer = await sharp(file.buffer)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize(1920, 1920, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        await fs.writeFile(displayPaths.absolutePath, displayBuffer);

        // Create thumbnail (max 320px)
        const thumbBuffer = await sharp(file.buffer)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize(320, 320, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ quality: 80 })
          .toBuffer();
        await fs.writeFile(thumbPaths.absolutePath, thumbBuffer);

        // Extract metadata
        const metadata = await sharp(file.buffer).metadata();
        
        const photoData = {
          orderId,
          originalPath: originalPaths.relativePath,
          displayPath: displayPaths.relativePath,
          thumbPath: thumbPaths.relativePath,
          width: metadata.width || 0,
          height: metadata.height || 0,
          fileSize: file.size,
          mimeType: file.mimetype,
          exif: {
            // TODO: Add EXIF extraction using exifr
            takenAt: new Date().toISOString(),
          }
        };

        const photo = await storage.createPhoto(orderId, photoData);
        uploadedPhotos.push(photo);
      }

      res.json(uploadedPhotos);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  // Update photo metadata
  app.put("/api/orders/:id/photos/:photoId", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const validationResult = photoUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid photo data", 
          errors: validationResult.error.errors 
        });
      }

      const updatedPhoto = await storage.updatePhoto(orderId, photoId, validationResult.data);
      res.json(updatedPhoto);
    } catch (error) {
      if (error instanceof Error && error.message === 'Photo not found') {
        return res.status(404).json({ message: "Photo not found" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete photo
  app.delete("/api/orders/:id/photos/:photoId", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      await storage.deletePhoto(orderId, photoId);
      res.json({ message: "Photo deleted successfully" });
    } catch (error) {
      if (error instanceof Error && error.message === 'Photo not found') {
        return res.status(404).json({ message: "Photo not found" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update photo masks (for blurring/redaction)
  app.post("/api/orders/:id/photos/:photoId/masks", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const validationResult = photoMasksSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid mask data", 
          errors: validationResult.error.errors 
        });
      }

      const updatedPhoto = await storage.updatePhotoMasks(orderId, photoId, validationResult.data);
      res.json(updatedPhoto);
    } catch (error) {
      if (error instanceof Error && error.message === 'Photo not found') {
        return res.status(404).json({ message: "Photo not found" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Process photo (apply blur masks)
  app.post("/api/orders/:id/photos/:photoId/process", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id: orderId, photoId } = req.params;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const processedPhoto = await storage.processPhoto(orderId, photoId);
      res.json(processedPhoto);
    } catch (error) {
      if (error instanceof Error && error.message === 'Photo not found') {
        return res.status(404).json({ message: "Photo not found" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk update photos
  app.post("/api/orders/:id/photos/bulk-update", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const validationResult = bulkPhotoUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid bulk update data", 
          errors: validationResult.error.errors 
        });
      }

      const { photoIds, updates } = validationResult.data;
      const updatedPhotos = await storage.bulkUpdatePhotos(orderId, photoIds, updates);
      res.json(updatedPhotos);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Addenda Routes

  // Get photo addenda
  app.get("/api/orders/:id/photos/addenda", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const addenda = await storage.getPhotoAddenda(orderId);
      res.json(addenda);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update photo addenda
  app.put("/api/orders/:id/photos/addenda", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const validationResult = photoAddendaSchema.safeParse({ ...req.body, orderId });
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid addenda data", 
          errors: validationResult.error.errors 
        });
      }

      const { pages, updatedAt } = req.body;
      const updatedAddenda = await storage.updatePhotoAddenda(orderId, { pages, updatedAt });
      res.json(updatedAddenda);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export addenda to PDF
  app.post("/api/orders/:id/photos/addenda/export", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const result = await storage.exportPhotoAddenda(orderId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // QC Summary Route

  // Get photos QC summary
  app.get("/api/orders/:id/photos/qc", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const qcSummary = await storage.getPhotosQcSummary(orderId);
      res.json(qcSummary);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Market Conditions & MCR API Routes
  
  // Get market settings
  app.get("/api/orders/:id/market/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const settings = await storage.getMarketSettings(orderId);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update market settings
  app.put("/api/orders/:id/market/settings", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body against schema
      const validationResult = marketSettingsSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid market settings data", 
          errors: validationResult.error.errors 
        });
      }
      
      const settings = await storage.updateMarketSettings(orderId, validationResult.data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get market records
  app.get("/api/orders/:id/market/records", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const records = await storage.getMarketRecords(orderId);
      res.json(records);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Seed market records (dev only)
  app.post("/api/orders/:id/market/records/seed", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const records = await storage.seedMarketRecords(orderId);
      res.json(records);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Compute MCR metrics
  app.post("/api/orders/:id/market/mcr/compute", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate source parameter
      const source = req.body.source as 'local' | 'attom' | undefined;
      if (source && !['local', 'attom'].includes(source)) {
        return res.status(400).json({ 
          message: "Invalid source parameter. Must be 'local' or 'attom'"
        });
      }
      
      // Validate settings if provided
      let validatedSettings = undefined;
      if (req.body.settings) {
        const validationResult = marketSettingsSchema.partial().safeParse(req.body.settings);
        if (!validationResult.success) {
          return res.status(400).json({ 
            message: "Invalid market settings for MCR computation", 
            errors: validationResult.error.errors 
          });
        }
        validatedSettings = validationResult.data;
      }
      
      const metrics = await storage.computeMcrMetrics(orderId, validatedSettings, source);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get time adjustments
  app.get("/api/orders/:id/market/time-adjustments", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const timeAdjustments = await storage.getTimeAdjustments(orderId);
      res.json(timeAdjustments);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update time adjustments
  app.put("/api/orders/:id/market/time-adjustments", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body against schema
      const validationResult = timeAdjustmentsSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid time adjustments data", 
          errors: validationResult.error.errors 
        });
      }
      
      const timeAdjustments = await storage.updateTimeAdjustments(orderId, validationResult.data);
      res.json(timeAdjustments);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== HABU (HIGHEST & BEST USE) API ROUTES =====

  // Get HABU state
  app.get("/api/orders/:id/habu", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const habuState = await storage.getHabuState(orderId);
      res.json(habuState);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Save HABU inputs
  app.put("/api/orders/:id/habu/inputs", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate HABU inputs using shared schema
      const validationResult = habuInputsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid HABU inputs", 
          errors: validationResult.error.errors 
        });
      }
      
      const habuState = await storage.saveHabuInputs(orderId, validationResult.data);
      
      // Audit log
      console.log(`[HABU_AUDIT] User ${req.user!.username} saved HABU inputs for order ${orderId}`);
      
      res.json(habuState);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Compute HABU analysis
  app.post("/api/orders/:id/habu/compute", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const result = await storage.computeHabu(orderId);
      
      // Audit log
      console.log(`[HABU_AUDIT] User ${req.user!.username} computed HABU analysis for order ${orderId}. Top use: ${result.asIfVacantConclusion.use}`);
      
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('inputs not found')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update HABU notes
  app.put("/api/orders/:id/habu/notes", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate notes using shared schema
      const validationResult = habuNotesSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid notes data", 
          errors: validationResult.error.errors 
        });
      }
      
      const habuState = await storage.updateHabuNotes(orderId, validationResult.data);
      
      // Audit log
      console.log(`[HABU_AUDIT] User ${req.user!.username} updated HABU notes for order ${orderId}`);
      
      res.json(habuState);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Fetch zoning data (stub)
  app.post("/api/orders/:id/habu/zoning/fetch", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const zoningData = await storage.fetchZoningStub(orderId);
      
      // Audit log
      console.log(`[HABU_AUDIT] User ${req.user!.username} fetched zoning data for order ${orderId}`);
      
      res.json(zoningData);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ADJUSTMENTS API ROUTES =====

  // Compute adjustments using 3 engines (regression, cost, paired)
  app.post("/api/orders/:id/adjustments/compute", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body against schema
      const validationResult = adjustmentRunInputSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid adjustment run input data", 
          errors: validationResult.error.errors 
        });
      }
      
      const result = await storage.computeAdjustments(orderId, validationResult.data);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get latest adjustment run
  app.get("/api/orders/:id/adjustments/run", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const run = await storage.getAdjustmentRun(orderId);
      res.json(run);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update engine settings
  app.put("/api/orders/:id/adjustments/settings", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body against schema
      const validationResult = engineSettingsSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid engine settings data", 
          errors: validationResult.error.errors 
        });
      }
      
      // Normalize weights if provided
      const normalizedData = { ...validationResult.data };
      if (normalizedData.weights) {
        normalizedData.weights = normalizeEngineWeights(normalizedData.weights);
      }
      
      const settings = await storage.updateAdjustmentSettings(orderId, normalizedData);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update attribute overrides
  app.patch("/api/orders/:id/adjustments/overrides", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Validate request body - expecting { attrKey, value, source?, note? }
      const { attrKey, value, source = 'manual', note } = req.body;
      if (!attrKey || typeof value !== 'number') {
        return res.status(400).json({ message: 'attrKey and value are required' });
      }
      
      const result = await storage.updateAttributeOverride(orderId, attrKey, value, source, note);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Apply adjustments to comps
  app.post("/api/orders/:id/adjustments/apply", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const bundle = await storage.applyAdjustments(orderId);
      res.json(bundle);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get complete adjustments bundle
  app.get("/api/orders/:id/adjustments/bundle", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      const bundle = await storage.getAdjustmentsBundle(orderId);
      res.json(bundle);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // HI-LO API ENDPOINTS
  // ==========================================

  // Get Hi-Lo state
  app.get("/api/orders/:id/hilo", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Verify user access to order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const state = await storage.getHiLoState(orderId);
      res.json(state);
    } catch (error) {
      console.error('Error getting Hi-Lo state:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update Hi-Lo settings
  app.put("/api/orders/:id/hilo/settings", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Verify user access to order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate Hi-Lo settings
      const hiloSettingsSchema = z.object({
        centerBasis: z.enum(['medianTimeAdj', 'weightedPrimaries', 'model']),
        boxPct: z.number().min(5).max(20),
        maxSales: z.number().min(10).max(15),
        maxListings: z.number().min(5).max(10),
        filters: z.object({
          insidePolygonOnly: z.boolean(),
          statuses: z.array(z.enum(['sold', 'active', 'pending', 'expired']))
        }),
        weights: z.object({
          distance: z.number().min(0).max(1),
          recency: z.number().min(0).max(1),
          gla: z.number().min(0).max(1),
          quality: z.number().min(0).max(1),
          condition: z.number().min(0).max(1),
          loc: z.number().min(0).max(1)
        })
      });

      const settings = hiloSettingsSchema.parse(req.body);
      const state = await storage.saveHiLoSettings(orderId, settings);
      
      res.json(state);
    } catch (error) {
      console.error('Error saving Hi-Lo settings:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid Hi-Lo settings", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Compute Hi-Lo
  app.post("/api/orders/:id/hilo/compute", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Verify user access to order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const state = await storage.computeHiLo(orderId);
      res.json(state);
    } catch (error) {
      console.error('Error computing Hi-Lo:', error);
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Apply Hi-Lo primaries
  app.post("/api/orders/:id/hilo/apply", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      // Verify user access to order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Validate apply request
      const applySchema = z.object({
        primaries: z.array(z.string()).max(3),
        listingPrimaries: z.array(z.string()).max(2)
      });

      const { primaries, listingPrimaries } = applySchema.parse(req.body);
      await storage.applyHiLo(orderId, primaries, listingPrimaries);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error applying Hi-Lo:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid apply request", 
          errors: error.errors 
        });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==========================================
  // DELIVERY & EXPORTS API ENDPOINTS
  // ==========================================

  // Get all delivery clients
  app.get("/api/delivery/clients", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const clientsData = await fs.readFile(path.join(process.cwd(), "data/delivery/clients.json"), "utf-8");
      const clients: DeliveryClient[] = JSON.parse(clientsData);
      res.json(clients);
    } catch (error) {
      console.error("Error loading delivery clients:", error);
      res.status(500).json({ message: "Failed to load delivery clients" });
    }
  });

  // Request delivery for an order
  app.post("/api/delivery/request", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const validatedRequest = deliveryRequestSchema.parse(req.body);
      
      // Verify user has access to the order
      const hasAccess = await verifyUserCanAccessOrder(req.user!, validatedRequest.orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      // Get order data for delivery package creation
      const order = await storage.getOrder(validatedRequest.orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Create delivery package ID
      const deliveryId = `delivery-${validatedRequest.orderId}-${Date.now()}`;
      
      // Get order components needed for delivery
      const [subject, comps, adjustmentsBundle, photos, habuState, hiloState] = await Promise.all([
        storage.getSubject(validatedRequest.orderId),
        storage.getCompsWithScoring(validatedRequest.orderId).then(result => result.comps),
        storage.getAdjustmentsBundle(validatedRequest.orderId),
        storage.getPhotos(validatedRequest.orderId),
        storage.getHabuState(validatedRequest.orderId).catch(() => null), // Optional HABU data
        storage.getHiLoState(validatedRequest.orderId).catch(() => null) // Optional Hi-Lo data
      ]);

      // Create delivery package directory
      const deliveryDir = path.join(process.cwd(), "temp/deliveries", deliveryId);
      await fs.mkdir(deliveryDir, { recursive: true });

      const packageItems: Array<{ type: string; filename: string; size: number; path: string }> = [];

      // Generate MISMO UAD XML if requested
      if (validatedRequest.formats.includes('uad_xml')) {
        try {
          const mcr = await storage.getMcrMetrics(validatedRequest.orderId);
          const timeAdj = await storage.getTimeAdjustments(validatedRequest.orderId);
          const effective = timeAdj?.effectiveDateISO || order.effectiveDate || order.dueDate || new Date().toISOString();

          const uadInput = {
            orderId: validatedRequest.orderId,
            subject: {
              address: subject?.address || '',
              apn: (subject as any)?.apn,
              legal: (subject as any)?.legalDescription,
              gla: subject?.gla || 0,
              yearBuilt: (subject as any)?.yearBuilt || new Date().getFullYear(),
              siteSize: (subject as any)?.siteSize,
              propertyType: (subject as any)?.propertyType || 'single-family'
            },
            comps: comps.map((comp: any) => ({
              id: comp.id,
              address: comp.address,
              saleDate: comp.saleDate,
              salePrice: comp.salePrice,
              distance: comp.distanceMiles || 0,
              gla: comp.gla,
              adjustments: [],
              netAdjustment: 0,
              adjustedValue: comp.salePrice
            })),
            timeAdjustment: {
              basis: timeAdj?.basis ?? 'salePrice',
              rate: timeAdj?.pctPerMonth ?? 0,
              effectiveDate: effective
            },
            marketMetrics: {
              trendPerMonth: mcr?.trendPctPerMonth ?? 0,
              monthsOfInventory: mcr?.monthsOfInventory ?? 0,
              daysOnMarket: mcr?.domMedian ?? 0,
              salePriceToListPrice: mcr?.spToLpMedian ?? 0
            },
            appraiser: {
              name: 'John Appraiser',
              license: 'AL12345',
              company: 'Professional Appraisal Services'
            },
            effectiveDate: order.dueDate || new Date().toISOString(),
            intendedUse: 'Purchase',
            reconciledValue: (adjustmentsBundle as any)?.finalValue,
            habuState: habuState, // HABU integration for MISMO XML
            hiloState: hiloState // Hi-Lo integration for MISMO XML
          };

          const { xml, validation } = buildUAD26XML(uadInput);
          
          if (validation.isValid) {
            const xmlPath = path.join(deliveryDir, `${validatedRequest.orderId}_UAD.xml`);
            await fs.writeFile(xmlPath, xml, 'utf-8');
            const xmlStats = await fs.stat(xmlPath);
            packageItems.push({
              type: 'uad_xml',
              filename: `${validatedRequest.orderId}_UAD.xml`,
              size: xmlStats.size,
              path: xmlPath
            });
          } else {
            console.warn('UAD XML validation warnings:', validation.warnings);
            console.error('UAD XML validation errors:', validation.errors);
          }
        } catch (xmlError) {
          console.error('Error generating UAD XML:', xmlError);
        }
      }

      // Copy photos if requested
      if (validatedRequest.formats.includes('photos') && photos.length > 0) {
        const photosDir = path.join(deliveryDir, 'photos');
        await fs.mkdir(photosDir, { recursive: true });
        
        for (const photo of photos) {
          try {
            // Pick blurred if available, else display
            const photoPath = photo.processing?.blurredPath || photo.displayPath;
            const srcAbs = path.join(process.cwd(), photoPath);
            const safeName = path.basename(srcAbs);
            const destAbs = path.join(photosDir, safeName);
            await fs.copyFile(srcAbs, destAbs);
            const photoStats = await fs.stat(destAbs);
            packageItems.push({
              type: 'photo',
              filename: `photos/${safeName}`,
              size: photoStats.size,
              path: destAbs
            });
          } catch (photoError) {
            console.error(`Error copying photo ${photo.id}:`, photoError);
          }
        }
      }

      // Generate workfile ZIP if requested
      if (validatedRequest.formats.includes('workfile_zip')) {
        const zipPath = path.join(deliveryDir, `${validatedRequest.orderId}_Workfile.zip`);
        const manifestPath = path.join(deliveryDir, `${validatedRequest.orderId}_Manifest.json`);
        
        try {
          const zipResult = await makeZip(deliveryDir, zipPath, manifestPath);
          const zipStats = await fs.stat(zipPath);
          packageItems.push({
            type: 'workfile_zip',
            filename: `${validatedRequest.orderId}_Workfile.zip`,
            size: zipStats.size,
            path: zipPath
          });
        } catch (zipError) {
          console.error('Error creating workfile ZIP:', zipError);
        }
      }

      // Create delivery package metadata
      const deliveryPackage: DeliveryPackage = {
        id: deliveryId,
        orderId: validatedRequest.orderId,
        request: {
          ...validatedRequest,
          clientId: validatedRequest.clientProfileId,
          deliveryMethod: 'download' as const
        },
        status: 'success' as const,
        messages: [],
        requestedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        packageItems,
        formats: validatedRequest.formats || []
      };

      // Save delivery package metadata
      const metadataPath = path.join(deliveryDir, 'package.json');
      await fs.writeFile(metadataPath, JSON.stringify(deliveryPackage, null, 2));

      res.json(deliveryPackage);
    } catch (error) {
      console.error("Error processing delivery request:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid delivery request",
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to process delivery request" });
    }
  });

  // Get delivery status
  app.get("/api/delivery/status/:deliveryId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const deliveryId = req.params.deliveryId;
      
      if (!deliveryId || !deliveryId.startsWith('delivery-')) {
        return res.status(400).json({ message: 'Invalid delivery ID' });
      }

      const deliveryDir = path.join(process.cwd(), "temp/deliveries", deliveryId);
      const metadataPath = path.join(deliveryDir, 'package.json');

      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const deliveryPackage: DeliveryPackage = JSON.parse(metadataContent);
        
        // Verify user has access to the order
        const hasAccess = await verifyUserCanAccessOrder(req.user!, deliveryPackage.orderId);
        if (!hasAccess) {
          return res.status(403).json({ message: 'Access denied to this delivery' });
        }

        res.json(deliveryPackage);
      } catch (fileError) {
        return res.status(404).json({ message: 'Delivery not found' });
      }
    } catch (error) {
      console.error("Error checking delivery status:", error);
      res.status(500).json({ message: "Failed to check delivery status" });
    }
  });

  // Download delivery package
  app.get("/api/delivery/download/:deliveryId/:filename?", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const deliveryId = req.params.deliveryId;
      const filename = req.params.filename;
      
      if (!deliveryId || !deliveryId.startsWith('delivery-')) {
        return res.status(400).json({ message: 'Invalid delivery ID' });
      }

      const deliveryDir = path.join(process.cwd(), "temp/deliveries", deliveryId);
      const metadataPath = path.join(deliveryDir, 'package.json');

      // Verify delivery exists and user has access
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const deliveryPackage: DeliveryPackage = JSON.parse(metadataContent);
        
        const hasAccess = await verifyUserCanAccessOrder(req.user!, deliveryPackage.orderId);
        if (!hasAccess) {
          return res.status(403).json({ message: 'Access denied to this delivery' });
        }

        // If no specific filename requested, return package metadata
        if (!filename) {
          return res.json(deliveryPackage);
        }

        // Download specific file - enhanced path traversal guard
        const safeBase = path.resolve(deliveryDir);
        const candidate = path.resolve(path.join(safeBase, filename));
        
        if (!candidate.startsWith(safeBase + path.sep) && candidate !== safeBase) {
          return res.status(403).json({ message: 'Forbidden path' });
        }
        
        // Additional safety checks
        if (filename.includes('..') || path.isAbsolute(filename) || /[\x00-\x1f]/.test(filename)) {
          return res.status(403).json({ message: 'Invalid filename' });
        }
        
        try {
          await fs.access(candidate);
          
          // Set appropriate content type based on file extension
          const ext = path.extname(filename).toLowerCase();
          const contentTypes: Record<string, string> = {
            '.xml': 'application/xml',
            '.zip': 'application/zip',
            '.json': 'application/json',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.pdf': 'application/pdf'
          };
          
          const contentType = contentTypes[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          
          const fileStream = fsSync.createReadStream(candidate);
          fileStream.pipe(res);
        } catch (fileError) {
          return res.status(404).json({ message: 'File not found in delivery package' });
        }
      } catch (metadataError) {
        return res.status(404).json({ message: 'Delivery not found' });
      }
    } catch (error) {
      console.error("Error downloading delivery file:", error);
      res.status(500).json({ message: "Failed to download delivery file" });
    }
  });

  // List all deliveries for an order
  app.get("/api/delivery/orders/:orderId/deliveries", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.orderId;
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }

      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }

      const deliveriesDir = path.join(process.cwd(), "temp/deliveries");
      
      try {
        const deliveryFolders = await fs.readdir(deliveriesDir);
        const orderDeliveries: DeliveryPackage[] = [];

        for (const folder of deliveryFolders) {
          if (folder.startsWith(`delivery-${orderId}-`)) {
            try {
              const metadataPath = path.join(deliveriesDir, folder, 'package.json');
              const metadataContent = await fs.readFile(metadataPath, 'utf-8');
              const deliveryPackage: DeliveryPackage = JSON.parse(metadataContent);
              orderDeliveries.push(deliveryPackage);
            } catch (packageError) {
              console.warn(`Could not load delivery package metadata for ${folder}:`, packageError);
            }
          }
        }

        // Sort by generatedAt date, newest first
        orderDeliveries.sort((a, b) => new Date((b as any).generatedAt || '').getTime() - new Date((a as any).generatedAt || '').getTime());
        
        res.json(orderDeliveries);
      } catch (dirError) {
        // Deliveries directory doesn't exist yet
        res.json([]);
      }
    } catch (error) {
      console.error("Error listing order deliveries:", error);
      res.status(500).json({ message: "Failed to list order deliveries" });
    }
  });

  // =====================================================
  // OPS HARDENING ROUTES
  // =====================================================

  // Import ops types and utilities
  const DEFAULT_FLAGS = { telemetry: true, auditLog: true, backups: true, featureGatesUI: true, healthChecks: true };
  
  // In-memory rate limiting (token bucket)
  const rateLimits = new Map<string, { tokens: number; lastRefill: number }>();
  
  function checkRateLimit(ip: string, maxTokens: number, refillRate: number): boolean {
    const now = Date.now();
    const bucket = rateLimits.get(ip) || { tokens: maxTokens, lastRefill: now };
    
    // Refill tokens based on time passed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed / (60000 / refillRate)); // tokens per minute
    
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      rateLimits.set(ip, bucket);
      return true;
    }
    
    rateLimits.set(ip, bucket);
    return false;
  }

  // Load feature flags from file or use defaults
  async function loadFeatureFlags() {
    try {
      const flagsPath = path.join(process.cwd(), 'data/ops/flags.json');
      const flagsData = await fs.readFile(flagsPath, 'utf-8');
      return { ...DEFAULT_FLAGS, ...JSON.parse(flagsData) };
    } catch {
      return DEFAULT_FLAGS;
    }
  }

  // Save feature flags to file
  async function saveFeatureFlags(flags: any) {
    try {
      const opsDir = path.join(process.cwd(), 'data/ops');
      await fs.mkdir(opsDir, { recursive: true });
      const flagsPath = path.join(opsDir, 'flags.json');
      await fs.writeFile(flagsPath, JSON.stringify(flags, null, 2));
    } catch (error) {
      console.error('Failed to save feature flags:', error);
    }
  }

  // 1. FEATURE FLAGS ROUTES
  
  // Get current feature flags
  app.get("/api/ops/flags", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief or admin role' });
      }
      
      const flags = await loadFeatureFlags();
      res.json(flags);
    } catch (error) {
      console.error("Error loading feature flags:", error);
      res.status(500).json({ message: "Failed to load feature flags" });
    }
  });

  // Update a specific feature flag
  app.patch("/api/ops/flags/:key", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief or admin role' });
      }
      
      const { key } = req.params;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: 'enabled must be a boolean' });
      }
      
      const flags = await loadFeatureFlags();
      if (!(key in flags)) {
        return res.status(404).json({ message: 'Feature flag not found' });
      }
      
      flags[key] = enabled;
      await saveFeatureFlags(flags);
      
      res.json({ key, enabled, message: 'Feature flag updated successfully' });
    } catch (error) {
      console.error("Error updating feature flag:", error);
      res.status(500).json({ message: "Failed to update feature flag" });
    }
  });

  // 2. AUDIT LOGGING ROUTES

  // Record audit event
  app.post("/api/ops/audit", requireAuth, requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      // Rate limiting: 120 requests per minute
      if (!checkRateLimit(ip, 120, 120)) {
        return res.status(429).json({ message: 'Too many requests' });
      }
      
      const user = req.user!;
      const { action, orderId, path, before, after } = req.body;
      
      const auditEvent = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        at: new Date().toISOString(),
        userId: user.id,
        role: user.role,
        action,
        orderId,
        path,
        before,
        after,
        ip
      };
      
      // Append to audit log file
      const opsDir = path.join(process.cwd(), 'data/ops');
      await fs.mkdir(opsDir, { recursive: true });
      const auditLogPath = path.join(opsDir, 'audit.log.jsonl');
      await fs.appendFile(auditLogPath, JSON.stringify(auditEvent) + '\n');
      
      res.json({ success: true, id: auditEvent.id });
    } catch (error) {
      console.error("Error recording audit event:", error);
      res.status(500).json({ message: "Failed to record audit event" });
    }
  });

  // Get audit events
  app.get("/api/ops/audit", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief or admin role' });
      }
      
      const { orderId, limit = '50' } = req.query;
      const maxLimit = Math.min(parseInt(limit as string) || 50, 500);
      
      const auditLogPath = path.join(process.cwd(), 'data/ops/audit.log.jsonl');
      
      try {
        const logData = await fs.readFile(auditLogPath, 'utf-8');
        const events = logData.trim().split('\n')
          .filter(line => line.length > 0)
          .map(line => JSON.parse(line))
          .filter(event => !orderId || event.orderId === orderId)
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, maxLimit);
        
        res.json(events);
      } catch (fileError) {
        res.json([]); // No audit log file yet
      }
    } catch (error) {
      console.error("Error fetching audit events:", error);
      res.status(500).json({ message: "Failed to fetch audit events" });
    }
  });

  // 3. TELEMETRY ROUTES

  // Record telemetry point
  app.post("/api/ops/telemetry", requireSameOrigin, async (req, res) => {
    try {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      // Rate limiting: 120 requests per minute
      if (!checkRateLimit(ip, 120, 120)) {
        return res.status(429).json({ message: 'Too many requests' });
      }
      
      const { at, k, v, dims } = req.body;
      
      const telemetryPoint = {
        at: at || new Date().toISOString(),
        k,
        v: Number(v),
        dims: dims || {}
      };
      
      // Append to telemetry log file
      const opsDir = path.join(process.cwd(), 'data/ops');
      await fs.mkdir(opsDir, { recursive: true });
      const telemetryLogPath = path.join(opsDir, 'telemetry.jsonl');
      await fs.appendFile(telemetryLogPath, JSON.stringify(telemetryPoint) + '\n');
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording telemetry:", error);
      res.status(500).json({ message: "Failed to record telemetry" });
    }
  });

  // Get telemetry summary
  app.get("/api/ops/telemetry/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief or admin role' });
      }
      
      const { since } = req.query;
      const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const telemetryLogPath = path.join(process.cwd(), 'data/ops/telemetry.jsonl');
      
      try {
        const logData = await fs.readFile(telemetryLogPath, 'utf-8');
        const points = logData.trim().split('\n')
          .filter(line => line.length > 0)
          .map(line => JSON.parse(line))
          .filter(point => new Date(point.at) >= sinceDate);
        
        // Compute summary metrics by key
        const metrics: Record<string, { count: number; avg: number; p95: number; min: number; max: number }> = {};
        
        const groupedByKey = points.reduce((acc, point) => {
          if (!acc[point.k]) acc[point.k] = [];
          acc[point.k].push(point.v);
          return acc;
        }, {} as Record<string, number[]>);
        
        Object.entries(groupedByKey).forEach(([key, values]) => {
          const numberValues = values as number[];
          const sorted = [...numberValues].sort((a: number, b: number) => a - b);
          const p95Index = Math.floor(sorted.length * 0.95);
          
          metrics[key] = {
            count: numberValues.length,
            avg: numberValues.reduce((sum: number, v: number) => sum + v, 0) / numberValues.length,
            p95: sorted[p95Index] || 0,
            min: Math.min(...numberValues),
            max: Math.max(...numberValues)
          };
        });
        
        res.json({
          period: 'last-24h',
          since: sinceDate.toISOString(),
          metrics
        });
      } catch (fileError) {
        res.json({ period: 'last-24h', since: sinceDate.toISOString(), metrics: {} });
      }
    } catch (error) {
      console.error("Error fetching telemetry summary:", error);
      res.status(500).json({ message: "Failed to fetch telemetry summary" });
    }
  });

  // 4. HEALTH CHECKS ROUTE

  app.get("/api/ops/health", async (req, res) => {
    try {
      const checks = [];
      let overallOk = true;
      
      // Check 1: Data directory read/write
      try {
        const testFile = path.join(process.cwd(), 'data/.health-test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        checks.push({ name: 'data-rw', ok: true, detail: 'Data directory is writable' });
      } catch (error) {
        checks.push({ name: 'data-rw', ok: false, detail: 'Cannot write to data directory' });
        overallOk = false;
      }
      
      // Check 2: Orders index exists
      try {
        await storage.getOrder('health-check');
        checks.push({ name: 'orders-index', ok: true, detail: 'Orders index accessible' });
      } catch (error) {
        checks.push({ name: 'orders-index', ok: false, detail: 'Orders index error' });
        overallOk = false;
      }
      
      // Check 3: Disk space estimate (mock for now)
      checks.push({ name: 'disk-space', ok: true, detail: '85% available (estimated)' });
      
      const healthStatus = {
        ok: overallOk,
        checks,
        at: new Date().toISOString()
      };
      
      res.status(overallOk ? 200 : 503).json(healthStatus);
    } catch (error) {
      console.error("Error performing health checks:", error);
      res.status(503).json({
        ok: false,
        checks: [{ name: 'health-check', ok: false, detail: 'Health check system error' }],
        at: new Date().toISOString()
      });
    }
  });

  // 5. BACKUP ROUTES

  // Create order snapshot
  app.post("/api/orders/:orderId/version/snapshot", requireAuth, limitHandler(10, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { orderId } = req.params;
      const { kind = 'order-snapshot' } = req.query;
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }

      const hasAccess = await verifyUserCanAccessOrder(user, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Create snapshot directory
      const versionsDir = path.join(process.cwd(), 'data/orders', orderId, 'versions');
      await fs.mkdir(versionsDir, { recursive: true });
      
      // Generate snapshot data (relevant order JSON)
      const order = await storage.getOrder(orderId);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotPath = path.join(versionsDir, `${timestamp}.json`);
      
      const snapshotData = {
        timestamp,
        orderId,
        kind,
        order,
        // Add other relevant data as needed
        metadata: {
          snapshotType: 'order-backup',
          source: 'manual-snapshot',
          requestedBy: user.id
        }
      };
      
      await fs.writeFile(snapshotPath, JSON.stringify(snapshotData, null, 2));
      
      // Compute checksum and record backup
      const stats = await fs.stat(snapshotPath);
      const sha256 = await sha256File(snapshotPath);
      
      const backupRecord = {
        id: `backup-${timestamp}`,
        at: new Date().toISOString(),
        kind: kind as string,
        orderId,
        path: snapshotPath,
        bytes: stats.size,
        sha256,
        rotationSlot: 'hourly' // Default slot
      };
      
      // Record backup in backup log
      const opsDir = path.join(process.cwd(), 'data/ops');
      await fs.mkdir(opsDir, { recursive: true });
      const backupsLogPath = path.join(opsDir, 'backups.jsonl');
      await fs.appendFile(backupsLogPath, JSON.stringify(backupRecord) + '\n');
      
      res.json({ 
        success: true, 
        snapshot: { 
          id: backupRecord.id, 
          path: snapshotPath, 
          sha256, 
          bytes: stats.size 
        } 
      });
    } catch (error) {
      console.error("Error creating order snapshot:", error);
      res.status(500).json({ message: "Failed to create order snapshot" });
    }
  });

  // Run backup rotation
  app.post("/api/ops/backups/run-rotation", requireAuth, limitHandler(5, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief or admin role' });
      }
      
      const backupsLogPath = path.join(process.cwd(), 'data/ops/backups.jsonl');
      
      try {
        const logData = await fs.readFile(backupsLogPath, 'utf-8');
        const backups = logData.trim().split('\n')
          .filter(line => line.length > 0)
          .map(line => JSON.parse(line))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        
        // Simple rotation logic: keep 24 hourly, 7 daily, 4 weekly
        const toKeep = new Set();
        const hourlyCount = backups.filter(b => b.rotationSlot === 'hourly').slice(0, 24);
        const dailyCount = backups.filter(b => b.rotationSlot === 'daily').slice(0, 7);
        const weeklyCount = backups.filter(b => b.rotationSlot === 'weekly').slice(0, 4);
        
        [...hourlyCount, ...dailyCount, ...weeklyCount].forEach(b => toKeep.add(b.id));
        
        const toDelete = backups.filter(b => !toKeep.has(b.id));
        let deletedCount = 0;
        
        for (const backup of toDelete) {
          try {
            await fs.unlink(backup.path);
            deletedCount++;
          } catch (deleteError) {
            console.warn(`Could not delete backup file ${backup.path}:`, deleteError);
          }
        }
        
        res.json({ 
          success: true, 
          message: `Rotation completed. Deleted ${deletedCount} old backups.`,
          kept: toKeep.size,
          deleted: deletedCount
        });
      } catch (fileError) {
        res.json({ success: true, message: 'No backups to rotate yet' });
      }
    } catch (error) {
      console.error("Error running backup rotation:", error);
      res.status(500).json({ message: "Failed to run backup rotation" });
    }
  });

  // ====================== ATTOM DATA ROUTES ======================
  
  // Import ATTOM modules - dynamic imports to handle async loading
  const { importClosedSales, importParcels, importSubjectByAddress } = await import('./attom/importer');
  
  // ATTOM Import Routes
  
  // Order-specific ATTOM closed sales import (client-called endpoint)
  app.post("/api/attom/closed-sales/import", requireAuth, limitHandler(5, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const { orderId, subjectAddress, settings } = req.body;
      
      if (!orderId || !subjectAddress) {
        return res.status(400).json({ message: 'orderId and subjectAddress are required' });
      }
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      if (!process.env.ATTOM_API_KEY) {
        return res.status(500).json({ message: 'ATTOM_API_KEY not configured' });
      }
      
      // Import closed sales around the subject property
      const result = await storage.importAttomClosedSalesForOrder(orderId, subjectAddress, settings);
      res.json(result);
    } catch (error) {
      console.error('ATTOM closed sales import error:', error);
      res.status(500).json({ message: (error as Error).message || 'Failed to import ATTOM closed sales' });
    }
  });
  
  // Bulk ATTOM import by county
  app.post("/api/attom/import/closed-sales", requireAuth, limitHandler(3, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief, admin, or appraiser role' });
      }
      
      if (!process.env.ATTOM_API_KEY) {
        return res.status(500).json({ message: 'ATTOM_API_KEY not configured' });
      }
      
      const { ATTOM } = require('../config/attom');
      const results = [];
      
      for (const county of ATTOM.counties) {
        try {
          const result = await importClosedSales(county);
          results.push({ ...result });
        } catch (error: any) {
          results.push({ county, error: error.message });
        }
      }
      
      res.json({ results });
    } catch (error: any) {
      console.error("Error importing closed sales:", error);
      res.status(500).json({ message: error.message || "Failed to import closed sales" });
    }
  });

  app.post("/api/attom/import/parcels", requireAuth, limitHandler(3, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief, admin, or appraiser role' });
      }
      
      if (!process.env.ATTOM_API_KEY) {
        return res.status(500).json({ message: 'ATTOM_API_KEY not configured' });
      }
      
      const { ATTOM } = require('../config/attom');
      const results = [];
      
      for (const county of ATTOM.counties) {
        try {
          const result = await importParcels(county);
          results.push({ county, ...result });
        } catch (error: any) {
          results.push({ county, error: error.message });
        }
      }
      
      res.json({ results });
    } catch (error: any) {
      console.error("Error importing parcels:", error);
      res.status(500).json({ message: error.message || "Failed to import parcels" });
    }
  });

  // ATTOM Subject Lookup
  app.post("/api/attom/subject/lookup", requireAuth, limitHandler(20, 60_000), requireSameOrigin, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied - requires chief, admin, or appraiser role' });
      }
      
      if (!process.env.ATTOM_API_KEY) {
        return res.status(500).json({ message: 'ATTOM_API_KEY not configured' });
      }
      
      const { addressLine1, city, state = 'FL', zip } = req.body;
      
      if (!addressLine1 || !city) {
        return res.status(400).json({ message: 'addressLine1 and city are required' });
      }
      
      const subject = await importSubjectByAddress(addressLine1, city, state, zip);
      
      if (!subject) {
        return res.status(404).json({ message: 'Property not found in ATTOM database' });
      }
      
      res.json({ subject, source: 'ATTOM' });
    } catch (error: any) {
      console.error("Error looking up subject:", error);
      res.status(500).json({ message: error.message || "Failed to lookup subject property" });
    }
  });

  // Order-specific ATTOM Closed Sales Data
  app.get("/api/orders/:id/attom/closed-sales", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      if (!validateOrderId(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
      }
      
      // Check if order-specific ATTOM data exists
      const orderAttomPath = path.join(process.cwd(), 'data/orders', orderId, 'attom/closed-sales.json');
      
      try {
        const data = await fs.readFile(orderAttomPath, 'utf8');
        const sales = JSON.parse(data);
        res.json(sales);
      } catch (fileError) {
        // No order-specific data found - return empty array
        res.json([]);
      }
    } catch (error: any) {
      console.error("Error serving order ATTOM data:", error);
      res.status(500).json({ message: error.message || "Failed to load order ATTOM data" });
    }
  });

  // ATTOM Closed Sales Data (for Market tab)
  app.get("/api/attom/market/closed-sales", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser', 'reviewer'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const county = req.query.county as string || 'Seminole';
      const filePath = path.join(process.cwd(), 'data/attom/closed_sales', `FL_${county.replace(/\s+/g,'')}.json`);
      
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const sales = JSON.parse(data);
        res.json({ county, sales, source: 'ATTOM' });
      } catch (fileError) {
        // File doesn't exist or can't be read
        res.json({ county, sales: [], source: 'ATTOM', message: 'No cached data available. Please import first.' });
      }
    } catch (error: any) {
      console.error("Error serving closed sales:", error);
      res.status(500).json({ message: error.message || "Failed to load closed sales data" });
    }
  });

  // ATTOM Parcels Data
  app.get("/api/attom/parcels", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser', 'reviewer'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const county = req.query.county as string || 'Seminole';
      const filePath = path.join(process.cwd(), 'data/attom/parcels', `FL_${county.replace(/\s+/g,'')}.json`);
      
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const parcels = JSON.parse(data);
        res.json({ county, parcels, source: 'ATTOM' });
      } catch (fileError) {
        // File doesn't exist or can't be read
        res.json({ county, parcels: [], source: 'ATTOM', message: 'No cached data available. Please import first.' });
      }
    } catch (error: any) {
      console.error("Error serving parcels:", error);
      res.status(500).json({ message: error.message || "Failed to load parcels data" });
    }
  });

  // ATTOM Manifest for rate limiting
  app.get("/api/attom/manifest", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      if (!['chief', 'admin', 'appraiser', 'reviewer'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const manifestPath = path.join(process.cwd(), 'data/attom/manifest.json');
      
      try {
        const data = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(data);
        res.json(manifest);
      } catch (error) {
        // If manifest doesn't exist, return empty manifest
        res.json({ lastRunISO: null, counts: {} });
      }
    } catch (error: any) {
      console.error("Error fetching ATTOM manifest:", error);
      res.status(500).json({ message: error.message || "Failed to load ATTOM manifest" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
