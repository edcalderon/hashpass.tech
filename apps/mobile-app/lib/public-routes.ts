/** Keep public access narrowly scoped; account and API routes remain protected. */
export const isPublicExplorerRoute = (pathname: string): boolean =>
  pathname.replace(/^\/\(shared\)/, '').replace(/\/$/, '') === '/dashboard/explore';
export const isPublicEventRoute = (pathname: string): boolean =>
  pathname === '/events' || pathname.startsWith('/events/') || isPublicExplorerRoute(pathname);

/** Token-protected links must remain reachable before a recipient has an account session. */
export const isPublicPassLinkRoute = (pathname: string): boolean => {
  const route = pathname.replace(/^\/\(shared\)/, '').replace(/\/$/, '');
  return route.startsWith('/public-pass/') || route === '/transfer/confirm';
};
