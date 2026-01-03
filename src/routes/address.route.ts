import { Router } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { createAddressSchema, updateAddressSchema } from "../schemas/customer.schema";

const router: Router = Router();
const prisma = getCustomerPrisma();

/**
 * GET /addresses
 * Get current user's addresses
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
 * GET /addresses/:id
 * Get a specific address
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
 * POST /addresses
 * Create a new address
 */
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
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
        data: {
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
 * PUT /addresses/:id
 * Update an address
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
 * DELETE /addresses/:id
 * Soft delete an address
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

/**
 * POST /addresses/:id/set-default-shipping
 * Set address as default shipping
 */
router.post("/:id/set-default-shipping", requireAuth, async (req: AuthenticatedRequest, res) => {
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

    // Unset current default and set new one
    await prisma.$transaction([
      prisma.customerAddress.updateMany({
        where: { customerId: customer.id, isDefaultShipping: true },
        data: { isDefaultShipping: false },
      }),
      prisma.customerAddress.update({
        where: { id: parseInt(id, 10) },
        data: { isDefaultShipping: true, updatedBy: userId },
      }),
    ]);

    return res.status(200).json({ 
      success: true, 
      message: "Default shipping address updated" 
    });
  } catch (error) {
    console.error("Error setting default shipping:", error);
    return res.status(500).json({ error: "Failed to set default shipping" });
  }
});

/**
 * POST /addresses/:id/set-default-billing
 * Set address as default billing
 */
router.post("/:id/set-default-billing", requireAuth, async (req: AuthenticatedRequest, res) => {
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

    await prisma.$transaction([
      prisma.customerAddress.updateMany({
        where: { customerId: customer.id, isDefaultBilling: true },
        data: { isDefaultBilling: false },
      }),
      prisma.customerAddress.update({
        where: { id: parseInt(id, 10) },
        data: { isDefaultBilling: true, updatedBy: userId },
      }),
    ]);

    return res.status(200).json({ 
      success: true, 
      message: "Default billing address updated" 
    });
  } catch (error) {
    console.error("Error setting default billing:", error);
    return res.status(500).json({ error: "Failed to set default billing" });
  }
});

export default router;
