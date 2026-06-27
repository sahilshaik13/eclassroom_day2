import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { translateTexts } from '@/services/translateApi'

const cacheKey = (text: string, lang: string) => ['db-translate', lang, text] as const

/** Translate dynamic database text when the UI language is Arabic. */
export function useDbTranslate(text: string | null | undefined): {
  text: string
  isTranslating: boolean
} {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const source = String(text ?? '').trim()

  const { data, isFetching } = useQuery({
    queryKey: cacheKey(source, lang),
    queryFn: async () => {
      const [translated] = await translateTexts([source], lang)
      return translated || source
    },
    enabled: lang === 'ar' && source.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
  })

  if (lang !== 'ar' || !source) {
    return { text: source, isTranslating: false }
  }

  return {
    text: data ?? source,
    isTranslating: isFetching && !data,
  }
}

/** Batch translate multiple strings (deduped). */
export function useDbTranslateMany(texts: string[]): Record<string, string> {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const unique = Array.from(new Set(texts.map((t) => String(t ?? '').trim()).filter(Boolean)))
  const joined = unique.join('\u0001')

  const { data } = useQuery({
    queryKey: ['db-translate-batch', lang, joined],
    queryFn: async () => {
      const translations = await translateTexts(unique, lang)
      const map: Record<string, string> = {}
      unique.forEach((text, i) => {
        map[text] = translations[i] || text
      })
      return map
    },
    enabled: lang === 'ar' && unique.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
  })

  if (lang !== 'ar') {
    const identity: Record<string, string> = {}
    unique.forEach((text) => {
      identity[text] = text
    })
    return identity
  }

  return data ?? Object.fromEntries(unique.map((text) => [text, text]))
}
