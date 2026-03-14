# Seconda passata - file rimasti con pattern diversi
# Esegui dalla cartella: C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\frontend\src
# powershell -ExecutionPolicy Bypass -File fix_api2.ps1

$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $srcDir) { $srcDir = Get-Location }

$files = Get-ChildItem -Path $srcDir -Recurse -Filter "*.tsx" | 
         Where-Object { Select-String -Path $_.FullName -Pattern "localhost:(8000|8080)" -Quiet }

$count = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    # Pattern: (window as any).__API_BASE__ || 'http://localhost:8000'
    $content = $content -replace "\(window as any\)\.__API_BASE__\s*\|\|\s*'http://localhost:\d+'", "import.meta.env.VITE_API_URL ?? ''"
    $content = $content -replace '\(window as any\)\.__API_BASE__\s*\|\|\s*"http://localhost:\d+"', 'import.meta.env.VITE_API_URL ?? ""'

    # Pattern rimasti: const API_BASE = 'http://localhost:8000'
    $content = $content -replace "const API_BASE\s*=\s*'http://localhost:\d+'", "const API_BASE = import.meta.env.VITE_API_URL ?? ''"
    $content = $content -replace 'const API_BASE\s*=\s*"http://localhost:\d+"', 'const API_BASE = import.meta.env.VITE_API_URL ?? ""'
    $content = $content -replace "const API\s*=\s*'http://localhost:\d+'", "const API = import.meta.env.VITE_API_URL ?? ''"
    $content = $content -replace 'const API\s*=\s*"http://localhost:\d+"', 'const API = import.meta.env.VITE_API_URL ?? ""'

    # RULE_DESIGNER_URL (RuleEnginePage) - non è un'API call, lascia invariato ma segnala
    if ($content -match "RULE_DESIGNER_URL") {
        Write-Host "SKIP (RULE_DESIGNER_URL): $($file.Name)"
        continue
    }

    if ($content -ne $original) {
        Set-Content $file.FullName $content -Encoding UTF8 -NoNewline
        Write-Host "OK: $($file.Name)"
        $count++
    }
}

Write-Host ""
Write-Host "Aggiornati $count file."
