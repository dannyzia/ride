import { colors } from '@/theme/goRide';
import { View, Text } from 'react-native'
import React from 'react'
import RideLayout from '@/components/RideLayout';
import BarikoiAutocomplete from '@/components/BarikoiAutocomplete';
import { icons } from '@/constants/data';
import CustomButton from '@/components/CustomButton';
import { useRouter } from 'expo-router';
import { useCustomer } from '@/store';


const FindRidePage = () => {

    const {
        userAddress,
        destinationAddress,
        setUserLocation,
        setDestinationLocation
    } = useCustomer();


    const router = useRouter();

    return (
        <RideLayout title='Ride' disabled={false}>
            <View className=''>
                <Text className='text-lg font-JakartaSemiBold mb-3'>From</Text>
                <BarikoiAutocomplete
                    icon={icons.target}
                    initialLocation={
                        (userAddress && userAddress.length > 49)
                            ? userAddress.slice(0, 49) + '...'
                            : userAddress || 'Enter Address'
                    }
                    textInputBackgroundColor={colors.gray100}
                    handlePress={(location) => setUserLocation(location)}
                />
            </View>

            <View className=''>
                <Text className='text-lg font-JakartaSemiBold mb-3'>To</Text>
                <BarikoiAutocomplete
                    icon={icons.map}
                    initialLocation={
                        (destinationAddress && destinationAddress.length > 49)
                            ? destinationAddress.slice(0, 49) + '...'
                            : destinationAddress || 'Enter Destination'
                    }
                    textInputBackgroundColor='transparent'
                    handlePress={(location) => setDestinationLocation(location)}
                />
            </View>
            <CustomButton
                title='Find now'
                onPress={() => router.push('/(main)/book-ride' as never)}
                className='mt-5 w-full'
                disabled={userAddress?.length!>0?false:true}
            />
        </RideLayout>
    )
}

export default FindRidePage