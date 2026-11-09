import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Authentication links contain one-use tokens; never log their query string.
  logging:{incomingRequests:{ignore:[/\/(nova-senha|verificar-email)(?:[/?]|$)/]}},
};

export default nextConfig;
