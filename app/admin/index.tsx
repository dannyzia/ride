import { colors } from '@/theme/goRide';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

const ADMIN_MENU = [
  {
    key: 'verification',
    title: 'Driver Verification',
    description: 'Review and approve driver documents',
    icon: 'checksquareo' as const,
    route: '/admin/verification',
  },
  {
    key: 'packages',
    title: 'Call Packages',
    description: 'Manage subscription packages and pricing',
    icon: 'database' as const,
    route: '/admin/packages',
  },
  {
    key: 'zones',
    title: 'Zones & Pricing',
    description: 'Configure operational zones and fare pricing',
    icon: 'enviromento' as const,
    route: '/admin/zones',
  },
  {
    key: 'city-boundaries',
    title: 'City Boundaries',
    description: 'Manage intercity geo-fencing polygons',
    icon: 'flag' as const,
    route: '/admin/city-boundaries',
  },
  {
    key: 'configuration',
    title: 'Configuration',
    description: 'Manage platform configuration values',
    icon: 'setting' as const,
    route: '/admin/configuration',
  },
];

export default function AdminDashboard() {
  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.replace('/(auth)/phone-entry');
  };

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mt-4 mb-8">
          <View>
            <Text className="text-primaryTextColor text-2xl font-bold">Admin Panel</Text>
            <Text className="text-secondaryTextColor text-sm mt-1">Manage your Ride platform</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} className="bg-hoverBgColor rounded-full p-3">
            <AntDesign name="logout" size={20} color={colors.adminSubtle} />
          </TouchableOpacity>
        </View>

        {/* Menu Cards */}
        {ADMIN_MENU.map(item => (
          <TouchableOpacity
            key={item.key}
            onPress={() => router.push(item.route as any)}
            className="bg-cardBgColor rounded-2xl p-5 mb-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-full bg-accentColor/20 items-center justify-center mr-4">
              <AntDesign name={item.icon} size={22} color={colors.adminAccent} />
            </View>
            <View className="flex-1">
              <Text className="text-primaryTextColor font-semibold text-base">{item.title}</Text>
              <Text className="text-secondaryTextColor text-xs mt-1">{item.description}</Text>
            </View>
            <AntDesign name="right" size={16} color={colors.textDisabledDark} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
