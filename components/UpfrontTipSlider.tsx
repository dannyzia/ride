import { View, Text, TouchableOpacity } from "react-native";

interface UpfrontTipSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function UpfrontTipSlider({ value, onChange }: UpfrontTipSliderProps) {
  return (
    <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-xl p-4 mb-4">
      <Text className="text-[15px] font-JakartaBold text-goAccent dark:text-goPrimary mb-1">
        💰 Get a Driver Faster
      </Text>
      <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-3">
        Add an upfront tip to attract drivers quickly.
      </Text>
      <View className="flex-row gap-2">
        {[0, 20, 50, 100].map((amount) => (
          <TouchableOpacity
            key={amount}
            onPress={() => onChange(amount)}
            className={`flex-1 py-2.5 rounded-full items-center border ${
              value === amount
                ? "bg-goPrimary border-goPrimary"
                : "bg-transparent border-goBorderLight dark:border-goBorderDark"
            }`}
          >
            <Text className={`text-[14px] font-JakartaBold ${
              value === amount ? "text-goWhite" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            }`}>
              {amount === 0 ? "No tip" : `৳${amount}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
