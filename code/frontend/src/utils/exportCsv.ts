// Экспорт массива объектов в CSV-файл на стороне клиента (без бэкенда).
export interface CsvColumn {
  key: string
  label?: string
}

export function exportCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: CsvColumn[],
): void {
  if (!rows.length) return
  const cols: CsvColumn[] = columns ?? Object.keys(rows[0]).map(k => ({ key: k }))

  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = cols.map(c => esc(c.label ?? c.key)).join(',')
  const body = rows
    .map(r => cols.map(c => esc((r as Record<string, unknown>)[c.key])).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + header + '\n' + body], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
