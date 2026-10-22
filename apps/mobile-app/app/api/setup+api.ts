import { setupRequest } from '../../lib/server/setup-api';

export const GET = (request: Request) => setupRequest(request);
export const POST = (request: Request) => setupRequest(request, true);
