import { Redirect } from 'expo-router';

export default function DeleteAccountRedirect() {
  return <Redirect href="/(shared)/delete-account" />;
}
