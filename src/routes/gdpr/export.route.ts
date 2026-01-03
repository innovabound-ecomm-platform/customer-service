/**
 * GDPR Export Routes
 * Data export request handling (Right to Access)
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { dataExportRequestSchema } from "../../schemas/customer.schema.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /gdpr/export:
 *   post:
 *     summary: Request data export
 *     description: Submit a GDPR data export request (Right to Access)
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               exportFormat:
 *                 type: string
 *                 enum: [JSON, CSV]
 *               includeOrders:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Export request submitted
 *       400:
 *         description: Validation error or pending request exists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create export request
 */
router.post("/export", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email || "";
    const validation = dataExportRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Check for pending request
    const pendingRequest = await prisma.dataExportRequest.findFirst({
      where: {
        userId,
        status: { in: ["PENDING", "VERIFIED", "PROCESSING"] },
      },
    });

    if (pendingRequest) {
      return res.status(400).json({ 
        error: "You already have a pending export request",
        requestId: pendingRequest.uuid,
      });
    }

    // Get customer ID if exists
    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    // GDPR requires completion within 30 days
    const dueBy = new Date();
    dueBy.setDate(dueBy.getDate() + 30);

    const request = await prisma.dataExportRequest.create({
      data: {
        userId,
        email: userEmail,
        customerId: customer?.id,
        ...validation.data,
        requestSource: "customer_portal",
        requestIp: req.ip,
        dueBy,
        actorUserId: userId,
        actorType: "USER",
        createdBy: userId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Export request submitted. You will receive an email when ready.",
      requestId: request.uuid,
      dueBy: request.dueBy,
    });
  } catch (error) {
    console.error("Error creating export request:", error);
    return res.status(500).json({ error: "Failed to create export request" });
  }
});

/**
 * @openapi
 * /gdpr/export/{id}:
 *   get:
 *     summary: Get export request status
 *     description: Get the status of a data export request
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
 *         description: Export request status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to fetch request
 */
router.get("/export/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const request = await prisma.dataExportRequest.findFirst({
      where: {
        uuid: id,
        userId,
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    return res.status(200).json({
      id: request.uuid,
      status: request.status,
      exportFormat: request.exportFormat,
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
      expiresAt: request.expiresAt,
      dueBy: request.dueBy,
      // Only include download URL if completed
      ...(request.status === "COMPLETED" && request.exportFileUrl && {
        downloadUrl: request.exportFileUrl,
        downloadCount: request.downloadCount,
      }),
    });
  } catch (error) {
    console.error("Error fetching export request:", error);
    return res.status(500).json({ error: "Failed to fetch request" });
  }
});

export default router;
