import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

type Props = {
  label?: string;
  bubbleStyle: object;
  dotStyle: object;
  labelStyle?: object;
};

export function TypingIndicator({ label, bubbleStyle, dotStyle, labelStyle }: Props) {
  const a = useRef(new Animated.Value(0.35)).current;
  const b = useRef(new Animated.Value(0.35)).current;
  const c = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.35, duration: 320, useNativeDriver: true })
        ])
      );

    const loopA = pulse(a, 0);
    const loopB = pulse(b, 160);
    const loopC = pulse(c, 320);
    loopA.start();
    loopB.start();
    loopC.start();
    return () => {
      loopA.stop();
      loopB.stop();
      loopC.stop();
    };
  }, [a, b, c]);

  return (
    <View style={bubbleStyle}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Animated.View style={[dotStyle, { opacity: a }]} />
        <Animated.View style={[dotStyle, { opacity: b }]} />
        <Animated.View style={[dotStyle, { opacity: c }]} />
      </View>
    </View>
  );
}
