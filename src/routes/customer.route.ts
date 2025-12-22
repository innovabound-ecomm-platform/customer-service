import { Router } from "express";
import { PrismaClient, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../middleware/auth";
import { 
  createCustomerSchema, 
  updateCustomerSchema, 
  updateProfileSchema,
  createNoteSchema 
} from "../schemas/customer.schema";

const router = Router();
const prisma = new PrismaClient();

// ============================================
// PUBLIC/USER ROUTES
// ============================================

/**
 * GET /customers/me
 * Get current user's customer profile
 */
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

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
        data: {
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
 * PUT /customers/me
 * Update current user's customer record
 */
router.put("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
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
      create: {
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
 * PUT /customers/me/profile
 * Update current user's profile
 */
router.put("/me/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
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
        data: {
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

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /customers
 * List all customers (admin only)
 */
router.get(
  "/",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { 
        page = "1", 
        limit = "50", 
        search,
        sortBy = "createdAt",
        sortOrder = "desc"
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);

      const where: Prisma.CustomerWhereInput = {};

      if (search) {
        where.OR = [
          { email: { contains: search as string, mode: "insensitive" } },
          { phone: { contains: search as string, mode: "insensitive" } },
          { profile: { firstName: { contains: search as string, mode: "insensitive" } } },
          { profile: { lastName: { contains: search as string, mode: "insensitive" } } },
        ];
      }

      const orderBy: Prisma.CustomerOrderByWithRelationInput = {};
      orderBy[sortBy as string] = sortOrder as "asc" | "desc";

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
 * GET /customers/:id
 * Get customer by ID (admin only)
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            { id: parseInt(id, 10) || 0 },
            { uuid: id },
            { userId: id },
          ],
        },
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
 * POST /customers
 * Create a new customer (admin only)
 */
router.post(
  "/",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const adminId = req.user!.id;
      const validation = createCustomerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { profile, ...customerData } = validation.data;

      const customer = await prisma.customer.create({
        data: {
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
        },
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
 * PUT /customers/:id
 * Update a customer (admin only)
 */
router.put(
  "/:id",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;
      const validation = updateCustomerSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const customer = await prisma.customer.update({
        where: { id: parseInt(id, 10) },
        data: {
          ...validation.data,
          updatedBy: adminId,
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
  }
);

/**
 * DELETE /customers/:id
 * Delete a customer (admin only)
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission("customers:delete"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      await prisma.customer.delete({
        where: { id: parseInt(id, 10) },
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

// ============================================
// CUSTOMER NOTES (Admin CRM)
// ============================================

/**
 * GET /customers/:id/notes
 * Get customer notes
 */
router.get(
  "/:id/notes",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { page = "1", limit = "20" } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 50);

      const [notes, total] = await Promise.all([
        prisma.customerNote.findMany({
          where: { customerId: parseInt(id, 10) },
          orderBy: { createdAt: "desc" },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.customerNote.count({
          where: { customerId: parseInt(id, 10) },
        }),
      ]);

      return res.status(200).json({
        data: notes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching notes:", error);
      return res.status(500).json({ error: "Failed to fetch notes" });
    }
  }
);

/**
 * POST /customers/:id/notes
 * Add a note to customer
 */
router.post(
  "/:id/notes",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;
      const validation = createNoteSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const note = await prisma.customerNote.create({
        data: {
          customerId: parseInt(id, 10),
          ...validation.data,
          authorId: adminId,
          createdBy: adminId,
        },
      });

      return res.status(201).json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      return res.status(500).json({ error: "Failed to create note" });
    }
  }
);

/**
 * DELETE /customers/:id/notes/:noteId
 * Delete a customer note
 */
router.delete(
  "/:id/notes/:noteId",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { noteId } = req.params;

      await prisma.customerNote.delete({
        where: { id: parseInt(noteId, 10) },
      });

      return res.status(200).json({ 
        success: true, 
        message: "Note deleted" 
      });
    } catch (error) {
      console.error("Error deleting note:", error);
      return res.status(500).json({ error: "Failed to delete note" });
    }
  }
);

export default router;
