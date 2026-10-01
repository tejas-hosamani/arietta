/**
 * Copies text to the clipboard. navigator.clipboard only exists on HTTPS and localhost, and Arietta is
 * often served over plain HTTP on a LAN, so fall back to the older execCommand path there.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or document not focused: try the fallback.
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  // Inside a modal dialog, only focusable elements in the dialog can be selected.
  const host = document.activeElement?.closest('[role="dialog"]') ?? document.body
  host.appendChild(area)
  const previous = document.activeElement as HTMLElement | null
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  previous?.focus?.()
  return ok
}
