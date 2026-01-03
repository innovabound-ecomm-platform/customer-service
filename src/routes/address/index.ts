import { Router } from "express";
import type { Router as RouterType } from "express";
import crudRouter from "./crud.route.js";
import defaultsRouter from "./defaults.route.js";

const router: RouterType = Router();

// Mount CRUD operations (GET /, GET /:id, POST /, PUT /:id, DELETE /:id)
router.use("/", crudRouter);

// Mount default address operations (POST /:id/set-default-shipping, POST /:id/set-default-billing)
router.use("/", defaultsRouter);

export default router;
