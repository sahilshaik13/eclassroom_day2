import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { countries } from 'country-data-list'
import { CountryDropdown, type Country } from '@/components/ui/CountryDropdown'
import {
  formatFullPhone,
  getPhoneCountry,
  parsePhoneValue,
  sortedPhoneCountries,
  DEFAULT_PHONE_COUNTRY_ISO,
} from '@/lib/phoneCountries'

type PhoneCountryInputProps = {
  value?: string
  onChange: (fullPhone: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  inputClassName?: string
}

/** Countries with calling codes, UAE/GCC first — for phone login. */
function usePhoneCountryOptions(): Country[] {
  return useMemo(() => {
    const byAlpha2 = new Map(countries.all.map((c) => [c.alpha2, c as Country]))
    return sortedPhoneCountries()
      .map((p) => byAlpha2.get(p.iso2))
      .filter((c): c is Country => !!c && (c.countryCallingCodes?.length ?? 0) > 0)
  }, [])
}

export function PhoneCountryInput({
  value = '',
  onChange,
  onBlur,
  error,
  disabled,
  autoFocus,
  placeholder = '50 123 4567',
  inputClassName,
}: PhoneCountryInputProps) {
  const phoneOptions = usePhoneCountryOptions()
  const parsed = useMemo(() => parsePhoneValue(value), [value])
  const [iso2, setIso2] = useState(parsed.iso2)
  const [national, setNational] = useState(parsed.national)

  useEffect(() => {
    setIso2(parsed.iso2)
    setNational(parsed.national)
  }, [parsed.iso2, parsed.national])

  const emitChange = (nextIso: string, nextNational: string) => {
    const c = getPhoneCountry(nextIso)
    onChange(formatFullPhone(c.dial, nextNational))
  }

  return (
    <div className="space-y-1">
      <div
        className={clsx(
          'flex w-full overflow-hidden rounded-xl border bg-white shadow-sm transition-all',
          error
            ? 'border-red-300 focus-within:ring-2 focus-within:ring-red-500/25'
            : 'border-gray-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20',
        )}
      >
        <div className="shrink-0 border-r border-gray-200 bg-gray-50">
          <CountryDropdown
            options={phoneOptions}
            defaultAlpha2={iso2}
            onChange={(country) => {
              setIso2(country.alpha2)
              emitChange(country.alpha2, national)
            }}
            disabled={disabled}
            slim
            showCallingCode
            compact
            triggerClassName="h-full min-h-10 w-auto shrink-0 gap-1 rounded-none border-0 bg-gray-50 px-2 py-2 shadow-none hover:bg-gray-100 focus:ring-0"
          />
        </div>

        <input
          type="tel"
          inputMode="numeric"
          autoFocus={autoFocus}
          disabled={disabled}
          value={national}
          placeholder={placeholder}
          onBlur={onBlur}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            setNational(digits)
            emitChange(iso2, digits)
          }}
          className={clsx(
            'min-w-0 flex-1 basis-[80%] bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-base',
            inputClassName,
          )}
          aria-label="Mobile number"
        />
      </div>
      {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}
    </div>
  )
}

export { DEFAULT_PHONE_COUNTRY_ISO }
