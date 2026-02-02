import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';

/**
 * Script to create an admin user
 * Usage: npx tsx scripts/create-admin.ts <email> <password>
 */

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
    process.exit(1);
  }

  const [email, password] = args;

  // Validate email format (basic check)
  if (!email.includes('@')) {
    console.error('Error: Invalid email format');
    process.exit(1);
  }

  // Validate password length
  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long');
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.error(`Error: Admin with email ${email} already exists`);
      process.exit(1);
    }

    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

    // Create admin user
    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('Admin details:');
    console.log(`  ID: ${admin.id}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role: ${admin.role}`);
    console.log(`  Active: ${admin.isActive}`);
    console.log(`  Created: ${admin.createdAt}`);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

