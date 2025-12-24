param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test","uat","prod")]
    [string]$Environment,
    [switch]$Dev
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tauriConfigPath = Join-Path "src-tauri" "tauri.conf.json"
$tauriTemplatePath = Join-Path "src-tauri" "tauri.template.json"
$bundlePath = "src-tauri\target\release\bundle"
$script:tauriConfigApplied = $false

function Write-Section {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Ensure-TauriTemplate {
    if (-not (Test-Path $tauriTemplatePath)) {
        if (Test-Path $tauriConfigPath) {
            Copy-Item -LiteralPath $tauriConfigPath -Destination $tauriTemplatePath -Force
        } else {
            throw "Cannot locate tauri config template."
        }
    }
}

function Apply-TauriConfig {
    param(
        [string]$ProductName,
        [string]$BundleIdentifier
    )

    Ensure-TauriTemplate
    $json = Get-Content -LiteralPath $tauriTemplatePath -Raw | ConvertFrom-Json

    if ($ProductName) {
        $json.productName = $ProductName
    }
    if ($BundleIdentifier) {
        $json.identifier = $BundleIdentifier
    }

    $jsonString = $json | ConvertTo-Json -Depth 32
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $resolvedPath = Resolve-Path $tauriConfigPath
    [System.IO.File]::WriteAllText($resolvedPath, $jsonString, $utf8NoBom)
    $script:tauriConfigApplied = $true
}

function Restore-TauriConfig {
    if ($script:tauriConfigApplied -and (Test-Path $tauriTemplatePath)) {
        Copy-Item -LiteralPath $tauriTemplatePath -Destination $tauriConfigPath -Force
    }
}

function Show-Artifacts {
    param(
        [string]$Source,
        [string]$Glob
    )

    if (-not (Test-Path $Source)) {
        Write-Section ("[WARN] No artifacts in {0}" -f $Source) "Yellow"
        return
    }

    Get-ChildItem -Path $Source -Filter $Glob | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host ("   {0} ({1} MB)" -f $_.Name, $size)
        Write-Host ("     {0}" -f $_.FullName) -ForegroundColor Gray
    }
}

function Copy-Artifacts {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Glob,
        [string]$ProductName
    )

    if (-not (Test-Path $Source)) {
        return
    }

    Get-ChildItem -Path $Source -Filter $Glob | ForEach-Object {
        $newName = $_.Name
        if ($ProductName) {
            $basePrefix = ($_.BaseName -split "_")[0]
            if ($basePrefix) {
                $pattern = [regex]::Escape($basePrefix)
                $newName = [regex]::Replace($_.Name, $pattern, $ProductName, 1)
            }
        }

        $targetPath = Join-Path $Destination $newName
        Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
    }
}

function Rename-Artifacts {
    param(
        [string]$Source,
        [string]$Glob,
        [string]$ProductName
    )

    if (-not $ProductName -or -not (Test-Path $Source)) {
        return
    }

    Get-ChildItem -Path $Source -Filter $Glob | ForEach-Object {
        $basePrefix = ($_.BaseName -split "_")[0]
        if ($basePrefix -and $basePrefix -ne $ProductName) {
            $pattern = [regex]::Escape($basePrefix)
            $newName = [regex]::Replace($_.Name, $pattern, $ProductName, 1)
            if ($newName -ne $_.Name) {
                Rename-Item -LiteralPath $_.FullName -NewName $newName -Force
            }
        }
    }
}

Write-Section "====================================" "Green"
Write-Section "   Tauri Windows Build" "Green"
Write-Section "====================================" "Green"
Write-Host ""

$envFile = ".env.$Environment"
if (-not (Test-Path $envFile)) {
    Write-Section "[ERR] Missing environment file: $envFile" "Red"
    exit 1
}

Write-Section "[INFO] Loading $envFile" "Yellow"
$envMap = @{}

Get-Content -LiteralPath $envFile -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) {
        return
    }
    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
        return
    }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    $envMap[$name] = $value
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
    Write-Host ("   {0} = {1}" -f $name, $value)
}

Write-Host ""

Write-Section "[BUILD] Running npm run build..." "Yellow"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Section "[FAIL] npm run build failed" "Red"
    exit $LASTEXITCODE
}

Write-Host ""

Write-Section "[ENV] Details" "Cyan"
if ($envMap.ContainsKey("TAURI_ENV_NAME")) {
    Write-Host ("   Name      : {0}" -f $envMap["TAURI_ENV_NAME"])
}
if ($envMap.ContainsKey("TAURI_ENV_URL")) {
    Write-Host ("   URL       : {0}" -f $envMap["TAURI_ENV_URL"])
}
if ($envMap.ContainsKey("TAURI_ENV_KEY")) {
    Write-Host ("   Key       : {0}" -f $envMap["TAURI_ENV_KEY"])
}
if ($envMap.ContainsKey("TAURI_DEVTOOLS_ENABLED")) {
    $autoOpen = if ($envMap.ContainsKey("TAURI_DEVTOOLS_AUTO_OPEN")) { $envMap["TAURI_DEVTOOLS_AUTO_OPEN"] } else { "false" }
    Write-Host ("   DevTools  : {0} (AutoOpen: {1})" -f $envMap["TAURI_DEVTOOLS_ENABLED"], $autoOpen)
}
Write-Host ""

Write-Section "[INFO] Checking dependencies..." "Yellow"

try {
    $nodeVersion = (node --version).Trim()
    Write-Host ("   [OK] Node.js {0}" -f $nodeVersion)
} catch {
    Write-Section "[ERR] Node.js is not installed" "Red"
    exit 1
}

try {
    $rustVersion = (rustc --version).Trim()
    Write-Host ("   [OK] Rust {0}" -f $rustVersion)
} catch {
    Write-Section "[ERR] Rust is not installed" "Red"
    exit 1
}

Write-Host ""

try {
    Apply-TauriConfig -ProductName $envMap["TAURI_PRODUCT_NAME"] -BundleIdentifier $envMap["TAURI_BUNDLE_IDENTIFIER"]

    if ($Dev) {
        Write-Section "[DEV] Starting dev mode..." "Yellow"
        npm run tauri dev
        exit $LASTEXITCODE
    }

    Write-Section "[BUILD] Cleaning previous bundle..." "Yellow"
    if (Test-Path $bundlePath) {
        try {
            Remove-Item $bundlePath -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Section ("[WARN] Could not clean bundle: {0}" -f $_.Exception.Message) "Yellow"
        }
    }

    Write-Host ""
    Write-Section "[BUILD] Running npm run tauri build..." "Yellow"
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Section "[FAIL] Build failed" "Red"
        exit $LASTEXITCODE
    }

    Write-Host ""
    Write-Section "[OK] Build finished" "Green"

    $msiSource = Join-Path $bundlePath "msi"
    $nsisSource = Join-Path $bundlePath "nsis"
    $targetProductName = $envMap["TAURI_PRODUCT_NAME"]
    if (-not $targetProductName) {
        $targetProductName = "Backstage68"
    }

    Rename-Artifacts $msiSource "*.msi" $targetProductName
    Rename-Artifacts $nsisSource "*.exe" $targetProductName

    Write-Host ""
    Write-Section "[INFO] MSI artifacts" "Cyan"
    Show-Artifacts $msiSource "*.msi"

    Write-Host ""
    Write-Section "[INFO] NSIS artifacts" "Cyan"
    Show-Artifacts $nsisSource "*.exe"

    $distRoot = Join-Path "dist" $Environment
    if (Test-Path $distRoot) {
        Remove-Item $distRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $distRoot | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $distRoot "msi") | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $distRoot "nsis") | Out-Null

    $msiTarget = Join-Path $distRoot "msi"
    $nsisTarget = Join-Path $distRoot "nsis"

    Copy-Artifacts $msiSource $msiTarget "*.msi" $targetProductName
    Copy-Artifacts $nsisSource $nsisTarget "*.exe" $targetProductName

    Write-Host ""
    Write-Section ("[INFO] Copied installers to {0}" -f $distRoot) "Yellow"
}
finally {
    Restore-TauriConfig
}
