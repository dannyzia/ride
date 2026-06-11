import { StyleSheet, Text } from 'react-native';
import { spacing } from '@/theme/goRide';

export default function NotFoundScreen() {
  return (
    <>
      <Text className='text-white'>shittt!!!wrong page</Text>
    </>
  );
}

const _styles = StyleSheet.create({
container: {
     flex: 1,
     alignItems: 'center',
     justifyContent: 'center',
     padding: spacing.xl,
   },
link: {
     marginTop: spacing.md,
     paddingVertical: spacing.md,
   },
});
