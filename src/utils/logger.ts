import { env } from '../config/env.js';

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

/**
 * Production-ready logger utility
 * Formats logs appropriately and supports different log levels
 */
class Logger {
  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  error(message: string, ...args: unknown[]): void {
    console.error(this.formatMessage(LogLevel.ERROR, message, ...args));
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, ...args));
  }

  info(message: string, ...args: unknown[]): void {
    console.log(this.formatMessage(LogLevel.INFO, message, ...args));
  }

  debug(message: string, ...args: unknown[]): void {
    if (env.nodeEnv === 'development') {
      console.log(this.formatMessage(LogLevel.DEBUG, message, ...args));
    }
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

