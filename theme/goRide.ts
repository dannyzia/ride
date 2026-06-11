// GoRide Design Tokens
// Source: docs/Plan/08-UI-SPEC.md + GoRide CSS

export const colors = {
  // Primary
  primary: "#0CC25F",
  primaryPressed: "#0A9B4C",
  primaryLight: "#E8FBF0",

  // Error / Danger
  danger: "#E31D1C",
  dangerLight: "#FDE8E8",

  // Info / Auxiliary
  info: "#2E42A5",
  infoLight: "#EAECF6",

  // Background
  bgLight: "#F7FCFF",
  bgDark: "#181A20",

  // Surface
  surfaceLight: "#FFFFFF",
  surfaceElevatedDark: "#212121",
  darkSurface: "#121212",
  nearBlack: "#0F0F0F",

  // Border
  borderLight: "#DADADA",
  borderDark: "#35383F",

  // Text
  textPrimaryLight: "#212121",
  textPrimaryDark: "#FFFFFF",
  textSecondaryLight: "#6B7280",
  textSecondaryDark: "#9CA3AF",
  textDisabledLight: "#D1D5DB",
  textDisabledDark: "#555555",

  // Neutral greys (for hex replacements)
  white: "#FFFFFF",
  gray: "#666666",
  grayLight: "#888888",
  grayMedium: "#999999",

  // Admin / accent
  adminAccent: "#64B5F6",
  adminSubtle: "#E0E0E0",
  adminIconDark: "#3A3A3A",

  // Legacy GlideX colors (referenced until full re-theme)
  blue: "#0286FF",
  darkSecondary: "#1E1E22",
  darkSecondaryAlt: "#1F1F22",
  darkTabBar: "#262628",
  redVariant: "#DC2626",
  greenVariant: "#16A34A",
  slideGreen: "#0F9D58",
  lightGray: "#F0F0F0",
  lightGreenText: "#BBF7D0",
  lightRedText: "#FCA5A5",
  yellow: "#EDD228",
  mediumGray: "#AAAAAA",
  indigo: "#6366F1",
  black: "#000000",
  checkGreen: "#22C55E",
  amber: "#F59E0B",
  gray100: "#F5F5F5",
  gray200: "#E5E7EB",
  gray600: "#4B5563",
} as const;

export const fonts = {
  // TODO: Add Urbanist + Inter .ttf files to assets/fonts/ and update these
  // For now Jakarta (PlusJakartaSans) is the active font family
  heading: "Jakarta-Bold",
  body: "Jakarta-Regular",
  headingFallback: "Jakarta-Bold",
  bodyFallback: "Jakarta-Regular",
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  pill: 1000,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export const shadows = {
  card: {
    shadowColor: "rgba(24, 26, 32, 0.1)",
    shadowOffset: { width: 0, height: -32 },
    shadowRadius: 48,
    elevation: 8,
  },
  bottomSheet: {
    shadowColor: "rgba(24, 26, 32, 0.15)",
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export const button = {
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing["2xl"],
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700" as const,
    fontSize: 16,
  },
  disabled: {
    backgroundColor: colors.borderDark,
  },
} as const;

export const goRideTheme = {
  colors,
  fonts,
  radii,
  spacing,
  shadows,
  button,
};
