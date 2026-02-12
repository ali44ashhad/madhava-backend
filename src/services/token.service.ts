import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import crypto from 'crypto';
import { AccessTokenPayload } from '../types/auth.types.js';

const ACCESS_TOKEN_SECRET = process.env.CUSTOMER_JWT_SECRET || 'access-secret';
const REFRESH_TOKEN_SECRET = process.env.CUSTOMER_REFRESH_SECRET || 'refresh-secret'; // Used for hashing generally
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export const generateAccessToken = (customerId: string): string => {
    const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
        customerId,
        role: 'CUSTOMER',
    };

    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = async (customerId: string): Promise<string> => {
    const token = crypto.randomBytes(40).toString('hex');

    // Store hashed version
    const hash = crypto
        .createHmac('sha256', REFRESH_TOKEN_SECRET)
        .update(token)
        .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await prisma.customerSession.create({
        data: {
            customerId,
            tokenHash: hash,
            expiresAt,
        },
    });

    return token;
};

export const verifyRefreshToken = async (token: string): Promise<string | null> => {
    const hash = crypto
        .createHmac('sha256', REFRESH_TOKEN_SECRET)
        .update(token)
        .digest('hex');

    const session = await prisma.customerSession.findFirst({
        where: { tokenHash: hash },
    });

    if (!session) return null;
    if (new Date() > session.expiresAt) {
        // Clean up expired session
        await prisma.customerSession.delete({ where: { id: session.id } });
        return null;
    }

    return session.customerId;
};

export const revokeSession = async (token: string): Promise<void> => {
    const hash = crypto
        .createHmac('sha256', REFRESH_TOKEN_SECRET)
        .update(token)
        .digest('hex');

    await prisma.customerSession.deleteMany({
        where: { tokenHash: hash },
    });
};

export const rotateRefreshToken = async (oldToken: string): Promise<{ newAccessToken: string; newRefreshToken: string } | null> => {
    const customerId = await verifyRefreshToken(oldToken);
    if (!customerId) return null;

    // Revoke old
    await revokeSession(oldToken);

    // Issue new
    const newAccessToken = generateAccessToken(customerId);
    const newRefreshToken = await generateRefreshToken(customerId);

    return { newAccessToken, newRefreshToken };
};
