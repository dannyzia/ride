import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useState } from "react";
import { InputFieldProps } from "@/types/type";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

const InputField = ({
  label,
  labelStyle,
  icon,
  secureTextEntry = false,
  containerStyle,
  inputStyle,
  iconStyle,
  className: _className,
  ...props
}: InputFieldProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [dontShowPassword, setDontShowPassword] = useState(secureTextEntry);
  const { theme } = useAppearance();

  const isDark =
    theme === "dark" || (theme === "system" && true); // system defaults to dark for now

  const borderColor = isFocused
    ? colors.primary
    : isDark
      ? colors.borderDark
      : colors.borderLight;

  const bgColor = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textColor = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const placeholderColor = isDark
    ? colors.textDisabledDark
    : colors.textDisabledLight;
  const iconColor = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <View className="my-2 w-full">
      {label ? (
        <Text
          className={`text-sm font-JakartaSemiBold mb-2 ${labelStyle}`}
          style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight }}
        >
          {label}
        </Text>
      ) : null}

      <View
        className={`flex flex-row items-center rounded-xl px-4 py-3.5 border ${containerStyle}`}
        style={{
          backgroundColor: bgColor,
          borderColor: borderColor,
          borderWidth: isFocused ? 2 : 1,
        }}
      >
        {icon && (
          <Ionicons
            name={icon as any}
            size={20}
            color={iconColor}
            style={{ marginRight: 12 }}
          />
        )}

        <TextInput
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`font-JakartaSemiBold text-[15px] flex-1 ${inputStyle}`}
          style={{ color: textColor }}
          secureTextEntry={dontShowPassword}
          placeholderTextColor={placeholderColor}
          {...props}
        />

        {secureTextEntry ? (
          <TouchableOpacity
            onPress={() => setDontShowPassword(!dontShowPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={dontShowPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={iconColor}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export default InputField;
