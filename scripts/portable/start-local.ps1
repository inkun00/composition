param(
    [switch]$ServerOnly,
    [string]$PackageRoot = $PSScriptRoot,
    [string]$StatusPath,
    [int]$ParentProcessId = 0,
    [long]$ParentStartTimeTicks = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'
    '.mjs' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.png' = 'image/png'
    '.jpg' = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.gif' = 'image/gif'
    '.avif' = 'image/avif'
    '.ico' = 'image/x-icon'
    '.mp3' = 'audio/mpeg'
    '.wav' = 'audio/wav'
    '.ogg' = 'audio/ogg'
    '.m4a' = 'audio/mp4'
    '.mp4' = 'video/mp4'
    '.webm' = 'video/webm'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf' = 'font/ttf'
    '.otf' = 'font/otf'
    '.wasm' = 'application/wasm'
    '.pdf' = 'application/pdf'
    '.xml' = 'application/xml; charset=utf-8'
    '.musicxml' = 'application/xml; charset=utf-8'
    '.txt' = 'text/plain; charset=utf-8'
    '.cmd' = 'application/octet-stream'
}

function Write-ServerStatus([int]$Port, [string]$Failure) {
    if (-not $StatusPath) { return }
    $status = @{ port = $Port; error = $Failure } | ConvertTo-Json -Compress
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($StatusPath + '.tmp', $status, $encoding)
    [System.IO.File]::Move($StatusPath + '.tmp', $StatusPath)
}

function Test-ParentAlive {
    if ($ParentProcessId -eq 0) { return $true }
    $owner = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
    if (-not $owner) { return $false }
    if ($ParentStartTimeTicks -eq 0) { return $true }
    return $owner.StartTime.Ticks -eq $ParentStartTimeTicks
}

function Read-HttpRequest([System.IO.Stream]$Stream) {
    $headerBytes = New-Object 'System.Collections.Generic.List[byte]'
    while ($headerBytes.Count -lt 16384) {
        $nextByte = $Stream.ReadByte()
        if ($nextByte -lt 0) { return $null }
        $headerBytes.Add([byte]$nextByte)
        $count = $headerBytes.Count
        if ($count -ge 4 -and $headerBytes[$count - 4] -eq 13 -and
            $headerBytes[$count - 3] -eq 10 -and $headerBytes[$count - 2] -eq 13 -and
            $headerBytes[$count - 1] -eq 10) {
            $lines = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray()) -split "`r`n"
            if ($lines[0] -notmatch '^([A-Z]+) ([^ ]+) HTTP/1\.[01]$') {
                throw 'Invalid HTTP request.'
            }
            $method = $Matches[1]
            $target = $Matches[2]
            $headers = @{}
            foreach ($line in $lines | Select-Object -Skip 1) {
                if ($line -eq '') { break }
                $separator = $line.IndexOf(':')
                if ($separator -lt 1) { throw 'Invalid HTTP header.' }
                $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
                if ($headers.ContainsKey($name)) { throw 'Duplicate HTTP header.' }
                $headers[$name] = $line.Substring($separator + 1).Trim()
            }
            return @{ method = $method; target = $target; headers = $headers }
        }
    }
    throw 'HTTP headers are too large.'
}

function Write-Headers(
    [System.IO.Stream]$Stream,
    [int]$Status,
    [string]$Reason,
    [string]$ContentType,
    [long]$Length,
    [hashtable]$Extra = @{}
) {
    $header = "HTTP/1.1 $Status $Reason`r`n"
    $header += "Content-Type: $ContentType`r`nContent-Length: $Length`r`n"
    $header += "Connection: close`r`nCache-Control: no-cache`r`n"
    $header += "X-Content-Type-Options: nosniff`r`n"
    foreach ($name in $Extra.Keys) {
        $header += "${name}: $($Extra[$name])`r`n"
    }
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($header + "`r`n")
    $Stream.Write($bytes, 0, $bytes.Length)
}

function Send-ErrorResponse(
    [System.IO.Stream]$Stream,
    [int]$Status,
    [string]$Reason,
    [bool]$HeadOnly = $false,
    [hashtable]$Extra = @{}
) {
    $body = [System.Text.Encoding]::UTF8.GetBytes("$Status $Reason`n")
    Write-Headers $Stream $Status $Reason 'text/plain; charset=utf-8' $body.Length $Extra
    if (-not $HeadOnly) { $Stream.Write($body, 0, $body.Length) }
}

function Resolve-AssetPath([string]$Target, [string]$Root) {
    if (-not $Target.StartsWith('/') -or $Target.StartsWith('//')) { return $null }
    $pathPart = ($Target -split '\?', 2)[0]
    $decoded = [System.Uri]::UnescapeDataString($pathPart)
    if ($decoded -match '[\\:\x00-\x1f]' -or $decoded -match '%[0-9a-fA-F]{2}') {
        return $null
    }
    $relative = $decoded.TrimStart('/')
    if ($relative -eq '') { $relative = 'index.html' }
    $segments = $relative -split '/'
    if (@($segments | Where-Object { $_ -eq '..' -or $_.StartsWith('.') }).Count -gt 0) {
        return $null
    }
    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
    $rootPrefix = $Root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    if (-not [System.IO.File]::Exists($fullPath)) { return $null }
    $item = Get-Item -LiteralPath $fullPath
    while ($item.FullName -ne $Root) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            return $null
        }
        $parentPath = [System.IO.Path]::GetDirectoryName($item.FullName)
        if (-not $parentPath) { return $null }
        $item = Get-Item -LiteralPath $parentPath
    }
    $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    if (-not $mimeTypes.ContainsKey($extension)) { return $null }
    return $fullPath
}

function Send-Asset([System.IO.Stream]$Stream, [hashtable]$Request, [string]$Path) {
    $headOnly = $Request.method -eq 'HEAD'
    $file = [System.IO.File]::Open($Path, 'Open', 'Read', 'Read')
    try {
        $length = $file.Length
        $start = [long]0
        $end = $length - 1
        $status = 200
        $reason = 'OK'
        $extra = @{ 'Accept-Ranges' = 'bytes' }
        if ($Request.headers.ContainsKey('range')) {
            $range = $Request.headers['range']
            $valid = $range -match '^bytes=(\d*)-(\d*)$'
            if ($valid) {
                $first = $Matches[1]
                $last = $Matches[2]
                if ($first -eq '' -and $last -eq '') {
                    $valid = $false
                } elseif ($first -eq '') {
                    $suffix = [long]0
                    $valid = [long]::TryParse($last, [ref]$suffix) -and $suffix -gt 0 -and $length -gt 0
                    $start = [Math]::Max(0, $length - $suffix)
                } else {
                    $parsedStart = [long]0
                    $parsedEnd = [long]0
                    $valid = [long]::TryParse($first, [ref]$parsedStart)
                    if ($last -ne '') {
                        $valid = $valid -and [long]::TryParse($last, [ref]$parsedEnd)
                        $end = [Math]::Min($parsedEnd, $length - 1)
                    }
                    $start = $parsedStart
                    $valid = $valid -and $start -lt $length -and $end -ge $start
                }
            }
            if (-not $valid) {
                Send-ErrorResponse $Stream 416 'Range Not Satisfiable' $headOnly @{
                    'Content-Range' = "bytes */$length"
                }
                return
            }
            $status = 206
            $reason = 'Partial Content'
            $extra['Content-Range'] = "bytes $start-$end/$length"
        }
        $contentLength = [Math]::Max(0, $end - $start + 1)
        $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
        Write-Headers $Stream $status $reason $mimeTypes[$extension] $contentLength $extra
        if ($headOnly) { return }
        $file.Position = $start
        $remaining = $contentLength
        $buffer = New-Object byte[] 65536
        while ($remaining -gt 0) {
            $readSize = [int][Math]::Min($remaining, $buffer.Length)
            $received = $file.Read($buffer, 0, $readSize)
            if ($received -eq 0) { break }
            $Stream.Write($buffer, 0, $received)
            $remaining -= $received
        }
    } finally {
        $file.Dispose()
    }
}

function Invoke-LocalServer {
    $root = (Get-Item -LiteralPath $PackageRoot).FullName
    if (-not [System.IO.File]::Exists((Join-Path $root 'index.html'))) {
        throw 'The package index.html file is missing. Extract the complete ZIP first.'
    }
    $listener = $null
    $port = 0
    foreach ($candidate in 4173..4182) {
        $attempt = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidate)
        try {
            $attempt.Start(32)
            $listener = $attempt
            $port = $candidate
            break
        } catch {
            $attempt.Stop()
        }
    }
    if (-not $listener) { throw 'Local ports 4173-4182 are already occupied.' }
    try {
        Write-ServerStatus $port ''
        while (Test-ParentAlive) {
            if (-not $listener.Pending()) {
                Start-Sleep -Milliseconds 50
                continue
            }
            $client = $listener.AcceptTcpClient()
            try {
                $client.ReceiveTimeout = 3000
                $client.SendTimeout = 10000
                $stream = $client.GetStream()
                try {
                    $request = Read-HttpRequest $stream
                } catch {
                    Send-ErrorResponse $stream 400 'Bad Request'
                    continue
                }
                if (-not $request) { continue }
                $headOnly = $request.method -eq 'HEAD'
                if (-not $request.headers.ContainsKey('host') -or
                    $request.headers['host'] -notin @("localhost:$port", "127.0.0.1:$port")) {
                    Send-ErrorResponse $stream 403 'Forbidden' $headOnly
                    continue
                }
                if ($request.method -notin @('GET', 'HEAD')) {
                    Send-ErrorResponse $stream 405 'Method Not Allowed' $false @{ Allow = 'GET, HEAD' }
                    continue
                }
                $asset = Resolve-AssetPath $request.target $root
                if (-not $asset) {
                    Send-ErrorResponse $stream 404 'Not Found' $headOnly
                    continue
                }
                Send-Asset $stream $request $asset
            } catch {
                # Browsers can close speculative connections; keep serving other requests.
            } finally {
                $client.Close()
            }
        }
    } finally {
        $listener.Stop()
    }
}

if ($ServerOnly) {
    try {
        Invoke-LocalServer
    } catch {
        Write-ServerStatus 0 $_.Exception.Message
        exit 1
    }
    exit 0
}

function ConvertTo-ShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

$serverProcess = $null
$statusFile = Join-Path ([System.IO.Path]::GetTempPath()) ("maeum-melody-" + [Guid]::NewGuid() + '.json')
try {
    $owner = Get-Process -Id $PID
    $command = '& ' + (ConvertTo-ShellLiteral $PSCommandPath) + ' -ServerOnly'
    $command += ' -PackageRoot ' + (ConvertTo-ShellLiteral $PackageRoot)
    $command += ' -StatusPath ' + (ConvertTo-ShellLiteral $statusFile)
    $command += " -ParentProcessId $PID -ParentStartTimeTicks $($owner.StartTime.Ticks)"
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($command))
    $powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $serverProcess = Start-Process -FilePath $powerShellPath -WindowStyle Hidden -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded
    )
    for ($attempt = 0; $attempt -lt 150; $attempt++) {
        if ([System.IO.File]::Exists($statusFile)) { break }
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) { throw 'The local server could not start.' }
        Start-Sleep -Milliseconds 100
    }
    if (-not [System.IO.File]::Exists($statusFile)) { throw 'The local server did not become ready.' }
    $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
    if ($status.error) { throw $status.error }
    $url = "http://localhost:$($status.port)/"
    Write-Host "App ready: $url"
    Write-Host 'Keep this window open while using the app.'
    Write-Host 'Press Enter or Ctrl+C to stop the local server.'
    Start-Process -FilePath $url
    [void](Read-Host)
} catch {
    Write-Host ('Could not start the app: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($serverProcess) {
        $serverProcess.Refresh()
        if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue }
    }
    foreach ($temporaryFile in @($statusFile, $statusFile + '.tmp')) {
        if ([System.IO.File]::Exists($temporaryFile)) {
            Remove-Item -LiteralPath $temporaryFile -ErrorAction SilentlyContinue
        }
    }
}
