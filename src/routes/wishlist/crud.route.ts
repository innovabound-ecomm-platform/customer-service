import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { v4 as uuidv4 } from "uuid";
import { requireAuth, optionalAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { 
  createWishlistSchema, 
  updateWishlistSchema 
} from "../../schemas/customer.schema.js";
import { wishlistWhere, withSiteId, getSiteId, requireSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /wishlists:
 *   get:
 *     summary: Get my wishlists
 *     description: Get all wishlists for the current user
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of wishlists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch wishlists
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);

    const wishlists = await prisma.wishlist.findMany({
      where: wishlistWhere(siteId, { userId }, { strict: false }),
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return res.status(200).json({
      data: wishlists.map(w => ({
        ...w,
        itemCount: w._count.items,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error("Error fetching wishlists:", error);
    return res.status(500).json({ error: "Failed to fetch wishlists" });
  }
});

/**
 * @openapi
 * /wishlists/{id}:
 *   get:
 *     summary: Get wishlist
 *     description: Get a specific wishlist with items by ID, UUID, or share token
 *     tags:
 *       - Wishlists
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Wishlist ID, UUID, or share token
 *     responses:
 *       200:
 *         description: Wishlist details with items
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to fetch wishlist
 */
router.get("/:id", optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user?.id;
    const siteId = getSiteId(req);

    const wishlist = await prisma.wishlist.findFirst({
      where: wishlistWhere(siteId, {
        OR: [
          { id: parseInt(id, 10) || 0 },
          { uuid: id },
          { shareToken: id },
        ],
      }, { strict: false }),
      include: {
        items: {
          orderBy: { addedAt: "desc" },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    // Check access
    if (wishlist.visibility === "PRIVATE" && wishlist.userId !== userId) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    return res.status(200).json({
      ...wishlist,
      itemCount: wishlist._count.items,
      _count: undefined,
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    return res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

/**
 * @openapi
 * /wishlists:
 *   post:
 *     summary: Create wishlist
 *     description: Create a new wishlist for the current user
 *     tags:
 *       - Wishlists
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
 *               description:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               visibility:
 *                 type: string
 *                 enum: [PRIVATE, PUBLIC, SHARED]
 *     responses:
 *       201:
 *         description: Wishlist created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create wishlist
 */
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = requireSiteId(req);
    const validation = createWishlistSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    const { isDefault, visibility, ...data } = validation.data;

    // If making this default, unset other defaults
    if (isDefault) {
      await prisma.wishlist.updateMany({
        where: wishlistWhere(siteId, { userId, isDefault: true }),
        data: { isDefault: false },
      });
    }

    const wishlist = await prisma.wishlist.create({
      data: withSiteId({
        userId,
        ...data,
        isDefault,
        visibility,
        shareToken: visibility !== "PRIVATE" ? uuidv4() : null,
        createdBy: userId,
      }, siteId),
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return res.status(201).json({
      ...wishlist,
      itemCount: wishlist._count.items,
      _count: undefined,
    });
  } catch (error) {
    console.error("Error creating wishlist:", error);
    return res.status(500).json({ error: "Failed to create wishlist" });
  }
});

/**
 * @openapi
 * /wishlists/{id}:
 *   put:
 *     summary: Update wishlist
 *     description: Update wishlist details (name, description, visibility)
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Wishlist ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               visibility:
 *                 type: string
 *                 enum: [PRIVATE, PUBLIC, SHARED]
 *     responses:
 *       200:
 *         description: Wishlist updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to update wishlist
 */
router.put("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;
    const siteId = requireSiteId(req);
    const validation = updateWishlistSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Verify ownership
    const existing = await prisma.wishlist.findFirst({
      where: wishlistWhere(siteId, {
        id: parseInt(id, 10),
        userId,
      }),
    });

    if (!existing) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const { isDefault, visibility, ...data } = validation.data;

    // Handle default flag
    if (isDefault) {
      await prisma.wishlist.updateMany({
        where: wishlistWhere(siteId, { userId, isDefault: true, id: { not: existing.id } }),
        data: { isDefault: false },
      });
    }

    // Generate share token if visibility changed to non-private
    const needsShareToken = 
      visibility && 
      visibility !== "PRIVATE" && 
      !existing.shareToken;

    const wishlist = await prisma.wishlist.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(isDefault !== undefined && { isDefault }),
        ...(visibility && { visibility }),
        ...(needsShareToken && { shareToken: uuidv4() }),
        updatedBy: userId,
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return res.status(200).json({
      ...wishlist,
      itemCount: wishlist._count.items,
      _count: undefined,
    });
  } catch (error) {
    console.error("Error updating wishlist:", error);
    return res.status(500).json({ error: "Failed to update wishlist" });
  }
});

/**
 * @openapi
 * /wishlists/{id}:
 *   delete:
 *     summary: Delete wishlist
 *     description: Delete a wishlist by ID
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Wishlist ID
 *     responses:
 *       200:
 *         description: Wishlist deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to delete wishlist
 */
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;
    const siteId = requireSiteId(req);

    const existing = await prisma.wishlist.findFirst({
      where: wishlistWhere(siteId, {
        id: parseInt(id, 10),
        userId,
      }),
    });

    if (!existing) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    await prisma.wishlist.delete({
      where: { id: existing.id },
    });

    return res.status(200).json({ 
      success: true, 
      message: "Wishlist deleted" 
    });
  } catch (error) {
    console.error("Error deleting wishlist:", error);
    return res.status(500).json({ error: "Failed to delete wishlist" });
  }
});

export default router;
