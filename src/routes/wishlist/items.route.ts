import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { addWishlistItemSchema } from "../../schemas/customer.schema.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /wishlists/default:
 *   get:
 *     summary: Get default wishlist
 *     description: Get or create the default wishlist for the current user
 *     tags:
 *       - Wishlists
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Default wishlist details with items
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch wishlist
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

/**
 * @openapi
 * /wishlists/{id}/items:
 *   post:
 *     summary: Add item to wishlist
 *     description: Add a product to a specific wishlist
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
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: string
 *               variantId:
 *                 type: string
 *               notes:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *     responses:
 *       201:
 *         description: Item added successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to add item
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
 * @openapi
 * /wishlists/{id}/items/{itemId}:
 *   delete:
 *     summary: Remove item from wishlist
 *     description: Remove a product from a wishlist
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Wishlist item ID
 *     responses:
 *       200:
 *         description: Item removed successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to remove item
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
 * @openapi
 * /wishlists/{id}/items/{itemId}/move:
 *   post:
 *     summary: Move item to another wishlist
 *     description: Move an item from one wishlist to another
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
 *         description: Source wishlist ID
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Wishlist item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetWishlistId
 *             properties:
 *               targetWishlistId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Item moved successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Wishlist not found
 *       500:
 *         description: Failed to move item
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

export default router;
