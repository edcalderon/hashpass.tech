import {
  buildMcpLoginContinuation,
  extractSignedOAuthQuery,
  isMcpLoginContinuation,
  MCP_LOGIN_PATH,
} from '../../../lib/auth/mcp-login';

const signedQuery =
  '?client_id=chatgpt&response_type=code&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&scope=openid+plane%3Aread&state=state-123&exp=1790620000&sig=signed-value';

describe('MCP OAuth login continuation', () => {
  it('recognizes only the MCP login route and its signed query', () => {
    expect(isMcpLoginContinuation('/mcp/login')).toBe(true);
    expect(isMcpLoginContinuation('/mcp/login?client_id=chatgpt&sig=signed')).toBe(true);
    expect(isMcpLoginContinuation('/mcp/login-evil?sig=signed')).toBe(false);
    expect(isMcpLoginContinuation('/dashboard')).toBe(false);
  });

  it('preserves the signed authorization query through Hashpass login', () => {
    expect(buildMcpLoginContinuation(signedQuery, 'https://api.hashpass.tech/api')).toEqual({
      authorizeUrl: `https://api.hashpass.tech/api/auth/oauth2/authorize${signedQuery}`,
      returnTo: `${MCP_LOGIN_PATH}${signedQuery}`,
    });
  });

  it('keeps only provider-signed parameters for browser-to-API OAuth requests', () => {
    const query = '?client_id=chatgpt&state=state-123&ba_iat=1790619400000&exp=1790620000&ba_param=ba_iat&ba_param=client_id&ba_param=exp&ba_param=state&sig=signed-value&router=ignored';

    expect(extractSignedOAuthQuery(query)).toBe(
      'client_id=chatgpt&state=state-123&ba_iat=1790619400000&exp=1790620000&ba_param=ba_iat&ba_param=client_id&ba_param=exp&ba_param=state&sig=signed-value',
    );
    expect(extractSignedOAuthQuery('?client_id=chatgpt&sig=signed-value')).toBe('');
    expect(extractSignedOAuthQuery('?client_id=chatgpt')).toBe('');
  });

  it('normalizes a trailing slash on the trusted API base URL', () => {
    const continuation = buildMcpLoginContinuation(
      signedQuery,
      'https://api.hashpass.tech/api/',
    );

    expect(continuation?.authorizeUrl).toBe(
      `https://api.hashpass.tech/api/auth/oauth2/authorize${signedQuery}`,
    );
  });

  it.each([
    '',
    '?client_id=chatgpt&response_type=code',
    '?client_id=chatgpt&response_type=token&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&exp=1790620000&sig=signed-value',
    '?client_id=chatgpt&response_type=code&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&exp=invalid&sig=signed-value',
  ])('rejects an incomplete or unsupported authorization query: %s', (query) => {
    expect(buildMcpLoginContinuation(query, 'https://api.hashpass.tech/api')).toBeNull();
  });
});
