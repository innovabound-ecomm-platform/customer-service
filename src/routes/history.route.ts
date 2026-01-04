import { Router, Response } from "express";
import { getCustomerPrisma, Prisma, ActivityType } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, optionalAuth, AuthenticatedRequest } from "../middleware/auth";

const router: Router = Router();
const prisma = getCustomerPrisma();

const VALID_ACTIVITY_TYPES: ActivityType[] = [
  "VIEW_PRODUCT",
  "VIEW_CATEGORY",
  "SEARCH",
  "ADD_TO_CART",
  "REMOVE_FROM_CART",
  "ADD_TO_WISHLIST",
  "PURCHASE",
];

function isValidActivityType(type: string): type is ActivityType {
  return VALID_ACTIVITY_TYPES.includes(type as ActivityType);
}

// ============================================
// RECENTLY VIEWED
// ============================================

/**
 * GET /history/recently-viewed
 * Get user's recently viewed products
 */
router.get("/recently-viewed", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit = "20" } = req.query;

    // Note: RecentlyViewed model doesn't have siteId - tenant filtering not applicable
    const items = await prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { lastViewedAt: "desc" },
      take: parseInt(limit as string, 10),
    });

    return res.status(200).json({ data: items });
  } catch (error) {
    console.error("Error fetching recently viewed:", error);
    return res.status(500).json({ error: "Failed to fetch recently viewed" });
  }
});

/**
 * POST /history/recently-viewed
 * Track a product view
 */
router.post("/recently-viewed", optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const guestId = req.body.guestId || req.cookies?.guestId;
    const { productId, variantId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    if (!userId && !guestId) {
      return res.status(400).json({ error: "User must be authenticated or provide guestId" });
    }

    // Upsert the recently viewed record
    // Note: RecentlyViewed model doesn't have siteId - tenant filtering not applicable
    const whereClause = userId 
      ? { userId_productId: { userId, productId } }
      : { guestId_productId: { guestId: guestId!, productId } };

    const recentlyViewed = await prisma.recentlyViewed.upsert({
      where: whereClause,
      create: {
        userId,
        guestId: !userId ? guestId : null,
        productId,
        variantId,
        viewCount: 1,
        firstViewedAt: new Date(),
        lastViewedAt: new Date(),
        actorUserId: userId,
        actorType: userId ? "USER" : "ANONYMOUS",
        createdBy: userId,
      },
      update: {
        variantId,
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    });

    return res.status(200).json(recentlyViewed);
  } catch (error) {
    console.error("Error tracking product view:", error);
    return res.status(500).json({ error: "Failed to track product view" });
  }
});

/**
 * DELETE /history/recently-viewed/:productId
 * Remove a product from recently viewed
 */
router.delete("/recently-viewed/:productId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const productId = req.params.productId;
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    // Note: RecentlyViewed model doesn't have siteId - tenant filtering not applicable
    await prisma.recentlyViewed.deleteMany({
      where: { userId, productId },
    });

    return res.status(200).json({ success: true, message: "Removed from recently viewed" });
  } catch (error) {
    console.error("Error removing from recently viewed:", error);
    return res.status(500).json({ error: "Failed to remove from recently viewed" });
  }
});

/**
 * DELETE /history/recently-viewed
 * Clear all recently viewed
 */
router.delete("/recently-viewed", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Note: RecentlyViewed model doesn't have siteId - tenant filtering not applicable
    await prisma.recentlyViewed.deleteMany({
      where: { userId },
    });

    return res.status(200).json({ success: true, message: "Recently viewed cleared" });
  } catch (error) {
    console.error("Error clearing recently viewed:", error);
    return res.status(500).json({ error: "Failed to clear recently viewed" });
  }
});

// ============================================
// BROWSING HISTORY
// ============================================

/**
 * GET /history/browsing
 * Get user's browsing history
 */
router.get("/browsing", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = "1", limit = "50", activityType } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.BrowsingHistoryWhereInput = { userId };
    if (activityType && isValidActivityType(String(activityType).toUpperCase())) {
      where.activityType = String(activityType).toUpperCase() as ActivityType;
    }

    const [items, total] = await Promise.all([
      prisma.browsingHistory.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.browsingHistory.count({ where }),
    ]);

    return res.status(200).json({
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching browsing history:", error);
    return res.status(500).json({ error: "Failed to fetch browsing history" });
  }
});

/**
 * POST /history/browsing
 * Track a browsing activity
 */
router.post("/browsing", optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const guestId = req.body.guestId || req.cookies?.guestId;
    const { 
      activityType, 
      productId, 
      categoryId, 
      searchQuery, 
      referrer, 
      deviceType,
      sessionId 
    } = req.body;

    if (!activityType) {
      return res.status(400).json({ error: "activityType is required" });
    }

    const activityUpper = String(activityType).toUpperCase();
    if (!isValidActivityType(activityUpper)) {
      return res.status(400).json({ error: "Invalid activityType", validTypes: VALID_ACTIVITY_TYPES });
    }

    if (!userId && !guestId) {
      return res.status(400).json({ error: "User must be authenticated or provide guestId" });
    }

    const history = await prisma.browsingHistory.create({
      data: {
        userId,
        guestId: !userId ? guestId : null,
        sessionId,
        activityType: activityUpper,
        productId,
        categoryId,
        searchQuery,
        referrer,
        deviceType,
        actorUserId: userId,
        actorType: userId ? "USER" : "ANONYMOUS",
        occurredAt: new Date(),
        createdBy: userId,
      },
    });

    return res.status(201).json(history);
  } catch (error) {
    console.error("Error tracking browsing activity:", error);
    return res.status(500).json({ error: "Failed to track browsing activity" });
  }
});

/**
 * DELETE /history/browsing
 * Clear browsing history
 */
router.delete("/browsing", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    await prisma.browsingHistory.deleteMany({
      where: { userId },
    });

    return res.status(200).json({ success: true, message: "Browsing history cleared" });
  } catch (error) {
    console.error("Error clearing browsing history:", error);
    return res.status(500).json({ error: "Failed to clear browsing history" });
  }
});

// ============================================
// SAVED SEARCHES
// ============================================

/**
 * GET /history/saved-searches
 * Get user's saved searches
 */
router.get("/saved-searches", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const searches = await prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
    });

    return res.status(200).json({ data: searches });
  } catch (error) {
    console.error("Error fetching saved searches:", error);
    return res.status(500).json({ error: "Failed to fetch saved searches" });
  }
});

/**
 * POST /history/saved-searches
 * Save a search
 */
router.post("/saved-searches", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, query, filters, notifyOnNewResults } = req.body;

    if (!query && !filters) {
      return res.status(400).json({ error: "query or filters is required" });
    }

    const savedSearch = await prisma.savedSearch.create({
      data: {
        userId,
        name,
        query,
        filters: filters || undefined,
        notifyOnNewResults: notifyOnNewResults || false,
        createdBy: userId,
      },
    });

    return res.status(201).json(savedSearch);
  } catch (error) {
    console.error("Error saving search:", error);
    return res.status(500).json({ error: "Failed to save search" });
  }
});

/**
 * PUT /history/saved-searches/:id
 * Update a saved search
 */
router.put("/saved-searches/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const idParam = req.params.id;
    if (!idParam) {
      return res.status(400).json({ error: "id is required" });
    }
    const id = parseInt(idParam, 10);
    const { name, query, filters, notifyOnNewResults } = req.body;

    const existing = await prisma.savedSearch.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Saved search not found" });
    }

    const updateData: Prisma.SavedSearchUpdateInput = { updatedBy: userId };
    if (name !== undefined) updateData.name = name;
    if (query !== undefined) updateData.query = query;
    if (filters !== undefined) updateData.filters = filters;
    if (notifyOnNewResults !== undefined) updateData.notifyOnNewResults = notifyOnNewResults;

    const savedSearch = await prisma.savedSearch.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json(savedSearch);
  } catch (error) {
    console.error("Error updating saved search:", error);
    return res.status(500).json({ error: "Failed to update saved search" });
  }
});

/**
 * POST /history/saved-searches/:id/use
 * Mark a saved search as used (updates lastUsedAt)
 */
router.post("/saved-searches/:id/use", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const idParam = req.params.id;
    if (!idParam) {
      return res.status(400).json({ error: "id is required" });
    }
    const id = parseInt(idParam, 10);

    const existing = await prisma.savedSearch.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Saved search not found" });
    }

    const savedSearch = await prisma.savedSearch.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });

    return res.status(200).json(savedSearch);
  } catch (error) {
    console.error("Error using saved search:", error);
    return res.status(500).json({ error: "Failed to use saved search" });
  }
});

/**
 * DELETE /history/saved-searches/:id
 * Delete a saved search
 */
router.delete("/saved-searches/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const idParam = req.params.id;
    if (!idParam) {
      return res.status(400).json({ error: "id is required" });
    }
    const id = parseInt(idParam, 10);

    const existing = await prisma.savedSearch.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Saved search not found" });
    }

    await prisma.savedSearch.delete({ where: { id } });

    return res.status(200).json({ success: true, message: "Saved search deleted" });
  } catch (error) {
    console.error("Error deleting saved search:", error);
    return res.status(500).json({ error: "Failed to delete saved search" });
  }
});

export default router;
