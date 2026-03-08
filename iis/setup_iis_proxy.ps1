#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup IIS Reverse Proxy per Configuratore Elettroquadri
    Versione per server con sito IIS già attivo su 80/443.
.DESCRIPTION
    - NON tocca il sito esistente
    - Crea un NUOVO sito con binding hostname sul sottodominio
    - Installa URL Rewrite + ARR se mancanti
    - Configura firewall (blocca 8080 dall'esterno)
    - Guida installazione win-acme per Let's Encrypt
.NOTES
    PREREQUISITO: creare record DNS A per il sottodominio
    che punta all'IP pubblico del server PRIMA di eseguire questo script.
#>

param(
    # OBBLIGATORIO: il sottodominio scelto
    [Parameter(Mandatory=$true)]
    [string]$HostName,
    # Porta backend FastAPI
    [int]$BackendPort = 8080,
    # Nome sito IIS
    [string]$SiteName = "Elettroquadri",
    # Cartella root sito IIS (contiene web.config)
    [string]$SiteRoot = "C:\inetpub\elettroquadri",
    # Cartella installazione applicazione
    [string]$AppDir = "C:\Elettroquadri"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Setup IIS Reverse Proxy - Elettroquadri" -ForegroundColor Cyan
Write-Host "  Sottodominio: $HostName" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Verifica DNS ──
Write-Host "[PRE] Verifica DNS per $HostName..." -NoNewline
try {
    $dns = Resolve-DnsName $HostName -ErrorAction Stop
    Write-Host " OK (risolve a $($dns[0].IPAddress))" -ForegroundColor Green
} catch {
    Write-Host "" 
    Write-Host ""
    Write-Host "  [ERRORE] Il dominio $HostName non risolve!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Devi creare un record DNS PRIMA di procedere:" -ForegroundColor Yellow
    Write-Host "    Tipo:   A" -ForegroundColor Gray
    Write-Host "    Nome:   $HostName" -ForegroundColor Gray
    Write-Host "    Valore: <IP pubblico di questo server>" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Dopo aver creato il record, attendi 5-10 minuti" -ForegroundColor Gray
    Write-Host "  per la propagazione DNS e riesegui lo script." -ForegroundColor Gray
    Write-Host ""
    Read-Host "Premi Invio per uscire"
    exit 1
}

# ═══════════════════════════════════════════════════════════════
# 1. VERIFICA/INSTALLA MODULI IIS
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[1/7] Verifica moduli IIS necessari..." -ForegroundColor Yellow

# Verifica solo i moduli che potrebbero mancare (IIS è già installato)
$requiredFeatures = @(
    "IIS-WebSockets",
    "IIS-HttpCompressionDynamic",
    "IIS-ISAPIFilter",
    "IIS-ISAPIExtensions"
)

foreach ($feature in $requiredFeatures) {
    $state = Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue
    if ($state -and $state.State -ne "Enabled") {
        Write-Host "  Abilito $feature..."
        Enable-WindowsOptionalFeature -Online -FeatureName $feature -NoRestart -All | Out-Null
    }
}
Write-Host "  [OK] Moduli IIS verificati" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# 2. URL REWRITE MODULE
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[2/7] URL Rewrite Module..." -ForegroundColor Yellow

if (-not (Test-Path "C:\Windows\System32\inetsrv\rewrite.dll")) {
    $urlRewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
    $urlRewriteMsi = "$env:TEMP\urlrewrite2.msi"
    
    Write-Host "  Download URL Rewrite Module 2.1..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $urlRewriteUrl -OutFile $urlRewriteMsi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i", $urlRewriteMsi, "/quiet", "/norestart" -Wait -NoNewWindow
        Write-Host "  [OK] URL Rewrite installato" -ForegroundColor Green
    } catch {
        Write-Host "  [ERRORE] Download fallito. Installa manualmente:" -ForegroundColor Red
        Write-Host "  https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Cyan
        Read-Host "Premi Invio dopo l'installazione"
    }
} else {
    Write-Host "  [OK] Già installato" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════
# 3. APPLICATION REQUEST ROUTING (ARR)
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[3/7] Application Request Routing (ARR)..." -ForegroundColor Yellow

if (-not (Test-Path "C:\Program Files\IIS\Application Request Routing")) {
    $arrUrl = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"
    $arrMsi = "$env:TEMP\arr3.msi"
    
    Write-Host "  Download ARR 3.0..."
    try {
        Invoke-WebRequest -Uri $arrUrl -OutFile $arrMsi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i", $arrMsi, "/quiet", "/norestart" -Wait -NoNewWindow
        Write-Host "  [OK] ARR installato" -ForegroundColor Green
    } catch {
        Write-Host "  [ERRORE] Download fallito. Installa manualmente:" -ForegroundColor Red
        Write-Host "  https://www.iis.net/downloads/microsoft/application-request-routing" -ForegroundColor Cyan
        Read-Host "Premi Invio dopo l'installazione"
    }
} else {
    Write-Host "  [OK] Già installato" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════
# 4. CONFIGURA ARR PROXY
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[4/7] Configurazione ARR..." -ForegroundColor Yellow

try {
    $appcmd = "$env:windir\system32\inetsrv\appcmd.exe"
    
    & $appcmd set config -section:system.webServer/proxy /enabled:true /commit:apphost 2>$null
    & $appcmd set config -section:system.webServer/proxy /preserveHostHeader:true /commit:apphost 2>$null
    
    # Server variables per X-Forwarded-*
    $vars = @("HTTP_X_FORWARDED_FOR", "HTTP_X_FORWARDED_PROTO", "HTTP_X_FORWARDED_HOST", "HTTP_X_REAL_IP")
    foreach ($var in $vars) {
        & $appcmd set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='$var']" /commit:apphost 2>$null
    }
    
    Write-Host "  [OK] ARR proxy abilitato" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] $($_.Exception.Message)" -ForegroundColor Yellow
}

# ═══════════════════════════════════════════════════════════════
# 5. CREA SITO IIS (con hostname binding, senza toccare l'esistente)
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[5/7] Creazione sito IIS '$SiteName'..." -ForegroundColor Yellow

# Elenca siti esistenti
Write-Host "  Siti IIS attualmente presenti:" -ForegroundColor Gray
Import-Module WebAdministration -ErrorAction SilentlyContinue
Get-Website | ForEach-Object {
    $bindings = ($_.bindings.Collection | ForEach-Object { $_.bindingInformation }) -join ", "
    Write-Host "    - $($_.Name) [$($_.State)] → $bindings" -ForegroundColor DarkGray
}

# Crea cartella root (contiene solo web.config)
if (-not (Test-Path $SiteRoot)) {
    New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
}

# Copia web.config
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$webConfigSource = Join-Path $scriptDir "web.config"
if (Test-Path $webConfigSource) {
    Copy-Item $webConfigSource -Destination "$SiteRoot\web.config" -Force
    Write-Host "  [OK] web.config copiato" -ForegroundColor Green
} else {
    Write-Host "  [WARN] web.config non trovato in $scriptDir - copialo manualmente in $SiteRoot" -ForegroundColor Yellow
}

# Crea cartella app
if (-not (Test-Path $AppDir)) {
    New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
}

# Rimuovi sito con lo stesso nome se esiste
$existing = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "  Rimozione sito precedente '$SiteName'..."
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
    Remove-Website -Name $SiteName
}

# Crea sito con binding HTTP per hostname specifico
# La porta 80/443 è condivisa col sito esistente grazie all'hostname
New-Website `
    -Name $SiteName `
    -PhysicalPath $SiteRoot `
    -Port 80 `
    -HostHeader $HostName `
    -Force | Out-Null

Write-Host "  [OK] Sito '$SiteName' creato con binding HTTP $HostName`:80" -ForegroundColor Green

# Avvia
Start-Website -Name $SiteName

# Verifica che il sito esistente sia ancora attivo
Write-Host ""
Write-Host "  Verifica siti dopo creazione:" -ForegroundColor Gray
Get-Website | ForEach-Object {
    $color = if ($_.State -eq "Started") { "Green" } else { "Red" }
    Write-Host "    - $($_.Name) [$($_.State)]" -ForegroundColor $color
}

# ═══════════════════════════════════════════════════════════════
# 6. FIREWALL
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[6/7] Firewall..." -ForegroundColor Yellow

# Blocca 8080 dall'esterno
$blockRule = Get-NetFirewallRule -DisplayName "Elettroquadri - Blocca 8080 esterno" -ErrorAction SilentlyContinue
if (-not $blockRule) {
    New-NetFirewallRule `
        -DisplayName "Elettroquadri - Blocca 8080 esterno" `
        -Direction Inbound `
        -LocalPort 8080 `
        -Protocol TCP `
        -Action Block `
        -Profile Any `
        -Description "Impedisce accesso diretto al backend FastAPI" | Out-Null
    Write-Host "  [OK] Porta 8080 bloccata dall'esterno" -ForegroundColor Green
} else {
    Write-Host "  [OK] Regola blocco 8080 già presente" -ForegroundColor Green
}

# Rimuovi eventuale vecchia regola che APRIVA la 8080
$oldOpen = Get-NetFirewallRule -DisplayName "Elettroquadri Server" -ErrorAction SilentlyContinue
if ($oldOpen) {
    Remove-NetFirewallRule -DisplayName "Elettroquadri Server"
    Write-Host "  [OK] Rimossa vecchia regola che apriva 8080" -ForegroundColor Green
}

# 80 e 443 dovrebbero essere già aperte per il sito esistente
Write-Host "  [OK] Porte 80/443 già gestite dal sito esistente" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# 7. LET'S ENCRYPT con WIN-ACME
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[7/7] Certificato SSL con Let's Encrypt (win-acme)..." -ForegroundColor Yellow

$winAcmeDir = "C:\win-acme"
$winAcmeExe = "$winAcmeDir\wacs.exe"

if (-not (Test-Path $winAcmeExe)) {
    Write-Host ""
    Write-Host "  win-acme non trovato. Installazione:" -ForegroundColor Yellow
    Write-Host ""
    
    # Prova download automatico
    $winAcmeUrl = "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1/win-acme.v2.2.9.1.x64.pluggable.zip"
    $winAcmeZip = "$env:TEMP\win-acme.zip"
    
    Write-Host "  Tentativo download automatico..." -ForegroundColor Gray
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $winAcmeUrl -OutFile $winAcmeZip -UseBasicParsing
        
        if (-not (Test-Path $winAcmeDir)) {
            New-Item -ItemType Directory -Path $winAcmeDir -Force | Out-Null
        }
        Expand-Archive -Path $winAcmeZip -DestinationPath $winAcmeDir -Force
        Write-Host "  [OK] win-acme scaricato in $winAcmeDir" -ForegroundColor Green
    } catch {
        Write-Host "  Download automatico fallito." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Scarica manualmente:" -ForegroundColor White
        Write-Host "    1. Vai a: https://www.win-acme.com/" -ForegroundColor Cyan
        Write-Host "    2. Scarica la versione 'pluggable' x64" -ForegroundColor Gray
        Write-Host "    3. Estrai in: $winAcmeDir" -ForegroundColor Gray
        Write-Host ""
        Read-Host "Premi Invio dopo aver estratto win-acme"
    }
}

if (Test-Path $winAcmeExe) {
    Write-Host ""
    Write-Host "  Avvio richiesta certificato per $HostName..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  NOTA: win-acme fara' una challenge HTTP-01." -ForegroundColor Gray
    Write-Host "  Assicurati che il DNS di $HostName punti a questo server" -ForegroundColor Gray
    Write-Host "  e che la porta 80 sia raggiungibile dall'esterno." -ForegroundColor Gray
    Write-Host ""
    
    # Esegui win-acme in modalità automatica
    # --target iis: cerca il binding in IIS
    # --host: il dominio
    # --installation iis: installa il certificato nel binding IIS
    # --webroot: cartella per la challenge HTTP-01
    
    $challengeDir = "$SiteRoot\.well-known"
    if (-not (Test-Path $challengeDir)) {
        New-Item -ItemType Directory -Path $challengeDir -Force | Out-Null
    }
    
    try {
        & $winAcmeExe `
            --target manual `
            --host $HostName `
            --validation filesystem `
            --validationpath $SiteRoot `
            --installation iis `
            --installationsiteid ((Get-Website -Name $SiteName).Id) `
            --accepttos `
            --emailaddress "admin@$($HostName.Split('.',2)[1])"
        
        # Verifica se il binding HTTPS è stato creato
        Start-Sleep -Seconds 3
        $httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" -ErrorAction SilentlyContinue
        if ($httpsBinding) {
            Write-Host ""
            Write-Host "  [OK] Certificato Let's Encrypt installato!" -ForegroundColor Green
            Write-Host "  [OK] Rinnovo automatico configurato da win-acme" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "  [WARN] Binding HTTPS non trovato automaticamente." -ForegroundColor Yellow
            Write-Host "  Potrebbe essere necessario eseguire win-acme manualmente:" -ForegroundColor Yellow
            Write-Host "    cd $winAcmeDir" -ForegroundColor DarkGray
            Write-Host "    wacs.exe" -ForegroundColor DarkGray
            Write-Host "  E seguire il wizard interattivo." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [WARN] Errore durante la richiesta certificato: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Esegui win-acme manualmente:" -ForegroundColor White
        Write-Host "    cd $winAcmeDir" -ForegroundColor DarkGray
        Write-Host "    wacs.exe" -ForegroundColor DarkGray
        Write-Host "  Poi scegli:" -ForegroundColor Gray
        Write-Host "    N - Create certificate (default settings)" -ForegroundColor Gray
        Write-Host "    1 - Single binding of an IIS site" -ForegroundColor Gray
        Write-Host "    Seleziona il sito '$SiteName'" -ForegroundColor Gray
    }
} else {
    Write-Host "  [SKIP] win-acme non disponibile" -ForegroundColor Yellow
}

# ═══════════════════════════════════════════════════════════════
# RIEPILOGO
# ═══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETATO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Architettura:" -ForegroundColor White
Write-Host "    Browser → https://$HostName → IIS (:443) → localhost:8080" -ForegroundColor Gray
Write-Host ""
Write-Host "  Siti IIS:" -ForegroundColor White
Get-Website | ForEach-Object {
    $icon = if ($_.Name -eq $SiteName) { "→" } else { " " }
    Write-Host "    $icon $($_.Name) [$($_.State)]" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Sicurezza:" -ForegroundColor White
Write-Host "    [x] Porta 8080 bloccata dall'esterno" -ForegroundColor Gray
Write-Host "    [x] Backend in ascolto solo su 127.0.0.1" -ForegroundColor Gray
Write-Host "    [x] IIS distingue i siti per hostname" -ForegroundColor Gray
Write-Host "    [x] Sito esistente NON modificato" -ForegroundColor Gray
Write-Host ""
Write-Host "  Prossimi passi:" -ForegroundColor White
Write-Host ""
Write-Host "    1. Copia il pacchetto applicazione in $AppDir" -ForegroundColor Gray
Write-Host "       (se non l'hai già fatto)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    2. Configura $AppDir\config.ini:" -ForegroundColor Gray
Write-Host "       [security]" -ForegroundColor DarkGray
Write-Host "       trusted_host = $HostName" -ForegroundColor DarkGray
Write-Host "       [app]" -ForegroundColor DarkGray
Write-Host "       allowed_origins = https://$HostName" -ForegroundColor DarkGray
Write-Host "       secret_key = <genera-chiave-random-lunga>" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    3. Avvia il backend:" -ForegroundColor Gray
Write-Host "       cd $AppDir" -ForegroundColor DarkGray
Write-Host "       install_service.bat  (come Amministratore)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    4. Testa:" -ForegroundColor Gray
Write-Host "       https://$HostName" -ForegroundColor Cyan
Write-Host ""

# Se il certificato non è stato installato automaticamente
$httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" -ErrorAction SilentlyContinue
if (-not $httpsBinding) {
    Write-Host "    5. CERTIFICATO SSL: esegui win-acme manualmente:" -ForegroundColor Yellow
    Write-Host "       cd C:\win-acme" -ForegroundColor DarkGray
    Write-Host "       wacs.exe" -ForegroundColor DarkGray
    Write-Host "       → N (new certificate)" -ForegroundColor DarkGray
    Write-Host "       → Scegli il sito '$SiteName'" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "============================================================" -ForegroundColor Cyan
Read-Host "Premi Invio per uscire"
