export type ProbeAction = {
  outcome: 'fail' | 'continue' | 'done'
  label: 'Fail' | 'Continue' | 'Done'
  colorLabel: 'Yellow' | 'Blue' | 'Indigo'
  shortcut: 'F' | 'C' | 'D'
  shortcuts: readonly string[]
  className: 'fail' | 'pass' | 'done'
}

/** Probe UI labels map lifecycle outcomes to the 7-color spectrum. */
export const PROBE_ACTIONS: ProbeAction[] = [
  {
    outcome: 'fail',
    label: 'Fail',
    colorLabel: 'Yellow',
    shortcut: 'F',
    shortcuts: ['F', '1'],
    className: 'fail',
  },
  {
    outcome: 'continue',
    label: 'Continue',
    colorLabel: 'Blue',
    shortcut: 'C',
    shortcuts: ['C', '2'],
    className: 'pass',
  },
  {
    outcome: 'done',
    label: 'Done',
    colorLabel: 'Indigo',
    shortcut: 'D',
    shortcuts: ['D', '3', 'Enter'],
    className: 'done',
  },
]
