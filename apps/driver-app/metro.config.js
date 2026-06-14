// Expo 54 يحتاج expo-asset@12؛ تطبيق آخر في المونوريبو (Expo 51) يجرّ expo-asset@10.
// نفرض حلّ الحزمة الصحيح عبر resolveRequest + حظر نسخة 10 من الـ bundle.
const { createRequire } = require("module");
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { applyMonorepoMetroConfig } = require("../../scripts/metro-monorepo.cjs");

const projectRoot = __dirname;
const appRequire = createRequire(require.resolve("expo/package.json", { paths: [projectRoot] }));
const { resolve: metroDefaultResolve } = appRequire("metro-resolver");

const config = applyMonorepoMetroConfig(getDefaultConfig(projectRoot), projectRoot);

const expoAssetPkgJson = require.resolve("expo-asset/package.json", { paths: [projectRoot] });
const expoAssetRoot = path.dirname(expoAssetPkgJson);
const expoAssetVersion = require(expoAssetPkgJson).version;
if (!String(expoAssetVersion).startsWith("12.")) {
  // eslint-disable-next-line no-console
  console.warn(
    `[driver-app] expo-asset يجب أن يكون 12.x مع Expo 54 (الحالي: ${expoAssetVersion}).`
  );
}

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-asset") {
    return {
      type: "sourceFile",
      filePath: path.join(expoAssetRoot, "build", "index.js")
    };
  }
  if (moduleName.startsWith("expo-asset/")) {
    return {
      type: "sourceFile",
      filePath: path.join(expoAssetRoot, moduleName.slice("expo-asset/".length))
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return metroDefaultResolve(context, moduleName, platform);
};

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "expo-asset": expoAssetRoot
};

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  // لا تُحمَّل نسخة Expo 51 من expo-asset أبدًا داخل هذا التطبيق
  /[/\\]node_modules[/\\]\.pnpm[/\\]expo-asset@10[^/\\]*[/\\]node_modules[/\\]expo-asset[/\\]/
];

module.exports = config;
