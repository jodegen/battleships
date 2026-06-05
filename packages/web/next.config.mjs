import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Engine wird direkt aus dem TS-Quellcode konsumiert (kein vorheriger Build nötig).
  transpilePackages: ['@schiffe/engine'],
  webpack: (config) => {
    config.resolve.alias['@schiffe/engine'] = path.resolve(dir, '../engine/src/index.ts');
    return config;
  },
};

export default nextConfig;
