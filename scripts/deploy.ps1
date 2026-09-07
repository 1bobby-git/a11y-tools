# Publishes only to the existing, user-designated repository. Never creates a repo or force-pushes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$Repo = '1bobby-git/a11y-tools'
$PageUrl = 'https://1bobby-git.github.io/a11y-tools/'
$Checkout = Join-Path ([IO.Path]::GetTempPath()) ('a11y-publish-' + [Guid]::NewGuid().ToString('N'))

function Run-Native([string]$Program, [string[]]$ArgumentList) {
  & $Program @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
}
function Read-Native([string]$Program, [string[]]$ArgumentList) {
  $OldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $Output = & $Program @ArgumentList 2>&1
    $Code = $LASTEXITCODE
    return [pscustomobject]@{ Code=$Code; Text=($Output | Out-String).Trim() }
  } finally { $ErrorActionPreference = $OldPreference }
}
function Read-Json([string[]]$ArgumentList) {
  $Result = Read-Native 'gh' $ArgumentList
  if ($Result.Code -ne 0) { throw $Result.Text }
  return ($Result.Text | ConvertFrom-Json)
}
try {
  Write-Host "Publish to EXISTING repository: $Repo" -ForegroundColor Cyan
  foreach ($Tool in @('git','gh')) {
    if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) {
      throw "Missing $Tool. Install Git and GitHub CLI, then reopen this script. No token needs to be pasted into a file or chat."
    }
  }
  $Auth = Read-Native 'gh' @('auth','status','--hostname','github.com')
  if ($Auth.Code -ne 0) {
    Run-Native 'gh' @('auth','login','--hostname','github.com','--git-protocol','https','--web','--scopes','workflow')
  }
  $User = Read-Json @('api','user')
  if ($User.login -ne '1bobby-git') { throw "Authenticated as $($User.login), expected 1bobby-git. Switch GitHub CLI accounts before publishing." }
  $Remote = Read-Json @('api',"repos/$Repo")
  if ($Remote.full_name -cne $Repo -or $Remote.archived -or -not $Remote.permissions.push) {
    throw 'The repository is missing, archived, or not writable by the authenticated account.'
  }
  if ($Remote.private) { throw 'The designated repository is expected to be public. Its visibility will not be changed automatically.' }
  if ($Remote.default_branch -ne 'main') { throw 'The repository default branch is not main. Stop rather than modify another branch.' }
  Write-Host "Target URL after deployment: $PageUrl"
  if ((Read-Host 'Type PUBLISH to upload this source and configure GitHub Pages') -cne 'PUBLISH') {
    throw 'Cancelled before remote changes.'
  }

  # Credentials are supplied by gh per command; global git settings are left untouched.
  $GitAuth = @('-c','credential.helper=','-c','credential.helper=!gh auth git-credential')
  Run-Native 'git' ($GitAuth + @('clone',"https://github.com/$Repo.git",$Checkout))
  Set-Location $Checkout
  $Head = Read-Native 'git' @('rev-parse','--verify','HEAD')
  if ($Head.Code -eq 0) {
    if (-not (Test-Path 'package.json')) { throw 'Non-empty repository is not this app. No files were changed remotely.' }
    $Existing = Get-Content 'package.json' -Raw | ConvertFrom-Json
    if ($Existing.name -notin @('a11y-tools','web-accessibility-studio')) {
      throw 'Existing project identity does not match. No files were changed remotely.'
    }
    Run-Native 'git' @('checkout','main')
  } else {
    Run-Native 'git' @('symbolic-ref','HEAD','refs/heads/main')
  }
  # Copy only known source files, excluding reports, credentials, and generated screenshots.
  $Paths = @('.github','.gitignore','CHANGELOG.md','DEPLOYMENT.md','DEPLOY-WINDOWS.cmd','LICENSE','README.md','SECURITY.md','START-LOCAL.cmd','VERIFICATION.md','docs','extension','package.json','public','scripts','tests')
  foreach ($Relative in $Paths) {
    $Source = Join-Path $Root $Relative
    if (-not (Test-Path $Source)) { throw "Missing package item: $Relative" }
    if (Test-Path $Source -PathType Container) {
      foreach ($File in Get-ChildItem -LiteralPath $Source -Recurse -File -Force) {
        $Within = $File.FullName.Substring($Root.Length + 1)
        if ($Within -match '^tests[\\/]artifacts[\\/]' -or $Within -match '[\\/]__pycache__[\\/]') { continue }
        $Destination = Join-Path $Checkout $Within
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item -LiteralPath $File.FullName -Destination $Destination -Force
      }
    } else { Copy-Item -LiteralPath $Source -Destination (Join-Path $Checkout $Relative) -Force }
  }
  Run-Native 'git' @('config','--local','user.name',[string]$User.login)
  Run-Native 'git' @('config','--local','user.email',"$($User.id)+$($User.login)@users.noreply.github.com")
  Run-Native 'git' (@('add','--') + $Paths)
  $Diff = Read-Native 'git' @('diff','--cached','--quiet')
  if ($Diff.Code -eq 1) { Run-Native 'git' @('commit','-m','feat: publish accessibility studio on a11y-tools Pages') }
  elseif ($Diff.Code -ne 0) { throw 'Unable to inspect staged changes.' }
  Run-Native 'git' ($GitAuth + @('push','-u','origin','main'))
  $Commit = (Read-Native 'git' @('rev-parse','HEAD')).Text

  # Push can start a workflow before Pages is enabled. Explicitly dispatch again after setup.
  $Pages = Read-Native 'gh' @('api',"repos/$Repo/pages")
  if ($Pages.Code -eq 0) { $Method = 'PUT' }
  elseif ($Pages.Text -match '404') { $Method = 'POST' }
  else { throw "Cannot read Pages settings: $($Pages.Text)" }
  $Payload = Join-Path ([IO.Path]::GetTempPath()) ('a11y-pages-' + [Guid]::NewGuid().ToString('N') + '.json')
  try {
    [IO.File]::WriteAllText($Payload,'{"build_type":"workflow"}',[Text.UTF8Encoding]::new($false))
    Run-Native 'gh' @('api',"repos/$Repo/pages",'--method',$Method,'--input',$Payload)
  } finally { if (Test-Path $Payload) { Remove-Item -LiteralPath $Payload } }
  Run-Native 'gh' @('repo','edit',$Repo,'--homepage',$PageUrl)
  Run-Native 'gh' @('workflow','run','pages.yml','--repo',$Repo,'--ref','main')
  $RunId = ''
  for ($Attempt=0; $Attempt -lt 20; $Attempt++) {
    $Runs = Read-Native 'gh' @('run','list','--repo',$Repo,'--workflow','pages.yml','--event','workflow_dispatch','--commit',$Commit,'--limit','1','--json','databaseId','--jq','.[0].databaseId // empty')
    if ($Runs.Code -eq 0 -and $Runs.Text -match '^\d+$') { $RunId=$Runs.Text; break }
    Start-Sleep -Seconds 3
  }
  if (-not $RunId) { throw "The workflow was requested, but its run ID was not found. Check https://github.com/$Repo/actions. This is not a verified deployment." }
  Run-Native 'gh' @('run','watch',$RunId,'--repo',$Repo,'--exit-status')
  $Published = $false
  for ($Attempt=0; $Attempt -lt 30; $Attempt++) {
    try {
      $Info = Invoke-RestMethod -Uri ($PageUrl + "build-info.json?commit=$Commit&attempt=$Attempt") -TimeoutSec 10
      $Page = Invoke-WebRequest -Uri ($PageUrl + "?commit=$Commit") -UseBasicParsing -TimeoutSec 10
      if ($Info.sha -eq $Commit -and $Info.axeBundled -eq $true -and $Page.StatusCode -eq 200 -and $Page.Content -match 'ACCESSIBILITY STUDIO') {
        $Published=$true; break
      }
    } catch { }
    Start-Sleep -Seconds 5
  }
  if (-not $Published) { throw 'Actions succeeded, but the exact live commit was not verified. Check Pages and build-info.json before claiming success.' }
  Write-Host "Verified live commit $Commit at $PageUrl" -ForegroundColor Green
  Start-Process $PageUrl
} catch {
  Write-Host ('STOPPED: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'No repository is deleted or force-pushed. Some completed remote steps may remain; check Actions before retrying.'
  Write-Host 'If workflow files were rejected for missing scope, run: gh auth refresh --hostname github.com --scopes workflow'
  Write-Host "The temporary checkout is retained for diagnosis: $Checkout"
  exit 1
} finally { Set-Location $Root }
