# Wrapper — استخدم build-android-local.ps1 مباشرة أو pnpm build:coordinator:android:local
& (Join-Path $PSScriptRoot "build-android-local.ps1") -App coordinator @args
