import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mockAssetRequiresPlugin = {
  name: 'mock-asset-requires',
  enforce: 'pre',
  transform(code, id) {
    const normalizedId = id.replace(/\\/g, '/');
    if (normalizedId.includes('/node_modules/') || !/\.(?:[cm]?[jt]sx?)$/.test(normalizedId)) {
      return null;
    }
    const nextCode = code.replace(
      /require\(\s*(['"])(@\/assets\/[^'"]+\.(?:png|jpe?g|gif|webp|avif))\1\s*\)/g,
      '({ uri: $1$2$1 })'
    );
    if (nextCode === code) {
      return null;
    }
    return {
      code: nextCode,
      map: null,
    };
  },
};

export default defineConfig({
  plugins: [mockAssetRequiresPlugin],
  define: {
    __DEV__: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@/assets': path.resolve(__dirname, './assets'),
      '@': path.resolve(__dirname, './src'),
      'react-native': 'react-native-web',
    },
  },
});
