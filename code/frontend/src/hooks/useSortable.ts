import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

// Клиентская сортировка таблицы по любой колонке. Числа сортируются как числа,
// строки — лексикографически; пустые значения всегда уходят вниз.
export function useSortable<T>(data: T[], initialKey?: string, initialDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<string | undefined>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    const arr = [...data]
    arr.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      const an = av == null || av === '' ? NaN : Number(av)
      const bn = bv == null || bv === '' ? NaN : Number(bv)
      const aNum = !Number.isNaN(an)
      const bNum = !Number.isNaN(bn)
      // пустые всегда вниз, независимо от направления
      const aEmpty = av == null || av === ''
      const bEmpty = bv == null || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      let cmp: number
      if (aNum && bNum) cmp = an - bn
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [data, sortKey, sortDir])

  const toggle = (key: string) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const indicator = (key: string) => (key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return { sorted, sortKey, sortDir, toggle, indicator }
}
