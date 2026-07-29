export const colors = {
  primary: "#0A9B4C",
  primaryPressed: "#08843E",
  primaryLight: "#E6F7EE",

  danger: "#E31D1C",
  dangerPressed: "#C41A19",
  dangerLight: "#FDE8E8",

  info: "#2E42A5",
  infoLight: "#EAECF6",

  bgLight: "#F8FAFC",
  bgDark: "#0F1115",

  surfaceLight: "#FFFFFF",
  surfaceElevatedDark: "#1C1E23",
  darkSurface: "#0F1115",
  nearBlack: "#0A0B0F",

  borderLight: "#D1D5DB",
  borderDark: "#2E3038",

  textPrimaryLight: "#1C1E23",
  textPrimaryDark: "#F0F1F5",
  textSecondaryLight: "#6B7280",
  textSecondaryDark: "#9CA3AF",
  textDisabledLight: "#D1D5DB",
  textDisabledDark: "#555555",

  white: "#FFFFFF",
  gray: "#666666",
  grayLight: "#888888",
  grayMedium: "#999999",
  gray100: "#F3F4F6",

  adminAccent: "#64B5F6",
  adminSubtle: "#E0E0E0",
  adminIconDark: "#3A3A3A",

  blue: "#0286FF",
  darkSecondary: "#1A1C22",
  darkSecondaryAlt: "#1C1E23",
  darkTabBar: "#22242A",
  redVariant: "#DC2626",
  greenVariant: "#16A34A",
  slideGreen: "#0F9D58",
  lightGray: "#EEF0F3",
  lightGreenText: "#BBF7D0",
  lightRedText: "#FCA5A5",
  yellow: "#EDD228",
  mediumGray: "#AAAAAA",
  indigo: "#6366F1",
  black: "#000000",
  checkGreen: "#22C55E",
  amber: "#F59E0B",
  gray200: "#E5E7EB",
  gray600: "#4B5563",

  accentLight: "#E6F7EE",
  accentPressed: "#08843E",
  accent: "#0A9B4C",
  surfaceElevated: "#1C1E23",
  borderDefault: "#2E3038",
} as const;

export const fonts = {
  heading: "Jakarta-Bold",
  headingSemi: "Jakarta-SemiBold",
  headingMedium: "Jakarta-Medium",
  body: "Jakarta-Regular",
  bodyMedium: "Jakarta-Medium",
  bodyBold: "Jakarta-Bold",
} as const;

export const typography = {
  "4xl": 36,
  "3xl": 30,
  "2xl": 24,
  xl: 20,
  lg: 18,
  base: 16,
  sm: 14,
  xs: 12,
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 34,
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
  cardLight: {
    shadowColor: "rgba(0, 0, 0, 0.06)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  cardDark: {
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  buttonLight: {
    shadowColor: "#0A9B4C",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  buttonDark: {
    shadowColor: "#0A9B4C",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  bottomSheet: {
    shadowColor: "rgba(0, 0, 0, 0.15)",
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

export const goRideTheme = {
  colors,
  fonts,
  typography,
  radii,
  spacing,
  shadows,
};
