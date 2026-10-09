/**
 * Official Aurea Pay brand mark.
 *
 * This is the ONLY approved visual representation of Aurea Pay. It MUST be
 * used anywhere the merchant surfaces Aurea Pay to a buyer — alongside the
 * unmodified "Aurea Pay" wordmark. Do not alter the colors, reshape the
 * paths, or crop the SVG. See the brand usage guide at
 * https://pay.aureahub.com/docs/brand.
 */

import * as React from 'react'

export interface AureaLogoMarkProps {
  /** Pixel size of the mark. Default: 24. */
  size?: number
  /**
   * Color variant:
   *   - 'color' (default): full-color mark on light backgrounds
   *   - 'white':           all-white mark, for dark backgrounds only
   */
  variant?: 'color' | 'white'
  className?: string
  title?: string
}

/** Official Aurea Pay logo mark. Do not restyle — consume as-is. */
export function AureaLogoMark({
  size = 24,
  variant = 'color',
  className,
  title = 'Aurea Pay',
}: AureaLogoMarkProps) {
  const fillA   = variant === 'white' ? '#ffffff' : '#6142fa'
  const fillDot = variant === 'white' ? '#ffffff' : '#ffab00'
  return (
    <svg
      width={size}
      height={size}
      viewBox="55 20 165 170"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <path fill={fillA} d="M158.08,156.78c-8.03-21.38-16.05-42.77-24.08-64.15l-3.05-8.43c-2.03-5.42-5.03-9.49-8.99-12.2-3.96-2.71-8.68-4.52-14.17-5.42-5.49-.9-11.73-1.25-18.74-1.05-7.01.2-14.48.3-22.4.3V30.28c14.22,0,26.92-.05,38.09-.15,11.17-.1,20.98.86,29.41,2.86,8.43,2.01,15.64,5.72,21.64,11.14,5.99,5.42,10.92,13.76,14.78,25l38.4,112.04h-41.75l-9.14-24.4Z"/>
      <path fill={fillDot} d="M131.3,142.23c-1.69,3.83-3.96,7.17-6.83,10.01-2.87,2.83-6.24,5.08-10.13,6.75-3.88,1.67-8.01,2.5-12.4,2.5s-8.48-.84-12.28-2.5c-3.8-1.67-7.13-3.92-10-6.75-2.87-2.84-5.15-6.17-6.83-10.01-1.68-3.84-2.53-7.92-2.53-12.26s.85-8.42,2.53-12.26c1.69-3.84,3.97-7.17,6.83-10,2.87-2.84,6.2-5.09,10-6.75,3.8-1.67,7.89-2.5,12.28-2.5s8.52.83,12.4,2.5c3.88,1.66,7.26,3.92,10.13,6.75,2.87,2.83,5.15,6.17,6.83,10,1.69,3.83,2.53,7.92,2.53,12.26s-.84,8.42-2.53,12.26"/>
    </svg>
  )
}

/**
 * The approved "Aurea Pay" wordmark pair: logo mark + text.
 * Use whenever you reference the brand visually in your UI.
 *
 * The wordmark text is fixed to "Aurea Pay" and is not overridable.
 */
export function AureaBrandLockup({
  size = 22,
  variant = 'color',
  className,
}: {
  size?: number
  variant?: 'color' | 'white'
  className?: string
}) {
  const textColor = variant === 'white' ? '#ffffff' : '#1b2139'
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1 }}
    >
      <AureaLogoMark size={size} variant={variant} />
      <span
        style={{
          color: textColor,
          fontWeight: 700,
          fontSize: Math.round(size * 0.64),
          letterSpacing: '-0.01em',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        }}
      >
        Aurea Pay
      </span>
    </span>
  )
}
