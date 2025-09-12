import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import "../types"; // Import session type extensions

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    role: 'appraiser' | 'reviewer' | 'admin';
    createdAt: Date;
    updatedAt: Date;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      // Clear invalid session
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Invalid session" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Authentication error" });
  }
}

export function requireRole(role: 'appraiser' | 'reviewer' | 'admin') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}