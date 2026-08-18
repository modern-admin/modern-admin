import { defineAdminAppConfig } from '@modern-admin/web/vite'

export default defineAdminAppConfig({
  apiProxy: {{apiProxy}},
  apiProxyPath: {{apiProxyPaths}},
  devConfig: {
    apiUrl: '',
    authBasePath: {{authBasePath}},
    basePath: {{basePath}},
    credentials: 'include',
  },
})
