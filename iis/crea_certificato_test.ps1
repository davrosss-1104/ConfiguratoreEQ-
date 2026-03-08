#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Crea certificato SSL self-signed per test locale.
    Per produzione usare win-acme (Let's Encrypt) o certificato acquistato.
#>
param(
    [string]$Domain = "localhost"
)

Write-Host "Creazione certificato self-signed per: $Domain" -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
    -DnsName $Domain, "localhost", "127.0.0.1" `
    -CertStoreLocation "Cert:\LocalMachine\My" `
    -FriendlyName "Elettroquadri Self-Signed ($Domain)" `
    -NotAfter (Get-Date).AddYears(2) `
    -KeyAlgorithm RSA `
    -KeyLength 2048

Write-Host ""
Write-Host "[OK] Certificato creato!" -ForegroundColor Green
Write-Host "  Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
Write-Host "  Scadenza:   $($cert.NotAfter)" -ForegroundColor Gray
Write-Host ""
Write-Host "NOTA: Il browser mostrera' un avviso 'connessione non sicura'" -ForegroundColor Yellow
Write-Host "perche' il certificato e' self-signed. Questo e' normale per test." -ForegroundColor Yellow
Write-Host ""
Write-Host "Per produzione, usa win-acme per certificato Let's Encrypt gratuito:" -ForegroundColor Cyan
Write-Host "  https://www.win-acme.com/" -ForegroundColor Cyan

Read-Host "Premi Invio"
