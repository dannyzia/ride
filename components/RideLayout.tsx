import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { View, Text, TouchableOpacity, Image } from 'react-native'
import React, { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { icons } from '@/constants/data'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import Map from './Map'
import { useCustomer, useDriverStore } from '@/store'
import { useFocusEffect } from '@react-navigation/native'
import { colors, radii, spacing } from '@/theme/goRide'

const RideLayout = ({ title, children, snapPoints, disabled }: {
    title: string,
    children: React.ReactNode,
    snapPoints?: string[],
    disabled: boolean
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

    return (
        <GestureHandlerRootView>
            <View style={{ flex: 1, backgroundColor: colors.bgDark }}>
                <View style={{ flex: 1 }}>
                    <View style={{
                        flexDirection: 'row',
                        position: 'absolute',
                        zIndex: 10,
                        top: 64,
                        alignItems: 'center',
                        justifyContent: 'flex-start',
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
                                fontFamily: 'Urbanist',
                                fontWeight: '600',
                                marginLeft: spacing.md,
                            }}>
                                {title || 'Go back'}
                            </Text>
                        )}
                    </View>
                    <Map />
                </View>

                <BottomSheet
                    keyboardBehavior='extend'
                    ref={bottomSheetRef}
                    snapPoints={snapPoints ?? ['40%', '70%']}
                    index={0}
                    enablePanDownToClose={false}
                    backgroundStyle={{ backgroundColor: colors.surfaceElevatedDark, borderTopLeftRadius: radii['3xl'], borderTopRightRadius: radii['3xl'] }}
                    handleIndicatorStyle={{ backgroundColor: colors.borderDark }}
                >
                    <BottomSheetView style={{
                        flex: 1,
                        padding: spacing.xl,
                        backgroundColor: colors.surfaceElevatedDark,
                    }}>
                        {children}
                    </BottomSheetView>
                </BottomSheet>
            </View>
        </GestureHandlerRootView>
    )
}

export default RideLayout
