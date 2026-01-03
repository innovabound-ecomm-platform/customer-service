/**
 * Customer Routes - Barrel Export
 * Combines profile, admin, and notes routes
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import profileRouter from "./profile.route.js";
import adminRouter from "./admin.route.js";
import notesRouter from "./notes.route.js";

const router: RouterType = Router();

// User self-service routes (must be before /:id to avoid conflicts)
router.use(profileRouter);

// Admin CRUD routes
router.use(adminRouter);

// Notes routes (nested under /:id/notes)
router.use(notesRouter);

export default router;
