import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * End-to-end configuration
 *
 * The app is built and served against a throwaway database, so a smoke run
 * never touches the developer's own library — the same PROMPT_BUILDER_DATA_DIR
 * override the integration tests use.
 */
const PORT = 3210;
const dataDirectory = mkdtempSync(path.join(tmpdir(), 'prompt-builder-e2e-'));

export default defineConfig({
  testDir: './tests/e2e',
  // A cold build plus a browser launch is not a two-second affair.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // One database, one prompt library: tests share state.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: `http://localhost:${PORT}`,
    // The copy button writes to the clipboard, and one test reads it back.
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/prompts`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      PROMPT_BUILDER_DATA_DIR: dataDirectory,
      // Its own build output, so a dev server on .next is no obstacle.
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
});
