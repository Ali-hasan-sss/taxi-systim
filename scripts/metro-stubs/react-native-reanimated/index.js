function noop() {}

function createAnimatedComponent(component) {
  return component;
}

const Reanimated = {
  getUseOfValueInStyleWarning: noop,
  createAnimatedComponent,
  useSharedValue: (value) => ({ value }),
  useEvent: noop,
  useAnimatedStyle: (factory) => (typeof factory === "function" ? factory() : factory),
  useDerivedValue: (factory) => ({ value: typeof factory === "function" ? factory() : factory }),
  useAnimatedRef: () => ({ current: null }),
  withTiming: (value) => value,
  withSpring: (value) => value,
  withRepeat: (value) => value,
  withSequence: (value) => value,
  withDelay: (_delay, value) => value,
  Easing: { linear: noop, ease: noop, in: noop, out: noop, inOut: noop },
  interpolate: (value) => value,
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  setGestureState: noop,
  default: { createAnimatedComponent }
};

module.exports = Reanimated;
module.exports.default = Reanimated;
