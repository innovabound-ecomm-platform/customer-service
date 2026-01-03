/**
 * Customer Service Configuration
 * Centralized configuration management with environment validation
 */

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3005),
  CUSTOMER_DATABASE_URL: z.string().optional(),
  AUTH_SERVICE_URL: z.string().default("http://localhost:8003"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3002,http://localhost:3003"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment configuration:");
    console.error(result.error.format());
    throw new Error("Invalid environment configuration");
  }

  return result.data;
}

export const config = loadConfig();

export const corsOrigins = config.CORS_ORIGINS.split(",").map((o) => o.trim());

export const isProduction = config.NODE_ENV === "production";
export const isDevelopment = config.NODE_ENV === "development";
export const isTest = config.NODE_ENV === "test";
