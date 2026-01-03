/**
 * Customer Service - Entry Point
 * Server initialization with graceful shutdown
 */

import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./config/logger.js";

const app = createApp();
let server: ReturnType<typeof app.listen> | null = null;

async function start(): Promise<void> {
  try {
    server = app.listen(config.PORT, () => {
      logger.info(`Customer service started`, { port: config.PORT });
      console.log(`🚀 Customer service running on port ${config.PORT}`);
      console.log(`📚 API Documentation:`);
      console.log(`   - Swagger UI: http://localhost:${config.PORT}/api-docs`);
      console.log(`   - OpenAPI JSON: http://localhost:${config.PORT}/api-docs.json`);
      console.log(`   - ReDoc: http://localhost:${config.PORT}/redoc`);
    });
  } catch (error) {
    logger.error("Failed to start customer service", error);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  if (server) {
    server.close((err) => {
      if (err) {
        logger.error("Error during server shutdown", err);
        process.exit(1);
      }
      logger.info("Server closed successfully");
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason as Error);
  process.exit(1);
});

start();
