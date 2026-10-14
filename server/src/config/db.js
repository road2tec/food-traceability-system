'use strict';
const mongoose = require('mongoose');
const config = require('./index');

mongoose.set('strictQuery', true);

async function connectDb(uri = config.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, driverInfo: { name: 'food-traceability-server', version: '1.0.0' } });
  return mongoose.connection;
}
module.exports = { connectDb, mongoose };
