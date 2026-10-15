$ErrorActionPreference = 'Stop'
$port = 8080
$listenHost = if ($env:CHAT_HOST) { $env:CHAT_HOST } else { 'localhost' }
$root = $PSScriptRoot
$localSecretsFile = Join-Path $root 'local-secrets.ps1'
if (Test-Path $localSecretsFile) { . $localSecretsFile }
$dataFile = if ($env:CHAT_DATA_PATH) { $env:CHAT_DATA_PATH } else { Join-Path $root 'chat-data.json' }
$passwords = @{
    '1' = $env:CHAT_GROUP_1_PASSWORD
    '2' = $env:CHAT_GROUP_2_PASSWORD
    '3' = $env:CHAT_GROUP_3_PASSWORD
}
$missingPasswords = @($passwords.GetEnumerator() | Where-Object { [string]::IsNullOrWhiteSpace($_.Value) } | ForEach-Object { "CHAT_GROUP_$($_.Key)_PASSWORD" })
if ($missingPasswords.Count -gt 0) {
    throw "Fehlende Gruppenpasswörter: $($missingPasswords -join ', ')"
}
$dataDirectory = Split-Path -Parent $dataFile
if ($dataDirectory -and -not (Test-Path $dataDirectory)) {
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
}
$script:messages = [System.Collections.Generic.List[object]]::new()

if (Test-Path $dataFile) {
    try {
        $savedMessages = Get-Content -Raw -Encoding UTF8 $dataFile | ConvertFrom-Json -AsHashtable -NoEnumerate
        if ($savedMessages -is [System.Collections.IDictionary]) {
            $script:messages.Add($savedMessages)
        } else {
            foreach ($message in $savedMessages) { $script:messages.Add($message) }
        }
    } catch {
        Write-Warning "Der gespeicherte Chatverlauf konnte nicht geladen werden: $_"
    }
}

function Send-Response($Response, [int]$Status, [string]$ContentType, [string]$Body) {
    $Response.StatusCode = $Status
    $Response.ContentType = $ContentType
    $Response.ContentEncoding = [System.Text.Encoding]::UTF8
    $Response.Headers['Cache-Control'] = 'no-store'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.Close()
}

function Send-Json($Response, [int]$Status, $Value) {
    Send-Response $Response $Status 'application/json; charset=utf-8' (ConvertTo-Json -InputObject $Value -Depth 10 -Compress)
}

function Read-JsonBody($Request) {
    $reader = [System.IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
    try { return $reader.ReadToEnd() | ConvertFrom-Json -AsHashtable }
    finally { $reader.Dispose() }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://${listenHost}:$port/")
$listener.Start()
$displayHost = if ($listenHost -eq '+') { 'localhost' } else { $listenHost }
Write-Host "Chat läuft auf http://${displayHost}:$port/ (Beenden mit Strg+C)" -ForegroundColor Green

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $path = $request.Url.AbsolutePath

        try {
            if ($path -eq '/api/unlock' -and $request.HttpMethod -eq 'POST') {
                $body = Read-JsonBody $request
                $group = [string]$body.group
                if ($passwords.ContainsKey($group) -and $body.password -ceq $passwords[$group]) {
                    Send-Json $response 200 @{ ok = $true }
                } else {
                    Send-Json $response 401 @{ error = 'Das Passwort stimmt nicht.' }
                }
                continue
            }

            if ($path -like '/api/*') {
                $group = [string]$request.QueryString['group']
                if (-not $passwords.ContainsKey($group) -or $request.Headers['X-Group-Password'] -cne $passwords[$group]) {
                    Send-Json $response 401 @{ error = 'Gruppe gesperrt.' }
                    continue
                }

                if ($path -eq '/api/messages' -and $request.HttpMethod -eq 'GET') {
                    $afterId = 0L
                    [void][long]::TryParse($request.QueryString['after'], [ref]$afterId)
                    $result = @($script:messages | Where-Object { $_.group -eq $group -and $_.id -gt $afterId } | Select-Object -First 100)
                    Send-Json $response 200 @{ messages = $result }
                    continue
                }

                if ($path -eq '/api/messages' -and $request.HttpMethod -eq 'POST') {
                    if ($request.ContentLength64 -gt 5000000) {
                        Send-Json $response 413 @{ error = 'Die Nachricht ist zu groß. Bilder dürfen höchstens 4 MB haben.' }
                        continue
                    }
                    $body = Read-JsonBody $request
                    $sender = ([string]$body.sender).Trim()
                    $text = ([string]$body.text).Trim()
                    $image = [string]$body.image
                    if ([string]::IsNullOrWhiteSpace($sender)) { $sender = 'Gast' }
                    if ($sender.Length -gt 32) { $sender = $sender.Substring(0, 32) }
                    if ($text.Length -gt 2000) {
                        Send-Json $response 400 @{ error = 'Nachrichten dürfen höchstens 2000 Zeichen enthalten.' }
                        continue
                    }
                    if ($image -and $image -notmatch '^data:image/(png|jpeg|gif|webp);base64,') {
                        Send-Json $response 400 @{ error = 'Dieses Bildformat wird nicht unterstützt.' }
                        continue
                    }
                    if (-not $text -and -not $image) {
                        Send-Json $response 400 @{ error = 'Schreibe eine Nachricht oder wähle ein Bild aus.' }
                        continue
                    }

                    $nextId = 1L
                    if ($script:messages.Count -gt 0) { $nextId = [long]$script:messages[$script:messages.Count - 1].id + 1 }
                    $message = @{ id = $nextId; group = $group; sender = $sender; text = $text; image = $image; time = [DateTimeOffset]::Now.ToString('o') }
                    $script:messages.Add($message)
                    if ($script:messages.Count -gt 2000) { $script:messages.RemoveAt(0) }
                    $messageJson = ConvertTo-Json -InputObject @($script:messages.ToArray()) -Depth 10
                    Set-Content -Path $dataFile -Value $messageJson -Encoding UTF8
                    Send-Json $response 201 @{ message = $message }
                    continue
                }

                Send-Json $response 404 @{ error = 'API-Endpunkt nicht gefunden.' }
                continue
            }

            $relativePath = if ($path -eq '/') { 'index.html' } else { $path.TrimStart('/') }
            $filePath = Join-Path (Join-Path $root 'public') $relativePath
            $publicRoot = [System.IO.Path]::GetFullPath((Join-Path $root 'public') + [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath($filePath)
            if (-not $fullPath.StartsWith($publicRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $fullPath -PathType Leaf)) {
                Send-Response $response 404 'text/plain; charset=utf-8' 'Nicht gefunden.'
                continue
            }
            $contentType = switch ([System.IO.Path]::GetExtension($fullPath)) {
                '.html' { 'text/html; charset=utf-8' }
                '.css' { 'text/css; charset=utf-8' }
                '.js' { 'text/javascript; charset=utf-8' }
                default { 'application/octet-stream' }
            }
            $content = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
            $response.Close()
        } catch {
            Write-Warning "Anfrage fehlgeschlagen: $_"
            if ($response.OutputStream) {
                try { Send-Json $response 500 @{ error = 'Interner Serverfehler.' } } catch { }
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}