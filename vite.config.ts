import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

/** Số phiên bản từ package.json ⇒ `__APP_VERSION__` (`src/buildFlags.ts`). */
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * Nhập mã bản vẽ của game (`EFO0…`): EnKAD tra mã qua `/endfield/aic/api/efbp` nhưng không mở CORS,
 * nên trình duyệt phải gọi qua proxy cùng gốc này (`src/blueprint/enkad.ts`). Có ở cả `npm run dev`
 * lẫn `npm run preview`; host tĩnh khác thì không có ⇒ dán thẳng chuỗi bản vẽ.
 */
const efbpProxy = {
  '^/(.*/)?api/efbp': {
    target: 'https://beta.enka.network',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^.*\/api\/efbp/, '/endfield/aic/api/efbp'),
  },
};

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2022', outDir: 'dist' },
  server: { proxy: efbpProxy },
  preview: { proxy: efbpProxy },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
