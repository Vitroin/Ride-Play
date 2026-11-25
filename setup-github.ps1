# One-time setup (Windows): creates the GitHub repo, pushes the code, turns on GitHub Pages.
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup-github.ps1 [-Repo moto-dash]
param([string]$Repo = "moto-dash")
# "Continue": in Windows PowerShell 5.1, "Stop" turns gh/git stderr output into fatal errors.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "Install Git first: https://git-scm.com/downloads"; exit 1 }
if (-not (Get-Command gh  -ErrorAction SilentlyContinue)) { Write-Host "Install GitHub CLI first: winget install GitHub.cli"; exit 1 }
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { gh auth login --web --git-protocol https }

$User = gh api user -q .login
Write-Host "-> GitHub account: $User"

if (-not (Test-Path .git)) { git init -q -b main }
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -qm "RidePlay" }
git branch -M main

gh repo view "$User/$Repo" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host "-> Repo exists, pushing"
  git remote get-url origin 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { git remote add origin "https://github.com/$User/$Repo.git" }
  git push -u origin main
} else {
  Write-Host "-> Creating public repo $Repo"
  gh repo create $Repo --public --source . --remote origin --push
}

Write-Host "-> Turning on GitHub Pages (deploys via GitHub Actions)"
gh api -X POST "repos/$User/$Repo/pages" -f build_type=workflow 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { gh api -X PUT "repos/$User/$Repo/pages" -f build_type=workflow 2>$null | Out-Null }
gh workflow run deploy.yml -R "$User/$Repo" 2>$null | Out-Null

$Url = "https://$($User.ToLower()).github.io/$Repo/"
Write-Host ""
Write-Host "Done. In about a minute the app is live at:"
Write-Host "   $Url"
Write-Host ""
Write-Host " 1. Spotify dashboard -> your app -> Redirect URI:  $Url"
Write-Host " 2. Open $Url in Safari on your iPhone -> Share -> Add to Home Screen"
Write-Host " 3. Open it from the Home Screen -> Setup & API keys -> paste keys -> Log in"
Write-Host ""
Write-Host "Watch the deploy: https://github.com/$User/$Repo/actions"
