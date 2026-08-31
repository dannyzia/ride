import { Stack } from 'expo-router';

export default function DeliveryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="request-create" />
      <Stack.Screen name="request-detail" />
    </Stack>
  );
}
