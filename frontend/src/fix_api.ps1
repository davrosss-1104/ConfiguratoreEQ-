Get-ChildItem -Recurse -Include *.ts,*.tsx | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "localhost:8000'") {
        $content = $content -replace "localhost:8000'", "localhost:8000/api'"
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed: $($_.Name)"
    }
    if ($content -match 'localhost:8000"') {
        $content = Get-Content $_.FullName -Raw
        $content = $content -replace 'localhost:8000"', 'localhost:8000/api"'
        Set-Content $_.FullName -Value $content -NoNewline
        Write-Host "Fixed: $($_.Name)"
    }
}
```

Poi esegui:
```
powershell -ExecutionPolicy Bypass -File fix_api.ps1
```

Poi verifica:
```
powershell -Command "Get-ChildItem -Recurse -Include *.ts,*.tsx | Select-String 'localhost:8000' | ForEach-Object { $_.Filename + ':' + $_.Line.Trim() }"