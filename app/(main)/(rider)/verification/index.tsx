import React, { useState } from 'react';
import { View, Text, TextInput, Button, Image, ScrollView, TouchableOpacity, Alert, StatusBar } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Rating } from 'react-native-ratings';
import { uploadImage } from '@/lib/imageToURL';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { AntDesign } from '@expo/vector-icons';
import ReactNativeModal from 'react-native-modal';
import CustomButton from '@/components/CustomButton';
import { router } from 'expo-router';
import { useDriver, useDriverDetails } from '@/store';
import Constants from 'expo-constants';
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from '@/theme/goRide';

const API_URL = Constants.expoConfig?.extra?.serverUrl;

const VerificationPage = () => {
    const { user } = useSession();

    const [carImageUri, setCarImageUri] = useState<string | null>(null);
    const [showCarImageModal, setShowCarImageModal] = useState<boolean>(false);
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [showProfileImageModal, setShowProfileImageModal] = useState<boolean>(false);

    const [rating, setRating] = useState(0);
    const [carSeats, setCarSeats] = useState('');

    const [carImageLoading, setCarImageLoading] = useState<boolean>(false);
    const [profileImageLoading, setProfileImageLoading] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);

    const { setProfileImageURL, setRating: setStoreRating } = useDriver();
    const { setIsVerified } = useDriverDetails();

    const pickCarImage = async () => {
        setCarImageLoading(true);
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 1,
            });
            if (!result.canceled) {
                const uri = result.assets?.[0]?.uri;
                const fileName = result.assets?.[0]?.fileName ?? `${Date.now()}.jpg`;
                try {
                    const imageUrl = await uploadImage(uri, fileName);
                    setCarImageUri(imageUrl);
                } catch (error) {
                    logger.error("Error uploading image:", error);
                }
            }
        } catch (error: any) {
            logger.info(error);
            Alert.alert('Car Image Upload Failed', error.message);
        } finally {
            setCarImageLoading(false);
        }
    };

    const pickProfileImage = async () => {
        setProfileImageLoading(true);
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 1,
            });
            if (!result.canceled) {
                const uri = result.assets?.[0]?.uri;
                const fileName = result.assets?.[0]?.fileName ?? `${Date.now()}.jpg`;
                try {
                    const imageUrl = await uploadImage(uri, fileName);
                    setProfileImage(imageUrl);
                } catch (error: any) {
                    logger.error("Error uploading image:", error);
                    Alert.alert('Profile Image Upload Failed', error.message);
                }
            }
        } catch (error: any) {
            logger.info(error);
            Alert.alert('Profile Image Upload Failed', error.message);
        } finally {
            setProfileImageLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!user || !carImageUri || !profileImage || !rating || !carSeats) {
            Alert.alert('Submission Failed', 'Please fill all the details to continue.');
            return;
        }
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            await fetch(`${API_URL}/api/driver/verify-driver`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ carImageUri, profileImage, rating, carSeats }),
            });
            setProfileImageURL({ profile_image_url: profileImage! });
            setStoreRating({ rating });
            setIsVerified(true);
            router.replace('/(rider)/home');
        } catch (error: any) {
            logger.info('error in driver verification page', error);
            Alert.alert('Submission Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    const sectionLabel = (text: string) => (
        <Text style={{ fontFamily: 'Urbanist', fontSize: 14, fontWeight: '600', color: colors.textSecondaryDark, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm }}>
            {text}
        </Text>
    );

    const uploadedBadge = (onShow: () => void) => (
        <View style={{ flexDirection: 'row', marginTop: spacing.md, justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Text style={{ color: colors.primary, fontFamily: 'Urbanist', fontWeight: '600' }}>Uploaded</Text>
                <AntDesign name='check' size={18} color={colors.primary} />
            </View>
            <TouchableOpacity onPress={onShow}>
                <Text style={{ color: colors.textSecondaryDark, fontFamily: 'Urbanist', fontSize: 13 }}>Show Image</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgDark }}>
            <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
            <ScrollView style={{ flex: 1, padding: spacing['2xl'] }} contentContainerStyle={{ paddingBottom: 60 }}>

                {/* Back */}
                <TouchableOpacity style={{ marginBottom: spacing['3xl'] }} onPress={() => router.back()}>
                    <AntDesign name='close' size={26} color={colors.textPrimaryDark} />
                </TouchableOpacity>

                <Text style={{ fontFamily: 'Urbanist', fontSize: 22, fontWeight: '800', color: colors.textPrimaryDark, marginBottom: spacing['3xl'] }}>
                    Driver Verification
                </Text>

                {/* Car Image */}
                <View style={{ marginBottom: spacing['2xl'] }}>
                    {sectionLabel('Car Image')}
                    <Button title="Upload Car Image" onPress={pickCarImage} disabled={carImageLoading} color={colors.primary} />
                    {carImageUri && uploadedBadge(() => setShowCarImageModal(true))}
                </View>

                <ReactNativeModal isVisible={showCarImageModal}>
                    <View style={{ height: '50%', padding: spacing.xl, backgroundColor: colors.surfaceElevatedDark, borderRadius: radii['2xl'], margin: 'auto', width: '100%' }}>
                        <TouchableOpacity onPress={() => setShowCarImageModal(false)} style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10 }}>
                            <AntDesign name='close' size={26} color={colors.textPrimaryDark} />
                        </TouchableOpacity>
                        {carImageUri && (
                            <Image source={{ uri: carImageUri }} style={{ width: '100%', height: '100%', marginTop: spacing.xl, borderRadius: radii.md }} resizeMode='contain' />
                        )}
                    </View>
                </ReactNativeModal>

                {/* Profile Image */}
                <View style={{ marginBottom: spacing['2xl'] }}>
                    {sectionLabel('Profile Image')}
                    <Button title="Upload Profile Image" onPress={pickProfileImage} disabled={profileImageLoading} color={colors.primary} />
                    {profileImage && uploadedBadge(() => setShowProfileImageModal(true))}
                </View>

                <ReactNativeModal isVisible={showProfileImageModal}>
                    <View style={{ height: '50%', padding: spacing.xl, backgroundColor: colors.surfaceElevatedDark, borderRadius: radii['2xl'], margin: 'auto', width: '100%' }}>
                        <TouchableOpacity onPress={() => setShowProfileImageModal(false)} style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10 }}>
                            <AntDesign name='close' size={26} color={colors.textPrimaryDark} />
                        </TouchableOpacity>
                        {profileImage && (
                            <Image source={{ uri: profileImage }} style={{ width: '100%', height: '100%', marginTop: spacing.xl, borderRadius: radii.md }} resizeMode='contain' />
                        )}
                    </View>
                </ReactNativeModal>

                {/* Rating */}
                <View style={{ marginBottom: spacing['2xl'] }}>
                    {sectionLabel('Rating')}
                    <Rating
                        ratingCount={5}
                        imageSize={30}
                        showRating
                        onFinishRating={setRating}
                        style={{ marginTop: 4, marginBottom: spacing.md, backgroundColor: 'transparent' }}
                    />
                </View>

                {/* Car Seats */}
                <View style={{ marginBottom: spacing['2xl'] }}>
                    {sectionLabel('Car Seats')}
                    <TextInput
                        style={{
                            backgroundColor: colors.surfaceElevatedDark,
                            color: colors.textPrimaryDark,
                            padding: spacing.md,
                            borderRadius: radii.md,
                            borderWidth: 1,
                            borderColor: colors.borderDark,
                            fontFamily: 'Urbanist',
                            fontSize: 15,
                        }}
                        placeholder="Enter number of seats"
                        placeholderTextColor={colors.textDisabledDark}
                        keyboardType="numeric"
                        value={carSeats}
                        onChangeText={setCarSeats}
                    />
                </View>

                <CustomButton
                    title="Submit"
                    style={{ marginTop: spacing['3xl'], opacity: loading ? 0.6 : 1 }}
                    onPress={handleSubmit}
                />
            </ScrollView>
        </SafeAreaView>
    );
};

export default VerificationPage;
