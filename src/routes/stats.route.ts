/**
 * Customer Statistics Route
 * Provides aggregated statistics for admin dashboard
 */

import { Router, Response } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, type AuthenticatedRequest } from "../middleware/auth.js";
import { customerWhere, getSiteId } from "../utils/tenant.utils.js";

const prisma = getCustomerPrisma();
const router: RouterType = Router();

/**
 * @swagger
 * /customers/stats:
 *   get:
 *     tags:
 *       - Customers
 *       - Statistics
 *     summary: Get customer statistics
 *     description: Get aggregated customer statistics for the admin dashboard
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCustomers:
 *                   type: integer
 *                 activeCustomers:
 *                   type: integer
 *                 newCustomersToday:
 *                   type: integer
 *                 newCustomersThisWeek:
 *                   type: integer
 *                 newCustomersThisMonth:
 *                   type: integer
 *                 customersWithOrders:
 *                   type: integer
 *                 averageOrdersPerCustomer:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires admin permission
 */
router.get(
  "/stats",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const siteId = getSiteId(req);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get counts in parallel
      const [
        totalCustomers,
        newCustomersToday,
        newCustomersThisWeek,
        newCustomersThisMonth,
        customersWithOrders,
      ] = await Promise.all([
        prisma.customer.count({ where: customerWhere(siteId, {}, { strict: false }) }),
        prisma.customer.count({
          where: customerWhere(siteId, { createdAt: { gte: startOfToday } }, { strict: false }),
        }),
        prisma.customer.count({
          where: customerWhere(siteId, { createdAt: { gte: startOfWeek } }, { strict: false }),
        }),
        prisma.customer.count({
          where: customerWhere(siteId, { createdAt: { gte: startOfMonth } }, { strict: false }),
        }),
        prisma.customer.count({
          where: customerWhere(siteId, { totalOrders: { gt: 0 } }, { strict: false }),
        }),
      ]);

      // Calculate average orders per customer
      const orderStats = await prisma.customer.aggregate({
        where: customerWhere(siteId, {}, { strict: false }),
        _avg: { totalOrders: true },
        _sum: { totalOrders: true },
      });

      const averageOrdersPerCustomer = orderStats._avg.totalOrders || 0;
      const repeatCustomers = await prisma.customer.count({
        where: customerWhere(siteId, { totalOrders: { gt: 1 } }, { strict: false }),
      });

      // Calculate average lifetime value using totalSpent
      const lifetimeValueStats = await prisma.customer.aggregate({
        where: customerWhere(siteId, {}, { strict: false }),
        _avg: { totalSpent: true },
      });

      // Active customers = customers who made an order in the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const activeCustomers = await prisma.customer.count({
        where: customerWhere(siteId, { lastOrderAt: { gte: ninetyDaysAgo } }, { strict: false }),
      });

      res.json({
        success: true,
        data: {
          totalCustomers,
          activeCustomers,
          newCustomersToday,
          newCustomersThisWeek,
          newCustomersThisMonth,
          customersWithOrders,
          repeatCustomers,
          averageOrdersPerCustomer: Math.round(averageOrdersPerCustomer * 100) / 100,
          averageLifetimeValue: Math.round((lifetimeValueStats._avg.totalSpent || 0) / 100), // Convert from minor units
        },
      });
    } catch (error) {
      console.error("Error fetching customer stats:", error);
      res.status(500).json({ success: false, error: "Failed to fetch customer statistics" });
    }
  }
);

export default router;
