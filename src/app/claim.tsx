import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

// Placeholder; the claim flow lands in the next step.
export default function ClaimScreen() {
  const { asset } = useLocalSearchParams<{ asset?: string }>();
  return (
    <View style={{ padding: 16 }}>
      <Text>Claim {asset}</Text>
    </View>
  );
}
