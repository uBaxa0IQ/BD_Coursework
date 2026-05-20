import { NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/dashboard',      label: 'Dashboard',       icon: '⬡' },
  { path: '/players',        label: 'Players',          icon: '👤' },
  { path: '/teams',          label: 'Teams',            icon: '🏀' },
  { path: '/stats',          label: 'Leaderboards',     icon: '📊' },
  { path: '/stats/advanced', label: 'Advanced Stats',   icon: '📈' },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <nav style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      flexShrink: 0,
    }}>
      <div style={{ padding: '0 16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '0.5px' }}>
          NBA STATS
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          2019-20 → 2023-24
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 2,
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(200,255,87,0.08)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        NBA Stats v1.0
      </div>
    </nav>
  )
}
