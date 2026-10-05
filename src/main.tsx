import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { registerServiceWorker } from './lib/push'

// Registering here (not in the notification panel) means the worker is in place
// from the first load, so a subscription created later has something to attach
// to. It is a no-op when push is not configured.
void registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
