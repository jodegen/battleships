import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Ziel des API-Servers (packages/server) im Dev. Über den Rewrite unten sieht der Browser
// nur den Web-Origin, sodass HTTP-only-Cookies Same-Origin funktionieren (SC-010).
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Engine wird direkt aus dem TS-Quellcode konsumiert (kein vorheriger Build nötig).
  transpilePackages: ['@schiffe/engine'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_TARGET}/:path*` }];
  },
  webpack: (config) => {
    config.resolve.alias['@schiffe/engine'] = path.resolve(dir, '../engine/src/index.ts');
    return config;
  },
};

export default nextConfig;
