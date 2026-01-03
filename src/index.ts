import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import customerRouter from "./routes/customer.route";
import addressRouter from "./routes/address.route";
import wishlistRouter from "./routes/wishlist.route";
import preferencesRouter from "./routes/preferences.route";
import gdprRouter from "./routes/gdpr.route";
import segmentRouter from "./routes/segment.route";
import historyRouter from "./routes/history.route";
import consentRouter from "./routes/consent.route";
import notesRouter from "./routes/notes.route";

const app: Application = express();

app.use(
  cors({
    origin: ["http://localhost:3002", "http://localhost:3003"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Swagger/OpenAPI configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Customer Service API",
      version: "1.0.0",
      description: "API documentation for the Customer microservice. Handles customer profiles, addresses, wishlists, preferences, GDPR compliance, segments, history, consent, and notes.",
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
        url: "http://localhost:3005",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Customers",
        description: "Customer profile management operations",
      },
      {
        name: "Addresses",
        description: "Customer address management",
      },
      {
        name: "Wishlists",
        description: "Customer wishlist operations",
      },
      {
        name: "Preferences",
        description: "Customer preferences management",
      },
      {
        name: "GDPR",
        description: "GDPR compliance operations",
      },
      {
        name: "Segments",
        description: "Customer segmentation",
      },
      {
        name: "History",
        description: "Customer activity history",
      },
      {
        name: "Consent",
        description: "Customer consent management",
      },
      {
        name: "Notes",
        description: "Customer notes and annotations",
      },
      {
        name: "Health",
        description: "Service health checks",
      },
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
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/index.ts"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "Customer Service API Docs",
}));

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

// Health check
app.get("/health", (req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    service: "customer-service",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Routes
app.use("/customers", customerRouter);
app.use("/addresses", addressRouter);
app.use("/wishlists", wishlistRouter);
app.use("/preferences", preferencesRouter);
app.use("/gdpr", gdprRouter);
app.use("/segments", segmentRouter);
app.use("/history", historyRouter);
app.use("/consent", consentRouter);
app.use("/notes", notesRouter);

// Error handler
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof Error) {
    console.error("Error:", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
      },
    });
  }

  console.error("Unknown error:", err);
  return res.status(500).json({
    success: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

const PORT = process.env.PORT || 3005;

const start = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Customer service running on port ${PORT}`);
      console.log(`📚 API Documentation:`);
      console.log(`   - Swagger UI: http://localhost:${PORT}/api-docs`);
      console.log(`   - OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
      console.log(`   - ReDoc: http://localhost:${PORT}/redoc`);
    });
  } catch (error) {
    console.error("Failed to start customer service:", error);
    process.exit(1);
  }
};

start();

export default app;
