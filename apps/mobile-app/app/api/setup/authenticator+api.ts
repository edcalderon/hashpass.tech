import { authenticatorRequest } from '../../../lib/server/authenticator-api';
export const GET = (request: Request) => authenticatorRequest(request);
export const POST = (request: Request) => authenticatorRequest(request, true);
