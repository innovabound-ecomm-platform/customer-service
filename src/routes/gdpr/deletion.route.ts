/**
 * GDPR Deletion Routes
 * Data deletion request handling (Right to Erasure)
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { dataDeletionRequestSchema } from "../../schemas/customer.schema.js";
import { getSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /gdpr/delete:
 *   post:
 *     summary: Request data deletion
 *     description: Submit a GDPR data deletion request (Right to Erasure)
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
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *               deleteOrders:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Deletion request submitted
 *       400:
 *         description: Validation error or pending request exists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create deletion request
 */
router.post("/delete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const userEmail = req.user!.email || "";
    const validation = dataDeletionRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Check for pending request
    const pendingRequest = await prisma.dataDeletionRequest.findFirst({
      where: {
        userId,
        status: { in: ["PENDING", "VERIFIED", "PROCESSING"] },
      },
    });

    if (pendingRequest) {
      return res.status(400).json({ 
        error: "You already have a pending deletion request",
        requestId: pendingRequest.uuid,
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    // Note: tenant verification is handled implicitly - customer belongs to authenticated user

    // GDPR: 30 days standard, can extend to 90 for complex requests
    const dueBy = new Date();
    dueBy.setDate(dueBy.getDate() + 30);

    const request = await prisma.dataDeletionRequest.create({
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
      message: "Deletion request submitted. You will receive confirmation by email.",
      requestId: request.uuid,
      dueBy: request.dueBy,
    });
  } catch (error) {
    console.error("Error creating deletion request:", error);
    return res.status(500).json({ error: "Failed to create deletion request" });
  }
});

/**
 * @openapi
 * /gdpr/delete/{id}:
 *   get:
 *     summary: Get deletion request status
 *     description: Get the status of a data deletion request
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
 *         description: Deletion request status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found
 *       500:
 *         description: Failed to fetch request
 */
router.get("/delete/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const request = await prisma.dataDeletionRequest.findFirst({
      where: {
        uuid: id,
        userId,
      },
      include: {
        deletionLog: true,
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    return res.status(200).json({
      id: request.uuid,
      status: request.status,
      requestedAt: request.requestedAt,
      acknowledgedAt: request.acknowledgedAt,
      completedAt: request.completedAt,
      dueBy: request.dueBy,
      retentionReason: request.retentionReason,
      deletionLog: request.deletionLog.map(log => ({
        dataType: log.dataType,
        recordCount: log.recordCount,
        status: log.status,
        deletedAt: log.deletedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching deletion request:", error);
    return res.status(500).json({ error: "Failed to fetch request" });
  }
});

/**
 * @openapi
 * /gdpr/delete/{id}:
 *   delete:
 *     summary: Cancel deletion request
 *     description: Cancel a pending data deletion request
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
 *         description: Deletion request cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found or cannot be cancelled
 *       500:
 *         description: Failed to cancel request
 */
router.delete("/delete/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const request = await prisma.dataDeletionRequest.findFirst({
      where: {
        uuid: id,
        userId,
        status: "PENDING",
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Request not found or cannot be cancelled" });
    }

    await prisma.dataDeletionRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });

    return res.status(200).json({ 
      success: true, 
      message: "Deletion request cancelled" 
    });
  } catch (error) {
    console.error("Error cancelling deletion request:", error);
    return res.status(500).json({ error: "Failed to cancel request" });
  }
});

/**
 * @openapi
 * /gdpr/requests:
 *   get:
 *     summary: Get all GDPR requests
 *     description: Get all GDPR export and deletion requests for the current user
 *     tags:
 *       - GDPR
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of GDPR requests
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch requests
 */
router.get("/requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [exportRequests, deletionRequests] = await Promise.all([
      prisma.dataExportRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: "desc" },
        take: 10,
        select: {
          uuid: true,
          status: true,
          exportFormat: true,
          requestedAt: true,
          completedAt: true,
          dueBy: true,
        },
      }),
      prisma.dataDeletionRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: "desc" },
        take: 10,
        select: {
          uuid: true,
          status: true,
          requestedAt: true,
          completedAt: true,
          dueBy: true,
        },
      }),
    ]);

    return res.status(200).json({
      exportRequests: exportRequests.map(r => ({ ...r, type: "export" })),
      deletionRequests: deletionRequests.map(r => ({ ...r, type: "deletion" })),
    });
  } catch (error) {
    console.error("Error fetching GDPR requests:", error);
    return res.status(500).json({ error: "Failed to fetch requests" });
  }
});

export default router;
