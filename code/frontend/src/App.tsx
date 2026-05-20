import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import PlayersList from './pages/Players/PlayersList'
import PlayerProfile from './pages/Players/PlayerProfile'
import Teams from './pages/Teams'
import TeamPage from './pages/Teams/TeamPage'
import Leaderboard from './pages/Leaderboard'
import Advanced from './pages/Stats/Advanced'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="players" element={<PlayersList />} />
          <Route path="players/:id" element={<PlayerProfile />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:id" element={<TeamPage />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="stats" element={<Navigate to="/leaderboard" replace />} />
          <Route path="stats/advanced" element={<Advanced />} />
          <Route path="compare" element={<Navigate to="/players" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
