import { View, Text, TouchableOpacity, Image } from 'react-native'
import React from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import { icons } from '@/constants/data'
import { useSignOut } from '@/lib/session'
import { router } from 'expo-router'
import { useDriverDetails } from '@/store'
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from '@/theme/goRide';

const RiderHeader = ({ hasPermissions: _hasPermissions, todayEarnings }: { hasPermissions: boolean, todayEarnings: string }) => {

    const { signOut } = useSignOut();

    const {
        isVerified,
        onDuty,
        setOnDuty
    } = useDriverDetails()


    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/(auth)/sign-in');
        } catch (err) {
            logger.error(JSON.stringify(err, null, 2));
        }
    };

    return (
        <>
            <View style={{
                backgroundColor: colors.bgDark,
                paddingHorizontal: spacing.lg,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                height: 64,
                borderBottomWidth: 1,
                borderBottomColor: colors.borderDark,
            }}>
                <MaterialIcons
                    name='logout'
                    color={colors.textSecondaryDark}
                    size={22}
                    onPress={handleSignOut}
                />
                <TouchableOpacity
                    style={{
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.sm,
                        borderRadius: radii.pill,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: onDuty ? colors.primary : colors.surfaceElevatedDark,
                        borderWidth: 1,
                        borderColor: onDuty ? colors.primary : colors.borderDark,
                        opacity: !isVerified ? 0.5 : 1,
                    }}
                    disabled={!isVerified}
                    onPress={() => { setOnDuty(!onDuty) }}
                >
                    <Text style={{
                        fontFamily: 'Urbanist',
                        fontWeight: '700',
                        fontSize: 13,
                        color: colors.textPrimaryDark,
                        letterSpacing: 0.5,
                    }}>
                        {onDuty ? 'ON DUTY' : 'OFF DUTY'}
                    </Text>
                    {onDuty ? (
                        <Image source={icons.dutyOn} style={{ width: 32, height: 32 }} resizeMode='contain' />
                    ) : (
                        <Image source={icons.dutyOff} style={{ width: 32, height: 32 }} resizeMode='contain' />
                    )}
                </TouchableOpacity>
                <MaterialIcons name='notifications' size={22} color={colors.textSecondaryDark} />
            </View>
            <View style={{
                height: 52,
                paddingHorizontal: spacing.xl,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.surfaceElevatedDark,
                borderBottomWidth: 1,
                borderBottomColor: colors.borderDark,
            }}>
                <Text style={{
                    fontFamily: 'Urbanist',
                    fontWeight: '500',
                    fontSize: 15,
                    color: colors.textSecondaryDark,
                }}>
                    Today&apos;s Earning
                </Text>
                <Text style={{
                    fontFamily: 'Urbanist',
                    fontWeight: '700',
                    fontSize: 16,
                    color: isVerified ? colors.primary : colors.textSecondaryDark,
                }}>
                    ৳ {isVerified ? todayEarnings : '_ _'}
                </Text>
            </View>
        </>
    )
}

export default RiderHeader
