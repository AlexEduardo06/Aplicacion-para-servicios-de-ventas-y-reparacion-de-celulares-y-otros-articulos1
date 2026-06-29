export type ThemeMode = "light" | "dark";

const base = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
};

const lightColor = {
  surface: "#F9FAFB",
  onSurface: "#111827",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#111827",
  surfaceTertiary: "#F3F4F6",
  onSurfaceTertiary: "#374151",
  surfaceInverse: "#111827",
  onSurfaceInverse: "#FFFFFF",
  brand: "#047857",
  brandPrimary: "#047857",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D1FAE5",
  onBrandSecondary: "#065F46",
  brandTertiary: "#ECFDF5",
  onBrandTertiary: "#047857",
  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  warningSoft: "#FEF3C7",
  warningSoftBorder: "#FDE68A",
  warningSoftText: "#92400E",
  error: "#DC2626",
  onError: "#FFFFFF",
  errorSoft: "#FEE2E2",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#F3F4F6",
  muted: "#6B7280",
};

const darkColor: typeof lightColor = {
  surface: "#0B1220",
  onSurface: "#F3F4F6",
  surfaceSecondary: "#111827",
  onSurfaceSecondary: "#F3F4F6",
  surfaceTertiary: "#1F2937",
  onSurfaceTertiary: "#D1D5DB",
  surfaceInverse: "#F3F4F6",
  onSurfaceInverse: "#0B1220",
  brand: "#10B981",
  brandPrimary: "#10B981",
  onBrandPrimary: "#0B1220",
  brandSecondary: "#064E3B",
  onBrandSecondary: "#A7F3D0",
  brandTertiary: "#064E3B",
  onBrandTertiary: "#A7F3D0",
  success: "#34D399",
  onSuccess: "#0B1220",
  warning: "#F59E0B",
  onWarning: "#0B1220",
  warningSoft: "#3B2A0A",
  warningSoftBorder: "#78551B",
  warningSoftText: "#FCD34D",
  error: "#F87171",
  onError: "#0B1220",
  errorSoft: "#3F1212",
  border: "#1F2937",
  borderStrong: "#374151",
  divider: "#1F2937",
  muted: "#9CA3AF",
};

export type AppTheme = typeof base & { color: typeof lightColor };

export const lightTheme: AppTheme = { ...base, color: lightColor };
export const darkTheme: AppTheme = { ...base, color: darkColor };

export function getTheme(mode: ThemeMode): AppTheme {
  return mode === "dark" ? darkTheme : lightTheme;
}

// Default for files that still import { theme } statically (e.g. receipts/PDF)
export const theme = lightTheme;
