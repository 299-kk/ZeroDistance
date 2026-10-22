param([ValidateSet('Install','Uninstall')][string]$Mode,[Parameter(Mandatory=$true)][string]$TestRoot,[switch]$NoDesktopShortcut,[switch]$QaIdentity,[string]$InstallerPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$nativeProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeWorkspace=[IO.Path]::GetFullPath((Join-Path $nativeProject '..'))
$nativeQa=[IO.Path]::GetFullPath((Join-Path $nativeWorkspace '.qa'))+'\'
$nativeTarget=[IO.Path]::GetFullPath($TestRoot)
if(!$nativeTarget.StartsWith($nativeQa,[StringComparison]::OrdinalIgnoreCase)){throw 'QA installation must stay inside this workspace .qa directory.'}
$nativeKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeroDistanceNative'
$nativeLink=Join-Path ([Environment]::GetFolderPath('Programs')) 'ZeroDistance.lnk'
$nativeDesktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'ZeroDistance.lnk'
if($QaIdentity){
 $nativeKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ZeroDistanceNativeQA'
 $nativeLink=Join-Path ([Environment]::GetFolderPath('Programs')) 'ZeroDistance QA.lnk'
 $nativeDesktop=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'ZeroDistance QA.lnk'
}
if($Mode -eq 'Install'){
 if((Test-Path -LiteralPath $nativeKey) -or (Test-Path -LiteralPath $nativeLink) -or (Test-Path -LiteralPath $nativeDesktop)){@{skipped=$true;reason='Existing native installation preserved.'}|ConvertTo-Json -Compress;exit 0}
 if(Test-Path -LiteralPath $nativeTarget){throw 'QA target must be new.'}
 $nativeVersion=(Get-Content -LiteralPath (Join-Path $nativeProject 'package.json') -Raw | ConvertFrom-Json).version
 $nativeInstaller=Join-Path $nativeProject ('release/ZeroDistance-'+$nativeVersion+'-Setup.exe')
 if($InstallerPath){$nativeInstaller=[IO.Path]::GetFullPath($InstallerPath);if(!$QaIdentity -or !$nativeInstaller.StartsWith($nativeQa,[StringComparison]::OrdinalIgnoreCase)){throw 'Alternative installer must use the isolated QA identity and directory.'}}
 $nativeOptions=if($NoDesktopShortcut){'/S /NoDesktopShortcut /D='}else{'/S /D='}
 $nativeProcess=Start-Process -FilePath $nativeInstaller -ArgumentList ($nativeOptions+$nativeTarget) -WindowStyle Hidden -PassThru
 if(!$nativeProcess.WaitForExit(60000)){throw 'Installer timed out.'}
 if($nativeProcess.ExitCode -ne 0){throw 'Installer failed.'}
 $nativeEntry=Get-ItemProperty -LiteralPath $nativeKey
 if([IO.Path]::GetFullPath($nativeEntry.InstallLocation) -ne $nativeTarget){throw 'Installer registered an unexpected path.'}
 if(!(Test-Path -LiteralPath (Join-Path $nativeTarget 'ZeroDistance.exe'))){throw 'Installed executable missing.'}
 if((Get-Content -LiteralPath (Join-Path $nativeTarget 'ZeroDistance.Native.marker') -Raw) -ne 'app.zerodistance.native/0.3'){throw 'Wrong install marker.'}
 if(!(Test-Path -LiteralPath $nativeLink)){throw 'Native start menu shortcut missing.'}
 if((Test-Path -LiteralPath $nativeDesktop) -eq [bool]$NoDesktopShortcut){throw 'Desktop shortcut selection was not respected.'}
 $nativeShell=New-Object -ComObject WScript.Shell
 $nativeStartTarget=$nativeShell.CreateShortcut($nativeLink).TargetPath
 if([IO.Path]::GetFullPath($nativeStartTarget) -ne (Join-Path $nativeTarget 'ZeroDistance.exe')){throw 'Start menu shortcut target is invalid.'}
 if(!$NoDesktopShortcut){$nativeDesktopTarget=$nativeShell.CreateShortcut($nativeDesktop).TargetPath;if([IO.Path]::GetFullPath($nativeDesktopTarget) -ne (Join-Path $nativeTarget 'ZeroDistance.exe')){throw 'Desktop shortcut target is invalid.'}}
 @{installed=$true;path=$nativeTarget;version=$nativeEntry.DisplayVersion;desktopShortcut=(!$NoDesktopShortcut);shortcutTargetsVerified=$true}|ConvertTo-Json -Compress
}else{
 $nativeEntry=Get-ItemProperty -LiteralPath $nativeKey
 if([IO.Path]::GetFullPath($nativeEntry.InstallLocation) -ne $nativeTarget){throw 'Refusing to uninstall a different installation.'}
 $nativeUninstaller=Join-Path $nativeTarget 'Uninstall.exe'
 if(![IO.Path]::GetFullPath($nativeUninstaller).StartsWith($nativeTarget+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid uninstaller path.'}
 $nativeProcess=Start-Process -FilePath $nativeUninstaller -ArgumentList ('/S _?='+$nativeTarget) -WindowStyle Hidden -PassThru
 if(!$nativeProcess.WaitForExit(60000)){throw 'Uninstaller timed out.'}
 if($nativeProcess.ExitCode -ne 0){throw 'Uninstaller failed.'}
 if((Test-Path -LiteralPath $nativeKey) -or (Test-Path -LiteralPath (Join-Path $nativeTarget 'ZeroDistance.exe'))){throw 'Native version remained registered or executable remained.'}
 if(Test-Path -LiteralPath $nativeLink){throw 'Native start menu shortcut remained.'}
 if(Test-Path -LiteralPath $nativeDesktop){throw 'Native desktop shortcut remained.'}
 @{uninstalled=$true;path=$nativeTarget;softwareDataPolicy='Cleared by current uninstaller; game directories preserved.'}|ConvertTo-Json -Compress
}
