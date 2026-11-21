import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          globalSetup: ['server/test/globalSetup.ts'],
          setupFiles: ['server/test/setup.ts'],
          fileParallelism: false,
          env: {
            NODE_ENV: 'test',
            RATE_LIMITS: 'off',
            DATABASE_URL:
              process.env.TEST_DATABASE_URL ??
              'postgresql://postgres:postgres@localhost:5432/northlist_posts_test?schema=public',
            OWNER_EMAIL: 'owner@example.com',
            PUBLIC_URL: 'https://posts.example.com',
            FAKE_SOCIAL: '1',
            DEV_LOGIN: '1',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['web/**/*.test.tsx', 'web/**/*.test.ts'],
          setupFiles: ['web/test/setup.ts'],
        },
      },
    ],
  },
});
