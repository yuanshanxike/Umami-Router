/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@umami_router/sdk'],
  async rewrites() {
    const target = process.env.UMAMI_SERVER_ORIGIN ?? 'http://localhost:3000';
    return [
      {
        source: '/trpc/:path*',
        destination: `${target}/trpc/:path*`,
      },
      {
        source: '/umami/:path*',
        destination: `${target}/umami/:path*`,
      },
    ];
  },
};

export default nextConfig;
