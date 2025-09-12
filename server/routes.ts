import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth";
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
