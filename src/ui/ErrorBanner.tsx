import { StyleSheet, Text, View } from "react-native";

import { Button } from "./Button";
import { colors, space } from "./theme";

type Props = { message: string; onRetry?: () => void; retrying?: boolean };

export function ErrorBanner({ message, onRetry, retrying }: Props) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
      {onRetry && <Button title="Retry" variant="secondary" onPress={onRetry} loading={retrying} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.dangerBg, borderRadius: 12, padding: space.md, gap: space.sm },
  text: { color: colors.danger, fontSize: 15 },
});
