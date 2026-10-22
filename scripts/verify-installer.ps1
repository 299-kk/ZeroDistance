param([ValidateSet('Install','Uninstall')][string]$Mode, [Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$taskWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskQaRoot = [IO.Path]::GetFullPath((Join-Path $taskWorkspace '.qa')) + '\'
$taskTarget = [IO.Path]::GetFullPath($TestRoot)
if (!$taskTarget.StartsWith($taskQaRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer verification must stay within the QA workspace.' }
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskWorkspace 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$taskRegistryRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')
function Get-TaskInstallations { Get-ItemProperty -Path $taskRegistryRoots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'ZeroDistance' } }
function Get-TaskLocation($taskEntry) {
    if ($taskEntry.InstallLocation) { return [IO.Path]::GetFullPath($taskEntry.InstallLocation.TrimEnd('\')) }
    if ($taskEntry.DisplayIcon) {
        $taskIconFile = ($taskEntry.DisplayIcon -replace ',\d+$','').Trim('"')
        return [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($taskIconFile))
    }
    return $null
}
if ($Mode -eq 'Install') {
    $taskDesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZeroDistance.lnk'
    $taskStartMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'ZeroDistance.lnk'
    if ((Get-TaskInstallations) -or (Test-Path -LiteralPath $taskDesktopLink) -or (Test-Path -LiteralPath $taskStartMenuLink)) {
        @{ skipped=$true; reason='Existing installation or shortcut preserved.' } | ConvertTo-Json -Compress
        exit 0
    }
    if (Test-Path -LiteralPath $taskTarget) { throw 'QA installation target must be new.' }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskTarget)) -Force | Out-Null
    $taskInstaller = Join-Path $taskWorkspace ('release\ZeroDistance-' + $taskVersion + '-Setup.exe')
    $taskProcess = Start-Process -FilePath $taskInstaller -ArgumentList ('/S /currentuser --no-desktop-shortcut /D=' + $taskTarget) -WindowStyle Hidden -PassThru
    if (!$taskProcess.WaitForExit(60000)) { throw 'Installer verification timed out.' }
    if ($taskProcess.ExitCode -ne 0) { throw ('Installer failed with code ' + $taskProcess.ExitCode) }
    $taskRegistered = Get-TaskInstallations | Where-Object { (Get-TaskLocation $_) -eq $taskTarget } | Select-Object -First 1
    if (!$taskRegistered -or !(Test-Path -LiteralPath (Join-Path $taskTarget 'ZeroDistance.exe'))) { throw 'Installation was not registered at the expected QA path.' }
    @{ installed=$true; path=$taskTarget; version=$taskRegistered.DisplayVersion } | ConvertTo-Json -Compress
} else {
    $taskRegistered = Get-TaskInstallations | Where-Object { (Get-TaskLocation $_) -eq $taskTarget } | Select-Object -First 1
    if (!$taskRegistered) { throw 'No matching QA installation; refusing to run another uninstaller.' }
    $taskUninstaller = Get-ChildItem -LiteralPath $taskTarget -File -Filter '*Uninstall*.exe' | Select-Object -First 1
    if (!$taskUninstaller -or ![IO.Path]::GetFullPath($taskUninstaller.FullName).StartsWith($taskTarget + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid QA uninstaller path.' }
    # The resolved uninstall target has been checked above and contains only this test install.
    $taskProcess = Start-Process -FilePath $taskUninstaller.FullName -ArgumentList ('/S _?=' + $taskTarget) -WindowStyle Hidden -PassThru
    if (!$taskProcess.WaitForExit(60000)) { throw 'Uninstaller verification timed out.' }
    if ($taskProcess.ExitCode -ne 0) { throw ('Uninstaller failed with code ' + $taskProcess.ExitCode) }
    if (Test-Path -LiteralPath (Join-Path $taskTarget 'ZeroDistance.exe')) { throw 'QA app executable remained after uninstall.' }
    if (Get-TaskInstallations | Where-Object { (Get-TaskLocation $_) -eq $taskTarget }) { throw 'QA uninstall registry entry remained.' }
    @{ uninstalled=$true; path=$taskTarget; userDataPreserved=$true } | ConvertTo-Json -Compress
}
