import { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { z, ZodError } from 'zod';
import { AppError } from '../middlewares/error.middleware.js';

// --- SCHEMAS ---

const signupRequestOtpSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

const signupVerifyOtpSchema = z.object({
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

const loginRequestOtpSchema = z.object({
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

const loginVerifyOtpSchema = z.object({
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

// --- CONTROLLERS ---

// SIGNUP

export const signupRequestOtp = async (req: Request, res: Response) => {
    try {
        const input = signupRequestOtpSchema.parse(req.body);
        await authService.signupRequestOtp(input);
        res.status(200).json({ message: 'Signup OTP sent successfully' });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: (error as any).errors });
        } else if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Signup Request OTP error:', error);
            res.status(500).json({ error: 'Failed to request OTP' });
        }
    }
};

export const signupVerifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp } = signupVerifyOtpSchema.parse(req.body);
        const result = await authService.signupVerifyOtp(phone, otp);

        setRefreshTokenCookie(res, result.refreshToken);

        res.status(201).json({
            message: 'Signup successful',
            accessToken: result.accessToken,
            customer: result.customer,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: (error as any).errors });
        } else if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Signup Verify OTP error:', error);
            res.status(401).json({ error: 'Verification failed' });
        }
    }
};

// LOGIN

export const loginRequestOtp = async (req: Request, res: Response) => {
    try {
        const { phone } = loginRequestOtpSchema.parse(req.body);
        await authService.loginRequestOtp(phone);
        res.status(200).json({ message: 'Login OTP sent successfully' });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: (error as any).errors });
        } else if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Login Request OTP error:', error);
            res.status(500).json({ error: 'Failed to request OTP' });
        }
    }
};

export const loginVerifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp } = loginVerifyOtpSchema.parse(req.body);
        const result = await authService.loginVerifyOtp(phone, otp);

        setRefreshTokenCookie(res, result.refreshToken);

        res.status(200).json({
            message: 'Login successful',
            accessToken: result.accessToken,
            customer: result.customer,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: (error as any).errors });
        } else if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Login Verify OTP error:', error);
            res.status(401).json({ error: 'Verification failed' });
        }
    }
};

// LEGACY (DEPRECATED)

export const requestOtp = async (req: Request, res: Response) => {
    // Forward to Login Flow
    return loginRequestOtp(req, res);
};

export const verifyOtp = async (req: Request, res: Response) => {
    // Forward to Login Flow
    return loginVerifyOtp(req, res);
};

// UTILS

export const refresh = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            res.status(401).json({ error: 'Refresh token missing' });
            return;
        }

        const result = await authService.refreshSession(refreshToken);

        setRefreshTokenCookie(res, result.newRefreshToken);

        res.status(200).json({ accessToken: result.newAccessToken });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ error: 'Failed to refresh token' });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await authService.logout(refreshToken);
        }

        res.clearCookie('refreshToken');
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

// HELPER

function setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
}
