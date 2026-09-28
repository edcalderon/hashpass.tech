import {createRemoteJWKSet, jwtVerify} from "jose";

const EMAIL_CLAIM = "https://hashpass.tech/email";

export function createTokenVerifier({issuer, audience, jwksUrl}) {
  if (!issuer || !audience || !jwksUrl) throw new Error("Incomplete OAuth verifier configuration");
  const jwks = createRemoteJWKSet(new URL(jwksUrl), {timeoutDuration: 5000, cooldownDuration: 30000});

  return async function verifyRequest(request) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    const {payload} = await jwtVerify(match[1], jwks, {
      issuer,
      audience,
      algorithms: ["EdDSA", "ES256", "RS256"],
      clockTolerance: 5,
    });
    const rawScope = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
    const rawScp = Array.isArray(payload.scp) ? payload.scp.filter((item) => typeof item === "string") : [];

    return {
      subject: typeof payload.sub === "string" ? payload.sub : "",
      email: typeof payload[EMAIL_CLAIM] === "string" ? payload[EMAIL_CLAIM] : "",
      scopes: [...new Set([...rawScope, ...rawScp])],
    };
  };
}
