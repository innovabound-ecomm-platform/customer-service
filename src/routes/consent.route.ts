import { Router, Request, Response } from "express";
import { getCustomerPrisma, Prisma, ConsentChannel } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../middleware/auth";
import { withSiteId, getSiteId } from "../utils/tenant.utils.js";

const router: Router = Router();
const prisma = getCustomerPrisma();

const VALID_CHANNELS: ConsentChannel[] = ["EMAIL", "SMS", "PUSH", "PHONE"];

function isValidChannel(channel: string): channel is ConsentChannel {
  return VALID_CHANNELS.includes(channel as ConsentChannel);
}

// ============================================
// USER CONSENT ROUTES
// ============================================

/**
 * GET /consent
 * Get current user's consent settings
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(200).json({ data: [] });
    }

    // Note: tenant verification is handled implicitly by customerWhere in queries
    // For simple lookups by userId, the customer already belongs to the authenticated user

    const consents = await prisma.customerConsent.findMany({
      where: { customerId: customer.id },
    });

    return res.status(200).json({ data: consents });
  } catch (error) {
    console.error("Error fetching consents:", error);
    return res.status(500).json({ error: "Failed to fetch consents" });
  }
});

/**
 * PUT /consent/:channel
 * Update consent for a specific channel
 */
router.put("/:channel", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const channelParam = req.params.channel;
    if (!channelParam) {
      return res.status(400).json({ error: "channel is required" });
    }
    
    const channel = channelParam.toUpperCase();
    const { granted, source } = req.body;

    if (typeof granted !== "boolean") {
      return res.status(400).json({ error: "granted must be a boolean" });
    }

    if (!isValidChannel(channel)) {
      return res.status(400).json({ error: "Invalid channel", validChannels: VALID_CHANNELS });
    }

    // Get or create customer
    let customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: siteId ? withSiteId({
          userId,
          email: req.user!.email,
          createdBy: userId,
        }, siteId) : {
          userId,
          email: req.user!.email,
          createdBy: userId,
        },
      });
    }

    // Get previous state for audit
    const previousConsent = await prisma.customerConsent.findUnique({
      where: { customerId_channel: { customerId: customer.id, channel } },
    });

    const previousState = previousConsent?.granted ?? null;

    // Upsert consent
    const consent = await prisma.customerConsent.upsert({
      where: { customerId_channel: { customerId: customer.id, channel } },
      create: {
        customerId: customer.id,
        channel,
        granted,
        source: source || "account",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        grantedAt: granted ? new Date() : undefined,
        withdrawnAt: !granted ? new Date() : undefined,
        createdBy: userId,
      },
      update: {
        granted,
        source: source || "account",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        grantedAt: granted ? new Date() : undefined,
        withdrawnAt: !granted ? new Date() : undefined,
        updatedBy: userId,
      },
    });

    // Create audit log
    await prisma.consentAuditLog.create({
      data: {
        customerId: customer.id,
        userId,
        email: req.user!.email || "",
        channel,
        previousState,
        newState: granted,
        legalBasis: "OPT_IN",
        source: source || "account",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        actorUserId: userId,
        actorType: "USER",
        occurredAt: new Date(),
        createdBy: userId,
      },
    });

    return res.status(200).json(consent);
  } catch (error) {
    console.error("Error updating consent:", error);
    return res.status(500).json({ error: "Failed to update consent" });
  }
});

/**
 * POST /consent/bulk
 * Update multiple consent settings at once
 */
router.post("/bulk", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const { consents, source } = req.body;

    if (!Array.isArray(consents)) {
      return res.status(400).json({ error: "consents array is required" });
    }

    // Get or create customer
    let customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: siteId ? withSiteId({
          userId,
          email: req.user!.email,
          createdBy: userId,
        }, siteId) : {
          userId,
          email: req.user!.email,
          createdBy: userId,
        },
      });
    }

    const results = await prisma.$transaction(async (tx) => {
      const updated = [];

      for (const c of consents) {
        const { channel: rawChannel, granted } = c;
        const channelUpper = String(rawChannel).toUpperCase();

        if (!isValidChannel(channelUpper)) {
          continue; // Skip invalid channels
        }

        // Get previous state
        const previous = await tx.customerConsent.findUnique({
          where: { customerId_channel: { customerId: customer.id, channel: channelUpper } },
        });

        // Upsert consent
        const consent = await tx.customerConsent.upsert({
          where: { customerId_channel: { customerId: customer.id, channel: channelUpper } },
          create: {
            customerId: customer.id,
            channel: channelUpper,
            granted,
            source: source || "account",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
            createdBy: userId,
          },
          update: {
            granted,
            source: source || "account",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
            updatedBy: userId,
          },
        });

        // Create audit log
        await tx.consentAuditLog.create({
          data: {
            customerId: customer.id,
            userId,
            email: req.user!.email || "",
            channel: channelUpper,
            previousState: previous?.granted ?? null,
            newState: granted,
            legalBasis: "OPT_IN",
            source: source || "account",
            ipAddress: req.ip,
            userAgent: req.get("User-Agent"),
            actorUserId: userId,
            actorType: "USER",
            occurredAt: new Date(),
            createdBy: userId,
          },
        });

        updated.push(consent);
      }

      return updated;
    });

    return res.status(200).json({ data: results });
  } catch (error) {
    console.error("Error bulk updating consents:", error);
    return res.status(500).json({ error: "Failed to update consents" });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /consent/audit
 * Get consent audit log (admin)
 */
router.get("/audit", requirePermission("customers:read"), async (req: Request, res: Response) => {
  try {
    const { 
      page = "1", 
      limit = "50", 
      customerId, 
      userId, 
      email, 
      channel 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.ConsentAuditLogWhereInput = {};
    if (customerId) where.customerId = parseInt(customerId as string, 10);
    if (userId) where.userId = userId as string;
    if (email) where.email = { contains: email as string, mode: "insensitive" };
    if (channel && isValidChannel(String(channel).toUpperCase())) {
      where.channel = String(channel).toUpperCase() as ConsentChannel;
    }

    const [logs, total] = await Promise.all([
      prisma.consentAuditLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.consentAuditLog.count({ where }),
    ]);

    return res.status(200).json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching consent audit log:", error);
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

/**
 * GET /consent/audit/:customerId
 * Get consent history for a specific customer (admin)
 */
router.get("/audit/:customerId", requirePermission("customers:read"), async (req: Request, res: Response) => {
  try {
    const customerIdParam = req.params.customerId;
    if (!customerIdParam) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const customerId = parseInt(customerIdParam, 10);

    const logs = await prisma.consentAuditLog.findMany({
      where: { customerId },
      orderBy: { occurredAt: "desc" },
    });

    return res.status(200).json({ data: logs });
  } catch (error) {
    console.error("Error fetching customer consent audit:", error);
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
