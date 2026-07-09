import { getAuthHandler } from './better-auth';
import {
  createBetterAuthErrorRedirect,
  rewriteBetterAuthErrorRedirect,
} from './better-auth-error-redirect';

const betterAuthHandler = getAuthHandler();

const handler: typeof betterAuthHandler = async (...args: Parameters<typeof betterAuthHandler>) => {
  const request = args[0] as Request;
  const errorRedirect = createBetterAuthErrorRedirect(request);
  if (errorRedirect) return errorRedirect;

  const response = await betterAuthHandler(...args);
  return rewriteBetterAuthErrorRedirect(request, response);
};

export { handler as GET, handler as POST };
