---
title: AI agent skills
description: Ship Modern Admin's integration rules to your AI coding agent via @modern-admin/skills and npm-skills.
---

# AI agent skills

Modern Admin has a lot of non-obvious integration rules — the 14 `Ma*`
Prisma models that `setupPrismaSystem` resolves eagerly, the
`actions:`-key-is-forbidden rule on `@AdminResource`, why
`createBetterAuthMiddleware` is required, the `RedisCacheProvider({
client, subscriber })` shape, and many more. Re-discovering these
through trial-and-error eats hours.

The `@modern-admin/skills` package bundles those rules as a
[Claude Code skill](https://docs.claude.com/en/docs/agents-and-tools/skills)
and ships it through [`npm-skills`](https://github.com/bluelibs/npm-skills),
so any project depending on Modern Admin can hand them to its AI coding
agent (Claude Code, Cursor, Aider, …) in a single command. The skill
body loads lazily — Claude only reads it when a task actually touches
Modern Admin, so it costs nothing in context the rest of the time.

---

## Install

In a host project that depends on `@modern-admin/*`:

```sh
bun add -d npm-skills @modern-admin/skills
bunx npm-skills extract
```

`npm-skills extract` walks the project's `dependencies` and
`devDependencies`, finds every directory that contains a `SKILL.md`,
and copies it into `.agents/skills/<package-prefixed-name>/`. By
default Modern Admin's skill lands at
`.agents/skills/modern-admin-skills-modern-admin-integration/`.

Want a different output directory (e.g. `.claude/skills/` so it sits
next to project-local skills)? Add this to the host `package.json`:

```json
{
  "npmSkills": {
    "consume": {
      "output": ".claude/skills"
    }
  }
}
```

To skip extraction on production builds, run with `--skip-production`
(respects `NODE_ENV=production`).

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

The skill lives in [`packages/skills/skills/modern-admin-integration/`](https://github.com/modern-admin/modern-admin/tree/main/packages/skills/skills/modern-admin-integration)
in the framework monorepo. Treat that directory as the canonical
location — when the framework gains a new pitfall worth documenting,
edit the skill files there and bump `@modern-admin/skills` through the
normal changeset flow. Host projects pick it up on the next
`bunx npm-skills extract` after upgrading the dependency.

If you want to read the skill content without installing the package,
browse it on GitHub:
[modern-admin/packages/skills/skills/modern-admin-integration/SKILL.md](https://github.com/modern-admin/modern-admin/blob/main/packages/skills/skills/modern-admin-integration/SKILL.md).

---

## Using the skill outside Claude Code

`SKILL.md` and its references are plain markdown — every agent that
can read local markdown files can consume them. Two practical options:

- **Cursor / Aider / Continue**: point them at
  `.agents/skills/<extracted>/SKILL.md` as a system rule. The
  description-driven lazy loading is a Claude Code feature; in other
  agents you typically prepend the file directly to the system prompt
  for the session.
- **CI checks / commit hooks**: scrape the skill's anti-patterns and
  verification checklist into your repo's review template. The
  `references/anti-patterns.md` table is structured for exactly that.

---

## Adding more skills

A future framework topic that deserves its own skill (e.g.
"writing a `feature-*` plugin", "drizzle migration patterns")
should land as a new directory under
`packages/skills/skills/<skill-name>/SKILL.md` with the same layout
(YAML frontmatter + body + optional `references/`). The npm package
already ships every directory under `skills/`, so the new skill
becomes available to consumers on the next release with no
configuration change.
