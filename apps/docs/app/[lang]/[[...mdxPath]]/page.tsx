import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { notFound } from 'next/navigation'
import { useMDXComponents as getMDXComponents } from '../../../mdx-components'
import { isLocale } from '../../../i18n'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

type PageProps = {
  params: Promise<{ lang: string; mdxPath?: string[] }>
}

export async function generateMetadata({ params }: PageProps) {
  const { lang, mdxPath } = await params
  if (!isLocale(lang)) {
    notFound()
  }
  const { metadata } = await importPage(mdxPath, lang)
  return metadata
}

const Wrapper = getMDXComponents().wrapper!

export default async function Page(props: PageProps) {
  const params = await props.params
  const { lang, mdxPath } = params
  if (!isLocale(lang)) {
    notFound()
  }
  const result = await importPage(mdxPath, lang)
  const { default: MDXContent, toc, metadata } = result

  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
