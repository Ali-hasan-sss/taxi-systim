/**
 * يُستدعى من apps/api بعد التثبيت. أثناء بناء تطبيق المنسق على EAS يُضبط SKIP_PRISMA_POSTINSTALL
 * لتجنّب فشل prisma generate في بيئة لا تحتاج تشغيل الـ API.
 */
const { spawnSync } = require("child_process");
const path = require("path");

if (process.env.SKIP_PRISMA_POSTINSTALL === "1") {
  console.log("[api] تخطّي prisma generate (SKIP_PRISMA_POSTINSTALL=1)");
  process.exit(0);
}

const apiRoot = path.resolve(__dirname, "..");
const result = spawnSync("pnpm", ["exec", "prisma", "generate"], {
  cwd: apiRoot,
  stdio: "inherit",
  shell: true,
  env: process.env
});

process.exit(result.status ?? 1);
