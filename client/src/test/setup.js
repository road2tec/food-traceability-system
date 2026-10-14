import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setToken } from '../services/api';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* ignore */ }
  setToken(null);
});

// jsdom lacks ResizeObserver (recharts) and matchMedia
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}
window.scrollTo = window.scrollTo || (() => {});

// Mock axios globally: one shared fake instance returned by axios.create().
vi.mock('axios', () => {
  const inst = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  return { default: { create: () => inst }, create: () => inst };
});
