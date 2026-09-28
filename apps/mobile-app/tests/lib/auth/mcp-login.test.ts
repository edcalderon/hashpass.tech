import {
  buildMcpLoginContinuation,
  MCP_LOGIN_PATH,
} from '../../../lib/auth/mcp-login';

const signedQuery =
  '?client_id=chatgpt&response_type=code&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&scope=openid+plane%3Aread&state=state-123&exp=1790620000&sig=signed-value';

describe('MCP OAuth login continuation', () => {
  it('preserves the signed authorization query through Hashpass login', () => {
    expect(buildMcpLoginContinuation(signedQuery, 'https://api.hashpass.tech/api')).toEqual({
      authorizeUrl: `https://api.hashpass.tech/api/auth/oauth2/authorize${signedQuery}`,
      returnTo: `${MCP_LOGIN_PATH}${signedQuery}`,
    });
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
