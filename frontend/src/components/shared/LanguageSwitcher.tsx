import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { setAppLanguage, type AppLanguage } from '@/i18n'

type Props = {
  variant?: 'sidebar' | 'header'
  className?: string
}

export function LanguageSwitcher({ variant = 'sidebar', className }: Props) {
  const { i18n, t } = useTranslation()
  const current = (i18n.language === 'ar' ? 'ar' : 'en') as AppLanguage
  const next: AppLanguage = current === 'en' ? 'ar' : 'en'

  const label = current === 'en' ? t('nav.arabic') : t('nav.english')

  return (
    <button
      type="button"
      onClick={() => setAppLanguage(next)}
      className={clsx(
        'flex items-center gap-2 transition-all',
        variant === 'sidebar'
          ? 'w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          : 'p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100',
        className,
      )}
      aria-label={t('nav.language')}
      title={label}
    >
      <Globe className="w-5 h-5 shrink-0" strokeWidth={2} />
      {variant === 'sidebar' ? (
        <span className="flex-1 text-start">{label}</span>
      ) : null}
    </button>
  )
}
