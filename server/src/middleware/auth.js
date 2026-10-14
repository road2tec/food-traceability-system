'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, RevokedToken } = require('../models');
const { E } = require('../utils/AppError');
const { asyncHandler } = require('../utils/http');

/** Authenticates the Bearer JWT, then loads the user from DB: role/org/status ALWAYS come from the DB, never the token. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) throw E.unauth();
  let payload;
  try { payload = jwt.verify(m[1], config.jwt.secret, { algorithms: ['HS256'] }); } catch (_) { throw E.unauth('Invalid or expired token'); }
  if (await RevokedToken.exists({ jti: payload.jti })) throw E.unauth('Token has been revoked');
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'ACTIVE') throw E.unauth('Account is not active');
  req.user = user;
  req.token = payload;
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(E.forbidden());
  next();
};

module.exports = { authenticate, requireRole };
