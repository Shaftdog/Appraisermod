import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, type WeightProfile, type OrderWeights, type WeightSet, type ConstraintSet, type CompProperty, type Subject, type MarketPolygon, type CompSelection, marketPolygonSchema, compSelectionUpdateSchema, compLockSchema, compSwapSchema } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth";
import { validateWeights, validateConstraints } from "../shared/scoring";
import "./types"; // Import session type extensions

export async function registerRoutes(app: Express): Promise<Server> {
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

  const httpServer = createServer(app);
  return httpServer;
}
