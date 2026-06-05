import { useEffect, useMemo, useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ZAxis,
  ReferenceLine,
} from 'recharts'
import { statsApi } from '../../api/stats'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { numericDomain, useChartSize } from '../../hooks/useChartSize'
import PlayerModal from '../../components/PlayerModal'

type AdvancedRow = {
  player_id: number
  player_name: string
  team: string
  per?: number | string | null
  ts_pct?: number | string | null
  usg_pct?: number | string | null
  avg_plus_minus?: number | string | null
  avg_min?: number | string | null
}

type ScatterPoint = {
  x: number
  y: number
  z?: number
  player_id: number
  player_name: string
  team: string
}

function n(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const MEDIAN_LINE = { stroke: 'var(--warning)', strokeDasharray: '5 4', strokeWidth: 1.5, strokeOpacity: 0.8, ifOverflow: 'extendDomain' as const }

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

function PmPerTooltip({ active, payload }: { active?: boolean; payload?: { payload?: ScatterPoint }[] }) {
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
      <div>+/-: {(d.x >= 0 ? '+' : '') + d.x.toFixed(1)}</div>
      <div>PER: {d.y.toFixed(1)}</div>
    </div>
  )
}

function PmPerChart({ data, onPick }: { data: ScatterPoint[]; onPick: (id: number) => void }) {
  const { ref, width, height, ready } = useChartSize(320)
  const xDomain = useMemo(() => numericDomain(data.map(d => d.x)), [data])
  const yDomain = useMemo(() => numericDomain(data.map(d => d.y)), [data])
  const mx = useMemo(() => median(data.map(d => d.x)), [data])
  const my = useMemo(() => median(data.map(d => d.y)), [data])

  return (
    <div ref={ref} style={{ width: '100%', height, minHeight: height }}>
      {!ready && <div className="loading" style={{ height }}>…</div>}
      {ready && (
        <ScatterChart width={width} height={height} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name="+/-"
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
          {mx != null && <ReferenceLine x={mx} {...MEDIAN_LINE} />}
          {my != null && <ReferenceLine y={my} {...MEDIAN_LINE} />}
          <Tooltip content={<PmPerTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            name="players"
            data={data}
            fill="#2dd4a7"
            opacity={0.65}
            isAnimationActive={false}
            style={{ cursor: 'pointer' }}
            onClick={(p: any) => { const id = p?.player_id ?? p?.payload?.player_id; if (id) onPick(id) }}
          />
        </ScatterChart>
      )}
    </div>
  )
}

function PerMinChart({ data, onPick }: { data: ScatterPoint[]; onPick: (id: number) => void }) {
  const { ref, width, height, ready } = useChartSize(320)
  const xDomain = useMemo(
    () => numericDomain(data.map(d => d.x), { min: 0, max: 42 }),
    [data],
  )
  const yDomain = useMemo(() => numericDomain(data.map(d => d.y)), [data])
  const mx = useMemo(() => median(data.map(d => d.x)), [data])
  const my = useMemo(() => median(data.map(d => d.y)), [data])

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
          {mx != null && <ReferenceLine x={mx} {...MEDIAN_LINE} />}
          {my != null && <ReferenceLine y={my} {...MEDIAN_LINE} />}
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            name="players"
            data={data}
            fill="#7c57ff"
            opacity={0.65}
            isAnimationActive={false}
            style={{ cursor: 'pointer' }}
            onClick={(p: any) => { const id = p?.player_id ?? p?.payload?.player_id; if (id) onPick(id) }}
          />
        </ScatterChart>
      )}
    </div>
  )
}

function UsgTsChart({ data, onPick }: { data: ScatterPoint[]; onPick: (id: number) => void }) {
  const { ref, width, height, ready } = useChartSize(320)
  const xDomain = useMemo(
    () => numericDomain(data.map(d => d.x), { min: 0.05, max: 0.45 }),
    [data],
  )
  const yDomain = useMemo(
    () => numericDomain(data.map(d => d.y), { min: 0.4, max: 0.75 }),
    [data],
  )
  const mx = useMemo(() => median(data.map(d => d.x)), [data])
  const my = useMemo(() => median(data.map(d => d.y)), [data])

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
          {mx != null && <ReferenceLine x={mx} {...MEDIAN_LINE} />}
          {my != null && <ReferenceLine y={my} {...MEDIAN_LINE} />}
          <Tooltip content={<UsgTsTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            name="players"
            data={data}
            fill="var(--accent)"
            opacity={0.65}
            isAnimationActive={false}
            style={{ cursor: 'pointer' }}
            onClick={(p: any) => { const id = p?.player_id ?? p?.payload?.player_id; if (id) onPick(id) }}
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
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)

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
        player_id: d.player_id,
        player_name: d.player_name,
        team: d.team,
      })
    }
    return out
  }, [raw])

  const pmPerData = useMemo((): ScatterPoint[] => {
    const out: ScatterPoint[] = []
    for (const d of raw) {
      const pm = n(d.avg_plus_minus)
      const per = n(d.per)
      if (pm == null || per == null) continue
      out.push({
        x: pm,
        y: per,
        player_id: d.player_id,
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
        player_id: d.player_id,
        player_name: d.player_name,
        team: d.team,
      })
    }
    return out
  }, [raw])

  if (loading) return <div className="loading">loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          USG% vs TS% (size = minutes)
        </h3>
        {usgTsData.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No data for season</div>
        ) : (
          <UsgTsChart data={usgTsData} onPick={setSelectedPlayer} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          PER vs Avg MIN (spotting underrated players)
        </h3>
        {perMinData.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No data for season</div>
        ) : (
          <PerMinChart data={perMinData} onPick={setSelectedPlayer} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Avg +/- vs PER (impact vs box production)
        </h3>
        {pmPerData.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No data for season</div>
        ) : (
          <PmPerChart data={pmPerData} onPick={setSelectedPlayer} />
        )}
      </div>

      {selectedPlayer != null && (
        <PlayerModal
          playerId={selectedPlayer}
          seasonId={seasonId}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
