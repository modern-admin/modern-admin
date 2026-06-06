// Self-contained HTML page that mounts Apollo's embeddable Sandbox against
// the admin GraphQL endpoint. The bundle is loaded from Apollo's CDN; if
// CSP forbids that, set `sandbox: false` in ModernAdminGraphqlOptions.
//
// `initialEndpoint` is computed in the browser so the same UI works for any
// host/port without baking the URL into the response.
//
// Reference: https://www.apollographql.com/docs/graphos/explorer/sandbox/embed-sandbox

export const SANDBOX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Apollo Sandbox · Modern Admin</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>html,body,#embedded-sandbox{height:100%;width:100%;margin:0;padding:0}</style>
</head>
<body>
  <div id="embedded-sandbox"></div>
  <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
  <script>
    new window.EmbeddedSandbox({
      target: '#embedded-sandbox',
      initialEndpoint: new URL('/admin/graphql', window.location.origin).toString(),
      includeCookies: true,
    });
  </script>
</body>
</html>
`
