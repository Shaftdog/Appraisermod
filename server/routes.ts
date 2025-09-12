import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get order
  app.get("/api/orders/:id", async (req, res) => {
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
  app.post("/api/orders/:id/tabs/:tab/signoff", async (req, res) => {
    try {
      const { action, overrideReason } = req.body;
      
      if (action !== 'sign-appraiser') {
        return res.status(400).json({ message: "Invalid action" });
      }

      const signedBy = "Current User"; // In real app, get from session
      
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
  app.get("/api/orders/:id/tabs/:tab/versions", async (req, res) => {
    try {
      const versions = await storage.getVersions(req.params.id, req.params.tab as any);
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get specific version
  app.get("/api/orders/:id/tabs/:tab/versions/:versionId", async (req, res) => {
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
  app.post("/api/orders/:id/tabs/:tab/review", async (req, res) => {
    try {
      const order = await storage.updateTabQC(req.params.id, req.params.tab as any, req.body);
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
