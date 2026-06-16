/**
 * يزيد versionCode و versionName قبل كل بناء APK محلي.
 * الاستخدام: node scripts/bump-android-local-version.cjs coordinator|driver
 */
const fs = require("fs");
const path = require("path");

const app = process.argv[2];
if (!app || !["coordinator", "driver"].includes(app)) {
  console.error("Usage: node bump-android-local-version.cjs <coordinator|driver>");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "apps", `${app}-app`);
const appJsonPath = path.join(appDir, "app.json");
const gradlePath = path.join(appDir, "android", "app", "build.gradle");
const packageJsonPath = path.join(appDir, "package.json");

if (!fs.existsSync(appJsonPath) || !fs.existsSync(gradlePath)) {
  console.error(`Missing app.json or android/app/build.gradle for ${app}`);
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const currentCode = Number(appJson.expo?.android?.versionCode ?? 0);
const nextCode = Number.isFinite(currentCode) && currentCode > 0 ? currentCode + 1 : 1;

const baseVersion = String(appJson.expo?.version ?? "1.0.0");
const parts = baseVersion.split(".");
const major = parts[0] || "1";
const minor = parts[1] || "0";
const nextVersion = `${major}.${minor}.${nextCode}`;

appJson.expo.version = nextVersion;
if (!appJson.expo.android) appJson.expo.android = {};
appJson.expo.android.versionCode = nextCode;
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, "utf8");

let gradle = fs.readFileSync(gradlePath, "utf8");
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]+"/.test(gradle)) {
  console.error("Could not find versionCode/versionName in build.gradle");
  process.exit(1);
}
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${nextVersion}"`);
fs.writeFileSync(gradlePath, gradle, "utf8");

if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

const slug = appJson.expo?.slug ?? app;
const result = { app, slug, version: nextVersion, versionCode: nextCode };
process.stdout.write(JSON.stringify(result));
