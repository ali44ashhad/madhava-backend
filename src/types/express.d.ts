/**
 * Extend Express Request type to include admin property
 * Set by adminAuth middleware after successful authentication
 */
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

export {};

