import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AccessTokenPayload } from '../types/auth.types.js';

const ACCESS_TOKEN_SECRET = process.env.CUSTOMER_JWT_SECRET || 'access-secret';

// Extend Express Request type to include customer info
declare global {
    namespace Express {
        interface Request {
            customer?: {
                id: string;
                role: 'CUSTOMER';
            };
        }
    }
}

export const customerAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid header' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as AccessTokenPayload;

        if (decoded.role !== 'CUSTOMER') {
            res.status(403).json({ error: 'Forbidden: Invalid role' });
            return;
        }

        req.customer = {
            id: decoded.customerId,
            role: decoded.role,
        };

        next();
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
        return;
    }
};
