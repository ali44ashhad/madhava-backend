import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

/**
 * Health check route
 * GET /health
 * Routes must only define HTTP method + path and call controller
 */
router.get('/health', getHealth);

export default router;

