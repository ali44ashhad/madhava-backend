import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { notFoundMiddleware } from './middlewares/notFound.middleware.js';
import { env } from './config/index.js';

/**
 * Create and configure Express application
 * Registers global middlewares, routes, and error handling
 * NO server listen logic here
 */
export function createApp(): Express {
  const app = express();

  // Global middlewares (order matters)
  // 1. JSON body parser
  app.use(express.json());

  // 2. CORS
  app.use(cors());

  // 3. Helmet (security headers)
  app.use(helmet());

  // 4. Request logging (Morgan)
  const morganFormat = env.nodeEnv === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));

  // Register routes
  app.use('/', routes);

  // 404 middleware (must be before error middleware)
  app.use(notFoundMiddleware);

  // Error middleware (must be last)
  app.use(errorMiddleware);



  return app;
}

