[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string] $ProjectId,

  [ValidateNotNullOrEmpty()]
  [string] $Region = 'southamerica-east1',

  [ValidateNotNullOrEmpty()]
  [string] $EnvFile = '.env'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serviceName = 'fluxo-api'
$jobName = 'fluxo-api-maintenance'
$repositoryName = 'fluxo'
$runtimeServiceAccountName = 'fluxo-api-runtime'
$schedulerServiceAccountName = 'fluxo-maintenance-invoker'
$schedulerJobName = 'fluxo-daily-maintenance'
$budgetDisplayName = 'Fluxo API - R$ 50'

function Invoke-Gcloud {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,

    [switch] $Capture
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  if ($Capture) {
    $output = & $script:gcloudCommand @Arguments 2>$null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($exitCode -ne 0) {
      throw "gcloud failed with exit code $exitCode."
    }
    return (@($output) -join "`n").Trim()
  }

  & $script:gcloudCommand @Arguments
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "gcloud failed with exit code $exitCode."
  }
}

function Read-DotEnv {
  param([Parameter(Mandatory = $true)][string] $Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }
    if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      throw "Invalid .env entry. Expected KEY=VALUE."
    }

    $key = $Matches[1]
    $value = $Matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Assert-RequiredEnvironment {
  param([Parameter(Mandatory = $true)][hashtable] $Values)

  $required = @(
    'DATABASE_URL',
    'DIRECT_URL',
    'JWT_SECRET_CURRENT',
    'REFRESH_TOKEN_PEPPER',
    'CORS_ORIGINS'
  )
  foreach ($key in $required) {
    if (-not $Values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Values[$key])) {
      throw "Required environment variable $key is missing."
    }
  }

  $databaseUri = [Uri] $Values['DATABASE_URL']
  $directUri = [Uri] $Values['DIRECT_URL']
  if (-not $databaseUri.Host.Contains('-pooler.')) {
    throw 'DATABASE_URL must use the pooled Neon hostname.'
  }
  if ($directUri.Host.Contains('-pooler.')) {
    throw 'DIRECT_URL must use the direct Neon hostname.'
  }
  if ($Values['JWT_SECRET_CURRENT'].Length -lt 32) {
    throw 'JWT_SECRET_CURRENT must contain at least 32 characters.'
  }
  if ($Values['REFRESH_TOKEN_PEPPER'].Length -lt 32) {
    throw 'REFRESH_TOKEN_PEPPER must contain at least 32 characters.'
  }
}

function Test-GcloudResource {
  param([Parameter(Mandatory = $true)][string[]] $Arguments)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $script:gcloudCommand @Arguments 1>$null 2>$null
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  return $exitCode -eq 0
}

function Add-SecretVersionFromMemory {
  param(
    [Parameter(Mandatory = $true)][string] $SecretName,
    [Parameter(Mandatory = $true)][string] $Value
  )

  $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $processInfo.FileName = $env:ComSpec
  $processInfo.Arguments =
    "/d /s /c `"`"$script:gcloudCommand`" secrets versions add $SecretName " +
    "--data-file=- --project=$ProjectId --quiet --format=value(name)`""
  $processInfo.UseShellExecute = $false
  $processInfo.RedirectStandardInput = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $processInfo.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $processInfo
  if (-not $process.Start()) {
    throw "Could not start gcloud for secret $SecretName."
  }
  $process.StandardInput.Write($Value)
  $process.StandardInput.Close()
  $versionName = $process.StandardOutput.ReadToEnd().Trim()
  $process.StandardError.ReadToEnd() | Out-Null
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($versionName)) {
    throw "Could not add a version to secret $SecretName."
  }
  return ($versionName -split '/')[-1]
}

function Get-CurrentSecretVersion {
  param(
    [Parameter(Mandatory = $true)][string] $SecretName,
    [Parameter(Mandatory = $true)][string] $ExpectedValue
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $existingValue = & $script:gcloudCommand secrets versions access latest `
    "--secret=$SecretName" "--project=$ProjectId" 2>$null
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    return $null
  }
  $joinedValue = @($existingValue) -join "`n"
  if ($joinedValue -cne $ExpectedValue) {
    return $null
  }

  return Invoke-Gcloud -Capture -Arguments @(
    'secrets', 'versions', 'list', $SecretName,
    "--project=$ProjectId",
    '--filter=state=enabled',
    '--sort-by=~createTime',
    '--limit=1',
    '--format=value(name)'
  ) | ForEach-Object { ($_ -split '/')[-1] }
}

function Remove-StaleSecretVersions {
  param(
    [Parameter(Mandatory = $true)][string] $SecretName,
    [Parameter(Mandatory = $true)][string] $CurrentVersion
  )

  $versions = Invoke-Gcloud -Capture -Arguments @(
    'secrets', 'versions', 'list', $SecretName,
    "--project=$ProjectId",
    '--filter=state=enabled',
    '--format=value(name)'
  )
  foreach ($versionName in @($versions -split "`n")) {
    if ([string]::IsNullOrWhiteSpace($versionName)) {
      continue
    }
    $version = ($versionName -split '/')[-1]
    if ($version -ne $CurrentVersion) {
      Invoke-Gcloud -Arguments @(
        'secrets', 'versions', 'destroy', $version,
        "--secret=$SecretName",
        "--project=$ProjectId",
        '--quiet'
      )
    }
  }
}

$gcloud = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if (-not $gcloud) {
  throw 'Google Cloud CLI is not installed or is not available on PATH.'
}
$script:gcloudCommand = $gcloud.Source

$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
$environment = Read-DotEnv -Path $resolvedEnvFile
Assert-RequiredEnvironment -Values $environment

$activeAccount = Invoke-Gcloud -Capture -Arguments @(
  'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'
)
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
  throw 'No active Google Cloud account. Run gcloud auth login first.'
}

Invoke-Gcloud -Arguments @('config', 'set', 'project', $ProjectId, '--quiet')
$billingAccountName = Invoke-Gcloud -Capture -Arguments @(
  'billing', 'projects', 'describe', $ProjectId,
  '--format=value(billingAccountName)'
)
if ([string]::IsNullOrWhiteSpace($billingAccountName)) {
  throw "Project $ProjectId does not have an active billing account."
}
$billingAccountId = ($billingAccountName -split '/')[-1]
$projectNumber = Invoke-Gcloud -Capture -Arguments @(
  'projects', 'describe', $ProjectId, '--format=value(projectNumber)'
)

Invoke-Gcloud -Arguments @(
  'services', 'enable',
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com',
  'cloudscheduler.googleapis.com',
  'billingbudgets.googleapis.com',
  'iam.googleapis.com',
  "--project=$ProjectId",
  '--quiet'
)

$runtimeServiceAccount =
  "$runtimeServiceAccountName@$ProjectId.iam.gserviceaccount.com"
$schedulerServiceAccount =
  "$schedulerServiceAccountName@$ProjectId.iam.gserviceaccount.com"

if (-not (Test-GcloudResource -Arguments @(
      'iam', 'service-accounts', 'describe', $runtimeServiceAccount,
      "--project=$ProjectId"
    ))) {
  Invoke-Gcloud -Arguments @(
    'iam', 'service-accounts', 'create', $runtimeServiceAccountName,
    '--display-name=Fluxo API runtime',
    "--project=$ProjectId",
    '--quiet'
  )
}
if (-not (Test-GcloudResource -Arguments @(
      'iam', 'service-accounts', 'describe', $schedulerServiceAccount,
      "--project=$ProjectId"
    ))) {
  Invoke-Gcloud -Arguments @(
    'iam', 'service-accounts', 'create', $schedulerServiceAccountName,
    '--display-name=Fluxo maintenance invoker',
    "--project=$ProjectId",
    '--quiet'
  )
}

$secretDefinitions = [ordered] @{
  DATABASE_URL = 'fluxo-database-url'
  DIRECT_URL = 'fluxo-direct-url'
  JWT_SECRET_CURRENT = 'fluxo-jwt-secret-current'
  REFRESH_TOKEN_PEPPER = 'fluxo-refresh-token-pepper'
}
$secretVersions = [ordered] @{}

foreach ($entry in $secretDefinitions.GetEnumerator()) {
  $secretName = $entry.Value
  if (-not (Test-GcloudResource -Arguments @(
        'secrets', 'describe', $secretName, "--project=$ProjectId"
      ))) {
    Invoke-Gcloud -Arguments @(
      'secrets', 'create', $secretName,
      '--replication-policy=automatic',
      "--project=$ProjectId",
      '--quiet'
    )
  }

  $version = Get-CurrentSecretVersion `
    -SecretName $secretName `
    -ExpectedValue $environment[$entry.Key]
  if ([string]::IsNullOrWhiteSpace($version)) {
    $version = Add-SecretVersionFromMemory `
      -SecretName $secretName `
      -Value $environment[$entry.Key]
  }
  $secretVersions[$entry.Key] = $version

  Invoke-Gcloud -Arguments @(
    'secrets', 'add-iam-policy-binding', $secretName,
    "--member=serviceAccount:$runtimeServiceAccount",
    '--role=roles/secretmanager.secretAccessor',
    "--project=$ProjectId",
    '--quiet'
  )
}

$env:DIRECT_URL = $environment['DIRECT_URL']
corepack pnpm prisma:deploy
if ($LASTEXITCODE -ne 0) {
  throw 'Prisma migration deployment failed.'
}

if (-not (Test-GcloudResource -Arguments @(
      'artifacts', 'repositories', 'describe', $repositoryName,
      "--location=$Region", "--project=$ProjectId"
    ))) {
  Invoke-Gcloud -Arguments @(
    'artifacts', 'repositories', 'create', $repositoryName,
    '--repository-format=docker',
    "--location=$Region",
    '--description=Fluxo API container images',
    "--project=$ProjectId",
    '--quiet'
  )
}

$gitSha = (git rev-parse --short=12 HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Could not resolve the current Git commit.'
}
$image = "$Region-docker.pkg.dev/$ProjectId/$repositoryName/${serviceName}:$gitSha"
Invoke-Gcloud -Arguments @(
  'builds', 'submit',
  "--tag=$image",
  "--project=$ProjectId",
  '--quiet',
  '.'
)

$plainEnvironmentFile = [System.IO.Path]::GetTempFileName()
$escapedCorsOrigins = $environment['CORS_ORIGINS'].Replace("'", "''")
$plainEnvironmentContents = @"
NODE_ENV: 'production'
CORS_ORIGINS: '$escapedCorsOrigins'
"@
[System.IO.File]::WriteAllText(
  $plainEnvironmentFile,
  $plainEnvironmentContents,
  [System.Text.UTF8Encoding]::new($false)
)
$secretArguments = @(
  "DATABASE_URL=$($secretDefinitions['DATABASE_URL']):$($secretVersions['DATABASE_URL'])",
  "DIRECT_URL=$($secretDefinitions['DIRECT_URL']):$($secretVersions['DIRECT_URL'])",
  "JWT_SECRET_CURRENT=$($secretDefinitions['JWT_SECRET_CURRENT']):$($secretVersions['JWT_SECRET_CURRENT'])",
  "REFRESH_TOKEN_PEPPER=$($secretDefinitions['REFRESH_TOKEN_PEPPER']):$($secretVersions['REFRESH_TOKEN_PEPPER'])"
) -join ','

try {
  Invoke-Gcloud -Arguments @(
    'run', 'deploy', $serviceName,
    "--image=$image",
    "--region=$Region",
    '--platform=managed',
    '--cpu=1',
    '--memory=512Mi',
    '--min=0',
    '--max=3',
    '--concurrency=10',
    '--timeout=60',
    '--cpu-throttling',
    '--no-cpu-boost',
    '--allow-unauthenticated',
    '--ingress=all',
    "--service-account=$runtimeServiceAccount",
    "--env-vars-file=$plainEnvironmentFile",
    "--set-secrets=$secretArguments",
    '--startup-probe=httpGet.path=/health/ready,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=12',
    '--liveness-probe=httpGet.path=/health/live,initialDelaySeconds=0,timeoutSeconds=2,periodSeconds=30,failureThreshold=3',
    "--project=$ProjectId",
    '--quiet'
  )

  Invoke-Gcloud -Arguments @(
    'run', 'jobs', 'deploy', $jobName,
    "--image=$image",
    "--region=$Region",
    '--cpu=1',
    '--memory=512Mi',
    '--tasks=1',
    '--parallelism=1',
    '--max-retries=1',
    '--task-timeout=10m',
    "--service-account=$runtimeServiceAccount",
    "--env-vars-file=$plainEnvironmentFile",
    "--set-secrets=$secretArguments",
    '--command=node',
    '--args=dist/maintenance.js',
    "--project=$ProjectId",
    '--quiet'
  )
} finally {
  [System.IO.File]::Delete($plainEnvironmentFile)
}

Invoke-Gcloud -Arguments @(
  'run', 'jobs', 'add-iam-policy-binding', $jobName,
  "--region=$Region",
  "--member=serviceAccount:$schedulerServiceAccount",
  '--role=roles/run.invoker',
  "--project=$ProjectId",
  '--quiet'
)

$jobRunUri =
  "https://run.googleapis.com/v2/projects/$ProjectId/locations/$Region/jobs/${jobName}:run"
$schedulerArguments = @(
  '--schedule=0 6 * * *',
  '--time-zone=America/Sao_Paulo',
  '--http-method=POST',
  "--uri=$jobRunUri",
  "--oauth-service-account-email=$schedulerServiceAccount",
  '--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform',
  '--attempt-deadline=600s',
  "--location=$Region",
  "--project=$ProjectId",
  '--quiet'
)
if (Test-GcloudResource -Arguments @(
    'scheduler', 'jobs', 'describe', $schedulerJobName,
    "--location=$Region", "--project=$ProjectId"
  )) {
  Invoke-Gcloud -Arguments (@(
      'scheduler', 'jobs', 'update', 'http', $schedulerJobName
    ) + $schedulerArguments)
} else {
  Invoke-Gcloud -Arguments (@(
      'scheduler', 'jobs', 'create', 'http', $schedulerJobName
    ) + $schedulerArguments)
}

$existingBudget = Invoke-Gcloud -Capture -Arguments @(
  'billing', 'budgets', 'list',
  "--billing-account=$billingAccountId",
  "--filter=displayName='$budgetDisplayName'",
  '--format=value(name)'
)
if ([string]::IsNullOrWhiteSpace($existingBudget)) {
  Invoke-Gcloud -Arguments @(
    'billing', 'budgets', 'create',
    "--billing-account=$billingAccountId",
    "--display-name=$budgetDisplayName",
    '--budget-amount=50BRL',
    "--filter-projects=projects/$projectNumber",
    '--calendar-period=month',
    '--threshold-rule=percent=0.10,basis=current-spend',
    '--threshold-rule=percent=0.20,basis=current-spend',
    '--threshold-rule=percent=0.40,basis=current-spend',
    '--threshold-rule=percent=1.00,basis=current-spend',
    '--quiet'
  )
}

foreach ($entry in $secretDefinitions.GetEnumerator()) {
  Remove-StaleSecretVersions `
    -SecretName $entry.Value `
    -CurrentVersion $secretVersions[$entry.Key]
}

$serviceUrl = Invoke-Gcloud -Capture -Arguments @(
  'run', 'services', 'describe', $serviceName,
  "--region=$Region",
  "--project=$ProjectId",
  '--format=value(status.url)'
)
Write-Output "Cloud Run service: $serviceUrl"
Write-Output "Cloud Run job: $jobName"
Write-Output "Cloud Scheduler job: $schedulerJobName"
Write-Output "Budget: $budgetDisplayName"
