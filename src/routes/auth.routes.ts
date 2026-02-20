import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';

const router = Router();


// New Flows
router.post('/signup/request-otp', authController.signupRequestOtp);
router.post('/signup/verify-otp', authController.signupVerifyOtp);

router.post('/login/request-otp', authController.loginRequestOtp);
router.post('/login/verify-otp', authController.loginVerifyOtp);

// Profile
import { customerAuthMiddleware } from '../middlewares/auth.middleware.js';
router.get('/me', customerAuthMiddleware, authController.getMe);

// Legacy (Deprecated)
router.post('/request-otp', authController.requestOtp); // DEPRECATED
router.post('/verify-otp', authController.verifyOtp);   // DEPRECATED

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

export default router;
