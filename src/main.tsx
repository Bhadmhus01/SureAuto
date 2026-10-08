import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Workflow from './workflow/Workflow.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.startsWith('/verification') || location.pathname.startsWith('/passport/') ? <Workflow /> : <App />}
  </StrictMode>,
)
