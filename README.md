# @tokenring-ai/tasks

Tasks as markdown files on disk, executed and tracked by agents.

A task is a markdown file with YAML frontmatter. The frontmatter says who should do the work and
where it stands; the body says what to do. Because tasks are ordinary files, they can be read,
edited, reviewed and committed like any other part of the repository — by a person or by an agent.

## Layout

```
<workspace>/<taskDirectory>/<list>/<name>.md
```

With the default configuration that is `tasks/<list>/<name>.md`.

```markdown
---
title: Extract the argument parser
description: Split the parser out of main.rs so it can be unit tested
agentType: code
status: pending
priority: high
tags:
  - refactor
steps: []
dependsOn: []
createdAt: 2026-08-11T14:02:11.000Z
lastRunAt: null
lastRunStatus: null
lastRunId: null
lastResult: ""
---

Move the argument parsing in `cli/src/main.rs` into a new `cli/src/args.rs` module.

Keep the public behaviour identical. Add unit tests covering the `--verbose` and `--output` flags.
```

Every frontmatter field has a default, so a file containing nothing but prose is still a valid
task. Unknown keys you add by hand are preserved when the plugin writes to the file.

## Execution

Running a task spawns a fresh agent of the task's `agentType` (falling back to the configured
`defaultAgentType`) and sends it the markdown body as a single message. If the frontmatter carries
a non-empty `steps` array, those are sent one at a time instead and the run stops at the first step
that does not succeed.

A group run gives each task its own agent and runs up to `parallel` of them at a time. Every task
is tracked as its own run; a group shares a batch id so progress can be followed as a whole.

Because each task runs on a brand new agent, **a task cannot ask questions and has no conversation
history**. Task bodies must be self-contained.

### Status

Two different things are tracked, and they are deliberately kept apart:

| | Lives in | Values |
|---|---|---|
| Task status | the file's frontmatter | `pending`, `in-progress`, `blocked`, `done`, `cancelled` |
| Run status | app state (not on disk) | `starting`, `running`, `completed`, `failed`, `cancelled` |

A run never writes its own status into the file. Instead:

- Starting a run moves a `pending` or `blocked` task to `in-progress`. A task that is already
  `done`, `cancelled`, or claimed by another run is left alone, so re-running a finished task does
  not silently reopen it.
- A run that completes marks the task `done`; one that fails marks it `blocked`; one that is
  cancelled returns it to `pending` — but only if that run is the one that claimed the task.
- `lastRunAt`, `lastRunStatus`, `lastRunId` and `lastResult` are always recorded.

Set `writeBackStatus: false` to disable all of this and treat task files as pure inputs.

After a crash, tasks stranded at `in-progress` are returned to `pending` on the next start.

## Tools

| Tool | Purpose |
|---|---|
| `task_lists` | List every task list with its status counts |
| `task_list` | List tasks, optionally filtered by list, status or tag |
| `task_read` | Read one task's frontmatter and instructions |
| `task_write` | Create or overwrite a task (upsert; creates the list if needed) |
| `task_set_status` | Change a task's status without touching its body |
| `task_delete` | Delete a task file |
| `task_search` | Substring search across names, titles, descriptions, tags and bodies |
| `task_run` | Run one task on a new agent |
| `task_run_group` | Run several tasks from a list, in parallel |
| `task_run_status` | Check on a run, a batch, or recent runs |

`task_write`, `task_run` and `task_run_group` declare the `available-agents` context handler so the
model knows which `agentType` values exist.

None of these tools prompt for approval. Execution is confirmed in conversation, not by the tool
layer — see the `swarm` agent's system prompt for the intended pattern.

## Commands

```
/tasks lists
/tasks list [<list>] [--status=] [--tag=]
/tasks show <list/name>
/tasks write <list/name> [--agent=] [--status=] [--priority=] [--title=] <instructions>
/tasks status <list/name> <status>
/tasks delete <list/name>
/tasks move <list/name> <list/name>
/tasks search [--list=] [--limit=] <query>
/tasks run <list/name> [--wait]
/tasks run-group <list> [--status=pending] [--names=a,b,c] [--parallel=N] [--wait]
/tasks runs [--batch=] [--list=] [--limit=]
/tasks cancel <runId> | --batch=<id>
/tasks create-list <list>
/tasks delete-list <list>
/tasks dir
```

`/tasks run` and `/tasks run-group` are fire-and-forget by default; pass `--wait` to block until
the work finishes and see the results.

## Configuration

```yaml
tasks:
  taskDirectory: tasks        # relative to the workspace
  defaultList: default
  parallel: 1                 # concurrent tasks in a group run
  maxFinishedRuns: 50         # runs retained for the history view
  maxResultLength: 2000       # longest result stored back into lastResult
  writeBackStatus: true
  defaultAgentType: code
  agentTypes: []              # agent types offered in the UI; empty means all
  subAgent: {}
```

## Dashboard

The Tasks app at `/tasks` shows every list and task, an editor for a task's frontmatter and body,
live run progress, and per-task run history. A whole list can be executed from its row in the
sidebar.

## Notes and limitations

- Frontmatter is rewritten as YAML when the plugin saves a task, which normalizes quoting and
  **discards comments inside the frontmatter block**. Put comments in the body.
- Writes are serialized per file within the process and are atomic (temp file + rename), but an
  external editor with the file open can still win the last write.
- `dependsOn` is parsed and preserved but does not yet affect scheduling.
- A task agent cannot mirror questions back to a human; give tasks everything they need up front.
