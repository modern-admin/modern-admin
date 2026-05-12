import nextra from 'nextra'

// Locales are duplicated here (also exist in `i18n.ts`) because importing
// `.ts` from `.mjs` is not supported by Node's ESM loader.
// Keep this list in sync with `apps/docs/i18n.ts`.
const locales = ['en']
const defaultLocale = 'en'

const withNextra = nextra({
  // Content lives at `content/<locale>/...` and is served at `/<locale>/...`.
  defaultShowCopyCode: true,
  search: {
    codeblocks: false,
  },
})

export default withNextra({
  reactStrictMode: true,
  // Nextra reads `i18n` from the Next config to populate `NEXTRA_LOCALES`
  // (even though App Router itself ignores this field). It strips it before
  // passing the config to Next, so the App-Router-only warning never fires.
  i18n: {
    locales,
    defaultLocale,
  },
})
