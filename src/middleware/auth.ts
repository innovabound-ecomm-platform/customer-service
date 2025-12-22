import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
  };
  userId?: string;
}

/**
 * Middleware to verify user is authenticated
 */
export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.headers["x-user-id"] as string;
  const userEmail = req.headers["x-user-email"] as string;
  const userRoles = req.headers["x-user-roles"] as string;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  req.user = {
    id: userId,
    email: userEmail,
    roles: userRoles ? userRoles.split(",") : [],
  };
  req.userId = userId;

  next();
};

/**
 * Middleware to check if user has required permission
 */
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRoles = req.user?.roles || [];
    
    // Admin role has all permissions
    if (userRoles.includes("admin")) {
      return next();
    }

    // Check specific permission
    const hasPermission = userRoles.some(role => 
      role === permission || role.startsWith(`${permission.split(":")[0]}:`)
    );

    if (!hasPermission) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

/**
 * Optional auth - populates user if present but doesn't require it
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.headers["x-user-id"] as string;
  const userEmail = req.headers["x-user-email"] as string;
  const userRoles = req.headers["x-user-roles"] as string;

  if (userId) {
    req.user = {
      id: userId,
      email: userEmail,
      roles: userRoles ? userRoles.split(",") : [],
    };
    req.userId = userId;
  }

  next();
};
