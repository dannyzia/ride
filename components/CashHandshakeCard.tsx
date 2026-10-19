import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";

export interface CashHandshakeView {
  rider_cash_tendered_bdt: number | null;
  driver_cash_received_bdt: number | null;
  change_due_bdt: number | null;
  amounts_match: boolean | null;
}

interface Props {
  handshake: CashHandshakeView | null | undefined;
}

/**
 * C4-6: renders the server's cash_handshake from the complete response.
 * amounts_match → settled; otherwise the computed change_due (or the raw
 * mismatch when no change figure applies). Null when there is nothing to
 * report (bodyless completes carry no handshake).
 */
export default function CashHandshakeCard({ handshake }: Props) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  if (!handshake) return null;

  if (handshake.amounts_match === true) {
    return (
      <View
        className="flex-row items-center px-[12px] py-[10px] rounded-[8px] mb-2"
        style={{ backgroundColor: colors.primary + "1A" }}
      >
        <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
        <Text className="flex-1 text-[13px] font-JakartaBold ml-2" style={{ color: textPrimary }}>
          {t("finish_ride.cash_settled")}
        </Text>
      </View>
    );
  }

  if (handshake.change_due_bdt != null && handshake.change_due_bdt > 0) {
    return (
      <View
        className="flex-row items-center px-[12px] py-[10px] rounded-[8px] mb-2"
        style={{ backgroundColor: colors.amber + "1A" }}
      >
        <Ionicons name="cash-outline" size={18} color={colors.amber} />
        <Text className="flex-1 text-[13px] font-JakartaBold ml-2" style={{ color: textPrimary }}>
          {t("finish_ride.return_change", { amount: formatBDT(handshake.change_due_bdt, { decimals: true }) })}
        </Text>
      </View>
    );
  }

  if (handshake.rider_cash_tendered_bdt != null && handshake.driver_cash_received_bdt != null) {
    return (
      <View
        className="flex-row items-center px-[12px] py-[10px] rounded-[8px] mb-2"
        style={{ backgroundColor: colors.danger + "1A" }}
      >
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text className="flex-1 text-[13px] font-JakartaBold ml-2" style={{ color: textPrimary }}>
          {t("finish_ride.cash_mismatch", {
            received: formatBDT(handshake.driver_cash_received_bdt, { decimals: true }),
            tendered: formatBDT(handshake.rider_cash_tendered_bdt, { decimals: true }),
          })}
        </Text>
      </View>
    );
  }

  return null;
}
