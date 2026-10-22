$ErrorActionPreference = 'Stop'

# Generate a unique container name
$containerName = "yziow_pg_test_$(Get-Date -Format 'yyyyMMdd_HHmmss')_$(Get-Random)"

# Start PostgreSQL 17 container (alpine)
# Using default postgres user/password, we set custom ones for clarity
$pgUser = "postgres"
$pgPassword = "postgres"
$pgDatabase = "testdb"

Write-Host "Starting PostgreSQL container $containerName..."
# Ensure any stale container with same name is removed if it exists
if (docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $containerName }) { docker rm -f $containerName | Out-Null }
# Run container with automatic removal on stop and random host port mapping
docker run -d --rm --name $containerName -e POSTGRES_PASSWORD=$pgPassword -e POSTGRES_DB=$pgDatabase -P postgres:17-alpine
if ($LASTEXITCODE -ne 0) { Write-Host "Docker run failed with exit code $LASTEXITCODE. Aborting."; exit $LASTEXITCODE }
$hostPort = (docker port $containerName 5432).Split(":")[1].Trim()

while ($true) {
  $ready = docker exec $containerName pg_isready -U $pgUser -d $pgDatabase
  if ($ready -match "accepting connections") { break }
  Start-Sleep -Seconds 1
}
Write-Host "PostgreSQL is ready."
# PostgreSQL ready (duplicate removed)

# Set DATABASE_URL for the test scripts
$env:DATABASE_URL = "postgres://${pgUser}:${pgPassword}@127.0.0.1:${hostPort}/${pgDatabase}"
Write-Host "DATABASE_URL set to $env:DATABASE_URL"

# Initialize test exit code (Fail-Closed)
$testExitCode = 1

try {
  $basePath = Split-Path $PSScriptRoot -Parent
  $projectRoot = Split-Path $basePath -Parent

  # 1. Bootstrap isolated test environment (Supabase roles, platform schools table, test school)
  Write-Host "Bootstrapping test environment..."
  $bootstrapFile = "$PSScriptRoot/bootstrap_parent_pack_test_db.sql"
  docker cp $bootstrapFile "${containerName}:/tmp/bootstrap_parent_pack_test_db.sql"
  docker exec $containerName psql -U $pgUser -d $pgDatabase -v ON_ERROR_STOP=1 -f /tmp/bootstrap_parent_pack_test_db.sql
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Bootstrap failed with exit code $LASTEXITCODE. Aborting."
    exit $LASTEXITCODE
  }

  # 2. Apply sequential official migrations up to P27 using psql with ON_ERROR_STOP=1
  $migrations = @(
    "$basePath/scripts/03_add_affiliate_system.sql",
    "$basePath/scripts/migration_p2_fedapay_webhook_security.sql",
    "$basePath/scripts/migration_p13_affiliate_financial_ledger.sql",
    "$basePath/scripts/migration_p19_parent_pack_foundation.sql",
    "$basePath/scripts/migration_p24_parent_pack_global_student_checkout.sql",
    "$basePath/scripts/migration_p27_parent_pack_reconciliation_defense.sql"
  )
  foreach ($m in $migrations) {
    Write-Host "Applying migration $m..."
    docker cp $m "${containerName}:/tmp/$(Split-Path $m -Leaf)"
    docker exec $containerName psql -U $pgUser -d $pgDatabase -v ON_ERROR_STOP=1 -f /tmp/$(Split-Path $m -Leaf)
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Migration $m failed with exit code $LASTEXITCODE. Aborting."
      exit $LASTEXITCODE
    }
  }

  # 3. Run backend test suite and capture exact exit code
  Write-Host "Running backend tests..."
  Set-Location $projectRoot
  npm run test:backend
  $testExitCode = $LASTEXITCODE
  Write-Host "Backend tests exited with code $testExitCode"
} finally {
  Write-Host "Cleaning up Docker container..."
  if (docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $containerName }) {
    docker stop $containerName | Out-Null
    docker rm $containerName | Out-Null
  }
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

exit $testExitCode
