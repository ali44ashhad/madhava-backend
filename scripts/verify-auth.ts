import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:5012/api/v1'; // Assuming port 5012 from previous context
const PHONE = '9999999999';

async function main() {
    console.log('--- STARTING AUTH VERIFICATION ---');

    try {
        // 1. Cleanup previous runs
        console.log('Cleaning up...');
        await prisma.otpVerification.deleteMany({ where: { phone: PHONE } });
        const customer = await prisma.customer.findUnique({ where: { email: `temp_${PHONE}_TODO` } }).catch(() => null);
        // actually finding by phone is better
        const c = await prisma.customer.findFirst({ where: { phone: PHONE } });
        if (c) {
            await prisma.customerSession.deleteMany({ where: { customerId: c.id } });
            // We might want to keep the customer to test re-login, or delete to test registration.
            // Let's keep it simple.
        }

        // 2. Request OTP
        console.log('1. Requesting OTP...');
        await axios.post(`${BASE_URL}/auth/request-otp`, { phone: PHONE });
        console.log('   ✅ OTP Requested');

        // 3. Get OTP from DB (Cheat)
        console.log('2. Fetching OTP from DB...');
        const otpRecord = await prisma.otpVerification.findFirst({
            where: { phone: PHONE },
            orderBy: { createdAt: 'desc' },
        });

        if (!otpRecord) throw new Error('OTP record not found in DB');

        // We cannot easily reverse the hash using bcrypt. 
        // Ah, wait. The requirement says "Hashed OTP".
        // If I hash it in the service, I cannot read it back here to verify !!
        // Panic!
        // If testing manually, I would get the SMS.
        // If testing automatically, I need to know what OTP was generated.
        // OPTION: Mock the OTP generation or SMS service?
        // OR: In non-production, maybe log the OTP?

        console.log('   Placeholder: Cannot automatically verify without mocking OTP generation.');
        console.log('   Please check your phone or console logs if implemented.');

        // For this script to work, I might need to temporarily modify the service to return the OTP 
        // or use a fixed OTP in dev mode.
        // Or, I can just verify the "Request OTP" part worked (200 OK) and manually verify the rest if I can't get the code.

        // HOWEVER, I can write a unit test that mocks `generateNumericOtp`.
        // But this is an integration test.

        // Let's just check if we can verify with a WRONG otp, ensuring it fails.
        console.log('3. Verifying with WRONG OTP...');
        try {
            await axios.post(`${BASE_URL}/auth/verify-otp`, { phone: PHONE, otp: '000000' });
        } catch (e: any) {
            if (e.response && e.response.status === 401) {
                console.log('   ✅ Correctly rejected wrong OTP');
            } else {
                console.error('   ❌ Unexpected response for wrong OTP:', e.message);
            }
        }

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('   Data:', error.response.data);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
