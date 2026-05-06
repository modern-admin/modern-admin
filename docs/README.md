# Modern Admin documentation

This directory contains the source markdown for the Modern Admin docs site.
The pages are framework-agnostic — each file has YAML front-matter so it
can be rendered by [Astro Starlight], [Mintlify], [Docusaurus], or any
other markdown-aware static-site generator.

## Pages

| File                  | Topic                                          |
| --------------------- | ---------------------------------------------- |
| `index.md`            | Project overview                               |
| `getting-started.md`  | Scaffold a project, register a resource        |
| `architecture.md`     | Package layout, data flow, ports               |
| `adapters.md`         | Prisma, Drizzle, custom adapters               |
| `auth.md`             | `IAuthProvider`, Better Auth integration       |
| `cache.md`            | `ICacheProvider`, Redis backend                |
| `realtime.md`         | WebSocket gateway, `IRealtimeBus`              |
| `frontend.md`         | React provider, hooks, theming, custom UI      |
| `decorators.md`       | Resource/property/action options model         |
| `graphql.md`          | Auto-generated schema, subscriptions, DataLoader |

To wire these up to a hosted site, point the generator's content root at
this directory.

[Astro Starlight]: https://starlight.astro.build
[Mintlify]: https://mintlify.com
[Docusaurus]: https://docusaurus.io
