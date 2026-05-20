import { NavLink } from 'react-router-dom'
import { useSeasonFilter } from '../../hooks/useSeasonFilter'
const NAV_TABS = [
  { path: '/dashboard',      label: 'dashboard' },
  { path: '/players',        label: 'players' },
  { path: '/teams',          label: 'teams' },
  { path: '/leaderboard',    label: 'leaderboard' },
  { path: '/stats/advanced', label: 'advanced' },
]

export default function TopBar() {
  const { seasonId, setSeasonId, seasons } = useSeasonFilter()

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 0,
      flexShrink: 0,
    }}>
      <div style={{
        fontWeight: 700,
        fontSize: 14,
        color: 'var(--accent)',
        letterSpacing: '1px',
        marginRight: 32,
        whiteSpace: 'nowrap',
      }}>
        nba stats
      </div>

      <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
        {NAV_TABS.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <select
        value={seasonId}
        onChange={e => setSeasonId(Number(e.target.value))}
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          padding: '5px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {seasons.map(s => (
          <option key={s.season_id} value={s.season_id}>{s.label}</option>
        ))}
      </select>
    </header>
  )
}
