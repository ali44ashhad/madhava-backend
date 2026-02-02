import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client singleton instance
 * Prevents multiple instances of PrismaClient in development
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton Prisma Client instance
 * Connection URL is read from DATABASE_URL environment variable
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Disconnects Prisma Client on application termination
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Closing Prisma connection...`);
  try {
    await prisma.$disconnect();
    console.log('Prisma connection closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error closing Prisma connection:', error);
    process.exit(1);
  }
};

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled Rejection:', reason);
  await gracefulShutdown('unhandledRejection');
});



