import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import React, { useCallback, useMemo, useRef } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { icons } from '@/constants/data'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import Map from './Map'
import { useCustomer, useDriverStore } from '@/store'
import { colors, radii, spacing } from '@/theme/goRide'

const RideLayout = ({ title, children, snapPoints, disabled, footer }: {
    title: string,
    children: React.ReactNode,
    snapPoints?: string[],
    disabled: boolean,
    footer?: React.ReactNode,
}) => {

    const { clearDestinationLocation } = useCustomer();
    const { clearSelectedDriver } = useDriverStore();

    const bottomSheetRef = useRef<BottomSheet>(null);
    const router = useRouter()

    useFocusEffect(
        useCallback(() => {
            bottomSheetRef.current?.snapToIndex(0);
        }, [])
    );

    const springConfig = useMemo(() => ({
        damping: 20, mass: 0.8, stiffness: 180,
        overshootClamping: false,
        restDisplacementThreshold: 0.01,
        restSpeedThreshold: 0.01,
    }), []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            {/* ── Layer 0: Full-screen map (base layer) ───────────────── */}
            <View style={StyleSheet.absoluteFill}>
                <Map />
            </View>

            {/* ── Layer 1: Back button + title (floats over map) ───────── */}
            <View style={{
                flexDirection: 'row',
                position: 'absolute',
                zIndex: 10,
                top: 64,
                left: 0,
                right: 0,
                alignItems: 'center',
                paddingHorizontal: spacing.xl,
            }}>
                <TouchableOpacity
                    onPress={() => {
                        if (title === 'Ride') {
                            clearDestinationLocation();
                            clearSelectedDriver();
                        }
                        router.back()
                    }}
                    disabled={disabled}
                >
                    {!disabled && (
                        <View style={{
                            width: 40,
                            height: 40,
                            backgroundColor: colors.surfaceElevatedDark,
                            borderRadius: radii.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: colors.borderDark,
                        }}>
                            <Image source={icons.backArrow} style={{ width: 20, height: 20 }} />
                        </View>
                    )}
                </TouchableOpacity>
                {!disabled && (
                    <Text style={{
                        fontSize: 18,
                        color: colors.textPrimaryDark,
                        fontFamily: 'Jakarta-SemiBold',
                        marginLeft: spacing.md,
                    }}>
                        {title || 'Go back'}
                    </Text>
                )}
            </View>

            {/* ── Layer 2: Bottom sheet (top layer, sits over map) ─────── */}
            <BottomSheet
                keyboardBehavior='extend'
                ref={bottomSheetRef}
                snapPoints={snapPoints ?? ['55%', '88%']}
                index={0}
                enablePanDownToClose={false}
                animationConfigs={springConfig}
                backgroundStyle={{
                    backgroundColor: colors.surfaceElevatedDark,
                    borderTopLeftRadius: radii['3xl'],
                    borderTopRightRadius: radii['3xl'],
                }}
                handleIndicatorStyle={{ backgroundColor: colors.borderDark }}
            >
                <BottomSheetView style={{
                    flex: 1,
                    padding: spacing.xl,
                    backgroundColor: colors.surfaceElevatedDark,
                }}>
                    {footer ? (
                        <View style={{ marginBottom: spacing.md }}>
                            {footer}
                        </View>
                    ) : null}
                    {children}
                </BottomSheetView>
            </BottomSheet>
        </GestureHandlerRootView>
    )
}

export default RideLayout
