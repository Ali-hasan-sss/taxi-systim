# Wrapper — استخدم build-android-local.ps1 مباشرة أو pnpm build:driver:android:local
& (Join-Path $PSScriptRoot "build-android-local.ps1") -App driver @args
