import api from './api'

export async function translateTexts(
  texts: string[],
  targetLang: 'en' | 'ar' = 'ar',
): Promise<string[]> {
  if (!texts.length) return []
  const res = await api.post<{ success: true; data: { translations: string[] } }>(
    '/translate',
    { texts, target_lang: targetLang },
  )
  return res.data.data.translations
}
