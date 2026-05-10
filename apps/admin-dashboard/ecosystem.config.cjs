/**
 * تشغيل داشبورد الأدمن عبر PM2 من جذر المونوريبو (pnpm workspace).
 *
 *   cd /var/www/taxi-systim
 *   pnpm --filter @taxi/admin-dashboard run build
 *   pm2 start apps/admin-dashboard/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");

module.exports = {
  apps: [
    {
      name: "taxi-admin",
      cwd: repoRoot,
      script: "pnpm",
      args: "--filter @taxi/admin-dashboard run start:prod",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
