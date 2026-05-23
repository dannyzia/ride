import { router } from "expo-router";
import { ActivityIndicator, Alert, Image, Text, View } from "react-native";
import CustomButton from "@/components/CustomButton";
import { icons } from "@/constants/data";
import { useCallback, useState } from "react";

const OAuth = () => {
    const [loading, setLoading] = useState<boolean>(false);

    const handleGoogleSignIn = useCallback(async () => {
        setLoading(true);
        try {
            Alert.alert(
                "Coming Soon",
                "Google Sign-In will be available in Phase 4 with Firebase Auth."
            );
            router.replace("/(auth)/welcome");
        } catch (err: any) {
            console.error("❌ Sign-in Error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <View>
            <View className="flex flex-row justify-center items-center mt-4 gap-x-3">
                <View className="flex-1 h-[1px] bg-general-100" />
                <View>
                    <Text className="text-lg text-white">Or</Text>
                </View>
                <View className="flex-1 h-[1px] bg-general-100" />
            </View>

            <CustomButton
                title={`${loading ? 'Loading' : 'Sign in with Google'}`}
                className={`mt-5 w-full shadow-none ${loading && 'opacity-60'}`}
                disabled={loading}
                IconLeft={() => (
                    loading ? (
                        <ActivityIndicator size='small' color='white' className="w-5 h-5 mx-2" />
                    ) : (
                        <Image
                            source={icons.google}
                            resizeMode="contain"
                            className="w-5 h-5 mx-2"
                        />
                    )
                )}
                bgVariant="outline"
                textVariant="primary"
                onPress={handleGoogleSignIn}
            />
        </View>
    );
};

export default OAuth;
