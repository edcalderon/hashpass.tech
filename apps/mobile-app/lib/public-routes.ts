/** Keep public access narrowly scoped; account and API routes remain protected. */
export const isPublicExplorerRoute = (pathname: string): boolean =>
  pathname.replace(/^\/\(shared\)/, '').replace(/\/$/, '') === '/dashboard/explore';
export const isPublicEventRoute = (pathname: string): boolean =>
  pathname === '/events' || pathname.startsWith('/events/') || isPublicExplorerRoute(pathname);
