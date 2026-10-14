'use strict';
const { AppError } = require('../utils/AppError');

const notFound = (req, _res, next) => next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let e = err;
  if (!e.isAppError) {
    if (e.type === 'entity.parse.failed') e = new AppError('VALIDATION_ERROR', 'Malformed JSON body');
    else if (e.type === 'entity.too.large') e = new AppError('VALIDATION_ERROR', 'Request body too large');
    else if (e.name === 'MulterError') e = new AppError('VALIDATION_ERROR', `Upload rejected: ${e.code === 'LIMIT_FILE_SIZE' ? 'file too large' : e.message}`);
    else if (e.name === 'CastError') e = new AppError('VALIDATION_ERROR', `Invalid value for ${e.path}`);
    else if (e.name === 'ValidationError') e = new AppError('VALIDATION_ERROR', 'Validation failed', Object.values(e.errors).map((x) => ({ path: x.path, message: x.message })));
    else if (e.code === 11000) e = new AppError('CONFLICT', 'A record with the same unique value already exists');
    else {
      console.error(`[error] ${req.method} ${req.originalUrl}:`, e);
      e = new AppError('INTERNAL', 'An unexpected error occurred');
    }
  }
  const body = { success: false, error: { code: e.code, message: e.message } };
  if (e.details) body.error.details = e.details;
  res.status(e.status).json(body);
};
module.exports = { notFound, errorHandler };
