import { Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TokenProvider, useSession } from "@/features/token/TokenProvider";
import { colors, MAX_CONTENT_WIDTH } from "@/ui/theme";

export default function RootLayout() {
  return (
    <View style={styles.page}>
      <View style={styles.app}>
        <TokenProvider>
          <AppStack />
        </TokenProvider>
      </View>
    </View>
  );
}

function AppStack() {
  const { changeToken } = useSession();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => (
          <Pressable accessibilityRole="button" onPress={changeToken} hitSlop={12}>
            <Text style={styles.headerLink}>Token</Text>
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Payback" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.border, alignItems: "center" },
  app: { flex: 1, width: "100%", maxWidth: MAX_CONTENT_WIDTH, backgroundColor: colors.background },
  headerLink: { color: colors.primary, fontSize: 16, fontWeight: "600", paddingHorizontal: 8 },
});
