import { createRoot } from 'react-dom/client'
import App from './App.tsx'
const element = document.getElementById('root')
if (!element) throw new Error('Log Finder root element is missing.')
createRoot(element).render(<App base={import.meta.env.BASE_URL} />)
