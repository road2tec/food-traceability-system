'use strict';
const { Threshold } = require('../models');

async function getGlobalThresholds() {
  let t = await Threshold.findOne({ key: 'global' }).lean();
  if (!t) {
    try { t = (await Threshold.create({ key: 'global' })).toObject(); } catch (_) { t = await Threshold.findOne({ key: 'global' }).lean(); }
  }
  return t;
}

/** ProductType.qualityThresholds override the global doc when both numbers are set. */
function effectiveThresholds(productType, global) {
  const q = (productType && productType.qualityThresholds) || {};
  return {
    safeAbove: typeof q.safeAbove === 'number' ? q.safeAbove : global.safeAbove,
    flagAbove: typeof q.flagAbove === 'number' ? q.flagAbove : global.flagAbove,
    nearExpiryHours: global.nearExpiryHours,
    lowShelfLifeHours: global.lowShelfLifeHours,
  };
}
module.exports = { getGlobalThresholds, effectiveThresholds };
