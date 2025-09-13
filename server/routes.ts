import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, marketPolygonSchema, compSelectionUpdateSchema, compLockSchema, compSwapSchema, type PhotoMeta, type PhotoAddenda, type PhotosQcSummary, photoUpdateSchema, photoMasksSchema, photoAddendaSchema, bulkPhotoUpdateSchema } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth";
import { validateWeights, validateConstraints } from "../shared/scoring";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import "./types"; // Import session type extensions

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
        const updatedSelection = await storage.swapComp(orderId, candidateId, targetIndex);
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

  const httpServer = createServer(app);
  return httpServer;
}
