import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";
import { createAddressSchema, updateAddressSchema } from "../../schemas/customer.schema.js";
import { withSiteId, getSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /addresses:
 *   get:
 *     summary: Get my addresses
 *     description: Get all addresses for the current user
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of addresses
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch addresses
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(200).json({ data: [] });
    }

    const addresses = await prisma.customerAddress.findMany({
      where: {
        customerId: customer.id,
        deletedAt: null,
      },
      orderBy: [
        { isDefaultShipping: "desc" },
        { isDefaultBilling: "desc" },
        { createdAt: "desc" },
      ],
    });

    return res.status(200).json({ data: addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    return res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

/**
 * @openapi
 * /addresses/{id}:
 *   get:
 *     summary: Get address
 *     description: Get a specific address by ID or UUID
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID or UUID
 *     responses:
 *       200:
 *         description: Address details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Failed to fetch address
 */
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Address not found" });
    }

    const address = await prisma.customerAddress.findFirst({
      where: {
        OR: [
          { id: parseInt(id, 10) || 0 },
          { uuid: id },
        ],
        customerId: customer.id,
        deletedAt: null,
      },
    });

    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    return res.status(200).json(address);
  } catch (error) {
    console.error("Error fetching address:", error);
    return res.status(500).json({ error: "Failed to fetch address" });
  }
});

/**
 * @openapi
 * /addresses:
 *   post:
 *     summary: Create address
 *     description: Create a new address for the current user
 *     tags:
 *       - Addresses
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
 *               - address1
 *               - city
 *               - country
 *               - zip
 *             properties:
 *               address1:
 *                 type: string
 *               address2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               country:
 *                 type: string
 *               zip:
 *                 type: string
 *               isDefaultShipping:
 *                 type: boolean
 *               isDefaultBilling:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Address created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create address
 */
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const siteId = getSiteId(req);
    const validation = createAddressSchema.safeParse(req.body);
    
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

    const { isDefaultShipping, isDefaultBilling, ...addressData } = validation.data;

    // If setting as default, unset other defaults first
    if (isDefaultShipping || isDefaultBilling) {
      await prisma.$transaction([
        ...(isDefaultShipping
          ? [
              prisma.customerAddress.updateMany({
                where: { customerId: customer.id, isDefaultShipping: true },
                data: { isDefaultShipping: false },
              }),
            ]
          : []),
        ...(isDefaultBilling
          ? [
              prisma.customerAddress.updateMany({
                where: { customerId: customer.id, isDefaultBilling: true },
                data: { isDefaultBilling: false },
              }),
            ]
          : []),
      ]);
    }

    const address = await prisma.customerAddress.create({
      data: {
        customerId: customer.id,
        ...addressData,
        isDefaultShipping,
        isDefaultBilling,
        createdBy: userId,
      },
    });

    return res.status(201).json(address);
  } catch (error) {
    console.error("Error creating address:", error);
    return res.status(500).json({ error: "Failed to create address" });
  }
});

/**
 * @openapi
 * /addresses/{id}:
 *   put:
 *     summary: Update address
 *     description: Update an existing address by ID
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address1:
 *                 type: string
 *               address2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               country:
 *                 type: string
 *               zip:
 *                 type: string
 *               isDefaultShipping:
 *                 type: boolean
 *               isDefaultBilling:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Failed to update address
 */
router.put("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;
    const validation = updateAddressSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors });
    }

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Verify ownership
    const existing = await prisma.customerAddress.findFirst({
      where: {
        id: parseInt(id, 10),
        customerId: customer.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Address not found" });
    }

    const { isDefaultShipping, isDefaultBilling, ...addressData } = validation.data;

    // Handle default flags
    if (isDefaultShipping || isDefaultBilling) {
      await prisma.$transaction([
        ...(isDefaultShipping
          ? [
              prisma.customerAddress.updateMany({
                where: { 
                  customerId: customer.id, 
                  isDefaultShipping: true,
                  id: { not: existing.id },
                },
                data: { isDefaultShipping: false },
              }),
            ]
          : []),
        ...(isDefaultBilling
          ? [
              prisma.customerAddress.updateMany({
                where: { 
                  customerId: customer.id, 
                  isDefaultBilling: true,
                  id: { not: existing.id },
                },
                data: { isDefaultBilling: false },
              }),
            ]
          : []),
      ]);
    }

    const address = await prisma.customerAddress.update({
      where: { id: existing.id },
      data: {
        ...addressData,
        ...(isDefaultShipping !== undefined && { isDefaultShipping }),
        ...(isDefaultBilling !== undefined && { isDefaultBilling }),
        updatedBy: userId,
      },
    });

    return res.status(200).json(address);
  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({ error: "Failed to update address" });
  }
});

/**
 * @openapi
 * /addresses/{id}:
 *   delete:
 *     summary: Delete address
 *     description: Soft delete an address by ID
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Failed to delete address
 */
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id!;
    const userId = req.user!.id;

    const customer = await prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Address not found" });
    }

    const existing = await prisma.customerAddress.findFirst({
      where: {
        id: parseInt(id, 10),
        customerId: customer.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Address not found" });
    }

    await prisma.customerAddress.update({
      where: { id: existing.id },
      data: { 
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    return res.status(200).json({ 
      success: true, 
      message: "Address deleted" 
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({ error: "Failed to delete address" });
  }
});

export default router;
