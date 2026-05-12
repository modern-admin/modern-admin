import type { ReactNode } from 'react'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import { isLocale, locales, localeNames } from '../../i18n'

export const metadata = {
  metadataBase: new URL('https://modern-admin.dev'),
  title: {
    default: 'Modern Admin',
    template: '%s — Modern Admin',
  },
  description: 'Universal admin panel framework — NestJS + React + shadcn.',
  applicationName: 'Modern Admin',
  appleWebApp: { title: 'Modern Admin' },
  openGraph: {
    type: 'website',
    title: 'Modern Admin',
    description: 'Universal admin panel framework — NestJS + React + shadcn.',
  },
}

const navbar = (
  <Navbar
    logo={<b>Modern Admin</b>}
    projectLink="https://github.com/anthropics/modern-admin"
  />
)

const footer = (
  <Footer>MIT {new Date().getFullYear()} © Modern Admin.</Footer>
)

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const locale = isLocale(lang) ? lang : 'en'
  const pageMap = await getPageMap(`/${locale}`)

  return (
    <html lang={locale} dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          banner={<Banner storageKey="modern-admin-wip">Modern Admin docs are a work in progress.</Banner>}
          navbar={navbar}
          footer={footer}
          pageMap={pageMap}
          docsRepositoryBase="https://github.com/anthropics/modern-admin/tree/main/apps/docs"
          i18n={locales.map((l) => ({ locale: l, name: localeNames[l] }))}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
