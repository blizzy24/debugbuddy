import { defineConfig } from 'vite';

// Library mode, one self-contained IIFE: dist/widget.js. No runtime deps;
// the shared markdown renderer is bundled in.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'DebugBuddyWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
  },
});
