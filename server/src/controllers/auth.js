'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { User, Organisation, RevokedToken } = require('../models');
const { E } = require('../utils/AppError');
const { ok, pagination, meta, parseSort, escapeRegex } = require('../utils/http');
const { audit } = require('../services/audit');

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 4);

const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  organisation: u.organisation && u.organisation.name !== undefined
    ? { id: u.organisation._id, name: u.organisation.name, type: u.organisation.type, publicName: u.organisation.publicName, status: u.organisation.status }
    : u.organisation,
});

async function register(req, res) {
  const { name, email, password, role, organisation } = req.body;
  if (role !== organisation.type) throw E.validation('Role must match the organisation type');
  if (await User.exists({ email })) throw E.conflict('An account with this email already exists');
  const nameLower = organisation.name.toLowerCase();
  let org = await Organisation.findOne({ nameLower, type: organisation.type });
  if (!org) {
    org = await Organisation.create({ ...organisation, nameLower, publicName: organisation.name, status: 'PENDING' });
  } // joining an existing organisation is allowed, but the account stays PENDING until an ADMIN approves it
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const user = await User.create({ name, email, passwordHash, role, organisation: org._id, status: 'PENDING' });
  await audit(req, 'USER_REGISTERED', 'User', user._id, { email, role, organisationId: org._id }, { actor: user, orgId: org._id });
  ok(res, { id: user._id, email: user.email, status: user.status, message: 'Registration received. An administrator must approve your account before you can log in.' }, null, 201);
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash').populate('organisation');
  const good = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !good) {
    await audit(req, 'LOGIN_FAILED', 'User', user && user._id, { email }, { actor: null });
    throw E.unauth('Invalid email or password');
  }
  if (user.status !== 'ACTIVE') {
    await audit(req, 'LOGIN_BLOCKED', 'User', user._id, { status: user.status }, { actor: user });
    throw E.forbidden(user.status === 'PENDING' ? 'Account is awaiting administrator approval' : `Account is ${user.status.toLowerCase()}`);
  }
  user.lastLoginAt = new Date();
  await user.save();
  const token = jwt.sign({ role: user.role }, config.jwt.secret, { algorithm: 'HS256', subject: String(user._id), expiresIn: config.jwt.expiresIn, jwtid: crypto.randomUUID() });
  await audit(req, 'LOGIN', 'User', user._id, {}, { actor: user });
  ok(res, { token, user: publicUser(user) });
}

async function logout(req, res) {
  await RevokedToken.updateOne({ jti: req.token.jti }, { jti: req.token.jti, expiresAt: new Date(req.token.exp * 1000) }, { upsert: true });
  await audit(req, 'LOGOUT', 'User', req.user._id);
  ok(res, { loggedOut: true });
}

async function me(req, res) {
  await req.user.populate('organisation');
  ok(res, publicUser(req.user));
}

async function listUsers(req, res) {
  const q = req.query;
  const p = pagination(q);
  const f = {};
  if (typeof q.status === 'string') f.status = q.status;
  if (typeof q.role === 'string') f.role = q.role;
  if (typeof q.q === 'string' && q.q) f.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }];
  const [items, total] = await Promise.all([
    User.find(f).sort(parseSort(q.sort, ['createdAt', 'name', 'email'])).skip(p.skip).limit(p.limit).populate('organisation'),
    User.countDocuments(f),
  ]);
  ok(res, items.map(publicUser), meta(p, total));
}

async function setUserStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw E.notFound('User not found');
  if (String(user._id) === String(req.user._id)) throw E.validation('You cannot change your own status');
  const from = user.status;
  user.status = req.body.status;
  await user.save();
  if (user.status === 'ACTIVE') await Organisation.updateOne({ _id: user.organisation, status: 'PENDING' }, { status: 'ACTIVE' });
  await audit(req, 'USER_STATUS_CHANGED', 'User', user._id, { from, to: user.status });
  await user.populate('organisation');
  ok(res, publicUser(user));
}

async function listOrganisations(req, res) {
  const p = pagination(req.query);
  const admin = req.user.role === 'ADMIN';
  const f = admin ? {} : { status: 'ACTIVE' };
  if (typeof req.query.type === 'string') f.type = req.query.type;
  if (typeof req.query.q === 'string' && req.query.q) f.name = new RegExp(escapeRegex(req.query.q), 'i');
  const [items, total] = await Promise.all([Organisation.find(f).sort({ name: 1 }).skip(p.skip).limit(p.limit).lean(), Organisation.countDocuments(f)]);
  const data = items.map((o) => (admin ? o : { _id: o._id, publicName: o.publicName || o.name, type: o.type, country: o.country }));
  ok(res, data, meta(p, total));
}

async function updateOrganisation(req, res) {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw E.notFound('Organisation not found');
  for (const k of ['name', 'publicName', 'address', 'country', 'status', 'mspId']) if (req.body[k] !== undefined) org[k] = req.body[k];
  if (req.body.name) org.nameLower = req.body.name.toLowerCase();
  await org.save();
  await audit(req, 'ORGANISATION_UPDATED', 'Organisation', org._id, req.body);
  ok(res, org);
}

module.exports = { register, login, logout, me, listUsers, setUserStatus, listOrganisations, updateOrganisation };
