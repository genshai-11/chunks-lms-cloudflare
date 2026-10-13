export type PackageRacMetricLabel = '%c' | '%r'

function firstCodeChar(value: string | null | undefined): string {
  return (value ?? '').trim().charAt(0).toUpperCase()
}

export function racMetricLabelForPackage(packageCode: string | null | undefined): PackageRacMetricLabel {
  return firstCodeChar(packageCode) === 'R' ? '%r' : '%c'
}

export function racMetricTitle(label: PackageRacMetricLabel, coolSteps: number, totalRecords: number): string {
  return `${label} = cool records / N_total = ${coolSteps} / ${totalRecords}. Cool = Green + Blue + Indigo + Purple.`
}
