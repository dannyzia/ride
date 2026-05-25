import { Redirect } from 'expo-router';

export default function CustomerIndex() {
  return <Redirect href="/(main)/(customer)/(tabs)/home" />;
}
