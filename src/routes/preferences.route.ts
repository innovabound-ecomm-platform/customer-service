import { Router } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { updatePreferencesSchema, updateConsentSchema } from "../schemas/customer.schema";
import { withSiteId, getSiteId } from "../utils/tenant.utils.js";

const router: Router = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /preferences:
 *   get:
 *     summary: Get my preferences
 *     description: Get the current user's preferences
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User preferences
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch preferences
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
 * @openapi
 * /preferences:
 *   put:
 *     summary: Update preferences
 *     description: Update the current user's notification and communication preferences
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marketingEmailsEnabled:
 *                 type: boolean
 *               orderUpdatesEnabled:
 *                 type: boolean
 *               newsletterEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to update preferences
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
 * @openapi
 * /preferences/consent:
 *   get:
 *     summary: Get consent settings
 *     description: Get the current user's consent settings for all channels
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of consent settings
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch consents
 */
router.get("/consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(200).json({ data: [] });
    }

    // Note: tenant verification is handled implicitly - customer belongs to authenticated user

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
 * @openapi
 * /preferences/consent:
 *   put:
 *     summary: Update consent
 *     description: Update consent for a specific channel (email, SMS, etc.)
 *     tags:
 *       - Preferences
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
 *               - channel
 *               - granted
 *             properties:
 *               channel:
 *                 type: string
 *                 enum: [EMAIL, SMS, PUSH, PHONE]
 *               granted:
 *                 type: boolean
 *               legalBasis:
 *                 type: string
 *               source:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consent updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to update consent
 */
router.put("/consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
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
 * @openapi
 * /preferences/consent/withdraw-all:
 *   post:
 *     summary: Withdraw all consents
 *     description: Withdraw all marketing consents for the current user
 *     tags:
 *       - Preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: All consents withdrawn successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to withdraw consents
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
