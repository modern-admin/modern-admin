import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { ModernAdminProvider } from '../src/provider.js'
import { I18nProvider } from '../src/i18n.js'
import { LoginPage } from '../src/pages/login-page.js'
import type { AuthUiProps } from '../src/client.js'

function renderLogin(auth: AuthUiProps, locale = 'en'): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  queryClient.setQueryData(['modern-admin', 'auth', 'ui-props'], auth)
  return renderToStaticMarkup(
    <ModernAdminProvider queryClient={queryClient}>
      <I18nProvider forceLocale={locale}>
        <LoginPage />
      </I18nProvider>
    </ModernAdminProvider>,
  )
}

describe('SSO login page', () => {
  it('uses the configured provider name and hides password inputs in SSO-only mode', () => {
    const html = renderLogin({
      providers: ['company-oidc'],
      providerLabels: { 'company-oidc': 'Company SSO' },
      emailAndPassword: false,
    })
    expect(html).toContain('Continue with Company SSO')
    expect(html).not.toContain('id="login-email"')
    expect(html).not.toContain('id="login-password"')
    expect(html).not.toContain('Or continue with')
    expect(html).toContain('truncate')
  })

  it('keeps social and password login together and translates the SSO button', () => {
    const html = renderLogin(
      {
        providers: ['authentik', 'github'],
        providerLabels: { authentik: 'Company SSO' },
        emailAndPassword: true,
      },
      'ru',
    )
    expect(html).toContain('Company SSO')
    expect(html).toContain('GitHub')
    expect(html).not.toContain('Continue with')
    expect(html).toContain('id="login-password"')
  })
})
