export const colors = {
  primary: "#0CC25F",
  primaryPressed: "#0AA84E",
  primaryLight: "#E6F7EE",

  danger: "#E31D1C",
  dangerPressed: "#C41A19",
  dangerLight: "#FDE8E8",

  success: "#38A169",
  successLight: "#F0FFF4",

  info: "#2E42A5",
  infoLight: "#EAECF6",

  bgLight: "#F8FAFC",
  bgDark: "#181A20",

  surfaceLight: "#FFFFFF",
  surfaceDark: "#181A20",
  surfaceElevatedDark: "#1C1E23",
  darkSurface: "#0F1115",
  nearBlack: "#0A0B0F",

  borderLight: "#E5E7EB",
  borderDark: "#35383F",

  textPrimaryLight: "#1C1E23",
  textPrimaryDark: "#FFFFFF",
  textSecondaryLight: "#6B7280",
  textSecondaryDark: "#9CA3AF",
  textDisabledLight: "#D1D5DB",
  textDisabledDark: "#555555",

  white: "#FFFFFF",
  black: "#000000",
  gray: "#666666",
  grayLight: "#888888",
  grayMedium: "#999999",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray600: "#4B5563",

  accent: "#0CC25F",
  accentPressed: "#0AA84E",
  accentLight: "#E6F7EE",
  surfaceElevated: "#1C1E23",
  borderDefault: "#35383F",
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
  checkGreen: "#22C55E",
  amber: "#F59E0B",

  adminAccent: "#64B5F6",
  adminSubtle: "#E0E0E0",
  adminIconDark: "#3A3A3A",
} as const;

// Surge / high-demand notice palette (Tailwind yellow scale — used by the
// confirm-ride surge banner; no generic yellow tokens exist in `colors`).
export const surge = {
  bg: { light: "#FEFCE8", dark: "rgba(113, 63, 18, 0.2)" },
  border: { light: "#FEF08A", dark: "#854D0E" },
  title: { light: "#A16207", dark: "#FACC15" },
  body: { light: "#CA8A04", dark: "#EAB308" },
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
    shadowColor: "#0CC25F",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  buttonDark: {
    shadowColor: "#0CC25F",
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
  surge,
};
