import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import LoadingScreen from '../components/LoadingScreen';
import packageJson from '../package.json';

const startupStamp = process.env.EXPO_PUBLIC_RELEASE_COMMIT
  ? `v${packageJson.version} · ${process.env.EXPO_PUBLIC_RELEASE_COMMIT}`
  : `v${packageJson.version} · local build`;

export default function Index() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <LoadingScreen
        fullScreen
        message="Opening HASHPASS"
        subtitle={startupStamp}
      />
    );
  }

  return <Redirect href="/home" />;
}
