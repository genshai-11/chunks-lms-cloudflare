import type { MetricStatus } from './calculate'
import { racMetricLabelForPackage, type PackageRacMetricLabel } from './display-labels'

export type BuiltInStandaloneTestMetricKey =
  | 'rfc'
  | 'package_percent'
  | 'legacy_rac'
  | 'avg_cvr'
  | 'avg_cci'
  | 'avg_cpd'
  | 'acn'
  | 'n_total'

export type StandaloneTestMetricUnit = 'percent' | 'number' | 'ohm' | 'amp' | 'volt' | 'count'

export type StandaloneTestMetricSetting = {
  key: string
  enabled: boolean
  status: MetricStatus
  label: string
  definition: string
  formula: string
  unit: StandaloneTestMetricUnit
  custom: boolean
}

export type StandaloneFormulaContext = {
  rfc: number | null
  rac: number | null
  avgPercentX: number | null
  legacyRac: number | null
  avgCvr: number | null
  avgCci: number | null
  avgCpd: number | null
  acn: number | null
  nTotal: number
  warmSteps: number
  coolSteps: number
  finalized: number
  total: number
  sumPercentX: number | null
  primaryRecords: number
  probeRecords: number
  enteredProbeCount: number
  redSteps: number
  orangeSteps: number
  yellowSteps: number
  greenSteps: number
  blueSteps: number
  indigoSteps: number
  purpleSteps: number
}

export const STANDALONE_FORMULA_VARIABLES: Array<keyof StandaloneFormulaContext> = [
  'rfc',
  'rac',
  'avgPercentX',
  'legacyRac',
  'avgCvr',
  'avgCci',
  'avgCpd',
  'acn',
  'nTotal',
  'warmSteps',
  'coolSteps',
  'finalized',
  'total',
  'sumPercentX',
  'primaryRecords',
  'probeRecords',
  'enteredProbeCount',
  'redSteps',
  'orangeSteps',
  'yellowSteps',
  'greenSteps',
  'blueSteps',
  'indigoSteps',
  'purpleSteps',
]

export const DEFAULT_STANDALONE_TEST_METRICS: StandaloneTestMetricSetting[] = [
  {
    key: 'rfc',
    enabled: true,
    status: 'operational',
    label: 'RFC',
    definition: 'Warm spectrum records / N_total, shown as a percentage.',
    formula: 'rfc',
    unit: 'percent',
    custom: false,
  },
  {
    key: 'package_percent',
    enabled: true,
    status: 'operational',
    label: '%c/%r',
    definition: 'Package main %c/%r value. Uses Avg %x: mean normalized 7-color spectrum factor over N_total.',
    formula: 'avgPercentX',
    unit: 'percent',
    custom: false,
  },
  {
    key: 'legacy_rac',
    enabled: false,
    status: 'operational',
    label: 'RAC legacy',
    definition: 'Legacy cool spectrum records / N_total. This equals 100 - RFC when N_total is greater than zero.',
    formula: 'legacyRac',
    unit: 'percent',
    custom: false,
  },
  {
    key: 'avg_cvr',
    enabled: true,
    status: 'operational',
    label: 'Avg CVR',
    definition: 'Average CVR across finalized questions in the current filter.',
    formula: 'avgCvr',
    unit: 'ohm',
    custom: false,
  },
  {
    key: 'avg_cci',
    enabled: true,
    status: 'operational',
    label: 'Avg CCI',
    definition: 'Average CCI across finalized questions in the current filter.',
    formula: 'avgCci',
    unit: 'amp',
    custom: false,
  },
  {
    key: 'avg_cpd',
    enabled: true,
    status: 'operational',
    label: 'Avg Final CPD',
    definition: 'Average final CPD: mean(CVR x CCI x color factor) across finalized questions.',
    formula: 'avgCpd',
    unit: 'volt',
    custom: false,
  },
  {
    key: 'acn',
    enabled: true,
    status: 'experimental',
    label: 'ACN',
    definition: 'Configured ACN value from the standalone Tests 1-1 analysis formula.',
    formula: 'acn',
    unit: 'number',
    custom: false,
  },
  {
    key: 'n_total',
    enabled: true,
    status: 'operational',
    label: 'N_total',
    definition: 'Primary records + probe records in the current filter.',
    formula: 'nTotal',
    unit: 'count',
    custom: false,
  },
]

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: keyof StandaloneFormulaContext }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' }
  | { type: 'paren'; value: '(' | ')' }

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]!
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let raw = ch
      i += 1
      while (i < expression.length && /[0-9.]/.test(expression[i]!)) {
        raw += expression[i]!
        i += 1
      }
      if ((raw.match(/\./g) ?? []).length > 1) return null
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      tokens.push({ type: 'number', value })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let raw = ch
      i += 1
      while (i < expression.length && /[A-Za-z0-9_]/.test(expression[i]!)) {
        raw += expression[i]!
        i += 1
      }
      if (!STANDALONE_FORMULA_VARIABLES.includes(raw as keyof StandaloneFormulaContext)) return null
      tokens.push({ type: 'identifier', value: raw as keyof StandaloneFormulaContext })
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch })
      i += 1
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'operator', value: ch })
      i += 1
      continue
    }
    return null
  }
  return tokens
}

export function evaluateStandaloneFormula(
  expression: string,
  context: StandaloneFormulaContext,
): number | null {
  const parsedTokens = tokenize(expression.trim())
  if (!parsedTokens || parsedTokens.length === 0) return null
  const tokens: Token[] = parsedTokens
  let index = 0

  function peek(): Token | undefined {
    return tokens[index]
  }

  function take(): Token | undefined {
    return tokens[index++]
  }

  function parsePrimary(): number | null {
    const token = take()
    if (!token) return null
    if (token.type === 'number') return token.value
    if (token.type === 'identifier') {
      const value = context[token.value]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }
    if (token.type === 'operator' && token.value === '-') {
      const value = parsePrimary()
      return value == null ? null : -value
    }
    if (token.type === 'operator' && token.value === '+') {
      return parsePrimary()
    }
    if (token.type === 'paren' && token.value === '(') {
      const value = parseExpression()
      const close = take()
      if (!close || close.type !== 'paren' || close.value !== ')') return null
      return value
    }
    return null
  }

  function parseFactor(): number | null {
    let left = parsePrimary()
    while (left != null) {
      const token = peek()
      if (!token || token.type !== 'operator' || !['*', '/', '%'].includes(token.value)) break
      take()
      const right = parsePrimary()
      if (right == null) return null
      if (token.value === '*') left *= right
      if (token.value === '/') {
        if (right === 0) return null
        left /= right
      }
      if (token.value === '%') {
        if (right === 0) return null
        left %= right
      }
    }
    return left
  }

  function parseExpression(): number | null {
    let left = parseFactor()
    while (left != null) {
      const token = peek()
      if (!token || token.type !== 'operator' || !['+', '-'].includes(token.value)) break
      take()
      const right = parseFactor()
      if (right == null) return null
      left = token.value === '+' ? left + right : left - right
    }
    return left
  }

  const value = parseExpression()
  if (index !== tokens.length || value == null || !Number.isFinite(value)) return null
  return value
}

export function standaloneMetricLabel(
  metric: StandaloneTestMetricSetting,
  packageTitleOrCode: string | null | undefined,
): string {
  if (metric.key === 'package_percent') return racMetricLabelForPackage(packageTitleOrCode)
  return metric.label
}

export function standalonePackagePercentLabel(packageTitleOrCode: string | null | undefined): PackageRacMetricLabel {
  return racMetricLabelForPackage(packageTitleOrCode)
}

export function mergeStandaloneTestMetrics(
  saved: unknown,
): StandaloneTestMetricSetting[] {
  const defaults = DEFAULT_STANDALONE_TEST_METRICS.map((m) => ({ ...m }))
  if (!Array.isArray(saved)) return defaults

  const byKey = new Map(
    saved
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => [String(row.key), row]),
  )

  const mergedDefaults = defaults.map((metric) => {
    const row = byKey.get(metric.key)
    if (!row) return metric
    return coerceStandaloneMetric(row, metric)
  }).filter((metric): metric is StandaloneTestMetricSetting => Boolean(metric))

  const defaultKeys = new Set(defaults.map((m) => m.key))
  const custom = Array.from(byKey.entries())
    .filter(([key]) => !defaultKeys.has(key))
    .map(([, row]) => coerceStandaloneMetric(row, null))
    .filter((row): row is StandaloneTestMetricSetting => Boolean(row))

  return [...mergedDefaults, ...custom]
}

export function coerceStandaloneMetric(
  row: Record<string, unknown>,
  fallback: StandaloneTestMetricSetting | null,
): StandaloneTestMetricSetting | null {
  const key = typeof row.key === 'string' ? row.key.trim() : fallback?.key
  if (!key) return null
  const unit = isStandaloneMetricUnit(row.unit) ? row.unit : fallback?.unit ?? 'number'
  const custom = typeof row.custom === 'boolean' ? row.custom : fallback?.custom ?? true
  return {
    key,
    enabled: typeof row.enabled === 'boolean' ? row.enabled : fallback?.enabled ?? true,
    status: row.status === 'experimental' || row.status === 'operational' ? row.status : fallback?.status ?? 'experimental',
    label: typeof row.label === 'string' && row.label.trim() ? row.label : fallback?.label ?? key,
    definition:
      typeof row.definition === 'string' && row.definition.trim()
        ? row.definition
        : fallback?.definition ?? 'Custom standalone Tests 1-1 metric.',
    formula: typeof row.formula === 'string' && row.formula.trim() ? row.formula : fallback?.formula ?? '0',
    unit,
    custom,
  }
}

function isStandaloneMetricUnit(value: unknown): value is StandaloneTestMetricUnit {
  return value === 'percent' || value === 'number' || value === 'ohm' || value === 'amp' || value === 'volt' || value === 'count'
}

export function formatStandaloneMetricValue(
  unit: StandaloneTestMetricUnit,
  value: number | null,
): string {
  if (value == null || !Number.isFinite(value)) return '-'
  if (unit === 'percent') return `${Math.round(value)}%`
  if (unit === 'ohm') return `${value.toFixed(1)} \u03A9`
  if (unit === 'amp') return `${value.toFixed(1)}A`
  if (unit === 'volt') return `${value.toFixed(1)}V`
  if (unit === 'count') return String(Math.round(value))
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
}

