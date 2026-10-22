import { contactsRequest } from '../../lib/server/contacts-api';

export const GET = (request: Request) => contactsRequest(request);
export const POST = (request: Request) => contactsRequest(request, true);
