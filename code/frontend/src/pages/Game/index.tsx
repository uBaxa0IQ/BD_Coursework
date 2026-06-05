import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { statsApi } from '../../api/stats'
import { teamsApi } from '../../api/teams'
import PlayerModal from '../../components/PlayerModal'
import type { Team } from '../../types'

interface BoxRow {
  player_id: number
  player_name: string
  nba_id?: number
  minutes_played?: string | null
  points: number
  rebounds_off: number
  rebounds_def: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  plus_minus?: number | null
  is_starter?: boolean
}

interface Boxscore {
  game: {
    game_id: number
    season_id?: number
    home_team_id: number
    away_team_id: number
    game_date: string
    home_score?: number | null
    away_score?: number | null
    status?: string
    overtime?: number
  }
  home_team_stats: BoxRow[]
  away_team_stats: BoxRow[]
}

const AWAY = '#60a5fa'
const HOME = '#4ade80'

interface Totals {
  pts: number; oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}

function totalsOf(rows: BoxRow[]): Totals {
  const t: Totals = { pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 }
  for (const r of rows) {
    t.pts += r.points; t.oreb += r.rebounds_off; t.dreb += r.rebounds_def
    t.reb += r.rebounds_off + r.rebounds_def
    t.ast += r.assists; t.stl += r.steals; t.blk += r.blocks; t.tov += r.turnovers; t.pf += r.fouls
    t.fgm += r.fgm; t.fga += r.fga; t.fg3m += r.fg3m; t.fg3a += r.fg3a; t.ftm += r.ftm; t.fta += r.fta
  }
  return t
}

const pctOf = (m: number, a: number) => (a > 0 ? (m / a) * 100 : 0)
const efgOf = (t: Totals) => (t.fga > 0 ? (t.fgm + 0.5 * t.fg3m) / t.fga * 100 : 0)
const tsOf = (t: Totals) => (t.fga + t.fta > 0 ? t.pts / (2 * (t.fga + 0.44 * t.fta)) * 100 : 0)

// Диаграмма-противостояние: одна строка показателя с двусторонней полосой
function CompareRow({ label, a, b, fmt }: { label: string; a: number; b: number; fmt?: (v: number) => string }) {
  const total = a + b || 1
  const aPct = (a / total) * 100
  const f = fmt ?? ((v: number) => String(v))
  const aLead = a > b, bLead = b > a
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
        <span style={{ fontWeight: aLead ? 700 : 400, color: aLead ? AWAY : 'var(--text-secondary)' }}>{f(a)}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontWeight: bLead ? 700 : 400, color: bLead ? HOME : 'var(--text-secondary)' }}>{f(b)}</span>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        <div style={{ width: `${aPct}%`, background: AWAY, opacity: aLead ? 1 : 0.5 }} />
        <div style={{ width: `${100 - aPct}%`, background: HOME, opacity: bLead ? 1 : 0.5 }} />
      </div>
    </div>
  )
}

const BOX_COLS = ['min', 'pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fg', '3p', 'ft', '+/-']

function BoxTable({ rows, name, color, onSelect }: { rows: BoxRow[]; name: string; color: string; onSelect: (id: number) => void }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{name}</span>
        <span style={{ fontSize: 10, color }}>● starter</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)' }}>player</th>
              {BOX_COLS.map(h => (
                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 500, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.player_id}
                onClick={() => onSelect(r.player_id)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '5px 8px', fontWeight: r.is_starter ? 600 : 400, color: r.is_starter ? color : 'var(--text-primary)' }}>{r.player_name}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.minutes_played ? Number(r.minutes_played).toFixed(0) : '—'}</td>
                <td style={{ padding: '5px 8px', fontWeight: 600 }}>{r.points}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.rebounds_off}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.rebounds_def}</td>
                <td style={{ padding: '5px 8px' }}>{r.rebounds_off + r.rebounds_def}</td>
                <td style={{ padding: '5px 8px' }}>{r.assists}</td>
                <td style={{ padding: '5px 8px' }}>{r.steals}</td>
                <td style={{ padding: '5px 8px' }}>{r.blocks}</td>
                <td style={{ padding: '5px 8px' }}>{r.turnovers}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.fouls}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.fgm}/{r.fga}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.fg3m}/{r.fg3a}</td>
                <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{r.ftm}/{r.fta}</td>
                <td style={{ padding: '5px 8px', color: (r.plus_minus ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {r.plus_minus != null ? (r.plus_minus >= 0 ? '+' : '') + r.plus_minus : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [box, setBox] = useState<Boxscore | null>(null)
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      statsApi.getBoxscore(Number(id)).catch(() => null),
      teamsApi.getList().catch(() => [] as Team[]),
    ]).then(([b, ts]) => {
      setBox(b as Boxscore | null)
      const map: Record<number, Team> = {}
      for (const t of ts) map[t.team_id] = t
      setTeams(map)
    }).finally(() => setLoading(false))
  }, [id])

  const away = box ? teams[box.game.away_team_id] : undefined
  const home = box ? teams[box.game.home_team_id] : undefined

  const at = useMemo(() => box ? totalsOf(box.away_team_stats) : null, [box])
  const ht = useMemo(() => box ? totalsOf(box.home_team_stats) : null, [box])

  const shootingData = useMemo(() => {
    if (!at || !ht) return []
    return [
      { metric: 'FG%', away: +pctOf(at.fgm, at.fga).toFixed(1), home: +pctOf(ht.fgm, ht.fga).toFixed(1) },
      { metric: '3P%', away: +pctOf(at.fg3m, at.fg3a).toFixed(1), home: +pctOf(ht.fg3m, ht.fg3a).toFixed(1) },
      { metric: 'FT%', away: +pctOf(at.ftm, at.fta).toFixed(1), home: +pctOf(ht.ftm, ht.fta).toFixed(1) },
      { metric: 'eFG%', away: +efgOf(at).toFixed(1), home: +efgOf(ht).toFixed(1) },
      { metric: 'TS%', away: +tsOf(at).toFixed(1), home: +tsOf(ht).toFixed(1) },
    ]
  }, [at, ht])

  if (loading) return <div className="loading">loading...</div>
  if (!box || !at || !ht) return <div className="error">game not found</div>

  const awayName = away?.abbreviation ?? 'AWY'
  const homeName = home?.abbreviation ?? 'HOM'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
        ← back
      </button>

      {/* Score header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ textAlign: 'center' }}>
          {away && <img src={`https://cdn.nba.com/logos/nba/${away.nba_team_id}/global/L/logo.svg`} alt="" style={{ width: 56, height: 56 }} onError={e => { e.currentTarget.style.display = 'none' }} />}
          <div style={{ fontSize: 12, color: AWAY, fontWeight: 600, marginTop: 4 }}>{awayName}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {box.game.away_score ?? '—'} : {box.game.home_score ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {box.game.game_date}{(box.game.overtime ?? 0) > 0 ? ` · OT${box.game.overtime}` : ''}
            {box.game.status && box.game.status !== 'Finished' ? ` · ${box.game.status}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          {home && <img src={`https://cdn.nba.com/logos/nba/${home.nba_team_id}/global/L/logo.svg`} alt="" style={{ width: 56, height: 56 }} onError={e => { e.currentTarget.style.display = 'none' }} />}
          <div style={{ fontSize: 12, color: HOME, fontWeight: 600, marginTop: 4 }}>{homeName}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Tale of the tape */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: AWAY, fontWeight: 600 }}>{awayName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>team totals</span>
            <span style={{ fontSize: 11, color: HOME, fontWeight: 600 }}>{homeName}</span>
          </div>
          <CompareRow label="points" a={at.pts} b={ht.pts} />
          <CompareRow label="rebounds" a={at.reb} b={ht.reb} />
          <CompareRow label="off reb" a={at.oreb} b={ht.oreb} />
          <CompareRow label="def reb" a={at.dreb} b={ht.dreb} />
          <CompareRow label="assists" a={at.ast} b={ht.ast} />
          <CompareRow label="steals" a={at.stl} b={ht.stl} />
          <CompareRow label="blocks" a={at.blk} b={ht.blk} />
          <CompareRow label="turnovers" a={at.tov} b={ht.tov} />
          <CompareRow label="fouls" a={at.pf} b={ht.pf} />
        </div>

        {/* Shooting */}
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>shooting efficiency</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={shootingData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="metric" tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                formatter={(v: number) => v + '%'}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
              <Bar name={awayName} dataKey="away" fill={AWAY} radius={[3, 3, 0, 0]} />
              <Bar name={homeName} dataKey="home" fill={HOME} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Box scores */}
      <BoxTable rows={box.away_team_stats} name={away?.name ?? 'Away'} color={AWAY} onSelect={setSelectedPlayer} />
      <BoxTable rows={box.home_team_stats} name={home?.name ?? 'Home'} color={HOME} onSelect={setSelectedPlayer} />

      {selectedPlayer != null && (
        <PlayerModal
          playerId={selectedPlayer}
          seasonId={box.game.season_id ?? 0}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
