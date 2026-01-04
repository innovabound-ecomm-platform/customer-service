/**
 * Tenant utilities for customer-service
 * Provides helpers for tenant-scoped database operations
 */

import type { Request } from "express";
import type { Prisma } from "@innovabound-ecomm-platform/customer-db";

/**
 * Get siteId from request.
 * Returns undefined if no tenant context is present.
 */
export function getSiteId(req: Request): string | undefined {
  return (req as { siteId?: string }).siteId;
}

/**
 * Get siteId from request, throwing if not present.
 * Use this when tenant context is required.
 */
export function requireSiteId(req: Request): string {
  const siteId = getSiteId(req);
  if (!siteId) {
    throw new TenantRequiredError();
  }
  return siteId;
}

/**
 * Options for tenant-scoped queries
 */
interface TenantQueryOptions {
  /**
   * When true (default), throws TenantRequiredError if siteId is missing.
   * Set to false ONLY for public storefront read operations.
   */
  strict?: boolean;
}

/**
 * Build a tenant-scoped where clause for Customer queries.
 * By default, throws if siteId is missing (deny-by-default).
 */
export function customerWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.CustomerWhereInput,
  options: TenantQueryOptions = { strict: true }
): Prisma.CustomerWhereInput {
  const { strict = true } = options;

  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }

  const where: Prisma.CustomerWhereInput = { ...additionalWhere };
  if (siteId) {
    (where as { siteId?: string }).siteId = siteId;
  }
  return where;
}

/**
 * Build a tenant-scoped unique where clause for Customer.
 */
export function customerWhereUnique(
  id: number,
  siteId: string | undefined
): { id: number; siteId: string } {
  if (!siteId) {
    throw new TenantRequiredError("siteId is required for unique lookups");
  }
  return { id, siteId };
}

/**
 * Build a tenant-scoped where clause for Wishlist queries.
 */
export function wishlistWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.WishlistWhereInput,
  options: TenantQueryOptions = { strict: true }
): Prisma.WishlistWhereInput {
  const { strict = true } = options;

  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }

  const where: Prisma.WishlistWhereInput = { ...additionalWhere };
  if (siteId) {
    (where as { siteId?: string }).siteId = siteId;
  }
  return where;
}

/**
 * Build a tenant-scoped where clause for CustomerSegment queries.
 */
export function segmentWhere(
  siteId: string | undefined,
  additionalWhere?: Prisma.CustomerSegmentWhereInput,
  options: TenantQueryOptions = { strict: true }
): Prisma.CustomerSegmentWhereInput {
  const { strict = true } = options;

  if (strict && !siteId) {
    throw new TenantRequiredError("siteId is required for this query");
  }

  const where: Prisma.CustomerSegmentWhereInput = { ...additionalWhere };
  if (siteId) {
    (where as { siteId?: string }).siteId = siteId;
  }
  return where;
}

/**
 * Add siteId to create data.
 * Use this when creating new records.
 */
export function withSiteId<T extends Record<string, unknown>>(
  data: T,
  siteId: string | undefined
): T & { siteId: string } {
  if (!siteId) {
    throw new TenantRequiredError("siteId is required for create operations");
  }
  return { ...data, siteId };
}

/**
 * Validate that a record belongs to the current tenant.
 * Use when fetching by ID to ensure cross-tenant access is blocked.
 */
export function validateTenantOwnership(
  recordSiteId: string | null | undefined,
  requestSiteId: string | undefined
): void {
  if (!requestSiteId) {
    throw new TenantRequiredError("Tenant context required");
  }
  if (!recordSiteId || recordSiteId !== requestSiteId) {
    throw new TenantRequiredError("Record does not belong to current tenant");
  }
}

/**
 * Error class for missing tenant context
 */
export class TenantRequiredError extends Error {
  public readonly code = "TENANT_REQUIRED";
  public readonly statusCode = 403;

  constructor(message = "Tenant context is required for this operation") {
    super(message);
    this.name = "TenantRequiredError";
  }
}
