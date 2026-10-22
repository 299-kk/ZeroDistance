param([Parameter(Mandatory=$true)][string]$Config,[ValidateSet('Install','Uninstall','LockedUninstall','State','SeedLegacyLinks','SeedBothViews','PointElsewhere','Cleanup')][string]$Mode,[string]$Target,[switch]$NoDesktopShortcut)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$configFile=[IO.Path]::GetFullPath($Config)
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$qaPrefix=(Join-Path $workspace '.qa')+'\'
if(!$configFile.StartsWith($qaPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'QA config outside workspace.'}
$testConfig=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
$qaRoot=[IO.Path]::GetFullPath($testConfig.qa)
if(!$qaRoot.StartsWith($qaPrefix,[StringComparison]::OrdinalIgnoreCase) -or $testConfig.identity -notmatch '^ZeroDistanceUninstallQA_[a-f0-9]{32}$'){throw 'Invalid QA identity.'}
$registryRoot='Software\'+$testConfig.identity
$installKey=$registryRoot+'\Native'
$uninstallKey='Software\Microsoft\Windows\CurrentVersion\Uninstall\'+$testConfig.identity
$shortcutName=$testConfig.identity+'.lnk'
$startLink=Join-Path ([Environment]::GetFolderPath('Programs')) $shortcutName
$desktopLink=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) $shortcutName
$legacyStart=Join-Path ([Environment]::GetFolderPath('Programs')) ($testConfig.identity+'-legacy.lnk')
$legacyDesktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($testConfig.identity+'-legacy.lnk')
function BaseKey($view){[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)}
function State {
 $views=@()
 foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
  $base=BaseKey $view
  try{
   $parent=$base.OpenSubKey($registryRoot);$install=$base.OpenSubKey($installKey);$uninstall=$base.OpenSubKey($uninstallKey)
   $views+=@{view=$view.ToString();parent=($null -ne $parent);install=($null -ne $install);uninstall=($null -ne $uninstall);displayName=if($uninstall){$uninstall.GetValue('DisplayName')}else{$null};location=if($install){$install.GetValue('InstallLocation')}else{$null}}
   if($parent){$parent.Dispose()};if($install){$install.Dispose()};if($uninstall){$uninstall.Dispose()}
  }finally{$base.Dispose()}
 }
 @{registry=$views;startShortcut=(Test-Path -LiteralPath $startLink);desktopShortcut=(Test-Path -LiteralPath $desktopLink);legacyStart=(Test-Path -LiteralPath $legacyStart);legacyDesktop=(Test-Path -LiteralPath $legacyDesktop)}
}
function Uninstall {
 # Execute the actual installed uninstaller from a private copy, as NSIS does
 # for self-removal. This also gives the test a reliable final exit code.
 $copy=Join-Path $qaRoot ('uninstall-'+[guid]::NewGuid().ToString('N')+'.exe')
 Copy-Item -LiteralPath (Join-Path $targetPath 'Uninstall.exe') -Destination $copy
 try{
  $process=Start-Process -FilePath $copy -ArgumentList ('/S _?='+$targetPath) -WindowStyle Hidden -PassThru
  if(!$process.WaitForExit(60000)){throw 'QA uninstall timed out.'}
  @{exitCode=$process.ExitCode;state=(State)}
 }finally{Remove-Item -LiteralPath $copy -Force -ErrorAction SilentlyContinue}
}
if($Target){$targetPath=[IO.Path]::GetFullPath($Target);if(!$targetPath.StartsWith($qaRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'QA target outside owned directory.'}}
switch($Mode){
 'SeedLegacyLinks' {
  [IO.File]::WriteAllText($legacyStart,'QA legacy shortcut');[IO.File]::WriteAllText($legacyDesktop,'QA legacy shortcut')
  State | ConvertTo-Json -Depth 6 -Compress
 }
 'Install' {
  $setup=[IO.Path]::GetFullPath($testConfig.installer);if(!$setup.StartsWith($qaRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'QA installer outside test.'}
  $options=if($NoDesktopShortcut){'/S /NoDesktopShortcut /D='}else{'/S /D='}
  $process=Start-Process -FilePath $setup -ArgumentList ($options+$targetPath) -WindowStyle Hidden -PassThru
  if(!$process.WaitForExit(60000)){throw 'QA install timed out.'}
  @{exitCode=$process.ExitCode;state=(State)} | ConvertTo-Json -Depth 6 -Compress
 }
 'Uninstall' {Uninstall | ConvertTo-Json -Depth 6 -Compress}
 'LockedUninstall' {
  $lockPath=Join-Path $qaRoot 'profile\cache.lock'
  $locked=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try{Uninstall | ConvertTo-Json -Depth 6 -Compress}finally{$locked.Dispose()}
 }
 'State' {State | ConvertTo-Json -Depth 6 -Compress}
 {$_ -in 'SeedBothViews','PointElsewhere'} {
  foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
   $base=BaseKey $view
   try{foreach($name in @($installKey,$uninstallKey)){$entry=$base.CreateSubKey($name);try{$entry.SetValue('InstallLocation',$targetPath)}finally{$entry.Dispose()}}}finally{$base.Dispose()}
  }
  State | ConvertTo-Json -Depth 6 -Compress
 }
 'Cleanup' {
  foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
   $base=BaseKey $view;try{$base.DeleteSubKeyTree($registryRoot,$false);$base.DeleteSubKeyTree($uninstallKey,$false)}finally{$base.Dispose()}
  }
  Remove-Item -LiteralPath $startLink,$desktopLink,$legacyStart,$legacyDesktop -Force -ErrorAction SilentlyContinue
  @{cleaned=$true}|ConvertTo-Json -Compress
 }
}
