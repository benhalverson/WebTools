import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerWidgetFields, registerWidgetEditor } from '@webtools/widget-runtime'
import { App } from './App'
import './vendor'
import './style.css'

registerWidgetFields(window.Formio, {})
registerWidgetEditor(window.Formio)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
