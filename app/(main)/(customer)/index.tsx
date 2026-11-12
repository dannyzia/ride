import { Redirect } from 'expo-router';
import { getRideVerticalEnabled } from '@/lib/verticalFlags';

/**
 * Node launch Stage 3 (#2): the customer index re-points by flag — ride
 * hidden lands on the services hub (the launch home); ride visible keeps the
 * legacy IA (re-enable restores the old route with no further change).
 */
export default function CustomerIndex() {
  if (!getRideVerticalEnabled()) {
    return <Redirect href="/(main)/(customer)/services-hub" />;
  }
  return <Redirect href="/(main)/(customer)/(tabs)/home" />;
}
