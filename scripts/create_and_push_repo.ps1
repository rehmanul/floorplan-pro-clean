<#
Create a new GitHub repository and push the current repo to it using the GitHub CLI.
Requires: gh (GitHub CLI) authenticated, git installed.

Usage:
  .\create_and_push_repo.ps1 -Name my-new-repo -Private

#>

param(
    [Parameter(Mandatory=$true)] [string] $Name,
    [switch] $Private,
    [string] $RemoteOrigin
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI 'gh' not found. Install it or create the repo manually."
    exit 2
}

$visibility = if ($Private) { 'private' } else { 'public' }

Write-Host "Creating GitHub repo '$Name' (visibility: $visibility) using gh..."

gh repo create $Name --$visibility --source=. --remote=origin --push --confirm

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create or push repo via gh."
    exit $LASTEXITCODE
}

if ($RemoteOrigin) {
    git remote set-url origin $RemoteOrigin
    git push -u origin HEAD
}

Write-Host "Repository created and pushed. If you used gh, open: https://github.com/$(gh api user --jq .login)/$Name"
