import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A wrong msgpack or timestamp decode should fail loudly, not warn.
    clearMocks: true,
    restoreMocks: true,
  },
});
