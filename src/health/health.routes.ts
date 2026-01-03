/**
 * Health Check Routes
 * Service health and readiness endpoints
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";

const router: RouterType = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Basic health check endpoint
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: customer-service
 *                 uptime:
 *                   type: number
 *                 timestamp:
 *                   type: number
 */
router.get("/", (req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    service: "customer-service",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Check if service is ready to accept traffic (includes database connectivity)
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get("/ready", async (req: Request, res: Response) => {
  try {
    const prisma = getCustomerPrisma();
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: "ready",
      service: "customer-service",
      checks: {
        database: "ok",
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return res.status(503).json({
      status: "not_ready",
      service: "customer-service",
      checks: {
        database: "error",
      },
      timestamp: Date.now(),
    });
  }
});

/**
 * @openapi
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Check if service process is alive
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get("/live", (req: Request, res: Response) => {
  return res.status(200).json({
    status: "alive",
    service: "customer-service",
    timestamp: Date.now(),
  });
});

export default router;
