// src/renderer/main.tsx
import React, { StrictMode, Suspense } from 'react'
import { createRoot, Root } from 'react-dom/client'
import App from './App'

// Lazy-load the headers window bundle
const HeadersWindow = React.lazy(() => import('./HeadersWindow'))

console.log('[renderer] loaded entry: src/renderer/main.tsx')

declare global {
  interface Window {
    __APP_ROOT__?: Root
  }
}

function Router() {
  const getHash = () => (window.location.hash || '#/').toLowerCase()
  const [route, setRoute] = React.useState(getHash())

  React.useEffect(() => {
    console.log('[renderer:root] initial hash =', route)
    const onHash = () => {
      const h = getHash()
      console.log('[renderer:root] hashchange ->', h)
      setRoute(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (route.startsWith('#/headers')) {
    console.log('[renderer:root] rendering <HeadersWindow/>')
    return (
      <Suspense fallback={<div style={{padding:12}}>Loading headers window…</div>}>
        <HeadersWindow />
      </Suspense>
    )
  }

  console.log('[renderer:root] rendering <App/>')
  return <App />
}

// --- single root creation guard ---
const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML =
    '<pre style="color:#f88;padding:16px">No #root element in index.html</pre>'
  throw new Error('No #root element in index.html')
}

if (!window.__APP_ROOT__) {
  console.log('[renderer] creating root')
  window.__APP_ROOT__ = createRoot(rootEl)
} else {
  console.warn('[renderer] root already exists — reusing')
}

window.__APP_ROOT__.render(
  <StrictMode>
    <Router />
  </StrictMode>
)
