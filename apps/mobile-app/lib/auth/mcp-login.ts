export const MCP_LOGIN_PATH = '/mcp/login';

export const isMcpLoginContinuation = (returnTo: string): boolean => {
  const [path] = returnTo.split('?', 1);
  return path === MCP_LOGIN_PATH;
};

/**
 * Better Auth signs the OAuth parameters it emits and lists their names in
 * `ba_param`. Browser routers may append their own query parameters; forwarding
 * those to the API would invalidate the provider signature.
 */
export const extractSignedOAuthQuery = (rawSearch: string): string => {
  const source = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch);
  if (!source.has('sig')) return '';

  const signedNames = new Set(source.getAll('ba_param'));
  if (signedNames.size === 0) return '';

  const signed = new URLSearchParams();
  for (const [key, value] of source.entries()) {
    if (key === 'sig' || key === 'ba_param' || signedNames.has(key)) {
      signed.append(key, value);
    }
  }
  return signed.toString();
};

type McpLoginContinuation = {
  authorizeUrl: string;
  returnTo: string;
};

const REQUIRED_SIGNED_PARAMETERS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'exp',
  'sig',
] as const;

export const buildMcpLoginContinuation = (
  rawSearch: string,
  apiBaseUrl: string,
): McpLoginContinuation | null => {
  const query = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch;
  if (!query) return null;

  const params = new URLSearchParams(query);
  if (REQUIRED_SIGNED_PARAMETERS.some((name) => !params.get(name))) return null;
  if (params.get('response_type') !== 'code') return null;

  const expiresAt = Number(params.get('exp'));
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;

  const preservedSearch = `?${query}`;
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, '');

  return {
    authorizeUrl: `${normalizedApiBaseUrl}/auth/oauth2/authorize${preservedSearch}`,
    returnTo: `${MCP_LOGIN_PATH}${preservedSearch}`,
  };
};
