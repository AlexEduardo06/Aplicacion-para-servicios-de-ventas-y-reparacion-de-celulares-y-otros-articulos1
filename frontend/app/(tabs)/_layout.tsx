import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/lib/theme-context";
import { Platform } from "react-native";

export default function TabsLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brandPrimary,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          backgroundColor: theme.color.surfaceSecondary,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        sceneStyle: { backgroundColor: theme.color.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Caja",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-caja",
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          title: "Inventario",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="phone-portrait-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-inventario",
        }}
      />
      <Tabs.Screen
        name="reparaciones"
        options={{
          title: "Reparaciones",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-reparaciones",
        }}
      />
      <Tabs.Screen
        name="mas"
        options={{
          title: "Más",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />
          ),
          tabBarButtonTestID: "tab-mas",
        }}
      />
    </Tabs>
  );
}
