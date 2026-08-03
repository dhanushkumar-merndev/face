import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow camera access (getUserMedia) when the dev server is opened from
  // these origins. `localhost` is always allowed; add any LAN IP or tunnel
  // domain you use during development.
  allowedDevOrigins: [
    "192.168.1.2",
    "upper-electable-chase.ngrok-free.dev",
  ],
};

export default nextConfig;
