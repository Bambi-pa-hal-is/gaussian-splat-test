import { StrictMode, lazy, Suspense, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The collision editor only exists in dev builds; production builds drop this branch
// and the editor code entirely.
let Root: ComponentType = App
if (import.meta.env.DEV && window.location.pathname.startsWith('/editor')) {
  Root = lazy(() => import('./editor/Editor.tsx'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense>
      <Root />
    </Suspense>
  </StrictMode>,
)
