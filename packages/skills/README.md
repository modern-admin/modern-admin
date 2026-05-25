# @modern-admin/skills

Claude Code skills for the [Modern Admin](https://github.com/modern-admin/modern-admin)
framework, distributed via [`npm-skills`](https://github.com/bluelibs/npm-skills).

When your project depends on `@modern-admin/*` and you use an AI coding
agent (Claude Code, Cursor, Aider, …), these skills give the agent
Modern Admin's non-obvious integration rules — adding resources, wiring
Better Auth, the 14 `Ma*` Prisma models, the `actions:`-key-is-forbidden
rule, `RedisCacheProvider({ client, subscriber })`, and so on — so the
agent doesn't have to re-discover them by reading the source.

## Install

```sh
# In the host project that uses @modern-admin/*
bun add -d npm-skills @modern-admin/skills

# Extract every skill from every dependency into .agents/skills/
bunx npm-skills extract
```

That's it. The next time Claude Code (or any agent that scans
`.agents/skills/`) starts in this project, it picks up the
`modern-admin-integration` skill automatically. Skill bodies load lazily
based on each `SKILL.md`'s `description` frontmatter — no context cost
unless a task actually touches Modern Admin.

By default `npm-skills extract` lands skills at
`.agents/skills/modern-admin-skills-modern-admin-integration/`
(package-prefixed). Override the target with `npmSkills.consume.output`
in the host `package.json`:

```json
{
  "npmSkills": {
    "consume": {
      "output": ".claude/skills"
    }
  }
}
```

Set `--skip-production` on CI or anywhere `NODE_ENV=production` to omit
skills from the deployable artefact.

## What's inside

```
skills/modern-admin-integration/
├── SKILL.md                        — entry (~150 lines, auto-loaded on match)
└── references/                     — lazy-loaded per topic
    ├── deployment.md               — standalone deploy, reusing host Prisma,
    │                                 the 14 Ma* models
    ├── resources.md                — three-pieces recipe, source registry,
    │                                 property-type matrix, hide vs expose
    ├── permissions.md              — DB-driven MaRole.permissions vs
    │                                 code-pinned isAccessible, why `actions:`
    │                                 on @AdminResource is forbidden, signature
    │                                 matching for base-class overrides
    ├── actions-and-plugins.md      — built-in actions, plugin selection,
    │                                 hooks vs custom actions vs handlers
    ├── custom-ui.md                — when/how, @modern-admin/ui primitives,
    │                                 Tailwind 4 border rule
    ├── auth-and-infra.md           — BetterAuthProvider, RedisCacheProvider,
    │                                 ModernAdminStaticUiModule,
    │                                 createBetterAuthMiddleware,
    │                                 mandatory admin() plugin, BigInt
    ├── conventions.md              — i18n boundary, UUID v7, cache + realtime
    └── anti-patterns.md            — full pitfalls list, verification
                                      checklist, canonical files index
```

The SKILL.md `description` triggers on tasks that mention
`@AdminResource`, `AdminController`, `BetterAuthProvider`,
`ModernAdminStaticUiModule`, `setupPrismaSystem`, `MaRole`,
`rolesResourceId`, the `ma_*` schema fragment, or
`bun create @modern-admin`.

## Authoring & source-of-truth

This package IS the source of truth — the human-facing docs page at
`apps/docs/content/en/docs/agent-skills.md` only explains *how* to
install and use the skill; it intentionally does not duplicate
content. When the framework gains a new pitfall worth documenting,
edit `skills/modern-admin-integration/SKILL.md` (or one of its
`references/*.md` files) directly and bump the package through the
normal changeset flow.

## License

MIT.
