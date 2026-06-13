/**
 * يتحقق قبل EAS build أن google-services.json موجود و package_name صحيح.
 * الاستخدام: node scripts/verify-google-services.cjs apps/driver-app
 */
const fs = require("fs");
const path = require("path");

const appRel = process.argv[2];
if (!appRel) {
  console.error("[verify-google-services] Usage: node scripts/verify-google-services.cjs apps/driver-app");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.resolve(repoRoot, appRel);
const appJsonPath = path.join(appDir, "app.json");
const gsPath = path.join(appDir, "google-services.json");

if (!fs.existsSync(appJsonPath)) {
  console.error(`[verify-google-services] app.json not found: ${appJsonPath}`);
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const expectedPackage = appJson.expo?.android?.package;
const gsRef = appJson.expo?.android?.googleServicesFile;

if (!expectedPackage) {
  console.error("[verify-google-services] expo.android.package missing in app.json");
  process.exit(1);
}

if (!gsRef) {
  console.error("[verify-google-services] expo.android.googleServicesFile missing in app.json");
  process.exit(1);
}

const resolvedGs = path.resolve(appDir, gsRef.replace(/^\.\//, ""));

if (!fs.existsSync(resolvedGs)) {
  console.error("");
  console.error("══════════════════════════════════════════════════════════════");
  console.error("  google-services.json غير موجود — Push لن يعمل بدونه");
  console.error("══════════════════════════════════════════════════════════════");
  console.error("");
  console.error(`  المسار المتوقع: ${resolvedGs}`);
  console.error(`  Package name:   ${expectedPackage}`);
  console.error("");
  console.error("  هذا ملف مختلف عن firebase-adminsdk-*.json:");
  console.error("  • adminsdk JSON  → يرفع إلى EAS credentials (FCM V1) فقط");
  console.error("  • google-services.json → ينزّل من Firebase Console ويُوضَع هنا");
  console.error("");
  console.error("  Firebase Console → Project settings → Your apps → Android");
  console.error(`  → Add app (package: ${expectedPackage}) → Download google-services.json`);
  console.error("");
  process.exit(1);
}

let gs;
try {
  gs = JSON.parse(fs.readFileSync(resolvedGs, "utf8"));
} catch {
  console.error(`[verify-google-services] Invalid JSON: ${resolvedGs}`);
  process.exit(1);
}

const clients = Array.isArray(gs.client) ? gs.client : [];
const packages = clients
  .map((c) => c?.client_info?.android_client_info?.package_name)
  .filter(Boolean);

if (!packages.includes(expectedPackage)) {
  console.error("");
  console.error("[verify-google-services] package_name mismatch in google-services.json");
  console.error(`  app.json expects: ${expectedPackage}`);
  console.error(`  file contains:    ${packages.join(", ") || "(none)"}`);
  console.error("  Download the correct google-services.json from Firebase for this package.");
  console.error("");
  process.exit(1);
}

console.info(`[verify-google-services] OK — ${path.relative(repoRoot, resolvedGs)} → ${expectedPackage}`);
