import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlotlyApi } from '@webtools/react-workflows'
import App from './App.tsx'
declare global { interface Window { Plotly?: PlotlyApi } }
const base = import.meta.env.BASE_URL
const plane = window.location.pathname.slice(base.length).startsWith('plane/')
createRoot(document.getElementById('root')!).render(<StrictMode><App plane={plane} base={base} plotly={window.Plotly} /></StrictMode>)
