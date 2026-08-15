import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT, formatRelativeTime } from "@/lib/format";

type TransactionType = "top_up" | "ride_payment" | "pass_purchase" | "refund";
type TransactionStatus = "success" | "failed" | "pending";

interface TransactionRowProps {
  type: TransactionType;
  title: string;
  amountBdt: number;
  status: TransactionStatus;
  date: string;
}

const TYPE_CONFIG: Record<
  TransactionType,
  { icon: keyof typeof Ionicons.glyphMap; bg: string; iconColor: string }
> = {
  top_up: { icon: "add-circle", bg: colors.primaryLight, iconColor: colors.primary },
  ride_payment: { icon: "car", bg: colors.infoLight, iconColor: colors.info },
  pass_purchase: { icon: "ticket", bg: `${colors.amber}1A`, iconColor: colors.amber },
  refund: { icon: "arrow-undo", bg: `${colors.checkGreen}1A`, iconColor: colors.checkGreen },
};

const FAILED_CONFIG = {
  icon: "warning" as const,
  bg: colors.dangerLight,
  iconColor: colors.danger,
};

const TransactionRow = ({ type, title, amountBdt, status, date }: TransactionRowProps) => {
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;

  const isFailed = status === "failed";
  const iconConfig = isFailed ? FAILED_CONFIG : TYPE_CONFIG[type];

  const formattedAmount = formatBDT(Math.abs(amountBdt), { decimals: false });
  let amountText: string;
  let amountColor: string;
  if (isFailed) {
    amountText = `! ${formattedAmount}`;
    amountColor = colors.danger;
  } else if (amountBdt > 0) {
    amountText = `+${formattedAmount}`;
    amountColor = colors.primary;
  } else {
    amountText = `-${formattedAmount}`;
    amountColor = textPrimary;
  }

  return (
    <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>
      <View style={[styles.iconCircle, { backgroundColor: iconConfig.bg }]}>
        <Ionicons name={iconConfig.icon} size={20} color={iconConfig.iconColor} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.date, { color: textDisabled }]}>
          {formatRelativeTime(date)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>{amountText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  date: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    textAlign: "right",
  },
});

export default TransactionRow;
