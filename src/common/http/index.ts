/**
 * HTTP Response Utilities
 * Standardized response formatting for the Customer Service
 */

import { Response } from "express";
import { AppError } from "../errors/AppError.js";
import { logger } from "../../config/logger.js";
import { isProduction } from "../../config/index.js";

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: unknown[];
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    success: true,
    data,
  } satisfies SuccessResponse<T>);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; limit: number; total: number }
): Response {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  } satisfies PaginatedResponse<T>);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

export function sendError(
  res: Response,
  error: unknown,
  context?: string
): Response {
  if (error instanceof AppError) {
    if (!error.isOperational) {
      logger.error("Non-operational error", error, { context });
    }
    
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
    
    if ("errors" in error && Array.isArray(error.errors)) {
      response.error.errors = error.errors;
    }
    
    return res.status(error.statusCode).json(response);
  }

  logger.error("Unhandled error", error, { context });

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction ? "An unexpected error occurred" : String(error),
    },
  } satisfies ErrorResponse);
}
