param([Parameter(Mandatory=$true)][int]$TargetPid,[Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference='Stop'
$qaTargetProcess=Get-Process -Id $TargetPid -ErrorAction Stop
if([IO.Path]::GetFullPath($qaTargetProcess.Path) -ne [IO.Path]::GetFullPath($Executable)){throw 'Unexpected QA process executable.'}
if($qaTargetProcess.MainWindowHandle -eq [IntPtr]::Zero){throw 'QA window is not ready.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeQaActivation {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,IntPtr process);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint first,uint second,bool attach);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr window);
 public static bool Focus(IntPtr target) {
  uint current=GetCurrentThreadId(),foreground=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero),owner=GetWindowThreadProcessId(target,IntPtr.Zero);
  bool a=false,b=false;
  try { if(foreground!=0&&foreground!=current)a=AttachThreadInput(current,foreground,true);if(owner!=0&&owner!=current&&owner!=foreground)b=AttachThreadInput(current,owner,true);BringWindowToTop(target);return SetForegroundWindow(target); }
  finally { if(b)AttachThreadInput(current,owner,false);if(a)AttachThreadInput(current,foreground,false); }
 }
}
'@
$null=[NativeQaActivation]::Focus($qaTargetProcess.MainWindowHandle)
