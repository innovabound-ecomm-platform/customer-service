import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, AuthenticatedRequest } from "../../middleware/auth.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /addresses/{id}/set-default-shipping:
 *   post:
 *     summary: Set default shipping address
 *     description: Set this address as the default shipping address
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
 *         description: Default shipping address updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Failed to set default shipping
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
 * @openapi
 * /addresses/{id}/set-default-billing:
 *   post:
 *     summary: Set default billing address
 *     description: Set this address as the default billing address
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
 *         description: Default billing address updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Failed to set default billing
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
