Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $changed = $false
    if ($content -match "localhost:8000/api'") {
        $content = $content -replace "localhost:8000/api'", "localhost:8000'"
        $changed = $true
    }
    if ($content -match 'localhost:8000/api"') {
        $content = $content -replace 'localhost:8000/api"', 'localhost:8000"'
        $changed = $true
    }
    if ($changed) {
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed: $($_.Name)"
    }
}