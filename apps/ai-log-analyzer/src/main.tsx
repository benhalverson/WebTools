import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('AI Log Analyzer root element is missing.')
createRoot(root).render(<StrictMode><App assetBase={import.meta.env.BASE_URL} /></StrictMode>)
