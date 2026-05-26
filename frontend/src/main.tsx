import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import { ModeProvider } from './context/ModeContext.tsx'
import { ConfigProvider } from './context/ConfigContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="dark min-h-screen bg-[#0a0e1a] text-slate-50">
        <ModeProvider>
          <AuthProvider>
            <ConfigProvider>
              <App />
              <Toaster
                position="top-center"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: '#111827',
                    color: '#f8fafc',
                    fontSize: '13px',
                    border: '1px solid rgba(255,255,255,0.1)',
                  },
                  success: { iconTheme: { primary: '#22c55e', secondary: '#111827' } },
                  error: { iconTheme: { primary: '#ef4444', secondary: '#111827' } },
                }}
              />
            </ConfigProvider>
          </AuthProvider>
        </ModeProvider>
      </div>
    </BrowserRouter>
  </StrictMode>,
)
