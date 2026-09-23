---
'@modern-admin/react': minor
---

`AdminClient.logout()`: complete RP-initiated logout instead of dropping it. Better Auth's `/sign-out` answers with `{ url, redirect }` when the session came from an OIDC provider that exposes an end-session endpoint — the client discarded that body, so signing out of the panel left the IdP session alive and the next social-login click silently signed the user back in. The client now navigates to the provider's end-session URL when one comes back (the `Location` header Better Auth sets alongside it is inert on a 200, so the navigation has to happen client-side). Email/password sessions get no URL and behave exactly as before. `logout()` and `useLogout()` accept an optional `callbackURL`, forwarded as `post_logout_redirect_uri`; it is omitted by default so the provider's own registered URL wins.
