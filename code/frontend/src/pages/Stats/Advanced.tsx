import { useEffect, useMemo, useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ZAxis,
} from 'recharts'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { numericDomain, useChartSize } from '../../hooks/useChartSize'

type AdvancedRow = {
  player_id: number
  player_name: string
  team: string
  per?: number | string | null
  ts_pct?: number | string | null
  usg_pct?: number | string | null
  avg_min?: number | string | null
}

type ScatterPoint = {
  x: number
  y: number
  z?: number
  player_name: string
  team: string
}

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

const AXIS = { stroke: 'var(--text-secondary)', fontSize: 11 }
const MARGIN = { top: 12, right: 20, bottom: 12, left: 8 }

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ScatterPoint }[] }) {
  if (!active || !payload?.[0]?.payload) return null
  const d = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: 8,
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600 }}>{d.player_name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{d.team}</div>
      <div>MIN: {d.x.toFixed(1)}</div>
      <div>PER: {d.y.toFixed(1)}</div>
    </div>
  )
}

function UsgTsTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ScatterPoint }[] }) {
  if (!active || !payload?.[0]?.payload) return null
  const d = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: 8,
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600 }}>{d.player_name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{d.team}</div>
      <div>USG%: {(d.x * 100).toFixed(1)}%</div>
      <div>TS%: {(d.y * 100).toFixed(1)}%</div>
      <div>MIN: {(d.z ?? 0).toFixed(1)}</div>
    </div>
  )
}

function PerMinChart({ data }: { data: ScatterPoint[] }) {
  const { ref, width, height, ready } = useChartSize(320)
  const xDomain = useMemo(
    () => numericDomain(data.map(d => d.x), { min: 0, max: 42 }),
    [data],
  )
  const yDomain = useMemo(() => numericDomain(data.map(d => d.y)), [data])

  return (
    <div ref={ref} style={{ width: '100%', height, minHeight: height }}>
      {!ready && <div className="loading" style={{ height }}>…</div>}
      {ready && (
        <ScatterChart width={width} height={height} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name="MIN"
            domain={xDomain}
            tickCount={7}
            allowDecimals
            {...AXIS}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="PER"
            domain={yDomain}
            tickCount={7}
            allowDecimals
            width={36}
            {...AXIS}
          />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            name="players"
            data={data}
            fill="#7c57ff"
            opacity={0.65}
            isAnimationActive={false}
          />
        </ScatterChart>
      )}
    </div>
  )
}

function UsgTsChart({ data }: { data: ScatterPoint[] }) {
  const { ref, width, height, ready } = useChartSize(320)
  const xDomain = useMemo(
    () => numericDomain(data.map(d => d.x), { min: 0.05, max: 0.45 }),
    [data],
  )
  const yDomain = useMemo(
    () => numericDomain(data.map(d => d.y), { min: 0.4, max: 0.75 }),
    [data],
  )

  return (
    <div ref={ref} style={{ width: '100%', height, minHeight: height }}>
      {!ready && <div className="loading" style={{ height }}>…</div>}
      {ready && (
        <ScatterChart width={width} height={height} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name="USG%"
            domain={xDomain}
            tickCount={6}
            tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`}
            {...AXIS}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="TS%"
            domain={yDomain}
            tickCount={6}
            tickFormatter={v => `${(Number(v) * 100).toFixed(0)}%`}
            width={40}
            {...AXIS}
          />
          <ZAxis dataKey="z" range={[24, 220]} />
          <Tooltip content={<UsgTsTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            name="players"
            data={data}
            fill="var(--accent)"
            opacity={0.65}
            isAnimationActive={false}
          />
        </ScatterChart>
      )}
    </div>
  )
}

export default function Advanced() {
  const { seasonId } = useSeasonFilter()
  const [raw, setRaw] = useState<AdvancedRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    statsApi.getAdvanced(seasonId).then(setRaw).finally(() => setLoading(false))
  }, [seasonId])

  const usgTsData = useMemo((): ScatterPoint[] => {
    const out: ScatterPoint[] = []
    for (const d of raw) {
      const usg = n(d.usg_pct)
      const ts = n(d.ts_pct)
      const min = n(d.avg_min)
      if (usg == null || ts == null) continue
      out.push({
        x: usg,
        y: ts,
        z: min ?? 0,
        player_name: d.player_name,
        team: d.team,
      })
    }
    return out
  }, [raw])

  const perMinData = useMemo((): ScatterPoint[] => {
    const out: ScatterPoint[] = []
    for (const d of raw) {
      const per = n(d.per)
      const min = n(d.avg_min)
      if (per == null || min == null) continue
      out.push({
        x: min,
        y: per,
        player_name: d.player_name,
        team: d.team,
      })
    }
    return out
  }, [raw])

  if (loading) return <div className="loading">Загрузка...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          USG% vs TS% (размер = минуты)
        </h3>
        {usgTsData.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Нет данных за сезон</div>
        ) : (
          <UsgTsChart data={usgTsData} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          PER vs Avg MIN (выявление недооценённых игроков)
        </h3>
        {perMinData.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Нет данных за сезон</div>
        ) : (
          <PerMinChart data={perMinData} />
        )}
      </div>
    </div>
  )
}
