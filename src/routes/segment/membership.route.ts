/**
 * Segment Membership Routes
 * Managing customer membership in segments
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../../middleware/auth.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /segments/{id}/members:
 *   get:
 *     summary: Get segment members
 *     description: Get all customers in a specific segment
 *     tags:
 *       - Segments
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Segment ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of segment members
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to fetch members
 */
router.get(
  "/:id/members",
  requireAuth,
  requirePermission("segments:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
      const { page = "1", limit = "50" } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const [members, total] = await Promise.all([
        prisma.customerSegmentMember.findMany({
          where: { segmentId: parseInt(id, 10) },
          orderBy: { joinedAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          include: {
            customer: {
              include: {
                profile: true,
              },
            },
          },
        }),
        prisma.customerSegmentMember.count({
          where: { segmentId: parseInt(id, 10) },
        }),
      ]);

      return res.status(200).json({
        data: members,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching segment members:", error);
      return res.status(500).json({ error: "Failed to fetch members" });
    }
  }
);

/**
 * @openapi
 * /segments/{id}/members:
 *   post:
 *     summary: Add customers to segment
 *     description: Add multiple customers to a segment
 *     tags:
 *       - Segments
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Segment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerIds
 *             properties:
 *               customerIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Customers added successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to add members
 */
router.post(
  "/:id/members",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
      const adminId = req.user!.id;
      const { customerIds } = req.body;

      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ error: "customerIds array is required" });
      }

      // Get customers with their userIds
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, userId: true },
      });

      const result = await prisma.customerSegmentMember.createMany({
        data: customers.map(c => ({
          segmentId: parseInt(id, 10),
          customerId: c.id,
          userId: c.userId,
          addedManually: true,
          actorUserId: adminId,
          actorType: "ADMIN" as const,
          createdBy: adminId,
        })),
        skipDuplicates: true,
      });

      // Update member count
      await prisma.customerSegment.update({
        where: { id: parseInt(id, 10) },
        data: { memberCount: { increment: result.count } },
      });

      return res.status(200).json({
        success: true,
        added: result.count,
        message: `${result.count} customer(s) added to segment`,
      });
    } catch (error) {
      console.error("Error adding segment members:", error);
      return res.status(500).json({ error: "Failed to add members" });
    }
  }
);

/**
 * @openapi
 * /segments/{id}/members/{customerId}:
 *   delete:
 *     summary: Remove customer from segment
 *     description: Remove a customer from a segment
 *     tags:
 *       - Segments
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Segment ID
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to remove member
 */
router.delete(
  "/:id/members/:customerId",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
      const customerId = req.params.customerId!;

      const deleted = await prisma.customerSegmentMember.deleteMany({
        where: {
          segmentId: parseInt(id, 10),
          customerId: parseInt(customerId, 10),
        },
      });

      if (deleted.count > 0) {
        // Update member count
        await prisma.customerSegment.update({
          where: { id: parseInt(id, 10) },
          data: { memberCount: { decrement: 1 } },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Customer removed from segment",
      });
    } catch (error) {
      console.error("Error removing segment member:", error);
      return res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

/**
 * @openapi
 * /segments/{id}/refresh:
 *   post:
 *     summary: Refresh segment membership
 *     description: Refresh automatic segment membership based on rules
 *     tags:
 *       - Segments
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Segment ID
 *     responses:
 *       200:
 *         description: Segment refresh queued
 *       400:
 *         description: Cannot refresh manual segments
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Segment not found
 *       500:
 *         description: Failed to refresh segment
 */
router.post(
  "/:id/refresh",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;

      const segment = await prisma.customerSegment.findUnique({
        where: { id: parseInt(id, 10) },
      });

      if (!segment) {
        return res.status(404).json({ error: "Segment not found" });
      }

      if (segment.segmentType === "MANUAL") {
        return res.status(400).json({ error: "Cannot refresh manual segments" });
      }

      // TODO: Implement rule-based membership evaluation
      // This would involve parsing segment.rules and querying matching customers

      return res.status(200).json({
        success: true,
        message: "Segment refresh queued",
      });
    } catch (error) {
      console.error("Error refreshing segment:", error);
      return res.status(500).json({ error: "Failed to refresh segment" });
    }
  }
);

export default router;
