import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_ID__: JSON.stringify('sdk_test'), __VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
