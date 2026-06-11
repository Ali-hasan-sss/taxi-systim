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
    "@taxi/expo-push": path.resolve(monorepoRoot, "packages/expo-push")
  };

  return config;
}

module.exports = { applyMonorepoMetroConfig };
