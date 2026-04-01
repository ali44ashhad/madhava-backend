import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middlewares/error.middleware.js';
import * as couponService from '../services/coupon.service.js';
import { DiscountType } from '@prisma/client';

export const createCouponSchema = z.object({
    code: z.string().min(3).max(20),
    description: z.string().optional(),
    discountType: z.nativeEnum(DiscountType),
    discountValue: z.number().positive(),
    minOrderAmount: z.number().nonnegative().optional().nullable().transform(v => v ?? null),
    maxDiscount: z.number().positive().optional().nullable().transform(v => v ?? null),
    usageLimit: z.number().int().positive().optional().nullable().transform(v => v ?? null),
    usageLimitPerCustomer: z.number().int().positive().default(1),
    isActive: z.boolean().default(true),
    startsAt: z.string().datetime().optional().nullable().transform(val => val ? new Date(val) : undefined),
    expiresAt: z.string().datetime().optional().nullable().transform(val => val ? new Date(val) : undefined),
});

export const updateCouponSchema = createCouponSchema.partial();

export async function createCouponController(req: Request, res: Response, next: NextFunction) {
    try {
        const bodyResult = createCouponSchema.parse(req.body);

        // Convert nulls back to undefined to match TypeScript interface
        const data: any = { ...bodyResult };
        if (data.minOrderAmount === null) data.minOrderAmount = undefined;
        if (data.maxDiscount === null) data.maxDiscount = undefined;
        if (data.usageLimit === null) data.usageLimit = undefined;

        const coupon = await couponService.createCoupon(data);
        res.status(201).json({
            success: true,
            data: coupon
        });
    } catch (error) {
        next(error);
    }
}

export async function listCouponsController(req: Request, res: Response, next: NextFunction) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;

        const result = await couponService.listCoupons(page, limit, search);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
}

export async function updateCouponController(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const bodyResult = updateCouponSchema.parse(req.body);

        // Convert nulls back to undefined to match TypeScript interface
        const data: any = { ...bodyResult };
        if (data.minOrderAmount === null) data.minOrderAmount = undefined;
        if (data.maxDiscount === null) data.maxDiscount = undefined;
        if (data.usageLimit === null) data.usageLimit = undefined;

        const coupon = await couponService.updateCoupon(id, data);
        res.status(200).json({
            success: true,
            data: coupon
        });
    } catch (error) {
        next(error);
    }
}

export async function toggleCouponController(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const coupon = await couponService.toggleCouponActive(id);
        res.status(200).json({
            success: true,
            data: coupon
        });
    } catch (error) {
        next(error);
    }
}

export const validateCouponSchema = z.object({
    code: z.string().min(1),
    subtotal: z.number().positive(),
});

export async function validateCouponController(req: any, res: Response, next: NextFunction) {
    try {
        const { code, subtotal } = validateCouponSchema.parse(req.body);
        // Authentication middleware guarantees customerId
        const customerId = req.customer?.id;
        if (!customerId) {
            throw new AppError('UNAUTHORIZED', 'Customer ID missing', 401);
        }

        const result = await couponService.validateCoupon(code, subtotal, customerId);

        res.status(200).json({
            success: true,
            data: {
                discountAmount: result.discountAmount,
                couponCode: result.coupon.code,
                message: 'Coupon applied successfully'
            }
        });
    } catch (error) {
        next(error);
    }
}
