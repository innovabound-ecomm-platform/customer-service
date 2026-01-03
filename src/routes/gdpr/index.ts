/**
 * GDPR Routes - Barrel Export
 * Combines export, deletion, and admin routes
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import exportRouter from "./export.route.js";
import deletionRouter from "./deletion.route.js";
import adminRouter from "./admin.route.js";

const router: RouterType = Router();

// User export routes
router.use(exportRouter);

// User deletion routes
router.use(deletionRouter);

// Admin routes
router.use(adminRouter);

export default router;
