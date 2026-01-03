# Customer Service

Customer microservice for the e-commerce platform. Manages customer profiles, addresses, preferences, wishlists, and GDPR compliance.

## Features

- **Customer Profiles**: Manage customer personal information and B2B details
- **Addresses**: Shipping and billing address management with validation
- **Wishlists**: Multiple wishlists with sharing capabilities
- **Preferences**: Communication and shopping preferences
- **Segments**: Customer segmentation for marketing
- **GDPR Compliance**: Data export and deletion request handling
- **Consent Management**: Track and audit marketing consent

## Project Structure

```
src/
├── app.ts                    # Express application setup
├── main.ts                   # Entry point with graceful shutdown
├── index.ts                  # Barrel exports
├── config/
│   ├── index.ts              # Configuration management
│   └── logger.ts             # Structured logging
├── common/
│   ├── errors/AppError.ts    # Error classes
│   └── http/index.ts         # Response utilities
├── health/
│   └── health.routes.ts      # Health check endpoints
├── middleware/
│   └── auth.ts               # Authentication middleware
├── schemas/
│   └── customer.schema.ts    # Zod validation schemas
└── routes/
    ├── customer/             # Customer profile routes
    │   ├── profile.route.ts  # User self-service
    │   ├── admin.route.ts    # Admin CRUD
    │   └── notes.route.ts    # CRM notes
    ├── address/              # Address routes
    │   ├── crud.route.ts     # CRUD operations
    │   └── defaults.route.ts # Default address management
    ├── wishlist/             # Wishlist routes
    │   ├── crud.route.ts     # Wishlist CRUD
    │   └── items.route.ts    # Wishlist items
    ├── gdpr/                 # GDPR compliance routes
    │   ├── export.route.ts   # Data export
    │   ├── deletion.route.ts # Data deletion
    │   └── admin.route.ts    # Admin management
    ├── segment/              # Customer segmentation
    │   ├── crud.route.ts     # Segment CRUD
    │   └── membership.route.ts # Member management
    ├── consent.route.ts      # Consent management
    ├── history.route.ts      # Customer history
    ├── notes.route.ts        # Standalone notes
    └── preferences.route.ts  # User preferences
```

## API Endpoints

### Customers
- `GET /customers` - List customers (admin)
- `GET /customers/:id` - Get customer profile
- `POST /customers` - Create customer
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

### Addresses
- `GET /addresses` - List user addresses
- `POST /addresses` - Add address
- `PUT /addresses/:id` - Update address
- `DELETE /addresses/:id` - Delete address

### Wishlists
- `GET /wishlists` - Get user's wishlists
- `POST /wishlists` - Create wishlist
- `PUT /wishlists/:id` - Update wishlist
- `DELETE /wishlists/:id` - Delete wishlist
- `POST /wishlists/:id/items` - Add item to wishlist
- `DELETE /wishlists/:id/items/:itemId` - Remove item

### Preferences
- `GET /preferences` - Get user preferences
- `PUT /preferences` - Update preferences

### GDPR
- `POST /gdpr/export` - Request data export
- `POST /gdpr/delete` - Request data deletion
- `GET /gdpr/requests` - List GDPR requests

## Development

```bash
pnpm install
pnpm dev
```

## Environment Variables

```env
PORT=3005
CUSTOMER_DATABASE_URL=postgresql://...
AUTH_SERVICE_URL=http://localhost:8003
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003
LOG_LEVEL=info
```
