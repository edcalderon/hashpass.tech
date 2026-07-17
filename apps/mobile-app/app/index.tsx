import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import LoadingScreen from '../components/LoadingScreen';
import packageJson from '../package.json';

const startupStamp = process.env.EXPO_PUBLIC_RELEASE_COMMIT
  ? `v${packageJson.version} · ${process.env.EXPO_PUBLIC_RELEASE_COMMIT}`
  : `v${packageJson.version} · local build`;

const DASHBOARD_EXPLORE_ROUTER_PATH = '/(shared)/dashboard/explore';

export default function Index() {
  const { isLoading, isLoggedIn, user } = useAuth();

  if (isLoading) {
    return (
      <LoadingScreen
        fullScreen
        message="Opening HASHPASS"
        subtitle={startupStamp}
      />
    );
  }

  // `/` is the route every cold start and post-login navigation funnels
  // through. An authenticated visitor here must be forwarded to the app, not
  // the public landing: after OTP/Google login the auth screen unmounts to
  // `/` before it can run its own dashboard redirect, and a resumed session
  // cold-starts straight into `/`. Routing them to `/home` in either case
  // strands them on the "Welcome back" landing with no automatic way into the
  // dashboard — the reported "logs in but never reaches the app" bug. Only
  // send signed-out visitors to the public landing.
  if (isLoggedIn && user) {
    return <Redirect href={DASHBOARD_EXPLORE_ROUTER_PATH as any} />;
  }

  return <Redirect href="/home" />;
}
