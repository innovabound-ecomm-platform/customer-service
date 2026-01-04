/**
 * Customer Admin CRUD Routes
 * Administrative customer management operations
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../../middleware/auth.js";
import { createCustomerSchema, updateCustomerSchema } from "../../schemas/customer.schema.js";
import { customerWhere, withSiteId, getSiteId, requireSiteId } from "../../utils/tenant.utils.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /customers:
 *   get:
 *     summary: List all customers
 *     description: Get a paginated list of all customers (admin only)
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of customers
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Failed to fetch customers
 */
router.get(
  "/",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = getSiteId(req);
      const { 
        page = "1", 
        limit = "50", 
        search,
        sortBy = "createdAt",
        sortOrder = "desc"
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const additionalWhere: Prisma.CustomerWhereInput = {};

      if (search) {
        additionalWhere.OR = [
          { email: { contains: search as string, mode: "insensitive" } },
          { phone: { contains: search as string, mode: "insensitive" } },
          { profile: { firstName: { contains: search as string, mode: "insensitive" } } },
          { profile: { lastName: { contains: search as string, mode: "insensitive" } } },
        ];
      }

      const where = customerWhere(siteId, additionalWhere, { strict: false });

      const orderBy = {
        [sortBy as string]: sortOrder as "asc" | "desc",
      } as Prisma.CustomerOrderByWithRelationInput;

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy,
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
          include: {
            profile: true,
            _count: {
              select: {
                addresses: true,
                notes: true,
              },
            },
          },
        }),
        prisma.customer.count({ where }),
      ]);

      return res.status(200).json({
        data: customers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching customers:", error);
      return res.status(500).json({ error: "Failed to fetch customers" });
    }
  }
);

/**
 * @openapi
 * /customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     description: Get detailed customer information by ID, UUID, or userId (admin only)
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID, UUID, or userId
 *     responses:
 *       200:
 *         description: Customer details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to fetch customer
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = getSiteId(req);
      const id = req.params.id!;

      const customer = await prisma.customer.findFirst({
        where: customerWhere(siteId, {
          OR: [
            { id: parseInt(id, 10) || 0 },
            { uuid: id },
            { userId: id },
          ],
        }, { strict: false }),
        include: {
          profile: true,
          preferences: true,
          addresses: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
          consents: true,
          notes: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          segments: {
            include: {
              segment: true,
            },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      return res.status(200).json(customer);
    } catch (error) {
      console.error("Error fetching customer:", error);
      return res.status(500).json({ error: "Failed to fetch customer" });
    }
  }
);

/**
 * @openapi
 * /customers:
 *   post:
 *     summary: Create new customer
 *     description: Create a new customer record (admin only)
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
 *             required:
 *               - userId
 *               - email
 *             properties:
 *               userId:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               profile:
 *                 type: object
 *     responses:
 *       201:
 *         description: Customer created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Failed to create customer
 */
router.post(
  "/",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
      const adminId = req.user!.id;
      const validation = createCustomerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { profile, ...customerData } = validation.data;

      const customer = await prisma.customer.create({
        data: withSiteId({
          ...customerData,
          createdBy: adminId,
          ...(profile && {
            profile: {
              create: {
                ...profile,
                dateOfBirth: profile.dateOfBirth 
                  ? new Date(profile.dateOfBirth) 
                  : undefined,
                createdBy: adminId,
              },
            },
          }),
        }, siteId),
        include: {
          profile: true,
        },
      });

      return res.status(201).json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      return res.status(500).json({ error: "Failed to create customer" });
    }
  }
);

/**
 * @openapi
 * /customers/{id}:
 *   put:
 *     summary: Update customer
 *     description: Update customer information (admin only)
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
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
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to update customer
 */
router.put(
  "/:id",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
      const id = req.params.id!;
      const adminId = req.user!.id;
      const validation = updateCustomerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const customer = await prisma.customer.findFirst({
        where: customerWhere(siteId, { id: parseInt(id, 10) }),
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...validation.data,
          updatedBy: adminId,
        },
        include: {
          profile: true,
        },
      });

      return res.status(200).json(updatedCustomer);
    } catch (error) {
      console.error("Error updating customer:", error);
      return res.status(500).json({ error: "Failed to update customer" });
    }
  }
);

/**
 * @openapi
 * /customers/{id}:
 *   delete:
 *     summary: Delete customer
 *     description: Delete a customer by ID (admin only)
 *     tags:
 *       - Customers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to delete customer
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("customers:delete"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const siteId = requireSiteId(req);
      const id = req.params.id!;

      const customer = await prisma.customer.findFirst({
        where: customerWhere(siteId, { id: parseInt(id, 10) }),
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      await prisma.customer.delete({
        where: { id: customer.id },
      });

      return res.status(200).json({ 
        success: true, 
        message: "Customer deleted" 
      });
    } catch (error) {
      console.error("Error deleting customer:", error);
      return res.status(500).json({ error: "Failed to delete customer" });
    }
  }
);

export default router;
