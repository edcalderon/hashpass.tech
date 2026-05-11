import { auth } from '../../../lib/server/better-auth';

const handler = auth.handler;

export { handler as GET, handler as POST };
