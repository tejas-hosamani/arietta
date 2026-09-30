import { StrictMode, useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App'
import { Aria2ClientProvider } from '@/lib/aria2/client-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSettings } from '@/store/settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, structuralSharing: true },
  },
})

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const subscribeDark = (cb: () => void) => {
  darkQuery.addEventListener('change', cb)
  return () => darkQuery.removeEventListener('change', cb)
}

function useResolvedTheme() {
  const theme = useSettings((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery.matches)
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color))
  }, [dark])
  return dark ? 'dark' : 'light'
}

function Root() {
  const theme = useResolvedTheme()
  return (
    <QueryClientProvider client={queryClient}>
      <Aria2ClientProvider>
        <TooltipProvider delayDuration={300}>
          <App />
        </TooltipProvider>
      </Aria2ClientProvider>
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-surface !border-line !text-fg !shadow-panel !rounded-xl !font-sans',
            description: '!text-fg-muted',
          },
        }}
      />
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
