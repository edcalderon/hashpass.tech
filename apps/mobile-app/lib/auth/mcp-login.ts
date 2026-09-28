export const MCP_LOGIN_PATH = '/mcp/login';

export const isMcpLoginContinuation = (returnTo: string): boolean => {
  const [path] = returnTo.split('?', 1);
  return path === MCP_LOGIN_PATH;
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
