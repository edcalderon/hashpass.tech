export type CorsOptions = {
  /** Replace the global allowlist for a route that has a narrower audience. */
  allowedOrigins?: readonly string[];
  allowCredentials?: boolean;
  methods?: readonly string[];
  allowedHeaders?: readonly string[];
  exposedHeaders?: readonly string[];
  maxAge?: number;
};

export type CorsHeaders = Record<string, string>;
