// Use Nextra's built-in locale middleware: it reads `NEXTRA_LOCALES` /
// `NEXTRA_DEFAULT_LOCALE` (populated from `i18n` in `next.config.mjs`) and
// handles redirect + cookie negotiation.
export { middleware } from 'nextra/locales'

export const config = {
  matcher: [
    // Run on every path except Next internals, the API, and static files.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}
