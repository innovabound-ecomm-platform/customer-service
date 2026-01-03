import { Router } from "express";
import type { Router as RouterType } from "express";
import crudRouter from "./crud.route.js";
import itemsRouter from "./items.route.js";

const router: RouterType = Router();

// Mount items router first so /default route is matched before /:id
router.use("/", itemsRouter);
router.use("/", crudRouter);

export default router;
