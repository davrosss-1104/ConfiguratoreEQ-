#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Diagnostica deployment Elettroquadri su server con IIS reverse proxy.
#>

param(
    [string]$HostName = ""
)

if (-not $HostName) {
    $HostName = Read-Host "Inserisci il sottodominio (es. configuratore.b-conn.it)"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Diagnostica Deployment Elettroquadri" -ForegroundColor Cyan
Write-Host "  Dominio: $HostName" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$problems = 0

# ── 1. Backend ──
Write-Host "[1/10] Backend (ElettroquadriServer.exe)..." -NoNewline
$proc = Get-Process -Name "ElettroquadriServer" -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host " OK (PID: $($proc.Id))" -ForegroundColor Green
} else {
    Write-Host " NON IN ESECUZIONE" -ForegroundColor Red
    $problems++
}

# ── 2. Porta 8080 ──
Write-Host "[2/10] Porta 8080 solo localhost..." -NoNewline
$tcp = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($tcp) {
    $addr = $tcp[0].LocalAddress
    if ($addr -eq "127.0.0.1" -or $addr -eq "::1") {
        Write-Host " OK ($addr)" -ForegroundColor Green
    } else {
        Write-Host " ATTENZIONE: ascolto su $addr!" -ForegroundColor Red
        $problems++
    }
} else {
    Write-Host " NON IN ASCOLTO" -ForegroundColor Red
    $problems++
}

# ── 3. IIS ──
Write-Host "[3/10] IIS (W3SVC)..." -NoNewline
$iis = Get-Service -Name W3SVC -ErrorAction SilentlyContinue
if ($iis -and $iis.Status -eq "Running") {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " NON ATTIVO" -ForegroundColor Red
    $problems++
}

# ── 4. Sito Elettroquadri ──
Write-Host "[4/10] Sito IIS 'Elettroquadri'..." -NoNewline
Import-Module WebAdministration -ErrorAction SilentlyContinue
$site = Get-Website -Name "Elettroquadri" -ErrorAction SilentlyContinue
if ($site -and $site.State -eq "Started") {
    Write-Host " OK" -ForegroundColor Green
} elseif ($site) {
    Write-Host " FERMO ($($site.State))" -ForegroundColor Red
    $problems++
} else {
    Write-Host " NON TROVATO" -ForegroundColor Red
    $problems++
}

# ── 5. Sito esistente ancora attivo ──
Write-Host "[5/10] Siti IIS coesistenza..." -NoNewline
$sites = Get-Website
$stoppedSites = $sites | Where-Object { $_.State -ne "Started" -and $_.Name -ne "Elettroquadri" }
if ($stoppedSites) {
    Write-Host " ATTENZIONE: siti fermi: $($stoppedSites.Name -join ', ')" -ForegroundColor Yellow
} else {
    $count = ($sites | Where-Object { $_.State -eq "Started" }).Count
    Write-Host " OK ($count siti attivi)" -ForegroundColor Green
}

# ── 6. URL Rewrite ──
Write-Host "[6/10] URL Rewrite Module..." -NoNewline
if (Test-Path "C:\Windows\System32\inetsrv\rewrite.dll") {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " MANCANTE" -ForegroundColor Red
    $problems++
}

# ── 7. ARR ──
Write-Host "[7/10] Application Request Routing..." -NoNewline
if (Test-Path "C:\Program Files\IIS\Application Request Routing") {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " MANCANTE" -ForegroundColor Red
    $problems++
}

# ── 8. Firewall ──
Write-Host "[8/10] Firewall 8080 bloccata..." -NoNewline
$block = Get-NetFirewallRule -DisplayName "Elettroquadri - Blocca 8080 esterno" -ErrorAction SilentlyContinue
if ($block) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " REGOLA MANCANTE (8080 potrebbe essere esposta!)" -ForegroundColor Red
    $problems++
}

# ── 9. Health check diretto ──
Write-Host "[9/10] Backend health check (localhost:8080)..." -NoNewline
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8080/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " Status: $($r.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ERRORE" -ForegroundColor Red
    $problems++
}

# ── 10. Test tramite IIS con hostname ──
Write-Host "[10/10] Proxy IIS → backend (https://$HostName)..." -NoNewline
try {
    # Testa prima via HTTP locale con header Host
    $r = Invoke-WebRequest -Uri "http://127.0.0.1/health" -Headers @{Host=$HostName} -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) {
        Write-Host " OK (proxy funzionante)" -ForegroundColor Green
    } else {
        Write-Host " Status: $($r.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ERRORE (il proxy non inoltra)" -ForegroundColor Red
    $problems++
}

# ── Certificato SSL ──
Write-Host ""
Write-Host "--- Certificato SSL ---" -ForegroundColor Gray
$httpsBinding = Get-WebBinding -Name "Elettroquadri" -Protocol "https" -ErrorAction SilentlyContinue
if ($httpsBinding) {
    Write-Host "  HTTPS binding presente" -ForegroundColor Green
    
    # Cerca il certificato associato
    try {
        $thumb = $httpsBinding.certificateHash
        if ($thumb) {
            $cert = Get-ChildItem Cert:\LocalMachine\My\$thumb -ErrorAction SilentlyContinue
            if ($cert) {
                $daysLeft = ($cert.NotAfter - (Get-Date)).Days
                $color = if ($daysLeft -gt 30) { "Green" } elseif ($daysLeft -gt 7) { "Yellow" } else { "Red" }
                Write-Host "  Scadenza: $($cert.NotAfter) ($daysLeft giorni)" -ForegroundColor $color
                Write-Host "  Soggetto: $($cert.Subject)" -ForegroundColor Gray
            }
        }
    } catch {}
} else {
    Write-Host "  HTTPS binding NON presente - certificato da configurare" -ForegroundColor Yellow
    $problems++
}

# ── Swagger ──
Write-Host ""
Write-Host "--- Swagger ---" -ForegroundColor Gray
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8080/docs" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($r.Content -match "swagger|openapi") {
        Write-Host "  ATTENZIONE: Swagger /docs accessibile!" -ForegroundColor Red
        $problems++
    } else {
        Write-Host "  OK (disabilitato o reindirizzato)" -ForegroundColor Green
    }
} catch {
    Write-Host "  OK (non accessibile)" -ForegroundColor Green
}

# ── Riepilogo ──
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
if ($problems -eq 0) {
    Write-Host "  TUTTO OK! 0 problemi rilevati" -ForegroundColor Green
} else {
    Write-Host "  $problems PROBLEMA/I RILEVATO/I - controlla i punti in rosso" -ForegroundColor Red
}
Write-Host "============================================================" -ForegroundColor Cyan

Read-Host "Premi Invio"
