---
'@modern-admin/nest': minor
---

Consolidate the AI assistant's per-resource `list_<r>` / `show_<r>` /
`search_<r>` tools into a single parameterized `query_resource({ resourceId,
action, … })` tool. This cuts a 12-resource setup from ~40 tools to ~8, keeping
the request payload small enough that OpenAI-compatible providers (notably API
Stock behind Cloudflare) no longer time out at their gateway (HTTP 524) when the
large tool list is combined with the schema-hint system prompt. Valid
resource/action pairs are still advertised in the "Available resources and
actions" system-prompt line, and unknown resource/action combinations return a
correctable error instead of failing the call.
