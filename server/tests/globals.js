'use strict';
// Jest-style globals on top of node:test (the mongodb driver misbehaves inside Jest's VM sandbox).
const t = require('node:test');
const { expect } = require('expect');
global.describe = t.describe;
global.test = t.test;
global.beforeAll = t.before;
global.afterAll = t.after;
global.expect = expect;
