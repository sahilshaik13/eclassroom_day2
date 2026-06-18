import type { ReactNode } from 'react'

export const authInputClass =
  'w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all'

export const authInputRoundClass =
  'w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all'

export const authLabelClass = 'block text-sm font-semibold text-gray-700 mb-2'

export const authBtnPrimaryClass =
  'w-full min-h-11 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-4 py-3 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed'

export const authBtnSecondaryClass =
  'flex-1 min-h-11 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-3 rounded-full transition-all flex items-center justify-center gap-2'

type AuthPageLayoutProps = {
  children: ReactNode
  maxWidth?: 'sm' | 'md'
  aboveCard?: ReactNode
  belowCard?: ReactNode
}

export function AuthLogo() {
  return (
    <div className="flex items-center justify-center mb-10">
      <img
        src="/logo.png"
        alt="ThinkTarteeb"
        className="h-16 w-auto"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    </div>
  )
}

export function AuthPageLayout({
  children,
  maxWidth = 'sm',
  aboveCard,
  belowCard,
}: AuthPageLayoutProps) {
  const widthClass = maxWidth === 'md' ? 'max-w-md' : 'max-w-sm'

  return (
    <div className="min-h-dvh bg-[#f0f2f5] flex flex-col items-center justify-center px-3.5 sm:px-4 py-6 sm:py-8 overflow-x-clip">
      <div className={`w-full ${widthClass}`}>
        <AuthLogo />
        {aboveCard}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
          {children}
        </div>
        {belowCard}
      </div>
    </div>
  )
}
