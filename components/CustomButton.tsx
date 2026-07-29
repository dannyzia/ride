import { ButtonProps } from '@/types/type';
import { Text, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const getBgVariantStyle = (variant: ButtonProps['bgVariant']) => {
    switch (variant) {
        case "secondary":
            return 'bg-goSurfaceElevatedDark border border-goBorderDark active:bg-goDarkSecondary';
        case "danger":
            return 'bg-goDanger active:bg-goDangerPressed shadow-md shadow-goDanger/25';
        case "success":
            return 'bg-goGreenVariant shadow-md shadow-green-500/40 border border-green-500/60';
        case "outline":
            return 'bg-transparent border-2 border-goAccent active:bg-goAccentLight';
        default:
            return 'bg-goAccent active:bg-goAccentPressed shadow-lg shadow-goAccent/30';
    }
};

const getTextVariantStyle = (variant: ButtonProps['textVariant']) => {
    switch (variant) {
        case "primary":
            return 'text-goWhite';
        case "secondary":
            return 'text-goLightGray';
        case "success":
            return 'text-goLightGreenText';
        case "danger":
            return 'text-goLightRedText';
        default:
            return 'text-goWhite';
    }
};

const CustomButton = ({
    onPress,
    disabled,
    title,
    bgVariant = "primary",
    textVariant = "primary",
    IconLeft,
    IconRight,
    className,
    ...props
}: ButtonProps) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <Animated.View style={animatedStyle}>
            <TouchableOpacity
                disabled={disabled}
                onPress={onPress}
                activeOpacity={0.9}
                onPressIn={() => { scale.value = withSpring(0.96, { stiffness: 400, damping: 15 }); }}
                onPressOut={() => { scale.value = withSpring(1, { stiffness: 400, damping: 15 }); }}
                className={`rounded-full py-3.5 px-8 flex flex-row justify-center items-center ${getBgVariantStyle(bgVariant)} ${className} ${disabled ? 'opacity-40' : ''}`}
                {...props}
            >
                {IconLeft && <IconLeft />}
                <Text className={`text-goWhite text-[15px] font-JakartaBold tracking-tight ${getTextVariantStyle(textVariant)}`}>{title}</Text>
                {IconRight && <IconRight />}
            </TouchableOpacity>
        </Animated.View>
    );
};

export default CustomButton;
