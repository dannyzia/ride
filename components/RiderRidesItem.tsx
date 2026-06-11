import { View, Text, Image, TouchableOpacity, Dimensions } from 'react-native';
import React, { useEffect, useState, useRef } from 'react';
import Animated, { FadeInLeft, FadeOutRight } from 'react-native-reanimated';
import { icons } from '@/constants/data';
import { AntDesign } from '@expo/vector-icons';
import { RideOfferDetails } from '@/types/type';
import { colors, spacing, radii } from '@/theme/goRide';

const { width } = Dimensions.get('window');

const RiderRidesItem = ({ item, removeIt, acceptRide }: {
    item: RideOfferDetails,
    removeIt: (id: string) => void,
    acceptRide: (id: string) => void
}) => {
    const [timer, setTimer] = useState(11);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (timer === 0) {
            removeIt(item.id);
            return;
        }

        if (!intervalRef.current) {
            intervalRef.current = setInterval(() => {
                setTimer(prev => prev - 1);
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [timer, item.id, removeIt]);

    return (
        <Animated.View
            entering={FadeInLeft.duration(500)}
            exiting={FadeOutRight.duration(500)}
            style={{
                backgroundColor: colors.surfaceElevatedDark,
                borderRadius: radii['2xl'],
                padding: spacing['2xl'],
                marginVertical: spacing.md,
                alignSelf: 'center',
                width: width - 32,
                borderWidth: 1,
                borderColor: colors.borderDark,
            }}
        >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Image source={icons.cab} style={{ width: 36, height: 36 }} resizeMode="contain" />
                    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimaryDark, fontFamily: 'Urbanist' }}>
                        Car
                    </Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondaryDark, fontFamily: 'Urbanist' }}>
                    #{item?.id?.slice(0, 10).toUpperCase() ?? 'RID12345'}
                </Text>
            </View>

            {/* Pickup & Dropoff */}
            <View style={{ marginTop: spacing['2xl'] }}>
                {/* Pickup */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.lg }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, marginTop: 6 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, color: colors.textPrimaryDark, fontFamily: 'Urbanist', fontWeight: '700' }}>
                            {item.pickupDetails.pickup}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondaryDark, marginTop: 4, fontFamily: 'Urbanist' }}>
                            {item.pickupDetails.pickupAddress ?? 'Pickup address'}
                        </Text>
                    </View>
                </View>

                {/* Dropoff */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger, marginTop: 6 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimaryDark, fontFamily: 'Urbanist' }}>
                            {item.dropoffDetails.dropoff}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondaryDark, marginTop: 4, fontFamily: 'Urbanist' }}>
                            {item.dropoffDetails.dropoffAddress ?? 'Dropoff address'}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Customer Details */}
            <View style={{ marginTop: spacing['2xl'] }}>
                <Text style={{ fontFamily: 'Urbanist', fontWeight: '600', color: colors.textSecondaryDark, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm }}>
                    Customer
                </Text>
                <View style={{ backgroundColor: colors.bgDark, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDark, gap: 4 }}>
                    <Text style={{ color: colors.textPrimaryDark, fontFamily: 'Urbanist', fontSize: 14 }}>
                        {item.customerDetails.full_name}
                    </Text>
                    <Text style={{ color: colors.textSecondaryDark, fontFamily: 'Urbanist', fontSize: 13 }}>
                        {item.customerDetails.number}
                    </Text>
                </View>
            </View>

            {/* Ride Info */}
            <View style={{ marginTop: spacing.lg }}>
                <Text style={{ fontFamily: 'Urbanist', fontWeight: '600', color: colors.textSecondaryDark, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm }}>
                    Ride Info
                </Text>
                <View style={{ backgroundColor: colors.bgDark, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDark, gap: 4 }}>
                    <Text style={{ color: colors.textSecondaryDark, fontFamily: 'Urbanist', fontSize: 13 }}>Duration: {item.duration}</Text>
                    <Text style={{ color: colors.primary, fontFamily: 'Urbanist', fontWeight: '700', fontSize: 16 }}>৳{item.fare}</Text>
                    <Text style={{ color: colors.textSecondaryDark, fontFamily: 'Urbanist', fontSize: 13 }}>Status: {item.status}</Text>
                </View>
            </View>

            {/* Footer */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing['2xl'] }}>
                <View>
                    <Text style={{ fontSize: 13, color: colors.textSecondaryDark, fontFamily: 'Urbanist' }}>Pickup distance</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimaryDark, fontFamily: 'Urbanist' }}>
                        {item.pickupDetails.pickupDistance} km
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    {/* Reject */}
                    <TouchableOpacity
                        onPress={() => removeIt(item.id)}
                        style={{ backgroundColor: colors.danger, borderRadius: radii.pill, padding: spacing.sm }}
                    >
                        <AntDesign name="close" size={22} color={colors.white} />
                    </TouchableOpacity>

                    {/* Accept */}
                    <TouchableOpacity
                        onPress={() => acceptRide(item.id)}
                        style={{
                            backgroundColor: colors.primary,
                            paddingHorizontal: spacing['2xl'],
                            paddingVertical: spacing.md,
                            borderRadius: radii.pill,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.white, fontFamily: 'Urbanist' }}>
                            Accept
                        </Text>
                        <View style={{
                            backgroundColor: colors.primaryPressed,
                            borderRadius: radii.pill,
                            width: 28,
                            height: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: colors.white, fontFamily: 'Urbanist' }}>
                                {timer}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </Animated.View>
    );
};

export default RiderRidesItem;
