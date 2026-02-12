import { Router } from 'express';
import healthRoutes from './health.routes.js';
import adminRoutes from './admin.routes.js';
import storeRoutes from './store.routes.js';

import authRoutes from './auth.routes.js';

const router = Router();

/**
 * Aggregate all route modules
 * Export router for app registration
 */
router.use('/', healthRoutes);
router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/admin', adminRoutes);
router.use('/api/v1/store', storeRoutes);

export default router;

