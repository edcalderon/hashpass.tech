import { pinRequest } from '../../../lib/server/setup-api';

export const POST = (request: Request) => pinRequest(request);
