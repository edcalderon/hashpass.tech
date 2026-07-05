import { getAuthHandler } from './better-auth';

const handler = getAuthHandler();

export { handler as GET, handler as POST };
