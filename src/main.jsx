import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
createRoot(document.getElementById('root')).render(<App />)

// Keep the browser's install prompt so the "Install app" button can use it later
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__bip = e })
// Offline-friendly app shell (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD)
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
