import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index:    'src/index.ts',
    webhooks: 'src/webhooks.ts',
    browser:  'src/browser.ts',
    react:    'src/react.tsx',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  // Don't ship source maps to npm: they leak absolute paths from the build
  // machine into every consumer's node_modules and stack traces. Consumers
  // can still debug via the readable compiled JS. Local dev gets maps via
  // `npm run dev` if we ever override this.
  sourcemap: false,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['react'],
})
