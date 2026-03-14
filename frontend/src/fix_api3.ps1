# Terza passata - file specifici rimasti
# Esegui dalla cartella: C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\frontend\src
# powershell -ExecutionPolicy Bypass -File fix_api3.ps1

$targets = @(
    "pages\ImpiantiPage.tsx",
    "pages\LoginPage.tsx",
    "pages\TicketDashboardPage.tsx",
    "pages\TicketKanbanPage.tsx",
    "pages\TicketsPage.tsx",
    "components\sections\GestioneRuoliPage.tsx"
)

$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $srcDir) { $srcDir = Get-Location }

$count = 0
foreach ($rel in $targets) {
    $path = Join-Path $srcDir $rel
    if (-not (Test-Path $path)) {
        Write-Host "NON TROVATO: $rel"
        continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($path)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    $original = $content

    $content = $content -replace "const API_BASE\s*=\s*'http://localhost:\d+'", "const API_BASE = import.meta.env.VITE_API_URL ?? ''"
    $content = $content -replace 'const API_BASE\s*=\s*"http://localhost:\d+"', 'const API_BASE = import.meta.env.VITE_API_URL ?? ""'

    if ($content -ne $original) {
        $newBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
        [System.IO.File]::WriteAllBytes($path, $newBytes)
        Write-Host "OK: $rel"
        $count++
    } else {
        Write-Host "INVARIATO: $rel"
    }
}

Write-Host ""
Write-Host "Aggiornati $count file."
