/// <reference types="jest" />

import {
  createCorsPreflightResponse,
  getCorsHeaders,
  withCors,
} from '../../lib/cors';

const requestFor = (origin?: string) => new Request('https://api.hashpass.tech/api/test', {
  headers: origin ? { Origin: origin } : undefined,
});

describe('mobile API CORS utility', () => {
  const originalOrigins = process.env.CORS_ALLOW_ORIGINS;

  afterEach(() => {
    if (originalOrigins === undefined) delete process.env.CORS_ALLOW_ORIGINS;
    else process.env.CORS_ALLOW_ORIGINS = originalOrigins;
  });

  it('echoes an explicitly allowed origin and centralizes defaults', () => {
    const headers = new Headers(getCorsHeaders(requestFor('https://hashpass.tech')));

    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://hashpass.tech');
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, PATCH, OPTIONS');
    expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('supports multiple configured origins without reflecting an untrusted origin', () => {
    process.env.CORS_ALLOW_ORIGINS = 'https://tenant.example, https://second.example';

    expect(new Headers(getCorsHeaders(requestFor('https://tenant.example'))).get('Access-Control-Allow-Origin'))
      .toBe('https://tenant.example');
    expect(new Headers(getCorsHeaders(requestFor('https://evil.example'))).get('Access-Control-Allow-Origin'))
      .toBeNull();
  });

  it('does not emit an allow-origin header for requests without an Origin', () => {
    const headers = new Headers(getCorsHeaders(requestFor()));

    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(headers.get('Access-Control-Allow-Methods')).toBeTruthy();
  });

  it('never uses a wildcard for credentialed requests', () => {
    const headers = new Headers(getCorsHeaders(requestFor('https://evil.example'), {
      allowedOrigins: ['*'],
      allowCredentials: true,
    }));

    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('supports route-specific methods and headers on preflight and normal responses', async () => {
    const options = {
      allowedOrigins: ['https://merchant.example'],
      methods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Captcha-Token'],
      maxAge: 600,
    } as const;
    const preflight = createCorsPreflightResponse(requestFor('https://merchant.example'), options);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://merchant.example');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Captcha-Token');
    expect(preflight.headers.get('Access-Control-Max-Age')).toBe('600');

    const response = withCors(
      new Response('ok', { status: 201, headers: { 'Content-Type': 'text/plain' } }),
      requestFor('https://merchant.example'),
      options,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://merchant.example');
    await expect(response.text()).resolves.toBe('ok');
  });
});
