import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { cpus: 2 },
  async headers() {
    return [{source:"/:path*",headers:[
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"same-origin"},
      {key:"Content-Security-Policy",value:"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"},
    ]},{source:"/embed",headers:[{key:"Content-Security-Policy",value:"frame-ancestors https://giorgi.app https://www.giorgi.app; base-uri 'self'; object-src 'none'"}]}];
  },
};
export default nextConfig;
