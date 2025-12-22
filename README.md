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

## API Endpoints

### Customers
- `GET /customers` - List customers (admin)
- `GET /customers/:id` - Get customer profile
- `POST /customers` - Create customer
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

### Addresses
- `GET /customers/:id/addresses` - List customer addresses
- `POST /customers/:id/addresses` - Add address
- `PUT /customers/:id/addresses/:addressId` - Update address
- `DELETE /customers/:id/addresses/:addressId` - Delete address

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
PORT=3008
DATABASE_URL=postgresql://...
KAFKA_BROKERS=localhost:9092
```
