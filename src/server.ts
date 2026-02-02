import { createServer, Server } from 'http';
import { createApp } from './app.js';
import { env } from './config/index.js';
import { logger } from './utils/logger.js';

/**
 * HTTP server instance
 */
let server: Server | null = null;

/**
 * Start the HTTP server
 */
function startServer(): void {
  const app = createApp();
  server = createServer(app);

  server.listen(env.port, () => {
    logger.info(`Server is running on port ${env.port} in ${env.nodeEnv} mode`);
  });

  // Handle server errors
  server.on('error', (error: Error) => {
    logger.error('Server error:', error);
    process.exit(1);
  });
}

/**
 * Graceful shutdown handler
 * Closes the server gracefully and exits the process cleanly
 */
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  if (!server) {
    logger.info('Server not running, exiting...');
    process.exit(0);
    return;
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

/**
 * Main entry point
 * Environment variables are loaded and validated by config/env.ts
 */
function main(): void {
  try {
    // Start the server
    startServer();

    // Handle graceful shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled rejection:', reason);
      gracefulShutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
main();

