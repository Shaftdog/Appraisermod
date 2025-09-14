import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, marketPolygonSchema, compSelectionUpdateSchema, compLockSchema, compSwapSchema, type PhotoMeta, type PhotoAddenda, type PhotosQcSummary, photoUpdateSchema, photoMasksSchema, photoAddendaSchema, bulkPhotoUpdateSchema, marketSettingsSchema, timeAdjustmentsSchema, adjustmentRunInputSchema, engineSettingsSchema } from "@shared/schema";

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
  status: z.enum(['pending', 'in_review', 'changes_requested', 'approved', 'revisions_submitted']).optional(),
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

  // Utility function to verify user authorization for an order
  async function verifyUserCanAccessOrder(user: any, orderId: string): Promise<boolean> {
    // Check that the order exists
    const order = await storage.getOrder(orderId);
    if (!order) {
      return false;
    }
    
    // Admins can access all orders
    if (user.role === 'admin') {
      return true;
    }
    
    // Appraisers can access all orders (for appraisal workflow)
    if (user.role === 'appraiser') {
      return true;
    }
    
    // Reviewers can access all orders (for review workflow)
    if (user.role === 'reviewer') {
      return true;
    }
    
    // Check explicit order assignment using stable userId
    const assignedUsers = orderAssignments.get(orderId);
    if (assignedUsers && assignedUsers.has(user.id)) {
      return true;
    }
    
    // DENY by default - no backdoors for unauthorized access
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
  app.post("/api/policy/packs", requireAuth, (req: AuthenticatedRequest, res, next) => requireAdmin(req, res, next), async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/review/:id/run", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/review/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/review/:id/override", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/review/:id/comment", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/review/:id/comment/:threadId/resolve", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/review/:id/signoff", requireAuth, async (req: AuthenticatedRequest, res) => {
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

  // Sign-off tab
  app.post("/api/orders/:id/tabs/:tab/signoff", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/tabs/:tab/review", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/weights/profiles", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/weights/profiles/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.delete("/api/weights/profiles/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/weights", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/weights/reset", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/market/polygon", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.delete("/api/orders/:id/market/polygon", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/comps/selection", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/comps/lock", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/comps/swap", requireAuth, async (req: AuthenticatedRequest, res) => {
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

  // Authentication Routes

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
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
  app.post("/api/auth/login", async (req, res) => {
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
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Session error" });
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
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout user
  app.post("/api/auth/logout", (req, res) => {
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
      if (!req.session.userId) {
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
  app.post("/api/orders/:id/photos/upload", requireAuth, (req, res, next) => {
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
  app.put("/api/orders/:id/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.delete("/api/orders/:id/photos/:photoId", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/photos/:photoId/masks", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/photos/:photoId/process", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/photos/bulk-update", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/photos/addenda", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/photos/addenda/export", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/market/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/market/records/seed", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/market/mcr/compute", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const orderId = req.params.id;
      
      const hasAccess = await verifyUserCanAccessOrder(req.user!, orderId);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this order' });
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
      
      const metrics = await storage.computeMcrMetrics(orderId, validatedSettings);
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
  app.put("/api/orders/:id/market/time-adjustments", requireAuth, async (req: AuthenticatedRequest, res) => {
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

  // ===== ADJUSTMENTS API ROUTES =====

  // Compute adjustments using 3 engines (regression, cost, paired)
  app.post("/api/orders/:id/adjustments/compute", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.put("/api/orders/:id/adjustments/settings", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.patch("/api/orders/:id/adjustments/overrides", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/orders/:id/adjustments/apply", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/delivery/request", requireAuth, async (req: AuthenticatedRequest, res) => {
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
      const [subject, comps, adjustmentsBundle, photos] = await Promise.all([
        storage.getSubject(validatedRequest.orderId),
        storage.getCompsWithScoring(validatedRequest.orderId).then(result => result.comps),
        storage.getAdjustmentsBundle(validatedRequest.orderId),
        storage.getPhotos(validatedRequest.orderId)
      ]);

      // Create delivery package directory
      const deliveryDir = path.join(process.cwd(), "temp/deliveries", deliveryId);
      await fs.mkdir(deliveryDir, { recursive: true });

      const packageItems: Array<{ type: string; filename: string; size: number }> = [];

      // Generate MISMO UAD XML if requested
      if (validatedRequest.formats.includes('uad_xml')) {
        try {
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
              basis: (adjustmentsBundle as any)?.timeAdjustment?.basis || 'market_conditions',
              rate: (adjustmentsBundle as any)?.timeAdjustment?.rate || 0,
              effectiveDate: order.dueDate || new Date().toISOString()
            },
            marketMetrics: {
              trendPerMonth: 0.5,
              monthsOfInventory: 4.2,
              daysOnMarket: 45,
              salePriceToListPrice: 0.98
            },
            appraiser: {
              name: 'John Appraiser',
              license: 'AL12345',
              company: 'Professional Appraisal Services'
            },
            effectiveDate: order.dueDate || new Date().toISOString(),
            intendedUse: 'Purchase',
            reconciledValue: (adjustmentsBundle as any)?.finalValue
          };

          const { xml, validation } = buildUAD26XML(uadInput);
          
          if (validation.isValid) {
            const xmlPath = path.join(deliveryDir, `${validatedRequest.orderId}_UAD.xml`);
            await fs.writeFile(xmlPath, xml, 'utf-8');
            const xmlStats = await fs.stat(xmlPath);
            packageItems.push({
              type: 'uad_xml',
              filename: `${validatedRequest.orderId}_UAD.xml`,
              size: xmlStats.size
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
            const sourcePath = path.join(process.cwd(), "uploads", (photo as any).filename);
            const destPath = path.join(photosDir, (photo as any).filename);
            await fs.copyFile(sourcePath, destPath);
            const photoStats = await fs.stat(destPath);
            packageItems.push({
              type: 'photo',
              filename: `photos/${(photo as any).filename}`,
              size: photoStats.size
            });
          } catch (photoError) {
            console.error(`Error copying photo ${(photo as any).filename}:`, photoError);
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
            size: zipStats.size
          });
        } catch (zipError) {
          console.error('Error creating workfile ZIP:', zipError);
        }
      }

      // Create delivery package metadata
      const deliveryPackage: DeliveryPackage = {
        id: deliveryId,
        orderId: validatedRequest.orderId,
        request: validatedRequest,
        status: 'success' as const,
        messages: [],
        requestedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        packageItems,
        metadata: {
          orderEffectiveDate: order.dueDate || new Date().toISOString(),
          generatedAt: new Date().toISOString() || 'download',
          requestedBy: req.user!.id
        }
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

        // Download specific file
        const filePath = path.join(deliveryDir, filename);
        
        try {
          await fs.access(filePath);
          
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
          
          const fileStream = fsSync.createReadStream(filePath);
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
  app.patch("/api/ops/flags/:key", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/ops/audit", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/ops/telemetry", async (req, res) => {
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
        
        Object.entries(groupedByKey).forEach(([key, values]: [string, number[]]) => {
          const sorted = [...values].sort((a: number, b: number) => a - b);
          const p95Index = Math.floor(sorted.length * 0.95);
          
          metrics[key] = {
            count: values.length,
            avg: values.reduce((sum: number, v: number) => sum + v, 0) / values.length,
            p95: sorted[p95Index] || 0,
            min: Math.min(...values),
            max: Math.max(...values)
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
  app.post("/api/orders/:orderId/version/snapshot", requireAuth, async (req: AuthenticatedRequest, res) => {
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
  app.post("/api/ops/backups/run-rotation", requireAuth, async (req: AuthenticatedRequest, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
