import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlatList, Text, View, Image, ActivityIndicator } from 'react-native';
import { colors, spacing } from '@/theme/goRide';
import { useSession } from '@/lib/session';
import { useRidesStore } from '@/store';
import RideCard from '@/components/RideCard';
import Constants from 'expo-constants';
import { images } from '@/constants/data';
import { supabase } from '@/lib/supabase';
import { logger } from "@/lib/logger";

const API_URL = Constants.expoConfig?.extra?.serverUrl;

const ShowAllRides = () => {
  const { user } = useSession();
  const { setRides, Rides = [] } = useRidesStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRides = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const url = `${API_URL}/api/ride/get-all`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { data } = await res.json();
        setRides(Array.isArray(data) ? data : []);
      } catch (err) {
        logger.error('Failed to fetch rides:', err);
        setRides([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRides();
  }, [user?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgDark, paddingHorizontal: spacing.xl, marginBottom: spacing['2xl'] }}>
      <Text style={{ color: colors.textPrimaryDark, fontSize: 28, fontWeight: '800', fontFamily: 'Urbanist', marginTop: spacing.lg, marginBottom: spacing['2xl'] }}>
        Rides History
      </Text>

      <FlatList
        data={Rides}
        renderItem={({ item }) => <RideCard ride={item} />}
        keyExtractor={(item) => item.ride_id?.toString() ?? Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={() =>
          loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 40 }}>
              <Image source={images.noResult} style={{ width: 160, height: 160 }} resizeMode="contain" />
              <Text style={{ color: colors.textSecondaryDark, marginTop: 12, fontFamily: 'Urbanist', fontSize: 15 }}>
                No recent rides found
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

export default ShowAllRides;
