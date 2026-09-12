# Workflow: Agent automation loop (Linear → implement → PR → Done)

## Loop

Each time an agent-capable ticket is ready, an AFK agent (Cursor, Codex, or Linear delegate when configured) picks it up, implements, opens a PR, and closes the ticket — without re-litigating architecture already in ADRs.

## Trigger

**Event:** Linear issue labelled `ready-for-agent` with no open blockers and state Todo or In Progress.

**Schedule (optional):** human or orchestrator (Hermes) assigns the next frontier ticket before starting an agent session.

## Roles

| Role | Who | Job |
|------|-----|-----|
| **Operator** | Gordo / Hermes | Chooses priority, assigns or unblocks tickets, reviews briefs at checkpoints |
| **AFK agent** | Cursor, Codex CLI | `/implement` one ticket per fresh session |
| **Linear** | Source of truth | Specs, tickets, blocking edges, status |

Hermes does not need a Linear user — the operator unblocks and labels; agents claim via `ready-for-agent` + frontier query.

## Frontier query (each agent session)

1. `list_issues` — team V1su4, project Zig Swap, label `ready-for-agent`, state open
2. Drop issues with open `blockedBy` relations
3. Pick highest priority / lowest issue number on the frontier
4. Run **`/implement`** with that issue id (fetch body + comments via MCP)

## Agent session recipe

```
1. get_issue V1S-NNN
2. /implement (or explicit: branch, TDD at agreed seam, typecheck, commit)
3. gh pr create — link PR in Linear issue links
4. save_comment — brief: what changed, test evidence, PR URL
5. save_issue — state Done (or In Review if human merge required)
```

**Context hygiene:** one ticket per session; `/clear` between tickets.

## Checkpoints (push right)

| Checkpoint | When |
|------------|------|
| **Language pick** (Zig vs Rust) | After spike tickets — human confirms ADR before web shell |
| **PR merge** | Optional human review before merge to main |
| **v0 demo** | All PGM tickets done — human watches canvas |

Maximal autonomous work happens *before* each checkpoint.

## Codex handoff

Same ticket body and ADRs. Codex session starts with:

- Linear issue id (e.g. `V1S-12`)
- `docs/agents/continuity.md` + relevant ADR
- Toolchain: bun/bunx, uv, zig

Use `claude-handoff` or issue URL as the session entry point.

## Graft (every session)

Before grepping source for context:

- `graft map` — orientation when cold
- `graft ask "<task>" --source` — locate + understand
- After edits: graph auto-refreshes on query; `graft build` after large changes

First ticket in the program explicitly smoke-tests Graft.

## Brief format (issue comment on Done)

```markdown
## Done brief
- **Delivered:** one sentence
- **PR:** link
- **Tests:** what ran green
- **Graft:** optional tokens saved note
- **Next unblocked:** V1S-XX
```
