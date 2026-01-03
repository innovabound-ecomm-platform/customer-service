import { Router } from "express";
import { getCustomerPrisma, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../middleware/auth";
import { createSegmentSchema, updateSegmentSchema } from "../schemas/customer.schema";

const router: Router = Router();
const prisma = getCustomerPrisma();

/**
 * GET /segments
 * List all customer segments
 */
router.get(
  "/",
  requireAuth,
  requirePermission("segments:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        page = "1", 
        limit = "50",
        search,
        segmentType,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const where: Prisma.CustomerSegmentWhereInput = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { slug: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (segmentType) {
        where.segmentType = segmentType as any;
      }

      const [segments, total] = await Promise.all([
        prisma.customerSegment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.customerSegment.count({ where }),
      ]);

      return res.status(200).json({
        data: segments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching segments:", error);
      return res.status(500).json({ error: "Failed to fetch segments" });
    }
  }
);

/**
 * GET /segments/:id
 * Get segment by ID
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission("segments:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;

      const segment = await prisma.customerSegment.findFirst({
        where: {
          OR: [
            { id: parseInt(id, 10) || 0 },
            { uuid: id },
            { slug: id },
          ],
        },
        include: {
          _count: {
            select: { members: true },
          },
        },
      });

      if (!segment) {
        return res.status(404).json({ error: "Segment not found" });
      }

      return res.status(200).json({
        ...segment,
        memberCount: segment._count.members,
        _count: undefined,
      });
    } catch (error) {
      console.error("Error fetching segment:", error);
      return res.status(500).json({ error: "Failed to fetch segment" });
    }
  }
);

/**
 * POST /segments
 * Create a new segment
 */
router.post(
  "/",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const adminId = req.user!.id;
      const validation = createSegmentSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { name, slug, rules, ...data } = validation.data;

      // Generate slug if not provided
      const segmentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      // Check for unique slug
      const existing = await prisma.customerSegment.findUnique({
        where: { slug: segmentSlug },
      });
      if (existing) {
        return res.status(400).json({ error: "Segment with this slug already exists" });
      }

      const segment = await prisma.customerSegment.create({
        data: {
          name,
          slug: segmentSlug,
          ...data,
          rules: rules as Prisma.InputJsonValue,
          createdBy: adminId,
        },
      });

      return res.status(201).json(segment);
    } catch (error) {
      console.error("Error creating segment:", error);
      return res.status(500).json({ error: "Failed to create segment" });
    }
  }
);

/**
 * PUT /segments/:id
 * Update a segment
 */
router.put(
  "/:id",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
      const adminId = req.user!.id;
      const validation = updateSegmentSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { slug, rules, ...data } = validation.data;

      // Check slug uniqueness if changed
      if (slug) {
        const existing = await prisma.customerSegment.findFirst({
          where: {
            slug,
            id: { not: parseInt(id, 10) },
          },
        });
        if (existing) {
          return res.status(400).json({ error: "Segment with this slug already exists" });
        }
      }

      const segment = await prisma.customerSegment.update({
        where: { id: parseInt(id, 10) },
        data: {
          ...data,
          ...(slug && { slug }),
          ...(rules !== undefined && { rules: rules as Prisma.InputJsonValue }),
          updatedBy: adminId,
        },
      });

      return res.status(200).json(segment);
    } catch (error) {
      console.error("Error updating segment:", error);
      return res.status(500).json({ error: "Failed to update segment" });
    }
  }
);

/**
 * DELETE /segments/:id
 * Delete a segment
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("segments:delete"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;

      await prisma.$transaction([
        prisma.customerSegmentMember.deleteMany({
          where: { segmentId: parseInt(id, 10) },
        }),
        prisma.customerSegment.delete({
          where: { id: parseInt(id, 10) },
        }),
      ]);

      return res.status(200).json({ 
        success: true, 
        message: "Segment deleted" 
      });
    } catch (error) {
      console.error("Error deleting segment:", error);
      return res.status(500).json({ error: "Failed to delete segment" });
    }
  }
);

// ============================================
// SEGMENT MEMBERS
// ============================================

/**
 * GET /segments/:id/members
 * Get segment members
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
 * POST /segments/:id/members
 * Add customers to segment
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
 * DELETE /segments/:id/members/:customerId
 * Remove customer from segment
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
 * POST /segments/:id/refresh
 * Refresh automatic segment membership
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
