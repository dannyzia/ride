import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlatList, Text, View, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { colors } from '@/theme/goRide';
import { useSession } from '@/lib/session';
import { useRidesStore } from '@/store';
import RideCard from '@/components/RideCard';
import { images } from '@/constants/data';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { logger } from '@/lib/logger';

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const FILTERS: { label: string; route: string }[] = [
  { label: 'All', route: '' },
  { label: 'Completed', route: '/(main)/(customer)/(tabs)/activity-completed' },
  { label: 'Scheduled', route: '/(main)/(customer)/(tabs)/activity-scheduled' },
  { label: 'Canceled', route: '/(main)/(customer)/(tabs)/activity-canceled' },
  { label: 'Inbox', route: '/(main)/(customer)/(tabs)/inbox' },
  { label: 'Referral', route: '/(main)/(customer)/(tabs)/referral' },
];

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
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgDark, paddingHorizontal: 20, marginBottom: 32 }}>
      <Text style={{ color: colors.textPrimaryDark, fontSize: 28, fontWeight: '800', fontFamily: 'Jakarta-Bold', marginTop: 16, marginBottom: 16 }}>Rides History</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 8 }}>
        {FILTERS.map((f) => (
          f.route ? (
            <TouchableOpacity key={f.label} onPress={() => router.push(f.route)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.darkSecondary }}>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: 'Jakarta-SemiBold', fontSize: 12 }}>{f.label}</Text>
            </TouchableOpacity>
          ) : (
            <View key={f.label} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.adminAccent }}>
              <Text style={{ color: '#000', fontFamily: 'Jakarta-Bold', fontSize: 12 }}>{f.label}</Text>
            </View>
          )
        ))}
      </View>
      <FlatList
        data={Rides}
        renderItem={({ item }) => <RideCard ride={item} />}
        keyExtractor={(item) => item.ride_id?.toString() ?? Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() =>
          loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 40 }}>
              <Image source={images.noResult} style={{ width: 160, height: 160 }} resizeMode="contain" />
              <Text style={{ color: colors.textSecondaryDark, marginTop: 12, fontFamily: 'Jakarta', fontSize: 15 }}>No recent rides found</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

export default ShowAllRides;
