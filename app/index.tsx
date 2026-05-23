import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

const Page = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Firebase auth check will be wired in Phase 4
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return <Redirect href="/(auth)/welcome" />;
};

export default Page;
