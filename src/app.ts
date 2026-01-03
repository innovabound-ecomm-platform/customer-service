/**
 * Customer Service - Express Application
 * Application configuration and middleware setup
 */

import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config, corsOrigins, isProduction } from "./config/index.js";
import { logger } from "./config/logger.js";
import { AppError } from "./common/errors/AppError.js";
import healthRouter from "./health/health.routes.js";
import customerRouter from "./routes/customer/index.js";
import addressRouter from "./routes/address/index.js";
import wishlistRouter from "./routes/wishlist/index.js";
import preferencesRouter from "./routes/preferences.route.js";
import gdprRouter from "./routes/gdpr/index.js";
import segmentRouter from "./routes/segment/index.js";
import historyRouter from "./routes/history.route.js";
import consentRouter from "./routes/consent.route.js";
import notesRouter from "./routes/notes.route.js";
import statsRouter from "./routes/stats.route.js";

export function createApp(): Application {
  const app: Application = express();

  // CORS configuration
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );

  // Body parsing
  app.use(express.json());
  app.use(cookieParser());

  // Request logging in development
  if (!isProduction) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip,
      });
      next();
    });
  }

  // Swagger/OpenAPI configuration
  const swaggerOptions: swaggerJsdoc.Options = {
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Customer Service API",
        version: "1.0.0",
        description:
          "API documentation for the Customer microservice. Handles customer profiles, addresses, wishlists, preferences, GDPR compliance, segments, history, consent, and notes.",
        contact: {
          name: "API Support",
          email: "support@innovabound.com",
        },
        license: {
          name: "ISC",
          url: "https://opensource.org/licenses/ISC",
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: "Development server",
        },
      ],
      tags: [
        { name: "Customers", description: "Customer profile management operations" },
        { name: "Addresses", description: "Customer address management" },
        { name: "Wishlists", description: "Customer wishlist operations" },
        { name: "Preferences", description: "Customer preferences management" },
        { name: "GDPR", description: "GDPR compliance operations" },
        { name: "Segments", description: "Customer segmentation" },
        { name: "History", description: "Customer activity history" },
        { name: "Consent", description: "Customer consent management" },
        { name: "Notes", description: "Customer notes and annotations" },
        { name: "Health", description: "Service health checks" },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "access_token",
            description: "JWT access token stored in cookie",
          },
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT Bearer token",
          },
        },
      },
      security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    },
    apis: ["./src/routes/*.ts", "./src/routes/**/*.ts", "./src/health/*.ts", "./src/app.ts"],
  };

  const swaggerSpec = swaggerJsdoc(swaggerOptions);

  // Swagger UI
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Customer Service API Docs",
    })
  );

  // OpenAPI JSON spec
  app.get("/api-docs.json", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // ReDoc documentation
  app.get("/redoc", (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Customer Service API - ReDoc</title>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
          <style>body { margin: 0; padding: 0; }</style>
        </head>
        <body>
          <redoc spec-url="/api-docs.json"></redoc>
          <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
        </body>
      </html>
    `);
  });

  // Mount routes
  app.use("/health", healthRouter);
  app.use("/stats", statsRouter);
  app.use("/customers", customerRouter);
  app.use("/addresses", addressRouter);
  app.use("/wishlists", wishlistRouter);
  app.use("/preferences", preferencesRouter);
  app.use("/gdpr", gdprRouter);
  app.use("/segments", segmentRouter);
  app.use("/history", historyRouter);
  app.use("/consent", consentRouter);
  app.use("/notes", notesRouter);

  // Global error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    if (err instanceof Error) {
      logger.error("Unhandled error", err, {
        path: req.path,
        method: req.method,
      });

      return res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: isProduction ? "An unexpected error occurred" : err.message,
        },
      });
    }

    logger.error("Unknown error type", err as Error);
    return res.status(500).json({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  return app;
}
