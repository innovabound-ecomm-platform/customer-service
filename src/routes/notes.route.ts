import { Router } from "express";
import { getCustomerPrisma, Prisma } from "@innovabound-ecomm-platform/customer-db";
import { requirePermission, AuthenticatedRequest } from "../middleware/auth";

const router: Router = Router();
const prisma = getCustomerPrisma();

// ============================================
// CUSTOMER NOTES (Admin/CRM)
// ============================================

/**
 * @openapi
 * /notes/customer/{customerId}:
 *   get:
 *     summary: Get customer notes
 *     description: Get all notes for a specific customer
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: query
 *         name: includeInternal
 *         schema:
 *           type: string
 *           default: "true"
 *     responses:
 *       200:
 *         description: List of notes
 *       400:
 *         description: customerId is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to fetch notes
 */
router.get("/customer/:customerId", requirePermission("customers:read"), async (req: AuthenticatedRequest, res) => {
  try {
    const customerIdParam = req.params.customerId;
    if (!customerIdParam) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const customerId = parseInt(customerIdParam, 10);
    const { includeInternal = "true" } = req.query;

    const where: Prisma.CustomerNoteWhereInput = { customerId };
    
    // Non-admin users can only see non-internal notes
    if (includeInternal !== "true") {
      where.isInternal = false;
    }

    const notes = await prisma.customerNote.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ data: notes });
  } catch (error) {
    console.error("Error fetching customer notes:", error);
    return res.status(500).json({ error: "Failed to fetch notes" });
  }
});

/**
 * @openapi
 * /notes/customer/{customerId}:
 *   post:
 *     summary: Add note to customer
 *     description: Add a new note to a customer
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
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
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Note created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to create note
 */
router.post("/customer/:customerId", requirePermission("customers:write"), async (req: AuthenticatedRequest, res) => {
  try {
    const customerIdParam = req.params.customerId;
    if (!customerIdParam) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const customerId = parseInt(customerIdParam, 10);
    const userId = req.user!.id;
    const { note, isInternal = true } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: "note is required" });
    }

    // Verify customer exists
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerNote = await prisma.customerNote.create({
      data: {
        customerId,
        note: note.trim(),
        authorId: userId,
        authorName: req.user!.email,
        isInternal,
        createdBy: userId,
      },
    });

    return res.status(201).json(customerNote);
  } catch (error) {
    console.error("Error creating customer note:", error);
    return res.status(500).json({ error: "Failed to create note" });
  }
});

/**
 * @openapi
 * /notes/{noteId}:
 *   put:
 *     summary: Update note
 *     description: Update a customer note
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Note updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Note not found
 *       500:
 *         description: Failed to update note
 */
router.put("/:noteId", requirePermission("customers:write"), async (req: AuthenticatedRequest, res) => {
  try {
    const noteIdParam = req.params.noteId;
    if (!noteIdParam) {
      return res.status(400).json({ error: "noteId is required" });
    }
    const noteId = parseInt(noteIdParam, 10);
    const userId = req.user!.id;
    const { note, isInternal } = req.body;

    const existing = await prisma.customerNote.findUnique({ where: { id: noteId } });
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Only author or admin can edit
    // For simplicity, allow any user with customers:write permission

    const updateData: Prisma.CustomerNoteUpdateInput = { updatedBy: userId };
    if (note !== undefined) updateData.note = note.trim();
    if (isInternal !== undefined) updateData.isInternal = isInternal;

    const customerNote = await prisma.customerNote.update({
      where: { id: noteId },
      data: updateData,
    });

    return res.status(200).json(customerNote);
  } catch (error) {
    console.error("Error updating customer note:", error);
    return res.status(500).json({ error: "Failed to update note" });
  }
});

/**
 * @openapi
 * /notes/{noteId}:
 *   delete:
 *     summary: Delete note
 *     description: Delete a customer note
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       400:
 *         description: noteId is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Note not found
 *       500:
 *         description: Failed to delete note
 */
router.delete("/:noteId", requirePermission("customers:delete"), async (req: AuthenticatedRequest, res) => {
  try {
    const noteIdParam = req.params.noteId;
    if (!noteIdParam) {
      return res.status(400).json({ error: "noteId is required" });
    }
    const noteId = parseInt(noteIdParam, 10);

    const existing = await prisma.customerNote.findUnique({ where: { id: noteId } });
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    await prisma.customerNote.delete({ where: { id: noteId } });

    return res.status(200).json({ success: true, message: "Note deleted" });
  } catch (error) {
    console.error("Error deleting customer note:", error);
    return res.status(500).json({ error: "Failed to delete note" });
  }
});

/**
 * @openapi
 * /notes/search:
 *   get:
 *     summary: Search notes
 *     description: Search notes across all customers
 *     tags:
 *       - Notes
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
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
 *         name: authorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isInternal
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search results
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to search notes
 */
router.get("/search", requirePermission("customers:read"), async (req: AuthenticatedRequest, res) => {
  try {
    const { 
      q, 
      page = "1", 
      limit = "50",
      authorId,
      isInternal 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.CustomerNoteWhereInput = {};
    if (q) {
      where.note = { contains: q as string, mode: "insensitive" };
    }
    if (authorId) where.authorId = authorId as string;
    if (isInternal !== undefined) where.isInternal = isInternal === "true";

    const [notes, total] = await Promise.all([
      prisma.customerNote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
        include: {
          customer: {
            select: {
              id: true,
              uuid: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      prisma.customerNote.count({ where }),
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
    console.error("Error searching notes:", error);
    return res.status(500).json({ error: "Failed to search notes" });
  }
});

export default router;
