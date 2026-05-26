---
title: AI agent skills
description: Ship Modern Admin's integration rules to your AI coding agent via `npx skills`.
---

# AI agent skills

Modern Admin has a lot of non-obvious integration rules — the 14 `Ma*`
Prisma models that `setupPrismaSystem` resolves eagerly, the
`actions:`-key-is-forbidden rule on `@AdminResource`, why
`createBetterAuthMiddleware` is required, the `RedisCacheProvider({
client, subscriber })` shape, and many more. Re-discovering these
through trial-and-error eats hours.

The framework repo publishes those rules as a
[Claude Code skill](https://docs.claude.com/en/docs/agents-and-tools/skills)
distributed through [`npx skills`](https://www.npmjs.com/package/skills) —
the community-standard installer for AI agent skills. The skill body
loads lazily, so Claude only reads it when a task actually touches
Modern Admin; it costs nothing in context the rest of the time.

---

## Install

In any project where you use an AI coding agent:

```sh
npx skills add modern-admin/modern-admin
```

The CLI clones the repo, lists the skills it finds under `skills/`,
and walks you through a small prompt:

1. **Pick skills** — currently one: `modern-admin-integration`. Toggle
   with space, confirm with enter.
2. **Pick agents** — Claude Code, Cursor, GitHub Copilot, Windsurf,
   Aider, opencode, Kiro, … 26+ supported. Multi-select.
3. **Pick scope** — project (`./.claude/skills/`, `./.cursor/skills/`,
   …) or global (`~/.claude/skills/`, …).

The CLI writes a `skills-lock.json` at the repo root with the resolved
source and a content hash for every installed skill, so the rest of
your team and CI restore the exact same files later:

```sh
npx skills experimental_install   # like `npm ci` — restore from lock
```

To install only the Modern Admin skill (skip the picker) or run
non-interactively in CI:

```sh
npx skills add modern-admin/modern-admin --skill modern-admin-integration --yes
```

To pin a specific framework version, append a git ref:

```sh
npx skills add modern-admin/modern-admin#v1.2.0
```

---

## What's in the skill

`modern-admin-integration` is one Claude Code skill with a compact
entry file plus eight topical references that are loaded only when
relevant:

| File | Topic |
|------|-------|
| `SKILL.md` | Ground rules, three-pieces-of-a-resource recipe, auth must-knows, verification checklist, canonical files to read |
| `references/deployment.md` | Standalone deploy model, reusing an existing host Prisma schema, the 14 `Ma*` models that `setupPrismaSystem` requires |
| `references/resources.md` | Source registry, resource controller, property-type matrix, hide-vs-expose with `isVisible` / `isAccessible` |
| `references/permissions.md` | DB-driven `MaRole.permissions` vs code-pinned `isAccessible`, why `actions:` on `@AdminResource` is forbidden, base-class signature matching, `Promise<never>` stubs, `guard:` vs permissions |
| `references/actions-and-plugins.md` | Built-in action override semantics, plugin selection guide, hooks vs custom actions vs handlers |
| `references/custom-ui.md` | When/how to write a custom UI component, `@modern-admin/ui` primitives, Tailwind 4 `border` rule |
| `references/auth-and-infra.md` | `BetterAuthProvider` wiring, `RedisCacheProvider`, `ModernAdminStaticUiModule`, `createBetterAuthMiddleware`, the mandatory `admin()` Better Auth plugin, `BigInt` serialisation |
| `references/conventions.md` | i18n boundary (9 locales), UUID v7 everywhere, cache + realtime |
| `references/anti-patterns.md` | Full anti-patterns list, verification checklist, reference index of canonical files |

The skill triggers automatically on tasks that mention
`@AdminResource`, `AdminController`, `BetterAuthProvider`,
`ModernAdminStaticUiModule`, `setupPrismaSystem`, `MaRole`,
`rolesResourceId`, the `ma_*` schema fragment, or
`bun create @modern-admin`. You do not need to invoke it manually.

---

## Source of truth

The skill lives in [`skills/modern-admin-integration/`](https://github.com/modern-admin/modern-admin/tree/main/skills/modern-admin-integration)
in the framework monorepo. Treat that directory as the canonical
location — when the framework gains a new pitfall worth documenting,
edit the skill files there. Consumers pick up the change the next
time they run `npx skills add modern-admin/modern-admin` (or
`npx skills experimental_sync` to re-fetch existing entries).

If you want to read the skill content without installing anything,
browse it on GitHub:
[modern-admin/skills/modern-admin-integration/SKILL.md](https://github.com/modern-admin/modern-admin/blob/main/skills/modern-admin-integration/SKILL.md).

---

## Using the skill outside the supported agents

`SKILL.md` and its references are plain markdown — every agent that
can read local markdown files can consume them. `npx skills add`
already supports the most common ones (Claude Code, Cursor, Copilot,
Windsurf, Aider, opencode, Kiro, …). For anything it doesn't cover,
clone the directory manually and point your agent at it as a system
rule. The lazy-loading on `description` frontmatter is a Claude Code
feature; in other agents you typically prepend the file directly to
the system prompt for the session.

For CI checks and commit hooks, scrape the skill's anti-patterns and
verification checklist into your repo's review template. The
`references/anti-patterns.md` table is structured for exactly that.

---

## Adding more skills

A future framework topic that deserves its own skill (e.g.
"writing a `feature-*` plugin", "drizzle migration patterns")
should land as a new directory under `skills/<skill-name>/SKILL.md`
in the framework repo, with the same layout (YAML frontmatter + body
+ optional `references/`). `npx skills add modern-admin/modern-admin`
discovers it automatically — no package release required.
