import {
  useCallback,
  useState,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Globe, Search } from 'lucide-react'
import { CircleFlag } from 'react-circle-flags'
import { countries } from 'country-data-list'

export interface Country {
  alpha2: string
  alpha3: string
  countryCallingCodes: string[]
  currencies: string[]
  emoji?: string
  ioc: string
  languages: string[]
  name: string
  status: string
}

export function countryCallingDisplay(country: Country): string {
  const raw = country.countryCallingCodes?.[0]
  if (!raw) return ''
  return raw.startsWith('+') ? raw : `+${raw.replace(/\D/g, '')}`
}

export function countryDialNumeric(country: Country): number {
  const digits = countryCallingDisplay(country).replace(/\D/g, '')
  return digits ? parseInt(digits, 10) : 0
}

export function compareCountriesByDialThenName(a: Country, b: Country): number {
  const da = countryDialNumeric(a)
  const db = countryDialNumeric(b)
  if (da !== db) return da - db
  return (a.name || '').localeCompare(b.name || '')
}

function matchesCountrySearch(country: Country, q: string): boolean {
  if (!country.name) return false
  const dial = countryCallingDisplay(country)
  const dialDigits = dial.replace(/\D/g, '')
  const qDigits = q.replace(/\D/g, '')
  const haystack = `${country.name} ${country.alpha2} ${country.alpha3} ${dial} ${dialDigits}`.toLowerCase()
  if (haystack.includes(q)) return true
  if (qDigits.length >= 2 && dialDigits.startsWith(qDigits)) return true
  return false
}

export const defaultCountryOptions: Country[] = countries.all.filter(
  (country: Country) =>
    country.emoji && country.status !== 'deleted' && country.ioc !== 'PRK',
)

interface CountryDropdownProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  options?: Country[]
  onChange?: (country: Country) => void
  /** ISO 3166-1 alpha-3 */
  defaultValue?: string
  /** ISO 3166-1 alpha-2 (preferred for phone flows) */
  defaultAlpha2?: string
  placeholder?: string
  /** Compact trigger: flag (+ optional dial code) only */
  slim?: boolean
  /** Show international dial code in trigger and list rows */
  showCallingCode?: boolean
  /** Tight trigger width (flag + code + chevron only) for phone inputs */
  compact?: boolean
  triggerClassName?: string
  popoverClassName?: string
}

const CountryDropdownComponent = (
  {
    options = defaultCountryOptions,
    onChange,
    defaultValue,
    defaultAlpha2,
    disabled = false,
    placeholder = 'Select a country',
    slim = false,
    showCallingCode = false,
    compact = false,
    triggerClassName,
    popoverClassName,
    className,
    ...props
  }: CountryDropdownProps,
  ref: React.ForwardedRef<HTMLButtonElement>,
) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<Country | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)

  const orderedOptions = useMemo(
    () => [...options].filter((x) => x.name).sort(compareCountriesByDialThenName),
    [options],
  )

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^\+/, '')
    if (!q) return orderedOptions
    return orderedOptions.filter((x) => matchesCountrySearch(x, q))
  }, [orderedOptions, search])

  const resolveDefault = useMemo(() => {
    if (defaultAlpha2) {
      return orderedOptions.find((c) => c.alpha2 === defaultAlpha2)
    }
    if (defaultValue) {
      return orderedOptions.find((c) => c.alpha3 === defaultValue)
    }
    return undefined
  }, [defaultAlpha2, defaultValue, orderedOptions])

  useEffect(() => {
    if (resolveDefault) setSelectedCountry(resolveDefault)
  }, [resolveDefault?.alpha2])

  const handleSelect = useCallback(
    (country: Country) => {
      setSelectedCountry(country)
      onChange?.(country)
      setOpen(false)
    },
    [onChange],
  )

  const triggerClasses = cn(
    'flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    slim && !showCallingCode && 'w-[4.5rem] px-2',
    slim && showCallingCode && !compact && 'w-full min-w-0 gap-1 px-2',
    compact && 'w-auto shrink-0 justify-start gap-1 px-2',
    triggerClassName,
    className,
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    const cursor = e.target.selectionStart ?? next.length
    setSearch(next)
    requestAnimationFrame(() => {
      const el = searchRef.current
      if (!el) return
      el.focus({ preventScroll: true })
      try {
        el.setSelectionRange(cursor, cursor)
      } catch {
        /* ignore if input type does not support selection */
      }
    })
  }

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger
        ref={ref}
        type="button"
        className={triggerClasses}
        disabled={disabled}
        {...props}
      >
        {selectedCountry ? (
          <div
            className={cn(
              'flex items-center gap-1',
              compact ? 'shrink-0' : 'min-w-0 flex-1 overflow-hidden',
            )}
          >
            <div className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <CircleFlag countryCode={selectedCountry.alpha2.toLowerCase()} height={20} />
            </div>
            {showCallingCode && (
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-gray-800">
                {countryCallingDisplay(selectedCountry)}
              </span>
            )}
            {!slim && (
              <span className="truncate text-ellipsis whitespace-nowrap">
                {selectedCountry.name}
              </span>
            )}
          </div>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            {slim ? <Globe className="h-5 w-5" /> : placeholder}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        collisionPadding={10}
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'w-[min(100vw-2rem,20rem)] overflow-hidden rounded-lg p-0',
          popoverClassName,
        )}
      >
        <div className="flex max-h-[min(260px,50vh)] w-full flex-col">
          <div
            className="flex items-center border-b border-slate-100 px-3"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Search country..."
              value={search}
              onChange={handleSearchChange}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
              aria-label="Search countries"
            />
          </div>
          <ul className="max-h-[min(220px,45vh)] overflow-y-auto overflow-x-hidden p-1">
            {filteredOptions.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500">No country found.</li>
            ) : (
              filteredOptions.map((option) => {
                const dial = countryCallingDisplay(option)
                const selected = option.alpha2 === selectedCountry?.alpha2
                return (
                  <li key={option.alpha2}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-indigo-50',
                        selected && 'bg-indigo-50',
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(option)}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <div className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                          <CircleFlag countryCode={option.alpha2.toLowerCase()} height={20} />
                        </div>
                        {showCallingCode && dial && (
                          <span className="w-12 shrink-0 text-sm font-semibold text-slate-800">
                            {dial}
                          </span>
                        )}
                        <span className="truncate text-sm text-slate-700">{option.name}</span>
                      </div>
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4 shrink-0 text-indigo-600',
                          selected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}

CountryDropdownComponent.displayName = 'CountryDropdown'

export const CountryDropdown = forwardRef(CountryDropdownComponent)
