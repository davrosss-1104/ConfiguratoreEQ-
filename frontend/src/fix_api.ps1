# Esegui dalla cartella: C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\frontend\src
# powershell -ExecutionPolicy Bypass -File fix_api.ps1

$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $srcDir) { $srcDir = Get-Location }

$files = Get-ChildItem -Path $srcDir -Recurse -Filter "*.tsx" | 
         Where-Object { Select-String -Path $_.FullName -Pattern "localhost:(8000|8080)" -Quiet }

$count = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    # const API_BASE = 'http://localhost:8000'  →  const API_BASE = import.meta.env.VITE_API_URL ?? ''
    $content = $content -replace "const API_BASE\s*=\s*[`'`"]http://localhost:\d+[`'`"]", "const API_BASE = import.meta.env.VITE_API_URL ?? ''"
    
    # const API = 'http://localhost:8000'  →  const API = import.meta.env.VITE_API_URL ?? ''
    $content = $content -replace "const API\s*=\s*[`'`"]http://localhost:\d+[`'`"]", "const API = import.meta.env.VITE_API_URL ?? ''"

    # Eventuali riferimenti inline rimasti (fetch dirette senza variabile)
    $content = $content -replace "'http://localhost:\d+/api/", "'/api/"
    $content = $content -replace '"http://localhost:\d+/api/', '"/api/'
    $content = $content -replace "'http://localhost:\d+/", "'/api/"
    $content = $content -replace '"http://localhost:\d+/', '"/api/'

    if ($content -ne $original) {
        Set-Content $file.FullName $content -Encoding UTF8 -NoNewline
        Write-Host "OK: $($file.Name)"
        $count++
    }
}

Write-Host ""
Write-Host "Aggiornati $count file."
