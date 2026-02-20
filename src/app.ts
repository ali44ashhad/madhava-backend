import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { notFoundMiddleware } from './middlewares/notFound.middleware.js';
import { env } from './config/index.js';

import { razorpayWebhookController } from './webhooks/razorpay.webhook.controller.js';

/**
 * Create and configure Express application
 * Registers global middlewares, routes, and error handling
 * NO server listen logic here
 */
export function createApp(): Express {
  const app = express();

  // Webhook routes (MUST be before express.json() to get raw body)
  app.post(
    '/api/v1/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    razorpayWebhookController
  );

  // Global middlewares (order matters)
  // 1. JSON body parser
  app.use(express.json());

  // 2. CORS
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5015', 'http://localhost:5016'],
    credentials: true,
  }));

  // 3. Helmet (security headers)
  app.use(helmet());

  // 4. Request logging (Morgan)
  const morganFormat = env.nodeEnv === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));

  // 5. Cookie parser
  app.use(cookieParser());

  // Register routes
  app.use('/', routes);

  // 404 middleware (must be before error middleware)
  app.use(notFoundMiddleware);

  // Error middleware (must be last)
  app.use(errorMiddleware);



  return app;
}

