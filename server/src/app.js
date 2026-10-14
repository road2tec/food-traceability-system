'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const buildRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const spec = require('./docs/openapi.json');

function createApp(opts = {}) {
  const app = express();
  app.set('trust proxy', config.trustProxy === '0' ? false : Number.isNaN(Number(config.trustProxy)) ? config.trustProxy : Number(config.trustProxy));
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: false, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '256kb' }));
  const rl = opts.rateLimit || config.rateLimit;
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, limit: rl.max, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } }),
  }));

  // Swagger UI needs inline styles/scripts; relax CSP for this route only.
  app.use('/api-docs', (req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); }, swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api-docs.json', (_req, res) => res.json(spec));
  app.use('/api/v1', buildRouter({ authMax: rl.authMax }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
