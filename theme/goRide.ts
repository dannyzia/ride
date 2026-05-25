// GoRide Design Tokens
// Source: docs/Plan/08-UI-SPEC.md + GoRide CSS

export const colors = {
  // Primary
  primary: '#0CC25F',
  primaryPressed: '#0A9B4C',
  primaryLight: '#E8FBF0',

  // Error / Danger
  danger: '#E31D1C',
  dangerLight: '#FDE8E8',

  // Info / Auxiliary
  info: '#2E42A5',
  infoLight: '#EAECF6',

  // Background
  bgLight: '#F7FCFF',
  bgDark: '#181A20',

  // Surface
  surfaceLight: '#FFFFFF',
  surfaceElevatedDark: '#212121',

  // Border
  borderLight: '#DADADA',
  borderDark: '#35383F',

  // Text
  textPrimaryLight: '#212121',
  textPrimaryDark: '#FFFFFF',
  textSecondaryLight: '#6B7280',
  textSecondaryDark: '#9CA3AF',
  textDisabledLight: '#D1D5DB',
  textDisabledDark: '#555555',
} as const;

export const fonts = {
  heading: 'Urbanist',
  body: 'Inter',
  // Fallback — Jakarta is what's actually bundled
  headingFallback: 'Jakarta',
  bodyFallback: 'Jakarta',
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  pill: 1000,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const shadows = {
  card: {
    shadowColor: 'rgba(24, 26, 32, 0.1)',
    shadowOffset: { width: 0, height: -32 },
    shadowRadius: 48,
    elevation: 8,
  },
  bottomSheet: {
    shadowColor: 'rgba(24, 26, 32, 0.15)',
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
    paddingHorizontal: spacing['2xl'],
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700' as const,
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
