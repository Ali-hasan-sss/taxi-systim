# بناء APK محلي لتطبيقات Expo على Windows (coordinator | driver)
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("coordinator", "driver")]
  [string]$App
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $RepoRoot "apps\$App-app\android"
$CmakeDir = "$env:LOCALAPPDATA\Android\Sdk\cmake"

Write-Host "==> App: $App"
Write-Host "==> Repo: $RepoRoot"

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
  $sdk = "$env:LOCALAPPDATA\Android\Sdk"
  $sdkmanager = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"
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

$localProps = Join-Path $AndroidDir "local.properties"
$sdkLine = "sdk.dir=C\:/Users/pc/AppData/Local/Android/Sdk"
$cmakeLine = "cmake.dir=C\:/Users/pc/AppData/Local/Android/Sdk/cmake/$cmakeVersion"
Set-Content -Path $localProps -Value @($sdkLine, $cmakeLine) -Encoding UTF8
Write-Host "==> Using CMake $cmakeVersion"

# Windows MAX_PATH (260) — مسارات pnpm المعزولة أطول من الحد
$longPaths = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
if (-not $longPaths -or $longPaths.LongPathsEnabled -ne 1) {
  Write-Host "WARNING: Windows long paths disabled. Enable via:" -ForegroundColor Yellow
  Write-Host "  gpedit.msc -> Computer Config -> Admin Templates -> System -> Filesystem -> Enable Win32 long paths" -ForegroundColor Yellow
  Write-Host "  Or run as Admin: Set-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled 1" -ForegroundColor Yellow
}

# Ninja 1.10.x (مع CMake 3.22) يسبب "build.ninja still dirty" على Windows — ننسخ 1.12.1+
$newNinja = Join-Path $CmakeDir "$cmakeVersion\bin\ninja.exe"
if (Test-Path $newNinja) {
  Get-ChildItem $CmakeDir -Directory | ForEach-Object {
    $oldNinja = Join-Path $_.FullName "bin\ninja.exe"
    if ((Test-Path $oldNinja) -and ($_.Name -ne $cmakeVersion)) {
      $ver = (& $oldNinja --version 2>$null)
      if ($ver -and ([version]$ver -lt [version]"1.12.0")) {
        Copy-Item -Force $newNinja $oldNinja
        Write-Host "==> Patched ninja in CMake $($_.Name) -> 1.12+" -ForegroundColor Yellow
      }
    }
  }
}

$CmakeBin = Join-Path $CmakeDir "$cmakeVersion\bin"
$env:PATH = "$CmakeBin;$env:PATH"

Write-Host "==> Cleaning native/build caches (skip gradlew clean — يفشل بدون codegen)..."
@(
  (Join-Path $AndroidDir "app\.cxx"),
  (Join-Path $AndroidDir "app\build"),
  (Join-Path $AndroidDir "build"),
  (Join-Path $AndroidDir ".gradle")
) | ForEach-Object {
  if (Test-Path $_) { Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue }
}

# Gradle 8.14 + pnpm: ملفات build داخل node_modules تسبب "Failed to normalize BuildConfig.java"
Get-ChildItem -Path (Join-Path $RepoRoot "node_modules\.pnpm") -Filter "build" -Directory -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '[/\\]android[/\\]build$' } |
  ForEach-Object {
    Write-Host "==> Removing stale: $($_.FullName)" -ForegroundColor DarkGray
    Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
  }

Get-ChildItem -Path (Join-Path $RepoRoot "node_modules") -Filter ".cxx" -Directory -Recurse -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue }

$env:EXPO_PUBLIC_API_URL = if ($env:EXPO_PUBLIC_API_URL) { $env:EXPO_PUBLIC_API_URL } else { "https://taxi.qmenussy.com/api" }
# Expo 54 في monorepo: بدون هذا يحلّ Metro من جذر المونوريبو بدل apps/<app>-app
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"

Push-Location $AndroidDir
try {
  .\gradlew.bat --stop 2>$null | Out-Null
  .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a "-Dorg.gradle.parallel=false" --no-daemon --no-build-cache
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host ""
  Write-Host "BUILD OK: $AndroidDir\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Green
} finally {
  Pop-Location
}
