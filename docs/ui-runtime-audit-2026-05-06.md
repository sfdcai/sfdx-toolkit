# UI Runtime Audit

Date: 2026-05-06

## Executive Summary

The UI slowdown is caused by a combination of backend execution mode and frontend data volume:

1. Deploy is still synchronous and blocking.
2. The log viewer polls the full log file every 2.5 seconds.
3. Large API responses are written directly into the shared console state.
4. Retrieve status files can become large and are re-polled frequently.
5. Some buttons trigger expensive CLI commands directly from request handlers.

This means the system is not failing in one place. The current design mixes:

- lightweight form actions
- background job actions
- blocking long-running actions
- large log/status polling

That combination makes the UI feel unstable under large org workloads.

## Main Hotspots

### 1. Global Console Output Is A Bottleneck

File: `src/app/page.tsx`

- `setOutput(...)` at line 625 writes all output into the same `consoleOutput` state.
- Many actions call `setOutput(data)` with large payloads.
- Large objects are stringified into one big JSON blob before rendering.

Impact:

- large rerenders
- heavy main-thread work in the browser
- poor responsiveness while polling is active

### 2. Log Streaming Reads Entire Files Repeatedly

Files:

- `src/app/page.tsx`
- `src/app/api/projects/[id]/logs/route.ts`

Current behavior:

- `startLogStream(...)` at line 649 polls every 2500ms
- `/api/projects/[id]/logs` reads the full log file and returns `content`
- UI replaces the entire console every poll

Impact:

- repeated full-file reads on the server
- repeated full-file JSON responses over HTTP
- repeated full console rerenders in the browser

This is one of the biggest architectural causes of “stuck UI”.

### 3. Deploy Is Blocking, Not Backgrounded

Files:

- `src/app/api/projects/[id]/deploy/route.ts`
- `src/lib/deploy.ts`

Current behavior:

- deploy request waits for `deployWithCli(...)` to finish
- `deployWithCli(...)` uses `execSync(...)`
- only after deployment finishes does the API respond

Impact:

- long request lifetime
- no true deploy job model
- UI cannot get lightweight incremental deploy status
- higher probability of browser/network timeout behavior

This is the single biggest runtime design issue for deployment.

### 4. Retrieve Is Job-Like, But Status Payloads Are Still Heavy

Files:

- `src/app/api/projects/[id]/retrieve/[target]/route.ts`
- `src/app/api/projects/[id]/retrieve/[target]/status/route.ts`
- `src/lib/metadata.ts`
- `src/app/page.tsx`

Current behavior:

- retrieve starts asynchronously
- UI polls status every 3000ms
- status contains all entries, outputs, and chunk/group manifests

Impact:

- better than blocking deploy
- still pushes large JSON repeatedly
- grouped mode reduces CLI startup count but not status size
- large metadata runs still create expensive poll cycles

### 5. Retrieve Type-Member Inspection Is Synchronous CLI

File: `src/app/api/projects/[id]/retrieve/[target]/members/route.ts`

Current behavior:

- clicking a metadata type can run `sf org list metadata`
- route uses `execFileSync(...)`
- result is cached, but first request is blocking

Impact:

- harmless for small types
- can stall the request for large types or slower org responses

## Action Surface By Button Group

### Lightweight / Mostly Fine

- login, register, forgot password
- profile save, password update, MFA setup/verify
- project create/update/delete
- org add/update/delete
- manifest save
- usage/profile/history refresh

These are normal request/response actions and are not the main UI performance problem.

### Medium Cost

- manifest generate
- diff file view
- report load
- retrieve type member refresh

These can be slow, but they are not the primary architecture problem.

### High Cost / Current Problem Area

- retrieve source/destination
- compare job start and compare polling
- deploy
- retry deploy
- continuous log streaming

These are the actions that need redesign.

## Compare Path Assessment

Files:

- `src/app/api/projects/[id]/compare/job/route.ts`
- `src/app/api/projects/[id]/compare/job/[jobId]/route.ts`
- `src/lib/compare-runner.ts`

Strengths:

- compare is already job-based
- job status is persisted to disk
- status route only returns a log tail instead of the full log

Weaknesses:

- final compare output can still be large
- retrieve steps inside compare still inherit retrieve cost
- UI still writes large responses to the shared console

Compare is structurally better than deploy, but still suffers from the same console/status pressure.

## Why The UI Feels Stuck

The UI is not just waiting on Salesforce.

It is also doing too much work locally:

1. polling large payloads
2. rendering large JSON blobs into the console
3. replacing log content repeatedly
4. mixing multiple timers and updates into one large page component

This is especially noticeable when:

- the retrieve status file grows
- deployment output is large
- the console is showing full logs
- the active page already has many stateful sections mounted

## Recommended Redesign Order

### Priority 1: Replace Full Log Polling With Tail/Offset Polling

Change `/api/projects/[id]/logs` to support:

- `offset`
- `limitBytes`
- or `lastLines`

UI should append deltas instead of replacing the entire console content.

### Priority 2: Convert Deploy Into A Real Background Job

Deploy should match compare architecture:

- create deploy job id
- persist deploy status file
- run deploy in background
- expose deploy status route
- poll small deploy status payloads

Do not keep deploy in a blocking API request.

### Priority 3: Shrink Retrieve Status Payloads

Status route should return:

- summary counters
- current batch/type
- latest failures
- selected recent outputs

The full detailed entry list should be requested separately only when needed.

### Priority 4: Split Heavy Metadata More Intelligently

Grouped retrieve improved command count, but heavy metadata is still dominating:

- `CustomObject`
- `Report`
- `Dashboard`

These should use sub-batching rules inside grouped mode.

### Priority 5: Separate Console State From Action Result State

Do not use the same `consoleOutput` sink for:

- logs
- API result summaries
- large object payloads
- errors

These should be split into:

- status summary
- structured action result
- log tail viewer
- error panel

## Bottom Line

The current problem is not just “Salesforce is slow”.

The app is also:

- reading too much log data
- sending too much status data
- rendering too much JSON
- and using a blocking deploy architecture

If only one thing is changed first, it should be:

1. async deploy job
2. log tail API instead of full-file polling

That will remove the biggest UI freeze points before deeper retrieve optimizations.
