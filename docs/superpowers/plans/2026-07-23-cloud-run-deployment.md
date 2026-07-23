# Cloud Run Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Fluxo API and its scheduled maintenance to Google Cloud Run with scale-to-zero and explicit cost controls.

**Architecture:** One Docker image serves both a public Cloud Run service and a private Cloud Run Job. The service handles mobile API traffic; one Cloud Scheduler entry runs all maintenance once daily. Secret Manager supplies four pinned secrets, while a PowerShell deployment script makes the infrastructure repeatable.

**Tech Stack:** Node.js 22, NestJS 11, Prisma 7, Neon PostgreSQL, Docker, Google Cloud Run, Cloud Run Jobs, Cloud Scheduler, Secret Manager, Artifact Registry, Cloud Build, PowerShell 7.

## Global Constraints

- Cloud Run request-based billing with 1 vCPU, 512 MiB, service minimum 0 and service maximum 3.
- Region is `southamerica-east1`.
- Runtime uses pooled `DATABASE_URL`; migrations use direct `DIRECT_URL`.
- Migrations run before deployment and never from container startup.
- Secret values never appear in Git, generated configuration files, command output, or command-line arguments.
- One Cloud Scheduler job runs in `America/Sao_Paulo`.
- Budget is BRL 50 with actual-spend thresholds 10%, 20%, 40%, and 100%.

---

### Task 1: Request-bound maintenance orchestration

**Files:**
- Modify: `src/modules/jobs/jobs.service.ts`
- Modify: `src/modules/jobs/jobs.module.ts`
- Modify: `src/modules/jobs/jobs.service.spec.ts`

**Interfaces:**
- Consumes: existing `materializeRecurrences`, `recalculateInvoices`, `evaluateBudgets`, and `cleanupExpired` methods.
- Produces: `JobsService.runDailyMaintenance(now?: Date): Promise<void>`.

- [ ] **Step 1: Write the failing orchestration tests**

Add tests proving that the three daily operations always run in order, cleanup
runs on Sunday in São Paulo, and cleanup does not run on Monday.

```ts
it('runs daily maintenance and Sunday cleanup in order', async () => {
  await service.runDailyMaintenance(new Date('2026-07-26T12:00:00.000Z'));
  expect(calls).toEqual(['materialize', 'recalculate', 'evaluate', 'cleanup']);
});

it('does not clean up outside Sunday in São Paulo', async () => {
  await service.runDailyMaintenance(new Date('2026-07-27T12:00:00.000Z'));
  expect(calls).toEqual(['materialize', 'recalculate', 'evaluate']);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
corepack pnpm test -- src/modules/jobs/jobs.service.spec.ts
```

Expected: failure because `runDailyMaintenance` does not exist.

- [ ] **Step 3: Replace in-process cron ownership with orchestration**

Remove the `@Cron` decorators and implement:

```ts
async runDailyMaintenance(now = new Date()): Promise<void> {
  await this.materializeRecurrences();
  await this.recalculateInvoices();
  await this.evaluateBudgets();
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(now);
  if (weekday === 'Sun') await this.cleanupExpired();
}
```

Export `JobsService` from `JobsModule` so the maintenance application context
can resolve it explicitly.

- [ ] **Step 4: Run the focused test and confirm success**

Run:

```powershell
corepack pnpm test -- src/modules/jobs/jobs.service.spec.ts
```

Expected: all job service tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/jobs
git commit -m "refactor: make maintenance request-bound"
```

### Task 2: Cloud Run Job entry point

**Files:**
- Create: `src/maintenance.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AppModule` and `JobsService.runDailyMaintenance`.
- Produces: `runMaintenance(): Promise<void>` and `pnpm maintenance`.

- [ ] **Step 1: Add a failing build expectation**

Add `"maintenance": "node dist/maintenance.js"` to `package.json`, then run:

```powershell
corepack pnpm build
Test-Path dist/maintenance.js
```

Expected before creating the source file: `False`.

- [ ] **Step 2: Implement the maintenance entry point**

Create an application context, attach the existing Pino logger, run
`JobsService.runDailyMaintenance`, and always close the context:

```ts
export async function runMaintenance(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    await app.get(JobsService).runDailyMaintenance();
  } finally {
    await app.close();
  }
}
```

The executable branch catches failures, writes only a generic message to
stderr, and sets `process.exitCode = 1`.

- [ ] **Step 3: Build and verify the generated entry point**

Run:

```powershell
corepack pnpm build
node --check dist/maintenance.js
```

Expected: both commands exit successfully.

- [ ] **Step 4: Commit**

```powershell
git add src/maintenance.ts package.json
git commit -m "feat: add Cloud Run maintenance entrypoint"
```

### Task 3: Repeatable Google Cloud deployment

**Files:**
- Create: `scripts/deploy-cloud-run.ps1`
- Modify: `README.md`

**Interfaces:**
- Consumes: `-ProjectId`, optional `-Region`, local `.env`, Git HEAD, and authenticated `gcloud`.
- Produces: Artifact Registry image, Cloud Run service, Cloud Run Job, Cloud Scheduler trigger, Secret Manager bindings, and billing budget.

- [ ] **Step 1: Implement preflight and secret-safe input**

The script must:

- stop when `.env`, `gcloud`, a project billing link, or an active account is missing;
- parse `.env` without printing values;
- verify pooled and direct Neon hostnames;
- send secret bytes through redirected stdin to
  `gcloud secrets versions add --data-file=-`;
- pin Cloud Run references to the newly-created numeric secret version.

- [ ] **Step 2: Implement build and service deployment**

Enable only:

```text
artifactregistry.googleapis.com
cloudbuild.googleapis.com
run.googleapis.com
secretmanager.googleapis.com
cloudscheduler.googleapis.com
billingbudgets.googleapis.com
iam.googleapis.com
```

Create the `fluxo` Docker repository if absent, build one Git-SHA-tagged image,
and deploy `fluxo-api` with:

```text
--cpu=1
--memory=512Mi
--min=0
--max=3
--concurrency=10
--timeout=60
--cpu-throttling
--no-cpu-boost
--allow-unauthenticated
--ingress=all
```

Set `/health/ready` as startup probe and `/health/live` as liveness probe.

- [ ] **Step 3: Implement maintenance job and scheduler**

Deploy `fluxo-api-maintenance` from the exact same image with command
`node`, args `dist/maintenance.js`, one task, parallelism one, one retry, and a
10-minute timeout.

Create `fluxo-maintenance-invoker`, grant it `roles/run.invoker` for the job,
and create one scheduler entry at `0 6 * * *` in `America/Sao_Paulo` targeting:

```text
https://run.googleapis.com/v2/projects/$ProjectId/locations/$Region/jobs/fluxo-api-maintenance:run
```

Use an OAuth service-account token with scope
`https://www.googleapis.com/auth/cloud-platform`.

- [ ] **Step 4: Implement budget creation**

Resolve the project's billing account. Create `Fluxo API - R$ 50` only when an
equivalent project-filtered budget is absent:

```text
--budget-amount=50BRL
--calendar-period=month
--threshold-rule=percent=0.10,basis=current-spend
--threshold-rule=percent=0.20,basis=current-spend
--threshold-rule=percent=0.40,basis=current-spend
--threshold-rule=percent=1.00,basis=current-spend
```

- [ ] **Step 5: Document deploy and rollback**

README must state the deploy command, the four managed secrets, the cost
settings, the budget's alert-only nature, the maintenance schedule, and the
Cloud Run revision rollback command.

- [ ] **Step 6: Lint the script and commit**

Parse the PowerShell script without executing it:

```powershell
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path scripts/deploy-cloud-run.ps1),
  [ref]$null,
  [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List; exit 1 }
```

Then commit:

```powershell
git add scripts/deploy-cloud-run.ps1 README.md
git commit -m "ops: add cost-safe Cloud Run deployment"
```

### Task 4: Local and database verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed implementation.
- Produces: fresh evidence that code, migrations, and Docker build inputs are valid.

- [ ] **Step 1: Run the full project verification**

```powershell
corepack pnpm verify
```

Expected: Prisma validation/generation, lint, typecheck, unit tests, e2e tests,
build, syntax check, OpenAPI generation, and formatting all pass.

- [ ] **Step 2: Apply production migrations**

```powershell
corepack pnpm prisma:deploy
```

Expected: no pending migrations or successful application of committed
migrations through `DIRECT_URL`.

- [ ] **Step 3: Confirm a clean tracked worktree**

```powershell
git status --short
```

Expected: no output.

### Task 5: Google authentication and deployment

**Files:**
- External Google Cloud resources only.

**Interfaces:**
- Consumes: authenticated Google account, selected project with active billing, and the deployment script.
- Produces: production API URL and successful maintenance execution.

- [ ] **Step 1: Install and authenticate Google Cloud CLI**

Install `Google.CloudSDK` through WinGet. Run:

```powershell
gcloud auth login --no-launch-browser
```

Send the generated URL to the user, wait for OAuth completion, and list projects.

- [ ] **Step 2: Deploy**

```powershell
pwsh -File scripts/deploy-cloud-run.ps1 -ProjectId $projectId
```

Expected: image build, migration check, service/job/scheduler/budget creation,
and a printed service URL with no secret values.

- [ ] **Step 3: Execute maintenance once**

```powershell
gcloud run jobs execute fluxo-api-maintenance `
  --region=southamerica-east1 `
  --wait
```

Expected: execution succeeds with one successful task.

- [ ] **Step 4: Smoke test production**

```powershell
Invoke-RestMethod "$serviceUrl/health/live"
Invoke-RestMethod "$serviceUrl/health/ready"
```

Expected: both endpoints report healthy status.

- [ ] **Step 5: Verify cost and security configuration**

Describe the service, job, scheduler, secret versions, and budget. Confirm exact
resource limits and confirm that command output contains no secret payloads.

- [ ] **Step 6: Push commits**

```powershell
git push origin main
```

Expected: `origin/main` points to the verified local HEAD.
