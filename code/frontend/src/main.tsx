import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/theme.css'

// Применяем сохранённую тему до первой отрисовки (без мигания)
if (localStorage.getItem('theme') === 'light') {
  document.documentElement.dataset.theme = 'light'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
