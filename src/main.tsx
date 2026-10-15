import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './overrides.css'
import './theme.css'
import './contrast-fixes.css'
import './entry-contrast.css'
import './lead.css'
import './detail.css'
import './calendar.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
