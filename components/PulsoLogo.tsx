import React, { useId } from 'react'
import type { JSX, SVGProps } from 'react'

type PulsoLogoVariant = 'mark' | 'wordmark'

interface PulsoLogoProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox'> {
  variant?: PulsoLogoVariant
  ariaLabel?: string
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '')
}

function PulseGlyph({ gradientId }: { gradientId: string }): JSX.Element {
  return (
    <>
      <path
        d="M16 104C24 104 29 97 31 88L39 50C41 40 51 40 53 50L60 82C62 91 71 91 73 82L82 34C84 24 94 24 96 34L103 86C105 95 114 95 116 86L123 44"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M98 40L116 24L110 50"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

export default function PulsoLogo({
  variant = 'mark',
  ariaLabel,
  ...props
}: PulsoLogoProps): JSX.Element {
  const uniqueId = sanitizeSvgId(useId())
  const gradientId = `pulso-gradient-${uniqueId}`

  if (variant === 'wordmark') {
    return (
      <svg
        viewBox="0 0 360 96"
        fill="none"
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        {...props}
      >
        <defs>
          <linearGradient id={gradientId} x1="16" y1="92" x2="124" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#69A7FF" />
            <stop offset="0.56" stopColor="#32D8E4" />
            <stop offset="1" stopColor="#14E6BE" />
          </linearGradient>
        </defs>

        <rect x="8" y="12" width="72" height="72" rx="20" fill="#090B0D" />
        <rect x="8.5" y="12.5" width="71" height="71" rx="19.5" stroke="#FFFFFF" strokeOpacity="0.08" />

        <g transform="translate(6 5) scale(0.56)">
          <PulseGlyph gradientId={gradientId} />
        </g>

        <text
          x="98"
          y="64"
          fill="#F8FBFF"
          fontFamily="Inter, Plus Jakarta Sans, Arial, sans-serif"
          fontSize="46"
          fontWeight="700"
          letterSpacing="-0.06em"
        >
          Pulso
        </text>
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="16" y1="104" x2="124" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#69A7FF" />
          <stop offset="0.56" stopColor="#32D8E4" />
          <stop offset="1" stopColor="#14E6BE" />
        </linearGradient>
      </defs>

      <rect x="8" y="8" width="112" height="112" rx="28" fill="#090B0D" />
      <rect x="8.5" y="8.5" width="111" height="111" rx="27.5" stroke="#FFFFFF" strokeOpacity="0.08" />

      <PulseGlyph gradientId={gradientId} />
    </svg>
  )
}
