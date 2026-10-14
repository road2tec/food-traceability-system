'use strict';
const STATUS = { VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, UPSTREAM_UNAVAILABLE: 503, INTERNAL: 500 };

class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.status = STATUS[code] || 500;
    this.details = details;
    this.isAppError = true;
  }
}
const E = {
  validation: (m, d) => new AppError('VALIDATION_ERROR', m, d),
  unauth: (m = 'Authentication required') => new AppError('UNAUTHENTICATED', m),
  forbidden: (m = 'You do not have permission to perform this action') => new AppError('FORBIDDEN', m),
  notFound: (m = 'Resource not found') => new AppError('NOT_FOUND', m),
  conflict: (m, d) => new AppError('CONFLICT', m, d),
  upstream: (m, d) => new AppError('UPSTREAM_UNAVAILABLE', m, d),
};
module.exports = { AppError, E };
