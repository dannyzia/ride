import { View, Text, ActivityIndicator } from 'react-native';
import { useDriverFlowStore } from '@/store/useDriverFlowStore';

interface Props {
  children: React.ReactNode;
}

export default function DriverStatusGuard({ children }: Props) {
  const { driver } = useDriverFlowStore();

  if (!driver) {
    return (
      <View className="flex-1 items-center justify-center bg-bgColor">
        <ActivityIndicator size="large" color="#555" />
        <Text className="text-primaryTextColor mt-4 text-base">Loading profile...</Text>
      </View>
    );
  }

  switch (driver.status) {
    case 'pending':
      return (
        <View className="flex-1 items-center justify-center bg-bgColor px-6">
          <Text className="text-primaryTextColor text-2xl font-bold mb-4">Welcome!</Text>
          <Text className="text-primaryTextColor text-center text-base mb-8">
            Your account is pending verification. Please upload the required documents to start receiving ride offers.
          </Text>
        </View>
      );

    case 'suspended':
      return (
        <View className="flex-1 items-center justify-center bg-bgColor px-6">
          <Text className="text-errorColor text-2xl font-bold mb-4">Account Suspended</Text>
          <Text className="text-primaryTextColor text-center text-base">
            Your account has been suspended. Please contact support for assistance.
          </Text>
        </View>
      );

    case 'rejected':
      return (
        <View className="flex-1 items-center justify-center bg-bgColor px-6">
          <Text className="text-errorColor text-2xl font-bold mb-4">Documents Rejected</Text>
          <Text className="text-primaryTextColor text-center text-base mb-4">
            Your submitted documents were not approved. Please re-submit with correct documents.
          </Text>
        </View>
      );

    case 'temporary':
    case 'active':
      return <>{children}</>;

    default:
      return <>{children}</>;
  }
}
