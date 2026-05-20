import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ScatterChart, Scatter,
  ReferenceLine,
} from 'recharts'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
import { leagueApi } from '../../api/league'
import { statsApi } from '../../api/stats'
import { teamsApi } from '../../api/teams'
import PlayerModal from '../../components/PlayerModal'
import MetricBadge from '../../components/MetricBadge'
import type { LeagueDashboard, LeagueTrend, ScatterPlayerPoint } from '../../types'

const n = (v: unknown) => {
  if (v == null || v === '') return null
  const num = Number(v)
  return Number.isFinite(num) ? num : null
}

function shortPlayerLabel(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0]![0]}. ${parts[parts.length - 1]}`
}

export default function Dashboard() {
  const { seasonId } = useSeasonFilter()
  const [trends, setTrends] = useState<LeagueTrend[]>([])
  const [dashboard, setDashboard] = useState<LeagueDashboard | null>(null)
  const [scatterRaw, setScatterRaw] = useState<ScatterPlayerPoint[]>([])
  const [teamStats, setTeamStats] = useState<any[]>([])
  const [topUsg, setTopUsg] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(false)
    Promise.all([
      leagueApi.getTrends(),
      leagueApi.getDashboard(seasonId),
      teamsApi.getAvgStats(seasonId, 10),
      statsApi.getLeaders({ metric: 'usg_pct', season_id: seasonId, limit: 10 }),
      statsApi.getScatter(seasonId).catch(() => [] as ScatterPlayerPoint[]),
    ]).then(([t, dash, ts, usg, sc]) => {
      setTrends(t)
      setDashboard(dash)
      setTeamStats(ts)
      setTopUsg(usg)
      setScatterRaw(sc)
    }).catch(() => {
      setError(true)
    }).finally(() => setLoading(false))
  }, [seasonId])

  if (loading) return <div className="loading">loading...</div>
  if (error || !dashboard) {
    return <div className="error" style={{ margin: '20px auto', maxWidth: 400 }}>failed to load dashboard data</div>
  }

  const trendData = trends.map(t => ({
    season: t.season,
    season_id: t.season_id,
    avg_total_pts: n(t.avg_total_pts),
    avg_3p_pct: n(t.avg_3p_pct) != null ? Number((n(t.avg_3p_pct)! * 100).toFixed(2)) : null,
  }))

  const currentSeasonLabel = trends.find(t => t.season_id === seasonId)?.season || `season ${seasonId}`
  const currentTrend = trends.find(t => t.season_id === seasonId)
  const totalPtsGame = currentTrend ? n(currentTrend.avg_total_pts) : null

  const avg3Display = dashboard.avg_3p_pct != null && dashboard.avg_3p_pct !== ''
    ? n(dashboard.avg_3p_pct)! * 100
    : null

  const topPer = dashboard.top_players_per ?? []

  const scatterData = scatterRaw
    .map(d => {
      const pts = n(d.avg_pts)
      const efg = n(d.efg_pct)
      if (pts == null || efg == null) return null
      return {
        player_id: d.player_id,
        player_name: d.player_name,
        team: d.team,
        pts,
        efg: Number((efg * 100).toFixed(1)),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
    },
  }
  const axisStyle = { stroke: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }

  const seasonDot = (activeId: number) => (props: { cx?: number; cy?: number; payload?: { season_id?: number } }) => {
    const { cx, cy, payload } = props
    const active = payload?.season_id === activeId
    const r = cx == null || cy == null ? 0 : active ? 5 : 3
    return (
      <circle
        cx={cx ?? 0}
        cy={cy ?? 0}
        r={r}
        fill={active ? 'var(--compare-color)' : 'var(--accent)'}
        stroke={active ? 'var(--bg-primary)' : 'none'}
        strokeWidth={active ? 2 : 0}
      />
    )
  }

  const grid2 = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
  } as const

  const kpiRow = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={kpiRow}>
        <MetricBadge label="avg pts (player)" value={dashboard.avg_pts != null ? Number(dashboard.avg_pts) : null} precision={1} />
        <MetricBadge label="active players (10+ gp)" value={dashboard.active_players ?? null} precision={0} />
        <MetricBadge label="avg 3p%" value={avg3Display} precision={1} suffix="%" />
        <MetricBadge label="total pts / game" value={totalPtsGame} precision={1} highlight />
      </div>

      {/* Top-5 PER */}
      <div className="card">
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          top-5 per — {currentSeasonLabel}
        </div>
        {topPer.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            no players with enough games for this season.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {topPer.map((p, i) => (
              <div
                key={`${p.player_id}-${p.abbreviation ?? i}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlayer(p.player_id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedPlayer(p.player_id)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: i < topPer.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 20, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
                <img
                  src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nba_id}.png`}
                  alt={p.player_name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)' }}
                  onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.player_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.abbreviation}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                  {n(p.per) != null ? n(p.per)!.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scatter: PTS vs eFG% */}
      {scatterData.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            pts vs efg% — {currentSeasonLabel} (click point for profile)
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ left: 8, right: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" dataKey="pts" name="pts" {...axisStyle} domain={['auto', 'auto']} />
              <YAxis type="number" dataKey="efg" name="eFG%" {...axisStyle} width={40} unit="%" domain={['auto', 'auto']} />
              <Tooltip
                {...tooltipStyle}
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(v: unknown, name: string) => {
                  const num = n(v)
                  if (name === 'efg') return [num != null ? `${num.toFixed(1)}%` : '—', 'eFG%']
                  return [num != null ? num.toFixed(1) : '—', 'pts']
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { player_name?: string; team?: string } | undefined
                  return p ? `${p.player_name} (${p.team})` : ''
                }}
              />
              <Scatter
                data={scatterData}
                fill="var(--accent)"
                onClick={(d: { player_id?: number }) => {
                  if (d?.player_id != null) setSelectedPlayer(d.player_id)
                }}
                style={{ cursor: 'pointer' }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Line charts */}
      <div style={grid2}>
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            total pts / game — all seasons (highlight: selected)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="season" {...axisStyle} />
              <YAxis {...axisStyle} domain={['auto', 'auto']} width={36} />
              <ReferenceLine
                x={currentSeasonLabel}
                stroke="var(--compare-color)"
                strokeDasharray="4 4"
                strokeOpacity={0.85}
                ifOverflow="extendDomain"
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: unknown) => {
                  const num = n(v)
                  return [num != null ? num.toFixed(1) : '—', 'total pts']
                }}
              />
              <Line
                type="monotone"
                dataKey="avg_total_pts"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={seasonDot(seasonId)}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>avg 3p% — all seasons</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="season" {...axisStyle} />
              <YAxis {...axisStyle} domain={['auto', 'auto']} width={32} unit="%" />
              <ReferenceLine
                x={currentSeasonLabel}
                stroke="var(--compare-color)"
                strokeDasharray="4 4"
                strokeOpacity={0.85}
                ifOverflow="extendDomain"
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: unknown) => {
                  const num = n(v)
                  return [num != null ? num.toFixed(1) + '%' : '—', 'avg 3p%']
                }}
              />
              <Line
                type="monotone"
                dataKey="avg_3p_pct"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={seasonDot(seasonId)}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {teamStats.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>top-10 teams avg pts</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[...teamStats]
                .map(t => ({ ...t, avg_pts: n(t.avg_pts) ?? 0 }))
                .sort((a, b) => b.avg_pts - a.avg_pts)
                .slice(0, 10)}
              layout="vertical"
              margin={{ left: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" {...axisStyle} domain={['auto', 'auto']} />
              <YAxis type="category" dataKey="team_abbreviation" {...axisStyle} width={36} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: unknown) => {
                  const num = n(v)
                  return [num != null ? num.toFixed(1) : '—', 'avg pts']
                }}
              />
              <Bar dataKey="avg_pts" fill="var(--accent)" radius={[0, 2, 2, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {topUsg.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>top-10 usg%</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={topUsg.map(p => ({
                name: typeof p.player_name === 'string' ? shortPlayerLabel(p.player_name) : '—',
                fullName: typeof p.player_name === 'string' ? p.player_name : '—',
                usg: n(p.value) != null ? Number((n(p.value)! * 100).toFixed(1)) : 0,
              }))}
              layout="vertical"
              margin={{ left: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" {...axisStyle} domain={['auto', 'auto']} unit="%" />
              <YAxis type="category" dataKey="name" {...axisStyle} width={88} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: unknown) => {
                  const num = n(v)
                  return [num != null ? num.toFixed(1) + '%' : '—', 'usg%']
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { fullName?: string } | undefined
                  return row?.fullName ?? ''
                }}
              />
              <Bar dataKey="usg" fill="var(--accent)" radius={[0, 2, 2, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
