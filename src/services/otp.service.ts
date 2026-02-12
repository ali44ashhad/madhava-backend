import { prisma } from '../config/prisma.js';
import bcrypt from 'bcryptjs';

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const OTP_SECRET = process.env.OTP_SECRET || 'default-secret-change-me';

// Helper to generate numeric OTP
const generateNumericOtp = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};


export const createOtp = async (phone: string, purpose: string = 'LOGIN', payload: any = null): Promise<string> => {
    const otp = generateNumericOtp();

    // Hash the OTP before storing. 
    // We can include a secret salt or just use bcrypt. 
    // Using bcrypt with a salt is robust.
    const otpHash = await bcrypt.hash(otp + OTP_SECRET, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    await prisma.otpVerification.create({
        data: {
            phone,
            otpHash,
            purpose,
            payload: payload ? JSON.stringify(payload) : undefined,
            expiresAt,
        },
    });

    return otp;
};

export const verifyOtp = async (phone: string, otp: string, purpose: string = 'LOGIN'): Promise<{ isValid: boolean; payload?: any }> => {
    // Find the latest OTP for this phone that hasn't theoretically expired by time
    // We will check precise expiry in logic
    const record = await prisma.otpVerification.findFirst({
        where: { phone, purpose },
        orderBy: { createdAt: 'desc' },
    });

    if (!record) return { isValid: false };

    if (record.attempts >= MAX_ATTEMPTS) {
        return { isValid: false }; // Too many attempts
    }

    if (new Date() > record.expiresAt) {
        return { isValid: false }; // Expired
    }

    const isValid = await bcrypt.compare(otp + OTP_SECRET, record.otpHash);

    if (!isValid) {
        // Increment attempts
        await prisma.otpVerification.update({
            where: { id: record.id },
            data: { attempts: { increment: 1 } },
        });
        return { isValid: false };
    }

    // If valid, we might want to delete it or mark it used to prevent replay.
    // Deleting is safest for one-time use.
    await prisma.otpVerification.delete({
        where: { id: record.id },
    });

    let payload = null;
    if (record.payload) {
        try {
            payload = JSON.parse(record.payload as string);
        } catch (e) {
            payload = record.payload;
        }
    }

    return { isValid: true, payload };
};
