#!/usr/bin/env tsx
/**
 * Database connection validation for customer-service
 * 
 * Validates:
 * - Can import customer-db module
 * - Prisma client is available
 * - Required types and functions are available
 */

import { PrismaClient, getCustomerPrisma } from "@innovabound-ecomm-platform/customer-db";

interface ValidationCheck {
  name: string;
  passed: boolean;
  error?: string;
}

const checks: ValidationCheck[] = [];

async function runValidation() {
  console.log('🔍 Validating customer-service database connection...\n');

  // Check 1: Import validation
  try {
    checks.push({
      name: 'Import customer-db module (PrismaClient)',
      passed: PrismaClient !== undefined,
    });
  } catch (error: any) {
    checks.push({
      name: 'Import customer-db module',
      passed: false,
      error: error.message,
    });
  }

  // Check 2: Check getCustomerPrisma function exists
  try {
    checks.push({
      name: 'getCustomerPrisma function available',
      passed: typeof getCustomerPrisma === 'function',
    });
  } catch (error: any) {
    checks.push({
      name: 'getCustomerPrisma function available',
      passed: false,
      error: error.message,
    });
  }

  // Check 3: Database connection (only if DATABASE_URL is set)
  if (process.env.CUSTOMER_DATABASE_URL) {
    try {
      const prisma = getCustomerPrisma();
      
      // Check models exist
      const requiredModels = ['customer', 'customerProfile', 'customerAddress', 'wishlist', 'wishlistItem'];
      
      for (const model of requiredModels) {
        const modelExists = (prisma as any)[model] !== undefined;
        checks.push({
          name: `Model ${model} exists`,
          passed: modelExists,
          error: modelExists ? undefined : `Model ${model} not found`,
        });
      }

      await prisma.$connect();
      checks.push({
        name: 'Database connection successful',
        passed: true,
      });
      await prisma.$disconnect();
    } catch (error: any) {
      checks.push({
        name: 'Database connection',
        passed: false,
        error: `Connection failed: ${error.message}`,
      });
    }
  } else {
    checks.push({
      name: 'Database connection',
      passed: true,
      error: 'Skipped - CUSTOMER_DATABASE_URL not set',
    });
  }

  // Print results
  console.log('Results:\n');
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  checks.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    if (check.error) {
      console.log(`   Error: ${check.error}`);
    }
  });

  console.log(`\n📊 Summary: ${passed}/${checks.length} checks passed\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runValidation().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
