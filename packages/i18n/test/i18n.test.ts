import { describe, expect, it } from 'bun:test'
import { I18n, builtinLocales, en, ru } from '../src/index.js'

describe('I18n', () => {
  it('uses the default locale when set', () => {
    const i18n = new I18n({ locales: [en, ru], defaultLocale: 'ru' })
    expect(i18n.t('common:home')).toBe('Главная')
  })

  it('falls back to fallbackLocale when key is missing', () => {
    const i18n = new I18n({
      locales: [
        { code: 'en', name: 'English', dict: { greet: 'hello' } },
        { code: 'xx', name: 'X', dict: {} },
      ],
      defaultLocale: 'xx',
      fallbackLocale: 'en',
    })
    expect(i18n.t('greet')).toBe('hello')
  })

  it('returns the key itself when no translation exists', () => {
    const i18n = new I18n({ locales: [en] })
    expect(i18n.t('totally:made:up')).toBe('totally:made:up')
  })

  it('interpolates {placeholders}', () => {
    const i18n = new I18n({
      locales: [{ code: 'en', name: 'English', dict: { hello: 'Hi {name}!' } }],
    })
    expect(i18n.t('hello', { name: 'Ann' })).toBe('Hi Ann!')
  })

  it('switches locale via setLocale', () => {
    const i18n = new I18n({ locales: [en, ru], defaultLocale: 'en' })
    expect(i18n.t('common:home')).toBe('Home')
    i18n.setLocale('ru')
    expect(i18n.t('common:home')).toBe('Главная')
  })

  it('rejects switching to an unknown locale silently', () => {
    const i18n = new I18n({ locales: [en], defaultLocale: 'en' })
    i18n.setLocale('zz')
    expect(i18n.locale).toBe('en')
  })

  it('extend() merges new entries into an existing locale', () => {
    const i18n = new I18n({ locales: [en] })
    i18n.extend('en', { 'custom:key': 'Custom' })
    expect(i18n.t('custom:key')).toBe('Custom')
    // Existing keys still work.
    expect(i18n.t('common:save')).toBe('Save')
  })

  it('availableLocales returns all registered codes/names', () => {
    const i18n = new I18n({ locales: builtinLocales })
    const codes = i18n.availableLocales().map((l) => l.code)
    expect(codes).toEqual(['en', 'ru', 'de', 'fr', 'es', 'it', 'ja', 'pl', 'pt-BR'])
  })

  it('throws when constructed with no locales', () => {
    expect(() => new I18n({ locales: [] })).toThrow(/at least one/)
  })
})
