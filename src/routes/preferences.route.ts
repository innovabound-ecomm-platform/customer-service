import { Router } from "express";
import { PrismaClient } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { updatePreferencesSchema, updateConsentSchema } from "../schemas/customer.schema";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /preferences
 * Get current user's preferences
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    let preferences = await prisma.customerPreferences.findUnique({
      where: { userId },
    });

    // Auto-create default preferences if doesn't exist
    if (!preferences) {
      preferences = await prisma.customerPreferences.create({
        data: {
          userId,
          createdBy: userId,
        },
      });
    }

    return res.status(200).json(preferences);
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

/**
 * PUT /preferences
 * Update current user's preferences
 */
router.put("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const validation = updatePreferencesSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    const preferences = await prisma.customerPreferences.upsert({
      where: { userId },
      update: {
        ...validation.data,
        updatedBy: userId,
      },
      create: {
        userId,
        ...validation.data,
        createdBy: userId,
      },
    });

    return res.status(200).json(preferences);
  } catch (error) {
    console.error("Error updating preferences:", error);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ============================================
// CONSENT MANAGEMENT
// ============================================

/**
 * GET /preferences/consent
 * Get current user's consent settings
 */
router.get("/consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(200).json({ data: [] });
    }

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
 * PUT /preferences/consent
 * Update consent for a channel
 */
router.put("/consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const validation = updateConsentSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Get or create customer
    let customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId,
          email: req.user!.email,
          createdBy: userId,
        },
      });
    }

    const { channel, granted, legalBasis, source } = validation.data;

    // Get previous state for audit
    const previousConsent = await prisma.customerConsent.findUnique({
      where: {
        customerId_channel: {
          customerId: customer.id,
          channel,
        },
      },
    });

    // Update consent
    const consent = await prisma.customerConsent.upsert({
      where: {
        customerId_channel: {
          customerId: customer.id,
          channel,
        },
      },
      update: {
        granted,
        legalBasis,
        source,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        ...(granted ? {} : { 
          withdrawnAt: new Date(),
          withdrawnReason: "User opt-out",
        }),
        updatedBy: userId,
      },
      create: {
        customerId: customer.id,
        channel,
        granted,
        legalBasis,
        source,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        createdBy: userId,
      },
    });

    // Log consent change for GDPR compliance
    await prisma.consentAuditLog.create({
      data: {
        customerId: customer.id,
        userId,
        email: customer.email || "",
        channel,
        previousState: previousConsent?.granted ?? null,
        newState: granted,
        legalBasis,
        source: source || "preferences",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        changedVia: "user",
        actorUserId: userId,
        actorType: "USER",
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
 * POST /preferences/consent/withdraw-all
 * Withdraw all marketing consents
 */
router.post("/consent/withdraw-all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Get current consents
    const currentConsents = await prisma.customerConsent.findMany({
      where: { 
        customerId: customer.id,
        granted: true,
      },
    });

    // Withdraw all
    await prisma.customerConsent.updateMany({
      where: { customerId: customer.id },
      data: { 
        granted: false,
        withdrawnAt: new Date(),
        withdrawnReason: "Bulk withdrawal",
        updatedBy: userId,
      },
    });

    // Log all changes
    await prisma.consentAuditLog.createMany({
      data: currentConsents.map(c => ({
        customerId: customer.id,
        userId,
        email: customer.email || "",
        channel: c.channel,
        previousState: true,
        newState: false,
        legalBasis: c.legalBasis,
        source: "bulk_withdrawal",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        changedVia: "user",
        actorUserId: userId,
        actorType: "USER" as const,
        createdBy: userId,
      })),
    });

    return res.status(200).json({ 
      success: true, 
      message: "All consents withdrawn" 
    });
  } catch (error) {
    console.error("Error withdrawing consents:", error);
    return res.status(500).json({ error: "Failed to withdraw consents" });
  }
});

export default router;
