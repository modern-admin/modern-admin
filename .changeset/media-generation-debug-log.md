---
'@modern-admin/nest': minor
---

Add opt-in debug logging for the model/prompt sent to providers. Media
generation logs the provider, model, and input via the `mediaGeneration.debug`
option or `MEDIA_GENERATION_DEBUG`; the AI assistant now also logs the system
prompt and chat messages sent to the LLM under the existing `aiAssistant.debug`
/ `AI_ASSISTANT_DEBUG` flag.

Also clarify AI assistant failures when API Stock (behind Cloudflare) returns a
non-JSON gateway error such as HTTP 524: instead of an empty `AI_APICallError`,
the task now fails with an explicit "API Stock request failed with HTTP <status>"
message so upstream timeouts are diagnosable.
