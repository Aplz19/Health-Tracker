import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tree-shake large packages so only the icons/utilities actually used are
  // bundled, instead of pulling whole barrel files into the client bundle.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
  // Strip console.* from the production bundle (keep error/warn for diagnostics).
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
};

export default nextConfig;
