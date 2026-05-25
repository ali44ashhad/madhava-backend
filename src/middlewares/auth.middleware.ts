import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AccessTokenPayload } from '../types/auth.types.js';
import { prisma } from '../config/prisma.js';
import { activeCustomerWhere } from '../services/customer.service.js';

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

export const customerAuthMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
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

        const customer = await prisma.customer.findFirst({
            where: { id: decoded.customerId, ...activeCustomerWhere },
            select: { id: true },
        });

        if (!customer) {
            res.status(401).json({ error: 'Account has been deleted' });
            return;
        }

        req.customer = {
            id: customer.id,
            role: decoded.role,
        };

        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
        return;
    }
};
