param([Parameter(Mandatory=$true)][int]$TargetId,[Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][long]$HandleValue)
$ErrorActionPreference='Stop'
$targetProcess=Get-Process -Id $TargetId -ErrorAction Stop
if([IO.Path]::GetFullPath($targetProcess.Path) -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected test executable.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LowMemoryQaMessage {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle,out uint id);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle,int message,IntPtr w,IntPtr l);
}
'@
$window=[IntPtr]::new($HandleValue);[uint32]$owner=0
$null=[LowMemoryQaMessage]::GetWindowThreadProcessId($window,[ref]$owner)
if($owner -ne [uint32]$TargetId){throw 'Window is not owned by the QA process.'}
if(![LowMemoryQaMessage]::PostMessage($window,0x8077,[IntPtr]::Zero,[IntPtr]::Zero)){throw 'Restore message failed.'}
