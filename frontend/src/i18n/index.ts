import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ar from './locales/ar.json'

export type AppLanguage = 'en' | 'ar'

const STORAGE_KEY = 'eclassroom-lang'

function readStoredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'ar' || stored === 'en') return stored
  } catch {
    /* ignore */
  }
  return 'en'
}

function applyDocumentLanguage(lang: AppLanguage) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export function setAppLanguage(lang: AppLanguage) {
  localStorage.setItem(STORAGE_KEY, lang)
  applyDocumentLanguage(lang)
  void i18n.changeLanguage(lang)
}

const initialLang = readStoredLanguage()
applyDocumentLanguage(initialLang)

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lang) => {
  applyDocumentLanguage(lang === 'ar' ? 'ar' : 'en')
})

export default i18n
