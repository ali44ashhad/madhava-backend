import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import crypto from 'crypto';
import { AccessTokenPayload } from '../types/auth.types.js';

const ACCESS_TOKEN_SECRET = process.env.CUSTOMER_JWT_SECRET || 'access-secret';
const REFRESH_TOKEN_SECRET = process.env.CUSTOMER_REFRESH_SECRET || 'refresh-secret'; // Used for hashing generally
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_ROTATION_GRACE_SECONDS = Number(process.env.REFRESH_ROTATION_GRACE_SECONDS || 60);

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
    // Inline validation so we can also apply a grace window to the old session.
    const oldHash = crypto
        .createHmac('sha256', REFRESH_TOKEN_SECRET)
        .update(oldToken)
        .digest('hex');

    const session = await prisma.customerSession.findFirst({
        where: { tokenHash: oldHash },
    });

    if (!session) return null;
    if (new Date() > session.expiresAt) {
        await prisma.customerSession.delete({ where: { id: session.id } });
        return null;
    }

    // Issue new tokens first (so even if the grace-update fails, user still gets a new token).
    const newAccessToken = generateAccessToken(session.customerId);
    const newRefreshToken = await generateRefreshToken(session.customerId);

    // Rotation grace window:
    // Instead of deleting the old session immediately, keep it valid briefly so parallel refresh
    // calls (or slow Set-Cookie persistence) don't log the user out.
    //
    // We implement grace without a schema change by shortening old `expiresAt`.
    const graceMs = Math.max(0, REFRESH_ROTATION_GRACE_SECONDS) * 1000;
    if (graceMs > 0) {
        const graceExpiry = new Date(Date.now() + graceMs);
        const newOldExpiry = graceExpiry < session.expiresAt ? graceExpiry : session.expiresAt;
        await prisma.customerSession.update({
            where: { id: session.id },
            data: { expiresAt: newOldExpiry },
        });
    } else {
        // If grace is disabled, behave like strict rotation.
        await prisma.customerSession.delete({ where: { id: session.id } });
    }

    return { newAccessToken, newRefreshToken };
};
