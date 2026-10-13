import { useMemo, useState } from 'react'
import { ChartColumn } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MetricKey } from '../modules/metrics/calculate'
import type { MetricSettingsState } from '../modules/metrics/settings'
import { getEnabledMetricKeys } from '../modules/metrics/settings'
import type { LearningSession } from '../modules/scheduling/types'
import type { ResultRecord } from '../modules/reporting/progress'
import {
  buildSessionCompareTable,
  buildSessionMetricSeries,
  toChartRows,
} from '../modules/reporting/session-series'
import { Panel } from './ui'

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'radar'

const CHART_TYPES: { id: ChartKind; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'pie', label: 'Pie' },
  { id: 'radar', label: 'Radar' },
]

const PALETTE = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777']

type Props = {
  ledger: ResultRecord[]
  learningSessions: LearningSession[]
  courseId: string
  classId?: string
  learnerUserId?: string
  metricSettings: MetricSettingsState
  title?: string
}

export function DynamicChartStudio({
  ledger,
  learningSessions,
  courseId,
  classId,
  learnerUserId,
  metricSettings,
  title = 'Charts',
}: Props) {
  const enabled = getEnabledMetricKeys(metricSettings)
  const [chartKind, setChartKind] = useState<ChartKind>('bar')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(() =>
    enabled.slice(0, 2),
  )
  const [selectedSessions, setSelectedSessions] = useState<string[]>([])

  const allPoints = useMemo(
    () =>
      buildSessionMetricSeries({
        ledger,
        learningSessions,
        courseId,
        classId,
        learnerUserId,
        metricKeys: enabled,
      }),
    [ledger, learningSessions, courseId, classId, learnerUserId, enabled],
  )

  const filteredPoints = useMemo(() => {
    if (selectedSessions.length === 0) return allPoints
    return allPoints.filter((p) => selectedSessions.includes(p.learningSessionId))
  }, [allPoints, selectedSessions])

  const chartRows = useMemo(
    () => toChartRows(filteredPoints, selectedMetrics),
    [filteredPoints, selectedMetrics],
  )

  const compareTable = useMemo(
    () => buildSessionCompareTable(filteredPoints, metricSettings),
    [filteredPoints, metricSettings],
  )

  const pieData = useMemo(() => {
    const key = selectedMetrics[0]
    if (!key) return []
    return filteredPoints
      .map((p, i) => ({
        name: p.label,
        value: typeof p.metrics[key] === 'number' ? (p.metrics[key] as number) : 0,
        fill: PALETTE[i % PALETTE.length],
      }))
      .filter((d) => d.value != null)
  }, [filteredPoints, selectedMetrics])

  const radarData = useMemo(() => {
    // One radar: metrics as axes, average across selected sessions
    return selectedMetrics.map((key) => {
      const vals = filteredPoints
        .map((p) => p.metrics[key])
        .filter((v): v is number => typeof v === 'number')
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      const label = metricSettings.metrics.find((m) => m.key === key)?.label ?? key
      const isRatio =
        key === 'rfc' ||
        key === 'rac' ||
        key.includes('rate') ||
        key === 'awareness_recovery' ||
        key === 'purple_mastery_rate'
      return {
        metric: label,
        value: isRatio ? Math.round(avg * 1000) / 10 : Math.round(avg * 100) / 100,
      }
    })
  }, [filteredPoints, selectedMetrics, metricSettings])

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (chartKind === 'pie' && prev.length >= 1) return [key]
      return [...prev, key]
    })
  }

  function toggleSession(id: string) {
    setSelectedSessions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <Panel
      icon={ChartColumn}
      title={title}
      description="Pick chart type + metrics + sessions. Values follow Admin metric settings."
      defaultOpen
    >
      <div className="chart-studio">
        <div className="chart-studio-controls">
          <div className="chart-control-block">
            <span className="chart-control-label">Chart type</span>
            <div className="btn-row my-0">
              {CHART_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={chartKind === t.id ? 'active' : 'ghost'}
                  onClick={() => {
                    setChartKind(t.id)
                    if (t.id === 'pie' && selectedMetrics.length > 1) {
                      setSelectedMetrics((m) => m.slice(0, 1))
                    }
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-control-block">
            <span className="chart-control-label">
              Metrics {chartKind === 'pie' ? '(one for pie)' : ''}
            </span>
            <div className="chart-metric-pills">
              {enabled.map((key) => {
                const label = metricSettings.metrics.find((m) => m.key === key)?.label ?? key
                const on = selectedMetrics.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={on ? 'weekday-pill is-on' : 'weekday-pill'}
                    onClick={() => toggleMetric(key)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {allPoints.length > 0 ? (
            <div className="chart-control-block">
              <span className="chart-control-label">
                Sessions (empty = all) · {allPoints.length} with data
              </span>
              <div className="chart-metric-pills">
                {allPoints.map((p) => {
                  const on =
                    selectedSessions.length === 0 ||
                    selectedSessions.includes(p.learningSessionId)
                  return (
                    <button
                      key={p.learningSessionId}
                      type="button"
                      className={on ? 'weekday-pill is-on' : 'weekday-pill'}
                      onClick={() => toggleSession(p.learningSessionId)}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="chart-studio-canvas">
          {chartRows.length === 0 || selectedMetrics.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No chart data</p>
              <p className="empty-desc">
                Finalize colors in live sessions (Buổi 1, 2, …). Then pick metrics above.
              </p>
            </div>
          ) : (
            <div className="chart-plot">
              <ResponsiveContainer width="100%" height={280}>
                {chartKind === 'bar' ? (
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {selectedMetrics.map((k, i) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        name={metricSettings.metrics.find((m) => m.key === k)?.label ?? k}
                        fill={PALETTE[i % PALETTE.length]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                ) : chartKind === 'line' ? (
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {selectedMetrics.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={metricSettings.metrics.find((m) => m.key === k)?.label ?? k}
                        stroke={PALETTE[i % PALETTE.length]}
                        strokeWidth={2}
                        dot
                      />
                    ))}
                  </LineChart>
                ) : chartKind === 'area' ? (
                  <AreaChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {selectedMetrics.map((k, i) => (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={metricSettings.metrics.find((m) => m.key === k)?.label ?? k}
                        stroke={PALETTE[i % PALETTE.length]}
                        fill={PALETTE[i % PALETTE.length]}
                        fillOpacity={0.15}
                      />
                    ))}
                  </AreaChart>
                ) : chartKind === 'pie' ? (
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {pieData.map((d, i) => (
                        <Cell key={d.name} fill={d.fill ?? PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : (
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis tick={{ fontSize: 10 }} />
                    <Radar
                      name="Avg"
                      dataKey="value"
                      stroke={PALETTE[0]}
                      fill={PALETTE[0]}
                      fillOpacity={0.25}
                    />
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {filteredPoints.length > 0 && selectedMetrics.length > 0 ? (
          <div className="table-wrap mt-3">
            <table aria-label="Session comparison">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {filteredPoints.map((p) => (
                    <th key={p.learningSessionId} scope="col">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareTable
                  .filter((row) => selectedMetrics.includes(row.key))
                  .map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      {row.bySession.map((cell) => (
                        <td key={cell.sessionNumber} className="font-mono text-xs">
                          {cell.value == null
                            ? '—'
                            : row.unit === 'ratio' ||
                                row.key.includes('rate') ||
                                row.key === 'rfc' ||
                                row.key === 'rac' ||
                                row.key === 'awareness_recovery'
                              ? `${(cell.value * 100).toFixed(1)}%`
                              : cell.value.toFixed(2)}
                          <span className="text-slate-400"> · sample={cell.n}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
