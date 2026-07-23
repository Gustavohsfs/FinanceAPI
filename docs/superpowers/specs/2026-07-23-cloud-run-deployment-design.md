# Cloud Run Deployment Design

## Goal

Deploy the Fluxo API to Google Cloud Run with a low-cost configuration suitable
for a personal application, while preserving the scheduled maintenance
currently implemented with NestJS cron decorators.

## Constraints

- Use request-based Cloud Run billing.
- Run the public API with 1 vCPU, 512 MiB, service-level minimum 0 and maximum 3.
- Keep the public API accessible to the mobile client while application routes
  remain protected by the existing JWT guard.
- Keep database credentials and application secrets out of Git and Cloud Run
  plain-text environment configuration.
- Use the pooled Neon endpoint at runtime and the direct Neon endpoint only for
  migrations and maintenance configuration.
- Run Prisma migrations as a release step, never from the container startup
  command.
- Preserve `America/Sao_Paulo` as the financial and maintenance timezone.
- Create a R$ 50 monthly project budget with actual-spend alerts at 10%, 20%,
  40%, and 100%, corresponding to R$ 5, R$ 10, R$ 20, and R$ 50.

## Approaches Considered

### Public Cloud Run service only

This is the smallest deployment, but it is incompatible with the current
in-process cron model. Request-based billing suspends CPU outside requests and
the service scales to zero, so scheduled maintenance would not run reliably.

### Public service with minimum one instance

This preserves the in-process cron model, but requires instance-based billing
for dependable background CPU and consumes resources continuously. It conflicts
with the project's cost-safety priority.

### Public service plus scheduled Cloud Run Job

This is the selected approach. The API scales to zero, and a separate Cloud Run
Job starts only for daily maintenance. One Cloud Scheduler entry invokes the
job, remaining within the three-jobs-per-billing-account free allowance when
the account has no other scheduler jobs.

## Architecture

The existing multi-stage Dockerfile produces one immutable application image.
That image is used by:

- `fluxo-api`: public Cloud Run service running `node dist/main.js`.
- `fluxo-api-maintenance`: private Cloud Run Job running
  `node dist/maintenance.js`.

The maintenance entry point creates a Nest application context, resolves
`JobsService`, runs all daily tasks under the existing PostgreSQL advisory-style
locks, runs cleanup on Sundays in `America/Sao_Paulo`, and closes the context.
The in-process cron decorators are removed so execution has a single owner.

A single Cloud Scheduler job invokes the Cloud Run Jobs v2 `:run` API once per
day using OAuth through a dedicated service account. The service account
receives only the permission required to execute this one job.

## Runtime Configuration

Plain environment variables:

- `NODE_ENV=production`
- `CORS_ORIGINS=http://localhost:8081,app://fluxo`

Secret Manager environment variables, each pinned to version `1`:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET_CURRENT`
- `REFRESH_TOKEN_PEPPER`

Four active secret versions remain below Secret Manager's free allowance of six
active versions per billing account. Secret values are copied from the existing
local `.env` without printing them and are never written to deployment files.

The API service uses:

- region `southamerica-east1`
- request-based billing (`cpu-throttling`)
- 1 vCPU and 512 MiB
- service-level minimum 0 and maximum 3
- concurrency 10
- request timeout 60 seconds
- startup CPU boost disabled
- HTTP startup probe on `/health/ready`
- HTTP liveness probe on `/health/live`
- public ingress, with authorization enforced by the existing application guard

The maintenance job uses:

- 1 vCPU and 512 MiB
- one task
- parallelism one
- one retry
- a 10-minute task timeout

## Build and Release Flow

1. Run the complete local verification suite.
2. Apply committed Prisma migrations through the direct Neon connection.
3. Build the Docker image remotely with Cloud Build and store it in Artifact
   Registry.
4. Deploy the Cloud Run service and job from the same image digest.
5. Create or update the single Cloud Scheduler trigger.
6. Verify the deployed configuration, execute the job once manually, and smoke
   test `/health/live` and `/health/ready`.

## Cost Controls

- Service-level maximum instances is the primary runtime cost guard.
- Scale-to-zero and request-based billing avoid idle API compute charges.
- One Scheduler job and four active Secret Manager versions stay within their
  documented free allowances, assuming the billing account has no competing
  usage.
- Artifact Registry retains only the deployment image needed by the service and
  job; stale unreferenced images are removed manually after successful rollout.
- A R$ 50 monthly budget sends actual-spend alerts at R$ 5, R$ 10, R$ 20, and
  R$ 50. Budgets are observability controls and do not stop spending.
- No automated billing shutdown is configured because disabling billing can
  stop services and eventually delete resources.

## Failure Handling and Rollback

Cloud Run keeps revisions, allowing application traffic to be moved back to the
previous image. Database migrations are not rolled back automatically and must
continue following expand/contract. The scheduled job relies on existing
database locks, so retries and accidental concurrent executions do not run the
same maintenance operation simultaneously.

Deployment stops before creating Cloud resources if Google authentication,
billing linkage, required APIs, migrations, tests, or image build fail.

## Verification

- Unit test the maintenance orchestration, including Sunday-only cleanup.
- Run `pnpm verify`.
- Run `pnpm prisma:deploy`.
- Confirm the Cloud Run service reports `min=0`, `max=3`, CPU throttling,
  1 vCPU, 512 MiB, concurrency 10, and the expected probes.
- Confirm the service identity can access exactly the four secrets.
- Execute the Cloud Run Job once and confirm success.
- Confirm `/health/live` and `/health/ready` return HTTP 200.
- Confirm the budget amount and its four threshold rules.
