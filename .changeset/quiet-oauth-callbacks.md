---
'@modern-admin/auth-better-auth': patch
'@modern-admin/create': patch
---

Recover exact repeats of completed web OAuth callbacks instead of failing with
`state_mismatch`. Export `oauthCallbackReplayPlugin()` and enable it in the
reference auth factory and generated hosts. Recovery requires a short-lived
signed receipt and the same active server-side session; normal state validation,
revocation, and account restrictions remain in force.
