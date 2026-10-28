param([Parameter(Mandatory=$true)][int]$RootId)
$ErrorActionPreference='Stop'
$all=@(Get-CimInstance Win32_Process)
$ids=[Collections.Generic.HashSet[uint32]]::new();$null=$ids.Add([uint32]$RootId)
do {$added=$false;foreach($item in $all){if($ids.Contains([uint32]$item.ParentProcessId) -and $ids.Add([uint32]$item.ProcessId)){$added=$true}}} while($added)
$rows=@($all | Where-Object {$ids.Contains([uint32]$_.ProcessId)} | ForEach-Object {
 $kind=$_.Name;if($_.Name -eq 'msedgewebview2.exe'){$kind=if($_.CommandLine -match '--type=([^\s]+)'){$Matches[1]}else{'browser'}}
 @{pid=$_.ProcessId;kind=$kind;workingBytes=[long]$_.WorkingSetSize;privateBytes=[long]$_.PrivatePageCount}
})
ConvertTo-Json -InputObject $rows -Compress
