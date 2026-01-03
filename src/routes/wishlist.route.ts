import { Router } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { v4 as uuidv4 } from "uuid";
import { requireAuth, optionalAuth, AuthenticatedRequest } from "../middleware/auth";
import { 
  createWishlistSchema, 
  updateWishlistSchema, 
  addWishlistItemSchema 
} from "../schemas/customer.schema";

const router: Router = Router();
const prisma = getCustomerPrisma();

/**
 * GET /wishlists
 * Get current user's wishlists
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const wishlists = await prisma.wishlist.findMany({
      where: { userId },
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
 * GET /wishlists/:id
 * Get a specific wishlist with items
 */
router.get("/:id", optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user?.id;

    const wishlist = await prisma.wishlist.findFirst({
      where: {
        OR: [
          { id: parseInt(id, 10) || 0 },
          { uuid: id },
          { shareToken: id },
        ],
      },
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
 * POST /wishlists
 * Create a new wishlist
 */
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const validation = createWishlistSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    const { isDefault, visibility, ...data } = validation.data;

    // If making this default, unset other defaults
    if (isDefault) {
      await prisma.wishlist.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const wishlist = await prisma.wishlist.create({
      data: {
        userId,
        ...data,
        isDefault,
        visibility,
        shareToken: visibility !== "PRIVATE" ? uuidv4() : null,
        createdBy: userId,
      },
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
 * PUT /wishlists/:id
 * Update a wishlist
 */
router.put("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;
    const validation = updateWishlistSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Verify ownership
    const existing = await prisma.wishlist.findFirst({
      where: {
        id: parseInt(id, 10),
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const { isDefault, visibility, ...data } = validation.data;

    // Handle default flag
    if (isDefault) {
      await prisma.wishlist.updateMany({
        where: { userId, isDefault: true, id: { not: existing.id } },
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
 * DELETE /wishlists/:id
 * Delete a wishlist
 */
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;

    const existing = await prisma.wishlist.findFirst({
      where: {
        id: parseInt(id, 10),
        userId,
      },
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

// ============================================
// WISHLIST ITEMS
// ============================================

/**
 * POST /wishlists/:id/items
 * Add item to wishlist
 */
router.post("/:id/items", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;
    const validation = addWishlistItemSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Verify ownership
    const wishlist = await prisma.wishlist.findFirst({
      where: {
        id: parseInt(id, 10),
        userId,
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const item = await prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId_variantId: {
          wishlistId: wishlist.id,
          productId: validation.data.productId,
          variantId: validation.data.variantId ?? "",
        },
      },
      update: {
        notes: validation.data.notes,
        priority: validation.data.priority,
        updatedBy: userId,
      },
      create: {
        wishlistId: wishlist.id,
        ...validation.data,
        createdBy: userId,
      },
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("Error adding wishlist item:", error);
    return res.status(500).json({ error: "Failed to add item" });
  }
});

/**
 * DELETE /wishlists/:id/items/:itemId
 * Remove item from wishlist
 */
router.delete("/:id/items/:itemId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const itemId = req.params.itemId!;
    const userId = req.user!.id;

    // Verify ownership
    const wishlist = await prisma.wishlist.findFirst({
      where: {
        id: parseInt(id, 10),
        userId,
      },
    });

    if (!wishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    await prisma.wishlistItem.delete({
      where: { id: parseInt(itemId, 10) },
    });

    return res.status(200).json({ 
      success: true, 
      message: "Item removed" 
    });
  } catch (error) {
    console.error("Error removing wishlist item:", error);
    return res.status(500).json({ error: "Failed to remove item" });
  }
});

/**
 * POST /wishlists/:id/items/:itemId/move
 * Move item to another wishlist
 */
router.post("/:id/items/:itemId/move", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const itemId = req.params.itemId!;
    const { targetWishlistId } = req.body;
    const userId = req.user!.id;

    if (!targetWishlistId) {
      return res.status(400).json({ error: "targetWishlistId is required" });
    }

    // Verify ownership of both wishlists
    const [sourceWishlist, targetWishlist] = await Promise.all([
      prisma.wishlist.findFirst({
        where: { id: parseInt(id, 10), userId },
      }),
      prisma.wishlist.findFirst({
        where: { id: parseInt(targetWishlistId, 10), userId },
      }),
    ]);

    if (!sourceWishlist || !targetWishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const item = await prisma.wishlistItem.update({
      where: { id: parseInt(itemId, 10) },
      data: { 
        wishlistId: targetWishlist.id,
        updatedBy: userId,
      },
    });

    return res.status(200).json(item);
  } catch (error) {
    console.error("Error moving wishlist item:", error);
    return res.status(500).json({ error: "Failed to move item" });
  }
});

/**
 * GET /wishlists/default
 * Get or create default wishlist
 */
router.get("/default", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    let wishlist = await prisma.wishlist.findFirst({
      where: { userId, isDefault: true },
      include: {
        items: {
          orderBy: { addedAt: "desc" },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    // Create default wishlist if doesn't exist
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: {
          userId,
          name: "My Wishlist",
          isDefault: true,
          createdBy: userId,
        },
        include: {
          items: true,
          _count: {
            select: { items: true },
          },
        },
      });
    }

    return res.status(200).json({
      ...wishlist,
      itemCount: wishlist._count.items,
      _count: undefined,
    });
  } catch (error) {
    console.error("Error fetching default wishlist:", error);
    return res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

export default router;
