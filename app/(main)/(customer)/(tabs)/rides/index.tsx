import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlatList, Text, View, Image, ActivityIndicator } from 'react-native';
import { useUser } from '@/lib/useUser';
import { useRidesStore } from '@/store';
import RideCard from '@/components/RideCard';
import Constants from 'expo-constants';
import { images } from '@/constants/data';
import { auth } from '@/lib/firebase';
import { logger } from "@/lib/logger";

const API_URL = Constants.expoConfig?.extra?.serverUrl;

const ShowAllRides = () => {
  const { user } = useUser();
  const { setRides, Rides = [] } = useRidesStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRides = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
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
    <SafeAreaView className="flex-1 bg-black px-5 mb-10">
      <Text className="text-white text-3xl font-bold mt-4 mb-6">Rides History</Text>

      <FlatList
        data={Rides}
        renderItem={({ item }) => <RideCard ride={item} />}
        keyExtractor={(item) => item.ride_id?.toString() ?? Math.random().toString()}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={() =>
          loading ? (
            <ActivityIndicator size="large" color="#fff" style={{ marginTop: 40 }} />
          ) : (
            <View className="items-center justify-center mt-10">
              <Image source={images.noResult} className="w-40 h-40" resizeMode="contain" />
              <Text className="text-gray-400 mt-3">No recent rides found</Text>
            </View>
          )
        }
      />
    </SafeAreaView>

  );
};

export default ShowAllRides;
