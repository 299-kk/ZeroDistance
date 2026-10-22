$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$portableFile = Join-Path $workspace ('release\ZeroDistance-' + $version + '.exe')
$expectedRuntime = Join-Path $workspace 'release\ZeroDistance-runtime'
$wrapper = Start-Process -FilePath $portableFile -WindowStyle Hidden -PassThru
$mainProcess = $null
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(40)
    while ([DateTime]::UtcNow -lt $deadline) {
        $child = Get-CimInstance Win32_Process -Filter "Name='ZeroDistance.exe'" | Where-Object {
            $_.ParentProcessId -eq $wrapper.Id -and $_.ExecutablePath -and
            $_.ExecutablePath.StartsWith($expectedRuntime + '\', [StringComparison]::OrdinalIgnoreCase)
        } | Select-Object -First 1
        if ($child) {
            $mainProcess = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
            if ($mainProcess -and $mainProcess.MainWindowTitle -eq 'ZeroDistance') { break }
        }
        Start-Sleep -Milliseconds 250
    }
    if (!$mainProcess -or $mainProcess.MainWindowTitle -ne 'ZeroDistance') {
        throw 'Portable launcher did not display the main window.'
    }
    $report = [ordered]@{
        ok = $true
        executable = [IO.Path]::GetFileName($portableFile)
        runtimeVerified = $true
        title = $mainProcess.MainWindowTitle
        sha256 = (Get-FileHash -LiteralPath $portableFile -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workspace '.qa\portable-startup.json') -Encoding UTF8
    $report | ConvertTo-Json
}
finally {
    # Close only the exact child launched by this verification wrapper.
    if ($mainProcess -and !$mainProcess.HasExited) {
        [void]$mainProcess.CloseMainWindow()
        [void]$mainProcess.WaitForExit(5000)
    }
}
