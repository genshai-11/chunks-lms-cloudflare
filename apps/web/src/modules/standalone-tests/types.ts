export type StandaloneAssignmentStatus = 'active' | 'completed' | 'cancelled'
export type StandaloneRunStatus = 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled'
export type PromptLanguage = 'vi' | 'en'

export type SectionMeasurement = {
  sessionNumber: number
  targetCvrOhm: number
  cciSourceId: string
  cciName: string
  cciValue: number
}

export type NarrationReadiness = {
  introApproved: boolean
  approvedItemCount: number
  expectedItemCount: number
  staleCount: number
}

export function calculateItemCpd(measurement: Pick<SectionMeasurement, 'targetCvrOhm' | 'cciValue'>): number {
  return Math.round(measurement.targetCvrOhm * measurement.cciValue * 100) / 100
}

export function canStartStandaloneRun(readiness: NarrationReadiness): boolean {
  return readiness.introApproved
    && readiness.approvedItemCount === readiness.expectedItemCount
    && readiness.expectedItemCount > 0
    && readiness.staleCount === 0
}

export function assertSingleLearner(learnerIds: string[]): string {
  const unique = [...new Set(learnerIds.filter(Boolean))]
  if (unique.length !== 1) throw new Error('Standalone Test Run requires exactly one Learner')
  return unique[0]!
}

const transitions: Record<StandaloneRunStatus, StandaloneRunStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function assertRunTransition(from: StandaloneRunStatus, to: StandaloneRunStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Invalid standalone run transition: ${from} -> ${to}`)
}
