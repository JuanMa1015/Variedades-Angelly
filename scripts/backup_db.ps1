<#
.SYNOPSIS
  Backup de la base de datos PostgreSQL a un archivo comprimido.
.DESCRIPTION
  Toma un dump de la BD usando pg_dump, lo comprime y limpia dumps viejos.
.PARAMETER OutputDir
  Directorio donde guardar los backups (default: ./backups)
.PARAMETER RetainDays
  Dias a conservar backups (default: 30)
#>

param(
    [string]$OutputDir = "./backups",
    [int]$RetainDays = 30
)

$ErrorActionPreference = "Stop"

# Cargar variables de entorno desde .env (raiz del proyecto)
$envFile = Join-Path -Path $PSScriptRoot -ChildPath "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)=(.*)") {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            Set-Item -Path "env:$key" -Value $val -ErrorAction SilentlyContinue
        }
    }
}

$connStr = $env:DATABASE_URL
if (-not $connStr) {
    Write-Error "DATABASE_URL no definida. Verifica .env"
    exit 1
}

# Parsear connection string: postgresql://user:pass@host:port/db
$pattern = '^postgresql(?:s|)\://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)$'
if ($connStr -notmatch $pattern) {
    Write-Error "No se pudo parsear DATABASE_URL"
    exit 1
}

$user = $matches[1]
$pass = $matches[2]
$hostname = $matches[3]
$port = $matches[4]
$dbname = $matches[5]

# Crear directorio de backups si no existe
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpFile = Join-Path $OutputDir "variedades_angelly_$timestamp.dump"

Write-Host "Iniciando backup de $dbname en $hostname:$port ..."

# Usar formato custom (-Fc) para compresion y restauracion selectiva
$env:PGPASSWORD = $pass
& pg_dump -h $hostname -p $port -U $user -Fc -f $dumpFile -d $dbname
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump fallo con codigo $LASTEXITCODE"
    exit 1
}

Write-Host "Backup creado: $dumpFile"

# Comprimir con gzip si esta disponible
if (Get-Command gzip -ErrorAction SilentlyContinue) {
    & gzip -f $dumpFile
    $dumpFile = "$dumpFile.gz"
    Write-Host "Comprimido: $dumpFile"
}

# Limpiar backups viejos
$cutoff = (Get-Date).AddDays(-$RetainDays)
Get-ChildItem -Path $OutputDir -Filter "variedades_angelly_*" | Where-Object {
    $_.LastWriteTime -lt $cutoff
} | ForEach-Object {
    Remove-Item -Path $_.FullName -Force
    Write-Host "Eliminado backup viejo: $($_.Name)"
}

Write-Host "Backup completado exitosamente."
