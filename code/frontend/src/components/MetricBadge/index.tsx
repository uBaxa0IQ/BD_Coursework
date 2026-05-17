interface MetricBadgeProps {
  label: string
  value?: number | string | null
  precision?: number
  suffix?: string
  highlight?: boolean
}

export default function MetricBadge({ label, value, precision = 1, suffix = '', highlight = false }: MetricBadgeProps) {
  const display = value != null
    ? (typeof value === 'number' ? value.toFixed(precision) : !isNaN(Number(value)) && value !== '' && !String(value).startsWith('#') ? Number(value).toFixed(precision) : value) + suffix
    : '—'

  return (
    <div style={{
      background: highlight ? 'rgba(74,222,128,0.06)' : 'var(--bg-secondary)',
      border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-sm)',
      padding: '12px 16px',
      textAlign: 'center',
      minWidth: 80,
    }}>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: highlight ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {display}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}
