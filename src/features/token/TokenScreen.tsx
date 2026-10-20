import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ApiError, createApi } from "@/api/client";
import { Button } from "@/ui/Button";
import { colors, space } from "@/ui/theme";

type Props = {
  message: string | null;
  onSave: (token: string) => void;
  onCancel?: () => void;
};

export function TokenScreen({ message, onSave, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const candidate = value.trim();
    if (!candidate) {
      setError("Paste your API token.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await createApi({ token: candidate, onUnauthorized: () => {} }).getBalances();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setChecking(false);
        setError("This token was rejected (invalid or expired).");
        return;
      }
      // Couldn't check it right now (network, server). Keep it; the home screen shows the error and a retry.
    }
    onSave(candidate);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CashMine</Text>
      <Text style={styles.subtitle}>
        Enter the API token from your task email. It is stored only in this browser and you can change it
        later.
      </Text>
      {message && <Text style={styles.warning}>{message}</Text>}
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder="API token"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        style={styles.input}
        accessibilityLabel="API token"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={checking ? "Checking…" : "Save token"} onPress={submit} loading={checking} />
      {onCancel && <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={checking} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.md },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  warning: {
    color: colors.warning,
    backgroundColor: colors.warningBg,
    padding: space.md,
    borderRadius: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 16,
    backgroundColor: colors.card,
    color: colors.text,
  },
  error: { color: colors.danger },
});
