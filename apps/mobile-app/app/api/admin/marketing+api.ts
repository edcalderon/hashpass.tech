import { marketingAdminRequest } from '../../../lib/server/marketing-api';
export const GET = (request: Request) => marketingAdminRequest(request);
export const POST = (request: Request) => marketingAdminRequest(request, true);
