# بناء APK محلي لتطبيقات Expo على Windows (coordinator | driver)
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("coordinator", "driver")]
  [string]$App,
  [switch]$NoVersionBump,
  # armeabi-v7a = أجهزة 32-bit قديمة؛ arm64-v8a = معظم الهواتف الحديثة
  [string]$Architectures = "armeabi-v7a,arm64-v8a"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$AppDir = Join-Path $RepoRoot "apps\$App-app"
$AndroidDir = Join-Path $AppDir "android"
$CmakeDir = "$env:LOCALAPPDATA\Android\Sdk\cmake"
$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$NdkVersion = "30.0.14904198"

Write-Host "==> App: $App"
Write-Host "==> Repo: $RepoRoot"

$bumpScript = Join-Path $PSScriptRoot "bump-android-local-version.cjs"
$versionInfo = $null
if (-not $NoVersionBump) {
  $versionInfo = node $bumpScript $App | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "==> Bumped to v$($versionInfo.version) (code $($versionInfo.versionCode))" -ForegroundColor Cyan
} else {
  $appJson = Get-Content (Join-Path $AppDir "app.json") -Raw | ConvertFrom-Json
  $versionInfo = [PSCustomObject]@{
    slug = $appJson.expo.slug
    version = $appJson.expo.version
    versionCode = $appJson.expo.android.versionCode
  }
  Write-Host "==> Version (no bump): $($versionInfo.version) (code $($versionInfo.versionCode))" -ForegroundColor Cyan
}

function Remove-NativeCaches {
  param([string]$Root)
  Write-Host "==> Cleaning native/build caches..."
  @(
    (Join-Path $AndroidDir "app\.cxx"),
    (Join-Path $AndroidDir "app\build"),
    (Join-Path $AndroidDir "build"),
    (Join-Path $AndroidDir ".gradle")
  ) | ForEach-Object {
    if (Test-Path $_) { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }
  }

  Get-ChildItem -Path (Join-Path $Root "node_modules\.pnpm") -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^(expo-modules-core|react-native-gesture-handler|react-native-screens|react-native-maps|react-native-safe-area-context|react-native@)" } |
    ForEach-Object {
      Get-ChildItem -Path $_.FullName -Filter ".cxx" -Directory -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue }
      Get-ChildItem -Path $_.FullName -Filter "build" -Directory -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '[/\\]android[/\\]build$' } |
        ForEach-Object { Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue }
    }

  Get-ChildItem -Path (Join-Path $Root "node_modules") -Filter ".cxx" -Directory -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue }
}

# CMake 3.22 (الافتراضي) لا يدعم CMAKE_OBJECT_PATH_MAX — مطلوب 3.26+
$cmakeOk = $false
if (Test-Path $CmakeDir) {
  Get-ChildItem $CmakeDir -Directory | ForEach-Object {
    $ver = [version]($_.Name -replace '[^\d\.]', '')
    if ($ver -ge [version]"3.26.0") {
      $cmakeOk = $true
      Write-Host "==> Found CMake $($_.Name)" -ForegroundColor Green
    }
  }
}
if (-not $cmakeOk) {
  Write-Host ""
  Write-Host "Installing CMake 3.31.6 via sdkmanager..." -ForegroundColor Yellow
  $sdkmanager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
  if (-not (Test-Path $sdkmanager)) {
    Write-Host "ERROR: Install CMake 3.31+ from Android Studio SDK Manager, or install Command-line Tools first." -ForegroundColor Red
    exit 1
  }
  if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
  }
  echo y | & $sdkmanager "cmake;3.31.6" | Out-Null
  if (Test-Path (Join-Path $CmakeDir "3.31.6")) { $cmakeOk = $true; Write-Host "==> Installed CMake 3.31.6" -ForegroundColor Green }
  if (-not $cmakeOk) { exit 1 }
}

$cmakeVersion = (Get-ChildItem $CmakeDir -Directory | ForEach-Object {
  $ver = [version]($_.Name -replace '[^\d\.]', '')
  if ($ver -ge [version]"3.26.0") { [PSCustomObject]@{ Name = $_.Name; Ver = $ver } }
} | Sort-Object Ver -Descending | Select-Object -First 1).Name

$sdkLine = "sdk.dir=" + ($SdkRoot -replace '\\', '/')
$cmakeLine = "cmake.dir=" + (($SdkRoot -replace '\\', '/') + "/cmake/$cmakeVersion")
Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value @($sdkLine, $cmakeLine) -Encoding UTF8
Write-Host "==> Using CMake $cmakeVersion, NDK $NdkVersion (from gradle.properties)"

$longPaths = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
if (-not $longPaths -or $longPaths.LongPathsEnabled -ne 1) {
  Write-Host "WARNING: Windows long paths disabled — CMake may fail on pnpm paths." -ForegroundColor Yellow
  Write-Host "  Run as Admin: Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled 1" -ForegroundColor Yellow
}

$CmakeBin = Join-Path $CmakeDir "$cmakeVersion\bin"
$env:PATH = "$CmakeBin;$env:PATH"
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:ANDROID_NDK_HOME = Join-Path $SdkRoot "ndk\$NdkVersion"
$env:NDK_ROOT = $env:ANDROID_NDK_HOME
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
  $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
}
$env:EXPO_PUBLIC_API_URL = if ($env:EXPO_PUBLIC_API_URL) { $env:EXPO_PUBLIC_API_URL } else { "https://taxi.qmenussy.com/api" }
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"

Remove-NativeCaches -Root $RepoRoot

try {
  Push-Location $AndroidDir
  .\gradlew.bat --stop 2>$null | Out-Null
  Write-Host "==> Architectures: $Architectures" -ForegroundColor Cyan
  .\gradlew.bat assembleRelease `
    "-PreactNativeArchitectures=$Architectures" `
    "-Dorg.gradle.parallel=false" `
    "-Dorg.gradle.workers.max=1" `
    --no-daemon `
    --no-build-cache
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

$apkSource = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSource)) {
  Write-Host "ERROR: APK not found at $apkSource" -ForegroundColor Red
  exit 1
}

$distDir = Join-Path $RepoRoot "dist\android"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$apkName = "$($versionInfo.slug)-v$($versionInfo.version)-$($versionInfo.versionCode).apk"
$apkDest = Join-Path $distDir $apkName
Copy-Item -Force $apkSource $apkDest

Write-Host ""
Write-Host "BUILD OK" -ForegroundColor Green
Write-Host "  APK: $apkSource" -ForegroundColor Green
Write-Host "  Copy: $apkDest" -ForegroundColor Green
Write-Host "  Version: $($versionInfo.version) (code $($versionInfo.versionCode))" -ForegroundColor Green
Write-Host "  ABIs: $Architectures" -ForegroundColor Green
Write-Host ""
Write-Host "Install tips:" -ForegroundColor Yellow
Write-Host "  - Uninstall any older copy of this app first (especially if signed with a different key)." -ForegroundColor Yellow
Write-Host "  - If install fails on old phones, rebuild includes armeabi-v7a for 32-bit ARM." -ForegroundColor Yellow
Write-Host "  - If the app crashes on open, connect USB and run: adb logcat *:E | findstr taxioffice" -ForegroundColor Yellow
