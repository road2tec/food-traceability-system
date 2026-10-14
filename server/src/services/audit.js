'use strict';
const { AuditLog } = require('../models');

/**
 * Write an audit log entry. Never throws into request handling (failures are logged).
 * actor: req.user (or null for system). orgId defaults to actor's organisation.
 */
async function audit(req, action, entityType, entityId, details = {}, opts = {}) {
  try {
    const actor = opts.actor || (req && req.user) || null;
    await AuditLog.create({
      actor: actor ? actor._id : undefined,
      actorEmail: actor ? actor.email : undefined,
      action,
      entityType,
      entityId: entityId == null ? undefined : String(entityId),
      orgId: opts.orgId || (actor && actor.organisation ? (actor.organisation._id || actor.organisation) : undefined),
      details,
      ip: req && req.ip,
    });
  } catch (e) {
    console.error('[audit] failed to write audit log:', e.message);
  }
}
module.exports = { audit };
