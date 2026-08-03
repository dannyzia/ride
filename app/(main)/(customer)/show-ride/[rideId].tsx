import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { API_URL } from '@/lib/config';
import React, { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { icons } from '@/constants/data';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const ShowRide = () => {
    const { rideId } = useLocalSearchParams<{ rideId: string }>();
    const [ride, setRide] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof rideId !== 'string') return;
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) return;
                const res = await fetch(`${API_URL}/api/ride/${rideId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) setRide((await res.json()).ride);
            } catch (e) {
                logger.error('[show-ride] fetch failed', e);
            } finally {
                setLoading(false);
            }
        })();
    }, [rideId]);

    if (loading) {
        return (
            <View className="flex-1 bg-goBgLight dark:bg-goBgDark justify-center items-center">
                <ActivityIndicator size="large" color="#0CC25F" />
            </View>
        );
    }

    if (!ride) {
        return (
            <View className="flex-1 bg-goBgLight dark:bg-goBgDark justify-center items-center px-6">
                <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-[16px] font-Jakarta text-center">Ride not found</Text>
                <TouchableOpacity className="mt-6 bg-goPrimary rounded-full px-6 py-3" onPress={() => router.back()}>
                    <Text className="text-goWhite font-JakartaBold">Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
            <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                <View className="flex-1 justify-between p-6">
                    <View className="relative mb-6">
                        <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-[24px] font-JakartaBold text-center">Ride Details</Text>
                        <View className="absolute top-0 left-0">
                            <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-full items-center justify-center">
                                <Image source={icons.backArrow} className="w-5 h-5" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="mb-6 px-4 py-4 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-2xl border border-goBorderLight dark:border-goBorderDark">
                        <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-[13px] font-Jakarta mb-1">Origin</Text>
                        <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-[15px] font-Jakarta mb-4">{ride.origin_address ?? "—"}</Text>
                        <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-[13px] font-Jakarta mb-1">Destination</Text>
                        <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-[15px] font-Jakarta">{ride.destination_address ?? "—"}</Text>
                    </View>

                    <View className="mb-6 px-4 py-4 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-2xl border border-goBorderLight dark:border-goBorderDark">
                        <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-[16px] font-JakartaBold mb-2">Status</Text>
                        <Text className="text-goPrimary text-[14px] font-JakartaBold">{ride.status ?? "—"}</Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ShowRide;
