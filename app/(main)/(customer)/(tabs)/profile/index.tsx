import { colors, spacing, radii } from '@/theme/goRide';
import { useSession } from "@/lib/session";
import { Image, RefreshControl, ScrollView, Text, View } from "react-native";
import InputField from "@/components/InputField";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";

const Profile = () => {
  const { user } = useSession();

  const [refreshing, setRefreshing] = useState(false);
  const [_, forceUpdate] = useState(0);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await user?.reload();
      forceUpdate(n => n + 1);
    } catch (_error) {
      // silently handle
    }
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgDark }}>
      <ScrollView
        style={{ paddingHorizontal: spacing.xl }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={{ fontSize: 24, color: colors.textPrimaryDark, fontFamily: 'Urbanist', fontWeight: '800', marginTop: spacing.xl, marginBottom: spacing['2xl'] }}>
          My Profile
        </Text>

        {/* Avatar */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: spacing['2xl'] }}>
          <Image
            source={{ uri: user?.externalAccounts?.[0]?.imageUrl ?? user?.imageUrl }}
            style={{
              width: 110,
              height: 110,
              borderRadius: 55,
              borderWidth: 3,
              borderColor: colors.primary,
            }}
          />
        </View>

        {/* Fields */}
        <View style={{ backgroundColor: colors.surfaceElevatedDark, borderRadius: radii.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderWidth: 1, borderColor: colors.borderDark }}>
          <InputField
            label="First name"
            placeholder={user?.firstName || "Not Found"}
            containerStyle="w-full mb-3"
            inputStyle="bg-cardBgColor text-primaryTextColor"
            editable={false}
          />

          <InputField
            label="Last name"
            placeholder={user?.lastName || "Not Found"}
            containerStyle="w-full mb-3"
            inputStyle="bg-cardBgColor text-primaryTextColor"
            editable={false}
          />

          <InputField
            label="Email"
            placeholder={user?.primaryEmailAddress?.emailAddress || "Not Found"}
            containerStyle="w-full mb-3"
            inputStyle="bg-cardBgColor text-primaryTextColor"
            editable={false}
          />

          <InputField
            label="Phone"
            placeholder={String(user?.publicMetadata?.phone_number) || "Not Found"}
            containerStyle="w-full"
            inputStyle="bg-cardBgColor text-primaryTextColor"
            editable={false}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;
