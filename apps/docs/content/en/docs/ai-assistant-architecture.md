# AI Assistant Architecture for Modern Admin

## Goals

- Add a fixed chat widget to the admin UI.
- Use Vercel AI SDK with OpenRouter.
- Store provider settings in admin settings, not in frontend code.
- Keep the first iteration strictly read-only.
- Reuse existing `ModernAdmin` resource actions instead of building a parallel data access layer.
- Prepare the runtime for future write tools, confirmations, and action-bound tools.

## Non-goals for the first iteration

- No direct SQL generation.
- No unrestricted tool execution.
- No autonomous background agent workflows.
- No write access from chat by default.
- No separate AI-specific ORM or transport layer.

## Architectural fit with Modern Admin

The original Unitify plan assumes:

- GraphQL as the only transport
- orchestrator + multiple domain sub-agents
- dedicated AI domain models for chat/session/tool-call lifecycle

For `modern-admin`, the architecture should be simplified and aligned with the framework primitives that already exist:

- `ModernAdmin` is the orchestration boundary.
- Resource actions (`list`, `show`, `search`, and later custom actions) are the tool surface.
- `configStore` persists assistant settings.
- `aiTaskStore` persists task metadata and event traces.
- `@modern-admin/nest` exposes REST endpoints for chat/settings.
- `@modern-admin/react` renders the floating widget and settings UI.

## High-level design

```text
React Admin UI
  ├─ Settings / AI Assistant
  ├─ Floating Widget (bottom-right)
  └─ AdminClient -> /admin/api/ai-assistant/*

Nest Transport (@modern-admin/nest)
  ├─ GET /admin/api/ai-assistant/settings
  ├─ PUT /admin/api/ai-assistant/settings
  └─ POST /admin/api/ai-assistant/chat

AI Runtime
  ├─ OpenRouter provider via Vercel AI SDK
  ├─ read-only tool registry built from ModernAdmin resources
  ├─ configStore-backed assistant settings
  └─ aiTaskStore-backed execution tracing

ModernAdmin Core
  ├─ resource registry
  ├─ auth / currentAdmin permissions
  ├─ invoke(request, currentAdmin)
  └─ existing action access control
```

## Tool strategy

### Current iteration

The assistant only receives generated read-only tools:

- `list_<resource>`
- `show_<resource>`
- `search_<resource>`

Each tool delegates back into `admin.invoke(...)` with the authenticated `currentAdmin`.

That gives us:

- existing access control reuse
- existing API key permissions reuse
- no duplicate repository/query layer
- resource-aware answers with record citations

### Future iterations

The same registry pattern can be extended with capability levels:

- `read`
- `write_with_confirmation`
- `dangerous`

and mapped to:

- built-in actions like `new`, `edit`, `delete`
- custom resource actions
- bulk actions
- domain-specific helper tools

## Settings model

Assistant settings are stored in `configStore` under a global key.

Suggested stored payload:

```ts
{
  enabled: boolean,
  provider: 'openrouter',
  model: string,
  apiKey: string,
  systemPrompt: string,
}
```

Rules:

- API key is only stored server-side.
- Frontend receives `maskedApiKey`, never the raw value.
- Role gating for managing settings is configured in `ModernAdminModuleOptions.aiAssistant.manageRoles`.

## Security model

### Read-only by construction

The first version only registers tools for actions already understood as read-only:

- `list`
- `show`
- `search`

### Authorization reuse

Every tool call goes through `ModernAdmin.invoke(...)` with `currentAdmin`.

That means the assistant inherits:

- resource-level `isAccessible`
- API key allowlists
- host auth provider identity

### No parallel data access

The assistant must not query Prisma/Drizzle directly if equivalent resource actions already exist.

This is a core design rule for `modern-admin`.

## Task lifecycle

For now, chat requests are synchronous from the user's point of view, but execution metadata is written to `aiTaskStore` when available.

Current lifecycle:

1. enqueue task
2. mark `running`
3. execute prompt + tools
4. append result event
5. mark `succeeded` or later `failed`

This gives a path toward:

- streaming
- polling task history
- resumable chat traces
- audit/debug UI

## UI design

### Settings page

A dedicated `AI Assistant` section lives next to API keys.

It manages:

- enable/disable assistant
- OpenRouter model
- API key update
- optional system prompt override

### Widget

The widget:

- is fixed in the bottom-right corner
- opens a side sheet
- keeps local chat history in the UI
- posts message history to the backend
- shows returned citations
- redirects admins to settings if the assistant is not configured

## Why this is better than the original multi-agent plan here

For `modern-admin`, a full orchestrator/sub-agent architecture is premature because:

- resources already define a normalized tool boundary
- REST transport already exists in `@modern-admin/nest`
- system stores for config and AI tasks already exist
- the framework needs a reusable base capability before domain-specialized orchestration

So the recommended rollout is:

### Phase 1

- single assistant
- read-only resource tools
- settings-backed provider config
- floating admin widget

### Phase 2

- confirmation-gated write tools
- resource action metadata for AI exposure
- task/event inspection UI
- structured citations and richer answer cards

### Phase 3

- optional planner/orchestrator layer
- per-domain tool bundles
- scheduled/background AI tasks
- reusable approval workflow for destructive actions

## Recommended framework extensions

- Add `aiAssistant` options to `ModernAdminModuleOptions`.
- Keep controller/runtime in `@modern-admin/nest`.
- Keep UI widget/settings in `@modern-admin/react`.
- Reuse `configStore` and `aiTaskStore` from core/system adapters.
- Introduce optional action metadata later, for example:

```ts
custom: {
  ai: {
    enabled: true,
    capability: 'read',
    description: 'Search customers by name or email',
  }
}
```

## Summary

The correct adaptation for `modern-admin` is not to copy the original GraphQL multi-agent architecture literally.

Instead, we should:

- use `ModernAdmin` itself as the orchestration surface
- treat resource actions as tools
- persist AI settings in `configStore`
- persist execution metadata in `aiTaskStore`
- expose the runtime through `@modern-admin/nest`
- deliver the UX through `@modern-admin/react`

This preserves framework consistency and gives a safe path from read-only analytics chat to future action-capable AI tooling.
