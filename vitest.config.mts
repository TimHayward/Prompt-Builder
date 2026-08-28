import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // The app's tsconfig leaves JSX for Next, so tests transform it here instead.
  oxc: {
    jsx: 'react-jsx',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
