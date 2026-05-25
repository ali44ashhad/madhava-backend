import { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { getCustomerById, softDeleteCustomer } from '../services/customer.service.js';
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

const deleteMyAccountSchema = z.object({
    confirm: z.literal(true, {
        message: 'You must confirm account deletion with confirm: true',
    }),
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
export const deleteMyAccount = async (req: Request, res: Response) => {
    try {
        if (!req.customer?.id) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        deleteMyAccountSchema.parse(req.body);
        await softDeleteCustomer(req.customer.id);

        clearRefreshTokenCookie(res);
        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: (error as ZodError).issues });
        } else if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Delete account error:', error);
            res.status(500).json({ error: 'Failed to delete account' });
        }
    }
};

export const getMe = async (req: Request, res: Response) => {
    try {
        if (!req.customer?.id) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const customer = await getCustomerById(req.customer.id);
        res.status(200).json(customer);
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error('Get Me error:', error);
            res.status(500).json({ error: 'Failed to fetch profile' });
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
            // Return null but don't clear cookie (in case of race where it's being set)
            res.status(200).json({ accessToken: null });
            return;
        }

        const result = await authService.refreshSession(refreshToken);

        setRefreshTokenCookie(res, result.newRefreshToken);

        res.status(200).json({ accessToken: result.newAccessToken });

    } catch (error) {
        console.error('Refresh Token Error:', error instanceof Error ? error.message : error);
        
        // Only clear if the token is explicitly invalid or expired (401)
        // This prevents transient errors (DB connection, 500s) from logging the user out permanently
        if (error instanceof AppError && error.statusCode === 401) {
            clearRefreshTokenCookie(res);
            res.status(200).json({ accessToken: null });
        } else {
            // For other errors (500, DB, etc.), return 500 and DON'T clear the cookie
            // The frontend can then decide to retry or show an error message without losing the session
            res.status(500).json({ 
                error: 'Internal server error during refresh',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await authService.logout(refreshToken);
        }

        clearRefreshTokenCookie(res);
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

// HELPER

function refreshTokenCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
    };
}

function setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, refreshTokenCookieOptions());
}

function clearRefreshTokenCookie(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        path: '/',
    });
}
