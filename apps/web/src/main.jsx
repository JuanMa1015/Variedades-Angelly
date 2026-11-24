import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext'
import { initAnalytics } from './utils/analytics'
import { registrarServiceWorker } from './utils/serviceWorker'

initAnalytics()
void registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
)

