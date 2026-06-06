import { countries as countryData } from 'country-data-list'

export type PhoneCountry = {
  iso2: string
  name: string
  /** Dial digits only, e.g. "971" */
  dial: string
  /** Display with +, e.g. "+971" */
  dialDisplay: string
}

export const DEFAULT_PHONE_COUNTRY_ISO = 'AE'

export function compareByDialThenName(
  a: { dial: string; name: string },
  b: { dial: string; name: string },
): number {
  const da = parseInt(a.dial, 10) || 0
  const db = parseInt(b.dial, 10) || 0
  if (da !== db) return da - db
  return a.name.localeCompare(b.name)
}

function buildCountryList(): PhoneCountry[] {
  const mapped: PhoneCountry[] = []

  for (const c of countryData.all) {
    if (c.status !== 'assigned') continue
    const raw = c.countryCallingCodes?.[0]
    if (!raw) continue
    const dial = raw.replace(/\D/g, '')
    if (!dial) continue
    mapped.push({
      iso2: c.alpha2,
      name: c.name,
      dial,
      dialDisplay: raw.startsWith('+') ? raw : `+${dial}`,
    })
  }

  return mapped.sort(compareByDialThenName)
}

export const PHONE_COUNTRIES: PhoneCountry[] = buildCountryList()

const byIso = new Map(PHONE_COUNTRIES.map((c) => [c.iso2, c]))

export function getPhoneCountry(iso2: string): PhoneCountry {
  return byIso.get(iso2) ?? byIso.get(DEFAULT_PHONE_COUNTRY_ISO)!
}

export function sortedPhoneCountries(): PhoneCountry[] {
  return PHONE_COUNTRIES
}

export function formatFullPhone(dial: string, national: string): string {
  const dialDigits = dial.replace(/\D/g, '')
  const nationalDigits = national.replace(/\D/g, '')
  if (!dialDigits && !nationalDigits) return ''
  return `+${dialDigits}${nationalDigits}`
}

export function parsePhoneValue(full: string): { iso2: string; national: string } {
  const trimmed = (full || '').trim()
  if (!trimmed) {
    return { iso2: DEFAULT_PHONE_COUNTRY_ISO, national: '' }
  }

  const normalized = trimmed.replace(/[^\d+]/g, '')
  if (!normalized.startsWith('+')) {
    return { iso2: DEFAULT_PHONE_COUNTRY_ISO, national: normalized.replace(/\D/g, '') }
  }

  const digits = normalized.slice(1)
  const byDialLength = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  for (const country of byDialLength) {
    if (digits.startsWith(country.dial)) {
      return {
        iso2: country.iso2,
        national: digits.slice(country.dial.length),
      }
    }
  }

  return { iso2: DEFAULT_PHONE_COUNTRY_ISO, national: digits }
}
