import { createRequestHandler } from '@expo/server/adapter/netlify';

const inner = createRequestHandler({
  build: require('path').join(__dirname, '../../dist/server'),
});

const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || 'https://bsl2025.hashpass.tech';
const ALLOW_METHODS = 'GET,POST,OPTIONS,PATCH,DELETE';
const ALLOW_HEADERS = 'Content-Type, Authorization';

const withCors = (fn: any) => async (event: any, context: any) => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': ALLOW_METHODS,
        'Access-Control-Allow-Headers': ALLOW_HEADERS,
      },
      body: '',
    };
  }

  const res = await fn(event, context);
  return {
    ...res,
    headers: {
      ...(res?.headers || {}),
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
    },
  };
};

const handler = withCors(inner);

module.exports = { handler };
