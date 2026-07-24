import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/form/index.ts', 'src/cache.ts', 'src/query.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['next', 'server-only', 'sonner'],
});
