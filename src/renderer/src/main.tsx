import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppServicesProvider } from './app-services'
import './assets/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppServicesProvider>
      <App />
    </AppServicesProvider>
  </StrictMode>
)
