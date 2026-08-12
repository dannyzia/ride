import { ButtonProps } from "@/types/type";
import { Text, TouchableOpacity } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

const getBgVariantStyle = (variant: ButtonProps["bgVariant"], isDark: boolean) => {
  switch (variant) {
    case "secondary":
      return {
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: isDark ? colors.borderDark : colors.borderLight,
      };
    case "danger":
      return {
        backgroundColor: colors.danger,
      };
    case "success":
      return {
        backgroundColor: colors.greenVariant,
      };
    case "outline":
      return {
        backgroundColor: "transparent",
        borderWidth: 2,
        borderColor: colors.primary,
      };
    default:
      return {
        backgroundColor: colors.primary,
      };
  }
};

const getTextVariantStyle = (variant: ButtonProps["textVariant"], isDark: boolean) => {
  switch (variant) {
    case "primary":
      return { color: colors.white };
    case "secondary":
      return { color: isDark ? colors.textPrimaryDark : colors.textPrimaryLight };
    case "success":
      return { color: colors.lightGreenText };
    case "danger":
      return { color: colors.lightRedText };
    default:
      return { color: colors.white };
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
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgStyle = getBgVariantStyle(bgVariant, isDark);
  const textStyle = getTextVariantStyle(textVariant, isDark);

  return (
    <Animated.View style={[animatedStyle, { width: "100%" }]}>
      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        activeOpacity={0.9}
        onPressIn={() => {
          if (!disabled) {
            scale.value = withSpring(0.96, { stiffness: 400, damping: 15 });
          }
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { stiffness: 400, damping: 15 });
        }}
        className={`rounded-full min-h-[58px] flex flex-row justify-center items-center px-6 ${className} ${
          disabled ? "opacity-50" : "opacity-100"
        }`}
        style={bgStyle}
        {...props}
      >
        {IconLeft && <IconLeft />}
        <Text
          className="text-[16px] font-JakartaBold tracking-tight"
          style={textStyle}
        >
          {title}
        </Text>
        {IconRight && <IconRight />}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default CustomButton;
