import { Router } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../middleware/auth";
import { dataExportRequestSchema, dataDeletionRequestSchema } from "../schemas/customer.schema";

const router = Router();
const prisma = getCustomerPrisma();

// ============================================
// DATA EXPORT (GDPR Right to Access)
// ============================================

/**
 * POST /gdpr/export
 * Request data export
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
 * GET /gdpr/export/:id
 * Get export request status
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

// ============================================
// DATA DELETION (GDPR Right to Erasure)
// ============================================

/**
 * POST /gdpr/delete
 * Request data deletion
 */
router.post("/delete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
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
 * GET /gdpr/delete/:id
 * Get deletion request status
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
 * DELETE /gdpr/delete/:id
 * Cancel a pending deletion request
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

// ============================================
// USER REQUEST LIST
// ============================================

/**
 * GET /gdpr/requests
 * Get all GDPR requests for current user
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

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /gdpr/admin/export-requests
 * List all export requests (admin)
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

      const where: any = {};
      if (status) {
        where.status = status;
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
 * GET /gdpr/admin/deletion-requests
 * List all deletion requests (admin)
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

      const where: any = {};
      if (status) {
        where.status = status;
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
 * POST /gdpr/admin/export-requests/:id/process
 * Process an export request (admin)
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
 * POST /gdpr/admin/deletion-requests/:id/process
 * Process a deletion request (admin)
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
