const path = require("path");

function packageRootFrom(projectRoot, packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`, { paths: [projectRoot] }));
}

/**
 * Expo + pnpm monorepo: watch workspace packages, resolve @taxi/* from packages/,
 * and pin react/react-native to the app copy (avoids duplicate React runtime).
 */
function applyMonorepoMetroConfig(config, projectRoot) {
  const monorepoRoot = path.resolve(projectRoot, "../..");

  config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])];

  const nodeModulesPaths = [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules")
  ];
  config.resolver.nodeModulesPaths = [
    ...new Set([...(config.resolver.nodeModulesPaths ?? []), ...nodeModulesPaths])
  ];

  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    react: packageRootFrom(projectRoot, "react"),
    "react-native": packageRootFrom(projectRoot, "react-native"),
    "@taxi/expo-theme": path.resolve(monorepoRoot, "packages/expo-theme"),
    "@taxi/expo-api-base": path.resolve(monorepoRoot, "packages/expo-api-base"),
    "@taxi/expo-push": path.resolve(monorepoRoot, "packages/expo-push"),
    "react-native-reanimated": path.resolve(monorepoRoot, "scripts/metro-stubs/react-native-reanimated"),
    "react-native-worklets": path.resolve(monorepoRoot, "scripts/metro-stubs/react-native-worklets")
  };

  // بعد بناء أندرويد محلي، Metro يحاول مراقبة android/build و.cxx ويفشل بـ ENOENT
  config.resolver.blockList = [
    ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
    /[/\\]android[/\\]build[/\\]/,
    /[/\\]\.cxx[/\\]/,
    /[/\\]node_modules[/\\]\.pnpm[/\\]react-native-reanimated@/,
    /[/\\]node_modules[/\\]\.pnpm[/\\]react-native-worklets@/
  ];

  const stubReanimated = path.resolve(
    monorepoRoot,
    "scripts/metro-stubs/react-native-reanimated/index.js"
  );
  const stubWorklets = path.resolve(monorepoRoot, "scripts/metro-stubs/react-native-worklets/index.js");
  const prevResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "react-native-reanimated" || moduleName.startsWith("react-native-reanimated/")) {
      return { type: "sourceFile", filePath: stubReanimated };
    }
    if (moduleName === "react-native-worklets" || moduleName.startsWith("react-native-worklets/")) {
      return { type: "sourceFile", filePath: stubWorklets };
    }
    if (typeof prevResolve === "function") {
      return prevResolve(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };

  return config;
}

module.exports = { applyMonorepoMetroConfig };
