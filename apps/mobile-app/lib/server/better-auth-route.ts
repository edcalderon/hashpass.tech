import { auth } from './better-auth';

const handler = auth.handler;

export { handler as GET, handler as POST };
