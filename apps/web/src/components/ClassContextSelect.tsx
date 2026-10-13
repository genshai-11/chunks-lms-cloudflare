import { useState, useRef, useEffect } from 'react'
import { School, Check, ChevronDown } from 'lucide-react'
import type { ClassOption } from '../modules/roster/class-context'
import type { LearnerEnrollmentOption } from '../modules/roster/class-context'

type TeacherProps = {
  variant: 'teacher'
  options: ClassOption[]
  value: string | null
  onChange: (classId: string) => void
  /** compact for sidebar */
  compact?: boolean
}

type LearnerProps = {
  variant: 'learner'
  options: LearnerEnrollmentOption[]
  value: string | null
  onChange: (classId: string) => void
  compact?: boolean
}

type AdminProps = {
  variant: 'admin'
  options: ClassOption[]
  value: string | null
  onChange: (classId: string) => void
  compact?: boolean
}

type Props = TeacherProps | LearnerProps | AdminProps

/** Class / enrollment switcher for role workspaces and admin analysis. */
export function ClassContextSelect(props: Props) {
  const { value, onChange, compact } = props
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const derivedMode = value === 'all' ? 'all' : (value && value.includes(',') ? 'multi' : 'one')
  const [activeTab, setActiveTab] = useState<'one' | 'multi' | 'all'>(derivedMode)

  useEffect(() => {
    setActiveTab(derivedMode)
  }, [value, derivedMode, isOpen])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (props.options.length === 0) {
    return (
      <p className={`class-context-empty${compact ? ' is-compact' : ''}`}>
        <School className="h-3.5 w-3.5" aria-hidden />
        No classes
      </p>
    )
  }

  if (props.options.length === 1 && compact) {
    const label =
      props.variant === 'learner'
        ? props.options[0]!.classRow.name
        : `${props.options[0]!.classRow.name}${
            props.options[0]!.course?.code ? ` · ${props.options[0]!.course.code}` : ''
          }`
    return (
      <p className="class-context-single" title={label}>
        <School className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </p>
    )
  }

  // Determine current label to show on the button:
  let displayLabel = 'Select Class'
  if (value === 'all') {
    displayLabel = 'All Classes'
  } else if (value && value.includes(',')) {
    const selectedIds = value.split(',')
    displayLabel = `${selectedIds.length} Classes`
  } else if (value) {
    const selectedOption = props.options.find(
      (o) => o.classRow.id === value
    )
    if (selectedOption) {
      displayLabel = selectedOption.classRow.name
      if (props.variant !== 'learner' && selectedOption.course?.code) {
        displayLabel += ` · ${selectedOption.course.code}`
      }
    }
  }

  const activeSelection = value === 'all'
    ? props.options.map(o => o.classRow.id)
    : (value ? value.split(',') : [])

  const handleSelectOption = (classId: string) => {
    onChange(classId)
    setIsOpen(false)
  }

  const handleToggleOption = (classId: string) => {
    if (value === 'all') {
      const otherIds = props.options.map(o => o.classRow.id).filter(id => id !== classId)
      onChange(otherIds.join(','))
    } else {
      const idx = activeSelection.indexOf(classId)
      let nextSelection: string[]
      if (idx > -1) {
        nextSelection = activeSelection.filter(id => id !== classId)
      } else {
        nextSelection = [...activeSelection, classId]
      }
      
      if (nextSelection.length === 0) {
        onChange('')
      } else if (nextSelection.length === props.options.length) {
        onChange('all')
      } else {
        onChange(nextSelection.join(','))
      }
    }
  }

  const handleSetMode = (newMode: 'one' | 'multi' | 'all') => {
    setActiveTab(newMode)
    if (newMode === 'all') {
      onChange('all')
      setIsOpen(false)
    } else if (newMode === 'one') {
      const currentIds = value === 'all'
        ? props.options.map(o => o.classRow.id)
        : (value ? value.split(',') : [])
      const nextId = currentIds[0] ?? props.options[0]?.classRow.id ?? ''
      onChange(nextId)
    } else if (newMode === 'multi') {
      if (value === 'all') {
        onChange(props.options.map(o => o.classRow.id).join(','))
      } else if (!value) {
        onChange(props.options[0]?.classRow.id ?? '')
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`class-context-select flex items-center justify-between w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-3xs cursor-pointer hover:bg-slate-50 transition-colors ${
          compact ? 'is-compact' : ''
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <School className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 w-full min-w-[200px] max-w-xs rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50 text-xs font-medium text-slate-700 space-y-2">
          {props.variant !== 'learner' && (
            <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => handleSetMode('one')}
                className={`flex-1 py-1 text-center rounded-md text-[10px] font-bold uppercase transition-all ${
                  activeTab === 'one' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                One
              </button>
              <button
                type="button"
                onClick={() => handleSetMode('multi')}
                className={`flex-1 py-1 text-center rounded-md text-[10px] font-bold uppercase transition-all ${
                  activeTab === 'multi' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Multi
              </button>
              <button
                type="button"
                onClick={() => handleSetMode('all')}
                className={`flex-1 py-1 text-center rounded-md text-[10px] font-bold uppercase transition-all ${
                  activeTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
            </div>
          )}
          
          <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1">
            {activeTab === 'all' ? (
              <div className="px-2.5 py-3 text-center text-slate-400 font-medium">
                All classes selected
              </div>
            ) : props.variant === 'learner' ? (
              props.options.map((o) => {
                const isSelected = value === o.classRow.id
                return (
                  <button
                    key={o.classRow.id}
                    type="button"
                    onClick={() => handleSelectOption(o.classRow.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-50 text-slate-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <span className="truncate">
                      {o.classRow.name}
                      {o.course?.code ? ` · ${o.course.code}` : ''}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-slate-900" aria-hidden />}
                  </button>
                )
              })
            ) : (
              props.options.map((o) => {
                const isSelected = activeSelection.includes(o.classRow.id)
                return (
                  <button
                    key={o.classRow.id}
                    type="button"
                    onClick={() => {
                      if (activeTab === 'multi') {
                        handleToggleOption(o.classRow.id)
                      } else {
                        handleSelectOption(o.classRow.id)
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-50 text-slate-900 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <span className="truncate">
                      {o.classRow.name}
                      {o.course?.code ? ` · ${o.course.code}` : ''}
                      {` · ${o.seats}/${o.classRow.capacity}`}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-slate-900" aria-hidden />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
