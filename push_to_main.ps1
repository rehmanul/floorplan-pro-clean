<#
Interactive helper to commit current changes and push to remote main.
Run from repository root in PowerShell:

  powershell -ExecutionPolicy Bypass -File .\push_to_main.ps1

This script will prompt you for a safe merge (recommended) or a destructive force push.
You remain in control; the script will not proceed without confirmation.
#>

function Run-Git([string[]]$args) {
    $cmd = @('git') + $args
    Write-Host "==> git $($args -join ' ')" -ForegroundColor Cyan
    & git @args
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Git command failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "Push-to-main helper" -ForegroundColor Green
Write-Host "Repository root: $(Get-Location)" -ForegroundColor DarkGray

# Show current status
Run-Git @('rev-parse','--abbrev-ref','HEAD')
Write-Host "Current git status (porcelain):" -ForegroundColor Yellow
& git status --porcelain

Write-Host "\nRecommended: ensure you do NOT commit secrets (webhooks.db, .env files)." -ForegroundColor Magenta
$confirm = Read-Host "Proceed? (yes/no)"
if ($confirm -ne 'yes') { Write-Host 'Aborting.'; exit 0 }

# Ensure .gitignore contains common entries
$ignores = @('webhooks.db','uploads/','exports/','logs/','*.log','analysis_preview.json','post_floorplan.json','post_ilots_response.json','post_preview.json','workspace_*.json','public/threeRenderer_served.js')
$gitignorePath = Join-Path -Path (Get-Location) -ChildPath '.gitignore'
if (-not (Test-Path $gitignorePath)) { New-Item -Path $gitignorePath -ItemType File -Force | Out-Null }

$content = Get-Content $gitignorePath -Raw
$addedAny = $false
foreach ($e in $ignores) {
    if ($content -notmatch [regex]::Escape($e)) {
        Add-Content -Path $gitignorePath -Value $e
        $addedAny = $true
    }
}
if ($addedAny) { Write-Host 'Updated .gitignore with recommended entries.' -ForegroundColor Green; Run-Git @('add','.gitignore'); Run-Git @('commit','-m','chore: ignore local db and workspace artifacts') } else { Write-Host '.gitignore already contains recommended entries.' }

Write-Host "\nChoose push mode:" -ForegroundColor Cyan
Write-Host "1) Safe merge: merge current branch into main and push main (recommended)"
Write-Host "2) Force push: overwrite remote main with current branch (destructive)"
$mode = Read-Host "Enter 1 or 2"
if ($mode -ne '1' -and $mode -ne '2') { Write-Host 'Invalid choice, aborting.'; exit 1 }

# Stage all and commit local changes (if any)
Run-Git @('add','-A')
& git commit -m "chore: commit workspace and deployment changes"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'No changes to commit.' -ForegroundColor Yellow
}

Run-Git @('fetch','origin','--prune')

if ($mode -eq '1') {
    Write-Host 'Performing safe merge: updating local main then merging current branch.' -ForegroundColor Green
    Run-Git @('checkout','main')
    # Pull remote main (non-fatal if it fails because branch doesn't exist)
    & git pull origin main
    if ($LASTEXITCODE -ne 0) { Write-Host 'Warning: git pull returned non-zero (branch may not exist remotely). Continuing...' -ForegroundColor Yellow }

    Run-Git @('checkout','-')
    $current = (& git rev-parse --abbrev-ref HEAD).Trim()
    Write-Host "Merging branch $current into main..." -ForegroundColor Cyan
    Run-Git @('checkout','main')
    & git merge --no-ff $current -m "chore: merge $current -> main (deployment)"
    if ($LASTEXITCODE -ne 0) { Write-Host 'Merge failed or had conflicts. Resolve conflicts and run git commit, then push.' -ForegroundColor Red; exit $LASTEXITCODE }

    Write-Host 'Pushing main to origin...' -ForegroundColor Green
    Run-Git @('push','origin','main')
    Write-Host 'Push complete.' -ForegroundColor Green
    exit 0
}

if ($mode -eq '2') {
    Write-Host 'Force pushing current branch to remote main (destructive).' -ForegroundColor Red
    $confirm2 = Read-Host "Are you absolutely sure? Type 'FORCE' to proceed"
    if ($confirm2 -ne 'FORCE') { Write-Host 'Confirmation not received. Aborting.'; exit 1 }

    $current = (& git rev-parse --abbrev-ref HEAD).Trim()
    Write-Host "Force pushing branch $current to origin/main..." -ForegroundColor Red
    Run-Git @('push','origin',"+$current:main")
    Write-Host 'Force push complete.' -ForegroundColor Green
    exit 0
}
