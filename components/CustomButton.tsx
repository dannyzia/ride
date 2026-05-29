import { ButtonProps } from '@/types/type';
import { Text, TouchableOpacity } from 'react-native';

const getBgVariantStyle = (variant: ButtonProps['bgVariant']) => {
    switch (variant) {
        case "secondary":
            return 'bg-goDarkSecondary shadow-lg shadow-goBlue/40 border border-goBlue/60'; // Dark but glowing effect
        case "danger":
            return 'bg-goRedVariant shadow-md shadow-red-500/40 border border-red-500/60';
        case "success":
            return 'bg-goGreenVariant shadow-md shadow-green-500/40 border border-green-500/60';
        case "outline":
            return 'bg-transparent border border-goBlue/50';
        default:
            return 'bg-goBlue shadow-xl shadow-goBlue/50'; // Bright blue glow
    }
};


const getTextVariantStyle = (variant: ButtonProps['textVariant']) => {
    switch (variant) {
        case "primary":
            return 'text-white';
        case "secondary":
            return 'text-goLightGray'; // Soft white glow
        case "success":
            return 'text-goLightGreenText';
        case "danger":
            return 'text-goLightRedText';
        default:
            return 'text-white';
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
}: ButtonProps) =>
    <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        className={`rounded-full p-4 flex flex-row justify-center items-center shadow-md shadow-neutral-400/70 ${getBgVariantStyle(bgVariant)} ${className}  ${disabled ? 'opacity-50' : 'shadow-md shadow-neutral-400/70'} `}
        {...props}
    >
        {IconLeft && <IconLeft />}
        <Text className={`text-white text-lg font-bold ${getTextVariantStyle(textVariant)}`}>{title}</Text>
        {IconRight && <IconRight />}
    </TouchableOpacity>

export default CustomButton;
