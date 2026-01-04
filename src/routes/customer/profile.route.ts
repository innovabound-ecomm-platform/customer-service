/**
 * Customer Profile Routes
 * Self-service profile management for authenticated users
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { updateCustomerSchema, updateProfileSchema } from "../../schemas/customer.schema.js";
import { withSiteId, getSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /customers/me:
 *   get:
 *     summary: Get my customer profile
 *     description: Get the current user's customer profile with addresses and preferences
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customer profile retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch profile
 */
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);

    let customer = await prisma.customer.findUnique({
      where: { userId },
      include: {
        profile: true,
        preferences: true,
        addresses: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
        consents: true,
      },
    });

    // Auto-create customer record if doesn't exist
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
        include: {
          profile: true,
          preferences: true,
          addresses: {
            where: { deletedAt: null },
          },
          consents: true,
        },
      });
    }

    return res.status(200).json(customer);
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * @openapi
 * /customers/me:
 *   put:
 *     summary: Update my customer record
 *     description: Update the current user's customer information
 *     tags:
 *       - Customers
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
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to update customer
 */
router.put("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const validation = updateCustomerSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    const customer = await prisma.customer.upsert({
      where: { userId },
      update: {
        ...validation.data,
        updatedBy: userId,
      },
      create: siteId ? withSiteId({
        userId,
        ...validation.data,
        createdBy: userId,
      }, siteId) : {
        userId,
        ...validation.data,
        createdBy: userId,
      },
      include: {
        profile: true,
      },
    });

    return res.status(200).json(customer);
  } catch (error) {
    console.error("Error updating customer:", error);
    return res.status(500).json({ error: "Failed to update customer" });
  }
});

/**
 * @openapi
 * /customers/me/profile:
 *   put:
 *     summary: Update my profile
 *     description: Update the current user's customer profile details
 *     tags:
 *       - Customers
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
 *               bio:
 *                 type: string
 *               company:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to update profile
 */
router.put("/me/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const validation = updateProfileSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    // Get or create customer first
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

    const profile = await prisma.customerProfile.upsert({
      where: { customerId: customer.id },
      update: {
        ...validation.data,
        dateOfBirth: validation.data.dateOfBirth 
          ? new Date(validation.data.dateOfBirth) 
          : undefined,
        updatedBy: userId,
      },
      create: {
        customerId: customer.id,
        ...validation.data,
        dateOfBirth: validation.data.dateOfBirth 
          ? new Date(validation.data.dateOfBirth) 
          : undefined,
        createdBy: userId,
      },
    });

    return res.status(200).json(profile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
