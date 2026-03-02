import * as otpService from './otp.service.js';
import * as smsService from './sms.service.js';
import * as tokenService from './token.service.js';
import * as customerService from './customer.service.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';

// --- SIGNUP FLOW ---

export const signupRequestOtp = async (input: { name: string; email: string; phone: string }): Promise<void> => {
    const { name, email, phone } = input;
    const cleanPhone = phone.replace(/\D/g, '');

    // 1. Check if customer already exists (by phone or email)
    const existingCustomer = await prisma.customer.findFirst({
        where: {
            OR: [
                { phone: cleanPhone },
                { email: { equals: email, mode: 'insensitive' } }
            ]
        }
    });

    if (existingCustomer) {
        throw new AppError('BAD_REQUEST', 'Customer with this phone or email already exists', 400);
    }

    // 2. Generate OTP and store with payload
    const payload = { name, email };
    const otp = await otpService.createOtp(cleanPhone, 'SIGNUP', payload);

    // 3. Send SMS
    const smsPhone = formatPhoneForSms(cleanPhone);
    await smsService.sendSms(smsPhone, `Your signup verification code is: ${otp}`);
};

export const signupVerifyOtp = async (phone: string, otp: string) => {
    const cleanPhone = phone.replace(/\D/g, '');

    // 1. Verify OTP
    const { isValid, payload } = await otpService.verifyOtp(cleanPhone, otp, 'SIGNUP');
    if (!isValid || !payload) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired OTP', 401);
    }

    // 2. Create Customer
    const { name, email } = payload;
    const customerResult = await customerService.createCustomer({
        name,
        email,
        phone: cleanPhone,
    });

    // 3. Issue Tokens
    const accessToken = tokenService.generateAccessToken(customerResult.customerId);
    const refreshToken = await tokenService.generateRefreshToken(customerResult.customerId);

    return {
        accessToken,
        refreshToken,
        customer: { id: customerResult.customerId, name, email, phone: cleanPhone }
    };
};

// --- LOGIN FLOW ---

export const loginRequestOtp = async (phone: string): Promise<void> => {
    const cleanPhone = phone.replace(/\D/g, '');

    // 1. Find Customer
    const customer = await prisma.customer.findFirst({
        where: { phone: cleanPhone },
    });

    if (!customer) {
        throw new AppError('NOT_FOUND', 'Account not found', 404);
    }

    // 2. Generate OTP (Login purpose)
    const otp = await otpService.createOtp(cleanPhone, 'LOGIN');

    // 3. Send SMS
    const smsPhone = formatPhoneForSms(cleanPhone);
    await smsService.sendSms(smsPhone, `Your login verification code is: ${otp}`);
    console.log('OTP sent to:', smsPhone);

};

export const loginVerifyOtp = async (phone: string, otp: string) => {
    const cleanPhone = phone.replace(/\D/g, '');

    // 1. Verify OTP
    const { isValid } = await otpService.verifyOtp(cleanPhone, otp, 'LOGIN');
    if (!isValid) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired OTP', 401);
    }

    // 2. Find Customer
    const customer = await prisma.customer.findFirstOrThrow({
        where: { phone: cleanPhone },
    });

    // 3. Issue Tokens
    const accessToken = tokenService.generateAccessToken(customer.id);
    const refreshToken = await tokenService.generateRefreshToken(customer.id);

    return { accessToken, refreshToken, customer };
};

// --- LEGACY / BACKWARD COMPATIBILITY ---

export const requestOtp = async (phone: string): Promise<void> => {
    // Deprecated: Internally route to LOGIN flow
    // This will fail for new users, as per instructions.
    // Spec says: "Internally route it to LOGIN flow."
    await loginRequestOtp(phone);
};

export const verifyOtp = async (phone: string, otp: string) => {
    // Deprecated: Internally route to LOGIN flow
    return loginVerifyOtp(phone, otp);
};

// --- UTILS ---

export const refreshSession = async (refreshToken: string) => {
    const result = await tokenService.rotateRefreshToken(refreshToken);
    if (!result) {
        throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
    }
    return result;
};

export const logout = async (refreshToken: string) => {
    await tokenService.revokeSession(refreshToken);
};

// Helper
const formatPhoneForSms = (phone: string): string => {
    if (phone.length === 10) return `+91${phone}`;
    if (phone.length === 12 && phone.startsWith('91')) return `+${phone}`;
    if (!phone.startsWith('+')) return `+${phone}`;
    return phone;
};
