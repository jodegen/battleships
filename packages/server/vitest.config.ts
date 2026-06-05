import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS-Decorator-/DI-Metadaten unter Vitest: SWC emittiert die nötigen
// `reflect-metadata`-Informationen (research.md §11).
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Integrationstests teilen sich EINE Postgres und setzen sie pro Test zurück (deleteMany).
    // Daher Test-Dateien seriell ausführen, damit kein paralleler Reset fremde Daten löscht.
    // Ohne DATABASE_URL werden die Integrationstests zur Laufzeit übersprungen (test/integration/*).
    fileParallelism: false,
  },
});
