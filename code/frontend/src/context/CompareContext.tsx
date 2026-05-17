import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import CompareModal from '../components/CompareModal'

interface CompareEntry {
  player_id: number
  nba_id: number
  name: string
}

interface CompareContextType {
  compareList: CompareEntry[]
  addToCompare: (entry: CompareEntry) => void
  removeFromCompare: (player_id: number) => void
  clearCompare: () => void
  isInCompare: (player_id: number) => boolean
}

const CompareContext = createContext<CompareContextType>({
  compareList: [],
  addToCompare: () => {},
  removeFromCompare: () => {},
  clearCompare: () => {},
  isInCompare: () => false,
})

export const useCompare = () => useContext(CompareContext)

interface Props {
  children: ReactNode
  seasonId: number
}

export function CompareProvider({ children, seasonId }: Props) {
  const [compareList, setCompareList] = useState<CompareEntry[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)

  const addToCompare = (entry: CompareEntry) => {
    setCompareList(prev => {
      if (prev.find(p => p.player_id === entry.player_id)) return prev
      if (prev.length >= 2) return prev
      return [...prev, entry]
    })
  }

  const removeFromCompare = (player_id: number) => {
    setCompareList(prev => prev.filter(p => p.player_id !== player_id))
  }

  const clearCompare = () => setCompareList([])

  const isInCompare = (player_id: number) => compareList.some(p => p.player_id === player_id)

  return (
    <CompareContext.Provider value={{ compareList, addToCompare, removeFromCompare, clearCompare, isInCompare }}>
      {children}

      {compareList.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 500,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {compareList.map(entry => (
              <div key={entry.player_id} style={{ position: 'relative' }}>
                <img
                  src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${entry.nba_id}.png`}
                  alt={entry.name}
                  title={entry.name}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-secondary)', display: 'block' }}
                  onError={(e) => { e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }}
                />
                <button
                  onClick={() => removeFromCompare(entry.player_id)}
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 9,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={compareList.length < 2}
            onClick={() => setShowCompareModal(true)}
            style={{ fontSize: 12, padding: '5px 12px' }}
          >
            compare
          </button>
        </div>
      )}

      {showCompareModal && compareList.length === 2 && (
        <CompareModal
          p1Id={compareList[0].player_id}
          p2Id={compareList[1].player_id}
          seasonId={seasonId}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </CompareContext.Provider>
  )
}
