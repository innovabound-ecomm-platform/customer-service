/**
 * Customer Notes Routes
 * CRM notes management for customer records
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import { getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";
import { requireAuth, requirePermission, AuthenticatedRequest } from "../../middleware/auth.js";
import { createNoteSchema } from "../../schemas/customer.schema.js";

const router: RouterType = Router();
const prisma = getCustomerPrisma();

/**
 * @openapi
 * /customers/{id}/notes:
 *   get:
 *     summary: Get customer notes
 *     description: Get all notes for a specific customer (admin only)
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of customer notes
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Failed to fetch notes
 */
router.get(
  "/:id/notes",
  requireAuth,
  requirePermission("customers:read"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
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
 * @openapi
 * /customers/{id}/notes:
 *   post:
 *     summary: Add note to customer
 *     description: Add a new note to a customer record (admin only)
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
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Note created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Failed to create note
 */
router.post(
  "/:id/notes",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id!;
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
 * @openapi
 * /customers/{id}/notes/{noteId}:
 *   delete:
 *     summary: Delete customer note
 *     description: Delete a note from a customer record (admin only)
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
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Note ID
 *     responses:
 *       200:
 *         description: Note deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Note not found
 *       500:
 *         description: Failed to delete note
 */
router.delete(
  "/:id/notes/:noteId",
  requireAuth,
  requirePermission("customers:write"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const noteId = req.params.noteId!;

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
