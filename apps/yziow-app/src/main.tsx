import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@oziow/ui'
import { YziowProvider } from './providers/YziowProvider'

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96aW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTUxNTEyMDAsImV4cCI6MjAyMjUxMTIwMH0.xxxx";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey}>
      <YziowProvider>
        <App />
      </YziowProvider>
    </AuthProvider>
  </StrictMode>,
)
