/**
 * React wrapper — a branded button that redirects to the Aurea Pay hosted checkout.
 *
 *   import { AureaCheckoutButton } from '@aureahub/pay/react'
 *
 *   <AureaCheckoutButton sessionId={sessionId} />
 *
 * By design, the button's visual identity (logo + "Aurea Pay" wordmark) is
 * baked in and cannot be overridden. This guarantees buyers always see
 * Aurea Pay presented consistently across every merchant integration —
 * the same way PayPal, Apple Pay, and Klarna enforce their own brand marks.
 *
 * If you need a radically different UI (e.g., Aurea Pay as a radio option
 * inside a longer payment picker), call `openCheckout()` directly from
 * `@aureahub/pay/browser` and render our official logo alongside — see the
 * brand guidelines at https://pay.aureahub.com/docs/brand.
 */

import * as React from 'react'
import { openCheckout, type OpenCheckoutOptions } from './browser'
import { AureaLogoMark, AureaBrandLockup } from './logo'

// Re-export branded assets so merchants building custom UI can reach them
// from the same entry point as the button.
export { AureaLogoMark, AureaBrandLockup }
export type { AureaLogoMarkProps } from './logo'

/** Allowed prefix labels for the button. The "Aurea Pay" wordmark itself is fixed. */
export type AureaCheckoutButtonLabel =
  | 'Pay with'
  | 'Continue with'
  | 'Checkout with'

export interface AureaCheckoutButtonProps extends Omit<OpenCheckoutOptions, 'sessionId'> {
  sessionId: string
  /**
   * Optional prefix label. Defaults to "Pay with". The "Aurea Pay" suffix
   * and logo are fixed for brand consistency across all merchants.
   */
  label?:    AureaCheckoutButtonLabel
  /** Visual style — "dark" (default, black) or "light" (white, for dark backgrounds). */
  theme?:    'dark' | 'light'
  className?: string
  style?:     React.CSSProperties
  disabled?:  boolean
}

export function AureaCheckoutButton(props: AureaCheckoutButtonProps) {
  const {
    sessionId, baseUrl, label = 'Pay with', theme = 'dark',
    className, style, disabled,
  } = props

  // Keyboard-only focus ring (works even on host sites that reset outlines),
  // and a one-shot pending guard so a slow redirect can't be double-clicked.
  const [focusRing, setFocusRing] = React.useState(false)
  const [pending, setPending]     = React.useState(false)

  const onClick = React.useCallback(() => {
    if (disabled || pending) return
    setPending(true)
    openCheckout({ sessionId, baseUrl })
  }, [sessionId, baseUrl, disabled, pending])

  const isDark = theme === 'dark'
  const restShadow  = isDark ? '' : '0 1px 2px rgba(27,33,57,0.06)'
  const focusShadow = '0 0 0 3px rgba(97,66,255,0.45)'   // indigo, brand-500 @ 45%
  const baseStyle: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    background:     isDark ? '#1b2139' : '#ffffff',
    color:          isDark ? '#ffffff' : '#1b2139',
    border:         isDark ? '0' : '1px solid #e6e6ec',
    outline:        'none',
    boxShadow:      focusRing
      ? [restShadow, focusShadow].filter(Boolean).join(', ')
      : (restShadow || 'none'),
    borderRadius:   10,
    padding:        '12px 18px',
    fontSize:       14,
    fontWeight:     600,
    letterSpacing:  '-0.005em',
    cursor:         disabled ? 'not-allowed' : pending ? 'progress' : 'pointer',
    opacity:        disabled ? 0.55 : 1,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    ...style,
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onFocus={(e) => {
        try { if (e.currentTarget.matches(':focus-visible')) setFocusRing(true) }
        catch { setFocusRing(true) }
      }}
      onBlur={() => setFocusRing(false)}
      className={className}
      style={baseStyle}
      aria-label={`${label} Aurea Pay`}
    >
      <span>{label}</span>
      <AureaLogoMark size={18} variant={isDark ? 'white' : 'color'} />
      <span style={{ fontWeight: 700 }}>Aurea Pay</span>
    </button>
  )
}
