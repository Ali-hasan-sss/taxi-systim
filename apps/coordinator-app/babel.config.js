module.exports = function (api) {
  api.cache.using(() => "no-reanimated-worklets");
  return {
    presets: [["babel-preset-expo", { reanimated: false, worklets: false }]]
  };
};
