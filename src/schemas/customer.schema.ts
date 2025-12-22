import { z } from "zod";

// Customer schemas
export const createCustomerSchema = z.object({
  userId: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  profile: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    displayName: z.string().optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
    companyName: z.string().optional(),
    jobTitle: z.string().optional(),
    taxId: z.string().optional(),
  }).optional(),
});

export const updateCustomerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
  phone: z.string().optional(),
  alternatePhone: z.string().optional(),
  avatar: z.string().url().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  taxId: z.string().optional(),
  website: z.string().url().optional(),
  preferredLocale: z.string().optional(),
  timezone: z.string().optional(),
});

// Address schemas
export const createAddressSchema = z.object({
  type: z.enum(["SHIPPING", "BILLING", "BOTH"]).default("SHIPPING"),
  label: z.string().optional(),
  isDefaultShipping: z.boolean().default(false),
  isDefaultBilling: z.boolean().default(false),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().min(1),
  country: z.string().length(2), // ISO 3166-1 alpha-2
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  deliveryInstructions: z.string().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

// Wishlist schemas
export const createWishlistSchema = z.object({
  name: z.string().default("My Wishlist"),
  description: z.string().optional(),
  visibility: z.enum(["PRIVATE", "SHARED", "PUBLIC"]).default("PRIVATE"),
  isDefault: z.boolean().default(false),
});

export const updateWishlistSchema = createWishlistSchema.partial();

export const addWishlistItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  notes: z.string().optional(),
  priority: z.number().default(0),
  priceAtAdd: z.number().optional(),
});

// Preferences schema
export const updatePreferencesSchema = z.object({
  emailMarketing: z.boolean().optional(),
  emailTransactional: z.boolean().optional(),
  emailProductUpdates: z.boolean().optional(),
  smsMarketing: z.boolean().optional(),
  smsTransactional: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  preferredLocale: z.string().optional(),
  preferredCurrency: z.string().optional(),
  preferredTimezone: z.string().optional(),
  preferredCategories: z.array(z.string()).optional(),
  preferredBrands: z.array(z.string()).optional(),
  allowBrowsingHistory: z.boolean().optional(),
  allowPersonalization: z.boolean().optional(),
  allowAnalytics: z.boolean().optional(),
});

// Consent schema
export const updateConsentSchema = z.object({
  channel: z.enum(["EMAIL", "SMS", "PUSH", "PHONE"]),
  granted: z.boolean(),
  legalBasis: z.enum(["OPT_IN", "LEGITIMATE_INTEREST", "CONTRACT", "LEGAL_OBLIGATION"]).default("OPT_IN"),
  source: z.string().optional(),
});

// GDPR schemas
export const dataExportRequestSchema = z.object({
  includeOrders: z.boolean().default(true),
  includeProfile: z.boolean().default(true),
  includeAddresses: z.boolean().default(true),
  includeBrowsing: z.boolean().default(true),
  includePreferences: z.boolean().default(true),
  exportFormat: z.enum(["json", "csv"]).default("json"),
});

export const dataDeletionRequestSchema = z.object({
  deleteOrders: z.boolean().default(false),
  deleteProfile: z.boolean().default(true),
  deleteAddresses: z.boolean().default(true),
  deleteBrowsing: z.boolean().default(true),
  deletePreferences: z.boolean().default(true),
  deletePaymentMethods: z.boolean().default(true),
  retentionReason: z.string().optional(),
});

// Customer note schema
export const createNoteSchema = z.object({
  note: z.string().min(1),
  isInternal: z.boolean().default(true),
});

// Segment schemas
export const createSegmentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  segmentType: z.enum(["MANUAL", "AUTOMATIC", "PREDICTIVE"]).default("MANUAL"),
  rules: z.any().optional(),
});

export const updateSegmentSchema = createSegmentSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type CreateWishlistInput = z.infer<typeof createWishlistSchema>;
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;
export type DataExportRequestInput = z.infer<typeof dataExportRequestSchema>;
export type DataDeletionRequestInput = z.infer<typeof dataDeletionRequestSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;
