import { registerDashboardEditor } from './editor'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { mavlink20 } from '@webtools/mavlink/browser'
import { registerWidgetFields } from '@webtools/widget-runtime'
import { App } from './App'
import './vendor'
import './style.css'

await mavlink20.ready
registerWidgetFields(window.Formio, mavlink20.map)
registerDashboardEditor(window.Formio)
const response = await fetch(`${import.meta.env.BASE_URL}Widgets/CustomHTML.html`)
if (!response.ok) throw new Error('Unable to load default widget HTML')
const defaultHtml = await response.text()
createRoot(document.getElementById('root')!).render(<StrictMode><App defaultHtml={defaultHtml} /></StrictMode>)
