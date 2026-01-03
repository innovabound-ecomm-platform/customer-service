/**
 * GDPR Admin Routes
 * Administrative GDPR request management
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../../middleware/auth.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /gdpr/admin/export-requests:
 *   get:
 *     summary: List all export requests (admin)
 *     description: Get a paginated list of all data export requests
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of export requests
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to fetch requests
 */
router.get(
  "/admin/export-requests",
  requireAuth,
  requirePermission("gdpr:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        page = "1", 
        limit = "50",
        status,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const where: Prisma.DataExportRequestWhereInput = {};
      if (status) {
        where.status = status as Prisma.DataExportRequestWhereInput["status"];
      }

      const [requests, total] = await Promise.all([
        prisma.dataExportRequest.findMany({
          where,
          orderBy: { requestedAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.dataExportRequest.count({ where }),
      ]);

      return res.status(200).json({
        data: requests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching export requests:", error);
      return res.status(500).json({ error: "Failed to fetch requests" });
    }
  }
);

/**
 * @openapi
 * /gdpr/admin/deletion-requests:
 *   get:
 *     summary: List all deletion requests (admin)
 *     description: Get a paginated list of all data deletion requests
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of deletion requests
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to fetch requests
 */
router.get(
  "/admin/deletion-requests",
  requireAuth,
  requirePermission("gdpr:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        page = "1", 
        limit = "50",
        status,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const where: Prisma.DataDeletionRequestWhereInput = {};
      if (status) {
        where.status = status as Prisma.DataDeletionRequestWhereInput["status"];
      }

      const [requests, total] = await Promise.all([
        prisma.dataDeletionRequest.findMany({
          where,
          orderBy: { requestedAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          include: {
            deletionLog: true,
          },
        }),
        prisma.dataDeletionRequest.count({ where }),
      ]);

      return res.status(200).json({
        data: requests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching deletion requests:", error);
      return res.status(500).json({ error: "Failed to fetch requests" });
    }
  }
);

/**
 * @openapi
 * /gdpr/admin/export-requests/{id}/process:
 *   post:
 *     summary: Process export request (admin)
 *     description: Start processing a data export request
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Export request UUID
 *     responses:
 *       200:
 *         description: Export processing started
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to process request
 */
router.post(
  "/admin/export-requests/:id/process",
  requireAuth,
  requirePermission("gdpr:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;

      const request = await prisma.dataExportRequest.update({
        where: { uuid: id },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          processedBy: adminId,
        },
      });

      // TODO: Trigger actual export job via Kafka

      return res.status(200).json({
        success: true,
        message: "Export processing started",
        request,
      });
    } catch (error) {
      console.error("Error processing export request:", error);
      return res.status(500).json({ error: "Failed to process request" });
    }
  }
);

/**
 * @openapi
 * /gdpr/admin/deletion-requests/{id}/process:
 *   post:
 *     summary: Process deletion request (admin)
 *     description: Start processing a data deletion request
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Deletion request UUID
 *     responses:
 *       200:
 *         description: Deletion processing started
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to process request
 */
router.post(
  "/admin/deletion-requests/:id/process",
  requireAuth,
  requirePermission("gdpr:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;

      const request = await prisma.dataDeletionRequest.update({
        where: { uuid: id },
        data: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          processedBy: adminId,
        },
      });

      // TODO: Trigger actual deletion job via Kafka

      return res.status(200).json({
        success: true,
        message: "Deletion processing started",
        request,
      });
    } catch (error) {
      console.error("Error processing deletion request:", error);
      return res.status(500).json({ error: "Failed to process request" });
    }
  }
);

export default router;
