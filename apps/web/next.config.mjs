/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: plain HTML/JS files, so a service worker can cache the whole app
  // and the board opens with no network after the first visit.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Strict mode mounts effects twice in dev, which would grab the one-tab board lock twice.
  reactStrictMode: false,
  // The shared package is TypeScript source; let Next compile it.
  transpilePackages: ['@driftboard/shared'],
};

export default nextConfig;
