import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Environment configuration interface
 */
export interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  adminJwtSecret: string;
  adminJwtExpiresIn: string;
  bcryptSaltRounds: number;
  sesRegion: string;
  sesAccessKeyId: string;
  sesSecretAccessKey: string;
  emailFromAddress: string;
}

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'PORT',
  'NODE_ENV',
  'DATABASE_URL',
  'ADMIN_JWT_SECRET',
  'ADMIN_JWT_EXPIRES_IN',
  'BCRYPT_SALT_ROUNDS',
  'SES_REGION',
  'SES_ACCESS_KEY_ID',
  'SES_SECRET_ACCESS_KEY',
  'EMAIL_FROM_ADDRESS',
] as const;

/**
 * Validates that all required environment variables are present
 * Fails fast if any are missing (no fallback defaults for secrets)
 */
function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please ensure all required variables are set in your .env file.'
    );
  }
}

/**
 * Parse and validate environment variables
 */
function parseEnv(): EnvConfig {
  validateEnv();

  const port = parseInt(process.env.PORT!, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`);
  }

  const nodeEnv = process.env.NODE_ENV!;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV value: ${nodeEnv}. Must be one of: development, production, test.`
    );
  }

  const databaseUrl = process.env.DATABASE_URL!;
  if (!databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      `Invalid DATABASE_URL format. Must start with 'postgresql://'. Current value: ${databaseUrl.substring(0, 20)}...`
    );
  }

  const adminJwtSecret = process.env.ADMIN_JWT_SECRET!;
  if (!adminJwtSecret || adminJwtSecret.trim().length === 0) {
    throw new Error('ADMIN_JWT_SECRET must be a non-empty string.');
  }

  const adminJwtExpiresIn = process.env.ADMIN_JWT_EXPIRES_IN!;
  if (!adminJwtExpiresIn || adminJwtExpiresIn.trim().length === 0) {
    throw new Error('ADMIN_JWT_EXPIRES_IN must be a non-empty string (e.g., "15m", "1h").');
  }

  const bcryptSaltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS!, 10);
  if (isNaN(bcryptSaltRounds) || bcryptSaltRounds < 1 || bcryptSaltRounds > 31) {
    throw new Error(
      `Invalid BCRYPT_SALT_ROUNDS value: ${process.env.BCRYPT_SALT_ROUNDS}. Must be a number between 1 and 31.`
    );
  }

  // Warn if cost factor is too high (will cause slow password verification)
  if (bcryptSaltRounds > 12) {
    console.warn(
      `⚠️  WARNING: BCRYPT_SALT_ROUNDS is set to ${bcryptSaltRounds}, which is very high. ` +
      `This will cause slow password verification (potentially 30+ seconds per login). ` +
      `Recommended value: 10-12 for good security/performance balance.`
    );
  }

  const sesRegion = process.env.SES_REGION!;
  const sesAccessKeyId = process.env.SES_ACCESS_KEY_ID!;
  const sesSecretAccessKey = process.env.SES_SECRET_ACCESS_KEY!;
  const emailFromAddress = process.env.EMAIL_FROM_ADDRESS!;

  return {
    port,
    nodeEnv,
    databaseUrl,
    adminJwtSecret,
    adminJwtExpiresIn,
    bcryptSaltRounds,
    sesRegion,
    sesAccessKeyId,
    sesSecretAccessKey,
    emailFromAddress,
  };
}

/**
 * Exported environment configuration
 * This will throw an error if required env vars are missing
 */
export const env: EnvConfig = parseEnv();

