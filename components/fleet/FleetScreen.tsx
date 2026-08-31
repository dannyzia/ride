/**
 * FleetScreen — shared wrapper for all fleet screens.
 * Provides: SafeAreaView, Pattern A theming, status bar, optional header.
 */
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StatusBar,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface FleetScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  scrollable?: boolean;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
}

export default function FleetScreen({
  children,
  title,
  subtitle,
  rightElement,
  onRefresh,
  refreshing = false,
  scrollable = true,
  contentContainerStyle,
}: FleetScreenProps) {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark
    ? colors.textPrimaryDark
    : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const content = scrollable ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[
        { padding: 16, paddingBottom: 100 },
        contentContainerStyle,
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, backgroundColor: bg, padding: 16 }}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={["top"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {title && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
            backgroundColor: surfaceBg,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 20,
                color: textPrimary,
              }}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {rightElement}
        </View>
      )}
      {content}
    </SafeAreaView>
  );
}
