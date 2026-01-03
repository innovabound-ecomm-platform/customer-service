/**
 * Segment Routes - Barrel Export
 * Combines CRUD and membership routes
 */

import { Router } from "express";
import type { Router as RouterType } from "express";
import crudRouter from "./crud.route.js";
import membershipRouter from "./membership.route.js";

const router: RouterType = Router();

// CRUD routes first (includes /:id which must be before more specific routes)
router.use(crudRouter);

// Membership routes (/:id/members, /:id/refresh)
router.use(membershipRouter);

export default router;
