import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // M7 gate: only business-logic layers are unit-covered to ≥80%
      include: [
        'src/services/**/*.{ts,vue}',
        'src/composables/**/*.{ts,vue}',
        'src/utils/**/*.{ts,vue}',
      ],
      exclude: [
        'src/**/*.test.*',
        'src/**/*.spec.*',
        // Supabase wiring is e2e-covered (needs live project)
        'src/services/supabase/client.ts',
        'src/services/supabase/auth.ts',
        'src/services/sync/remote.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 75,
      },
    },
  },
});
