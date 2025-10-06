<#
Automated Windows bootstrap for building better-sqlite3 and prerequisites.
Run this script as Administrator in PowerShell (ExecutionPolicy Bypass):

PowerShell -ExecutionPolicy Bypass -File .\scripts\setup_win_build_and_install_sqlite.ps1

This script will:
- ensure Python 3 is installed (via winget if available)
- download Visual Studio Build Tools bootstrapper and install the C++ workload (VCTools)
- set npm msvs_version to 2022
- attempt to build and install better-sqlite3 from source

Notes:
- The script attempts to do as much as possible unattended. In some environments the Visual Studio Installer GUI may appear or you may need to add the Windows 10 SDK (10.0.26100) manually via Visual Studio Installer.
#>

function Write-Log($msg) { Write-Host "[setup] $msg" }

function Ensure-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "This script must be run as Administrator. Please re-run PowerShell as Administrator." -ForegroundColor Yellow
        exit 2
    }
}

Ensure-Admin

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

Write-Log "Starting Windows build tool setup (this can take 10-30 minutes depending on downloads)."

# 1) Check for winget
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Log "winget not found. Please install App Installer / winget or run the Visual Studio Build Tools installer manually: https://visualstudio.microsoft.com/downloads/"
    Read-Host "Press Enter to continue when you've installed winget (or press Ctrl+C to abort)"
}

# 2) Ensure Python 3 is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue) -and -not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Log "Python not found. Installing Python 3 via winget..."
    winget install --id Python.Python.3 -e --accept-package-agreements --accept-source-agreements
} else {
    Write-Log "Python appears installed: $(if (Get-Command python -ErrorAction SilentlyContinue) { (python --version) } else { (py -3 --version) })"
}

# 3) Download Visual Studio Build Tools bootstrapper
$vsInstaller = "$env:TEMP\vs_buildtools.exe"
if (-not (Test-Path $vsInstaller)) {
    Write-Log "Downloading Visual Studio Build Tools bootstrapper..."
    $url = 'https://aka.ms/vs/17/release/vs_BuildTools.exe'
    Invoke-WebRequest -Uri $url -OutFile $vsInstaller -UseBasicParsing
} else { Write-Log "Using existing bootstrapper at $vsInstaller" }

# 4) Install C++ workload (VCTools) and recommended components
Write-Log "Launching Visual Studio Build Tools installer (will try to auto-install C++ workload). This may take a while."
$args = @(
    '--add', 'Microsoft.VisualStudio.Workload.VCTools',
    '--includeRecommended',
    '--quiet',
    '--wait',
    '--norestart'
)

try {
    $p = Start-Process -FilePath $vsInstaller -ArgumentList $args -Wait -PassThru -ErrorAction Stop
    Write-Log "Visual Studio Build Tools installer finished with exit code $($p.ExitCode)"
} catch {
    Write-Log "Visual Studio Build Tools installer failed to run silently. Please run the installer at $vsInstaller and add 'Desktop development with C++' workload and the Windows 10 SDK (10.0.26100) if available."
    Write-Log "When finished, re-run this script to continue. Aborting now."; exit 3
}

# 5) Ensure npm uses MSVC 2022
Write-Log "Configuring npm to use MSVC 2022 (msvs_version = 2022)"
npm config set msvs_version 2022

# 6) Attempt to build and install better-sqlite3
Write-Log "Attempting to build and install better-sqlite3 from source. This may run a long compilation step."
try {
    npm install --build-from-source --verbose better-sqlite3
} catch {
    Write-Log "npm install reported errors. See above output. It's likely the Windows SDK or MSVC components are missing."
}

# 7) Quick verification
Write-Log "Verifying require('better-sqlite3') in Node"
try {
    node -e "try { require('better-sqlite3'); console.log('OK'); } catch(e) { console.error('ERR', e && e.message); process.exit(2); }"
    if ($LASTEXITCODE -eq 0) { Write-Log "better-sqlite3 load succeeded." } else { Write-Log "better-sqlite3 load failed. Check installer logs above or ensure Windows SDK 10.0.26100 is installed." }
} catch {
    Write-Log "Verification failed; please inspect npm build logs above."
}

Write-Log "Done. If better-sqlite3 failed to build, open Visual Studio Installer and ensure 'Desktop development with C++' and Windows 10 SDK 10.0.26100 are installed, then re-run this script."
