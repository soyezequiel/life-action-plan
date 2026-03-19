import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installMockApi } from './mock-api'
import App from './App'
import './assets/global.css'

installMockApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
