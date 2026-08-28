---
'@modern-admin/api-stock': patch
---

Allow importing finalized media from the API Stock `aitohumanize.com` CDN.
Generated files are served from `fileN.aitohumanize.com`, which the download
host allowlist previously rejected — so applying a generated image failed with
`502 Generated file host is not allowed` before it could be stored through the
upload adapter. Hosts can still widen the allowlist via `allowedDownloadHosts`.
