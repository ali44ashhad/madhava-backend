
import { prisma } from '../src/config/prisma';
import bcrypt from 'bcryptjs';

const API_URL = 'http://localhost:5012/api/v1';

async function verifyDashboard() {
    try {
        console.log('--- Verifying Admin Dashboard Metrics ---');

        const adminEmail = 'test-dashboard-admin@example.com';
        const adminPassword = 'Password@123';

        // Ensure Admin Exists
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const admin = await prisma.admin.upsert({
            where: { email: adminEmail },
            update: { passwordHash: hashedPassword },
            create: {
                email: adminEmail,
                passwordHash: hashedPassword,
                role: 'ADMIN',
                isActive: true
            }
        });
        console.log(`1. Admin user ensured: ${admin.email}`);

        // Login
        console.log('2. Logging in via API...');
        const loginResponse = await fetch(`${API_URL}/admin/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: adminEmail,
                password: adminPassword
            })
        });

        const loginData = await loginResponse.json();

        if (!loginResponse.ok) {
            throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
        }

        const { token } = loginData.data;
        console.log('Logged in successfully. Token received.');

        // Fetch Dashboard
        console.log('3. Fetching Dashboard Metrics...');
        const dashboardResponse = await fetch(`${API_URL}/admin/dashboard`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const dashboardData = await dashboardResponse.json();
        console.log('Dashboard Data:', JSON.stringify(dashboardData, null, 2));

        if (dashboardData.success) {
            console.log('✅ Dashboard metrics retrieved successfully.');
        } else {
            console.error('❌ Failed to retrieve dashboard metrics.');
            process.exit(1);
        }

        // Validate Structure
        const data = dashboardData.data;
        if (typeof data.ordersToday === 'number' && typeof data.revenueToday === 'number') {
            console.log('✅ Response structure is correct.');
        } else {
            console.error('❌ Response structure mismatch.');
            process.exit(1);
        }

    } catch (error: any) {
        console.error('❌ Error during verification:', error.message);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyDashboard();
