import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { DiscountType, Prisma } from '@prisma/client';

export interface CreateCouponInput {
    code: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    minOrderAmount?: number;
    maxDiscount?: number;
    usageLimit?: number;
    usageLimitPerCustomer?: number;
    isActive?: boolean;
    startsAt?: Date;
    expiresAt?: Date;
}

export interface UpdateCouponInput extends Partial<CreateCouponInput> { }

export async function createCoupon(input: CreateCouponInput) {
    // Enforce uppercase code
    const code = input.code.toUpperCase().trim();

    // Check if coupon code already exists
    const existing = await prisma.coupon.findUnique({
        where: { code },
    });

    if (existing) {
        throw new AppError('CONFLICT', `Coupon with code ${code} already exists`, 409);
    }

    const coupon = await prisma.coupon.create({
        data: {
            ...input,
            code,
        },
    });

    logger.info('Coupon created', { couponId: coupon.id, code: coupon.code });
    return coupon;
}

export async function listCoupons(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: Prisma.CouponWhereInput = search
        ? {
            OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ],
        }
        : {};

    const [coupons, total] = await Promise.all([
        prisma.coupon.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.coupon.count({ where }),
    ]);

    return {
        coupons,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

export async function updateCoupon(id: string, input: UpdateCouponInput) {
    const existing = await prisma.coupon.findUnique({
        where: { id },
    });

    if (!existing) {
        throw new AppError('NOT_FOUND', 'Coupon not found', 404);
    }

    // If code is updated, ensure it's uppercase and unique
    let code = input.code;
    if (code) {
        code = code.toUpperCase().trim();
        if (code !== existing.code) {
            const duplicate = await prisma.coupon.findUnique({
                where: { code },
            });
            if (duplicate) {
                throw new AppError('CONFLICT', `Coupon code ${code} is already in use`, 409);
            }
        }
    }

    const coupon = await prisma.coupon.update({
        where: { id },
        data: {
            ...input,
            ...(code && { code }),
        },
    });

    logger.info('Coupon updated', { couponId: coupon.id });
    return coupon;
}

export async function toggleCouponActive(id: string) {
    const existing = await prisma.coupon.findUnique({
        where: { id },
    });

    if (!existing) {
        throw new AppError('NOT_FOUND', 'Coupon not found', 404);
    }

    const coupon = await prisma.coupon.update({
        where: { id },
        data: {
            isActive: !existing.isActive,
        },
    });

    logger.info(`Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, { couponId: coupon.id });
    return coupon;
}

export interface ValidateCouponResult {
    coupon: any;
    discountAmount: number;
}

export async function validateCoupon(
    code: string,
    subtotal: number,
    customerId: string,
    txClient: Prisma.TransactionClient = prisma
): Promise<ValidateCouponResult> {
    const couponCode = code.toUpperCase().trim();

    // Find the coupon
    const coupon = await txClient.coupon.findUnique({
        where: { code: couponCode },
    });

    if (!coupon) {
        throw new AppError('NOT_FOUND', 'Invalid coupon code', 404);
    }

    if (!coupon.isActive) {
        throw new AppError('BAD_REQUEST', 'This coupon is currently inactive', 400);
    }

    // Check dates
    const now = new Date();
    if (coupon.startsAt > now) {
        throw new AppError('BAD_REQUEST', 'This coupon is not active yet', 400);
    }

    if (coupon.expiresAt && coupon.expiresAt < now) {
        throw new AppError('BAD_REQUEST', 'This coupon has expired', 400);
    }

    // Check total usage limit
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
        throw new AppError('BAD_REQUEST', 'This coupon has reached its usage limit', 400);
    }

    // Check minimum order amount
    if (coupon.minOrderAmount !== null && subtotal < Number(coupon.minOrderAmount)) {
        throw new AppError(
            'BAD_REQUEST',
            `Minimum order amount of ₹${coupon.minOrderAmount} required for this coupon`,
            400
        );
    }

    // Check per-customer usage
    const customerUses = await txClient.couponUsage.count({
        where: {
            couponId: coupon.id,
            customerId,
        },
    });

    if (customerUses >= coupon.usageLimitPerCustomer) {
        throw new AppError(
            'BAD_REQUEST',
            `You have already used this coupon the maximum allowed times (${coupon.usageLimitPerCustomer})`,
            400
        );
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
        let rawDiscount = (subtotal * Number(coupon.discountValue)) / 100;

        // Apply max discount cap if it exists
        if (coupon.maxDiscount !== null && rawDiscount > Number(coupon.maxDiscount)) {
            rawDiscount = Number(coupon.maxDiscount);
        }

        discountAmount = Math.round(rawDiscount); // Round to avoid fractional paise issues
    } else {
        // FLAT discount
        discountAmount = Number(coupon.discountValue);
    }

    // Ensure discount doesn't exceed subtotal
    if (discountAmount > subtotal) {
        discountAmount = subtotal;
    }

    return {
        coupon,
        discountAmount,
    };
}
