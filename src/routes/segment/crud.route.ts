/**
 * Segment CRUD Routes
 * Basic segment management operations
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../../middleware/auth.js";
import { createSegmentSchema, updateSegmentSchema } from "../../schemas/customer.schema.js";
import { segmentWhere, withSiteId, getSiteId, requireSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /segments:
 *   get:
 *     summary: List customer segments
 *     description: Get a paginated list of all customer segments
 *     tags:
 *       - Segments
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
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: segmentType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of segments
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to fetch segments
 */
router.get(
  "/",
  requireAuth,
  requirePermission("segments:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = getSiteId(req);
      const { 
        page = "1", 
        limit = "50",
        search,
        segmentType,
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const additionalWhere: Prisma.CustomerSegmentWhereInput = {};

      if (search) {
        additionalWhere.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { slug: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (segmentType) {
        additionalWhere.segmentType = segmentType as Prisma.EnumSegmentTypeFilter;
      }

      const where = segmentWhere(siteId, additionalWhere, { strict: false });

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
 * @openapi
 * /segments/{id}:
 *   get:
 *     summary: Get segment by ID
 *     description: Get segment details by ID, UUID, or slug
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
 *         description: Segment ID, UUID, or slug
 *     responses:
 *       200:
 *         description: Segment details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Segment not found
 *       500:
 *         description: Failed to fetch segment
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission("segments:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = getSiteId(req);
      const id = req.params.id!;

      const segment = await prisma.customerSegment.findFirst({
        where: segmentWhere(siteId, {
          OR: [
            { id: parseInt(id, 10) || 0 },
            { uuid: id },
            { slug: id },
          ],
        }, { strict: false }),
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
 * @openapi
 * /segments:
 *   post:
 *     summary: Create new segment
 *     description: Create a new customer segment
 *     tags:
 *       - Segments
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               segmentType:
 *                 type: string
 *                 enum: [MANUAL, AUTOMATIC]
 *               rules:
 *                 type: object
 *     responses:
 *       201:
 *         description: Segment created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create segment
 */
router.post(
  "/",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
      const adminId = req.user!.id;
      const validation = createSegmentSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { name, slug, rules, ...data } = validation.data;

      // Generate slug if not provided
      const segmentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      // Check for unique slug within tenant
      const existing = await prisma.customerSegment.findFirst({
        where: segmentWhere(siteId, { slug: segmentSlug }),
      });
      if (existing) {
        return res.status(400).json({ error: "Segment with this slug already exists" });
      }

      const segment = await prisma.customerSegment.create({
        data: withSiteId({
          name,
          slug: segmentSlug,
          ...data,
          rules: rules as Prisma.InputJsonValue,
          createdBy: adminId,
        }, siteId),
      });

      return res.status(201).json(segment);
    } catch (error) {
      console.error("Error creating segment:", error);
      return res.status(500).json({ error: "Failed to create segment" });
    }
  }
);

/**
 * @openapi
 * /segments/{id}:
 *   put:
 *     summary: Update segment
 *     description: Update a customer segment
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
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               rules:
 *                 type: object
 *     responses:
 *       200:
 *         description: Segment updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Segment not found
 *       500:
 *         description: Failed to update segment
 */
router.put(
  "/:id",
  requireAuth,
  requirePermission("segments:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
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
          where: segmentWhere(siteId, {
            slug,
            id: { not: parseInt(id, 10) },
          }),
        });
        if (existing) {
          return res.status(400).json({ error: "Segment with this slug already exists" });
        }
      }

      const existingSegment = await prisma.customerSegment.findFirst({
        where: segmentWhere(siteId, { id: parseInt(id, 10) }),
      });

      if (!existingSegment) {
        return res.status(404).json({ error: "Segment not found" });
      }

      const segment = await prisma.customerSegment.update({
        where: { id: existingSegment.id },
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
 * @openapi
 * /segments/{id}:
 *   delete:
 *     summary: Delete segment
 *     description: Delete a customer segment and all its members
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
 *         description: Segment deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Segment not found
 *       500:
 *         description: Failed to delete segment
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("segments:delete"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
      const id = req.params.id!;

      const existingSegment = await prisma.customerSegment.findFirst({
        where: segmentWhere(siteId, { id: parseInt(id, 10) }),
      });

      if (!existingSegment) {
        return res.status(404).json({ error: "Segment not found" });
      }

      await prisma.$transaction([
        prisma.customerSegmentMember.deleteMany({
          where: { segmentId: existingSegment.id },
        }),
        prisma.customerSegment.delete({
          where: { id: existingSegment.id },
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

export default router;
