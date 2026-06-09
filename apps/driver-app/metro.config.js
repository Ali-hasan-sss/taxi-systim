const { getDefaultConfig } = require("expo/metro-config");
const { applyMonorepoMetroConfig } = require("../../scripts/metro-monorepo.cjs");

const projectRoot = __dirname;

module.exports = applyMonorepoMetroConfig(getDefaultConfig(projectRoot), projectRoot);
