'use client'

import React, { useId } from 'react'
import { motion, SVGMotionProps } from 'framer-motion'
import type { JSX } from 'react'

type PulsoLogoVariant = 'mark' | 'wordmark'

interface PulsoLogoAnimatedProps extends SVGMotionProps<SVGSVGElement> {
  variant?: PulsoLogoVariant
  size?: number | string
  speed?: number
  glow?: boolean
  ariaLabel?: string
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '')
}

export default function PulsoLogoAnimated({
  variant = 'mark',
  size = 128,
  speed = 1.5,
  glow = true,
  ariaLabel,
  className = '',
  ...props
}: PulsoLogoAnimatedProps): JSX.Element {
  const uniqueId = sanitizeSvgId(useId())
  const gradientId = `pulso-anim-gradient-${uniqueId}`
  const filterId = `pulso-glow-${uniqueId}`

  // Animation constants
  const pathVariants: import('framer-motion').Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
      pathLength: 1, 
      opacity: 1,
      transition: { 
        duration: speed * 1.5,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 0.5
      }
    }
  }

  const pulseVariants: import('framer-motion').Variants = {
    initial: { scale: 1, opacity: 0.8 },
    animate: { 
      scale: [1, 1.05, 1],
      opacity: [0.8, 1, 0.8],
      transition: { 
        duration: speed,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  }

  const glyphPaths = (
    <>
      <motion.path
        d="M16 104C24 104 29 97 31 88L39 50C41 40 51 40 53 50L60 82C62 91 71 91 73 82L82 34C84 24 94 24 96 34L103 86C105 95 114 95 116 86L123 44"
        stroke={`url(#${gradientId})`}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={pathVariants}
        initial="hidden"
        animate="visible"
        filter={glow ? `url(#${filterId})` : undefined}
      />
      <motion.path
        d="M98 40L116 24L110 50"
        stroke={`url(#${gradientId})`}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1, 
          opacity: 1,
          transition: { delay: speed * 0.8, duration: 0.5 } 
        }}
        filter={glow ? `url(#${filterId})` : undefined}
      />
    </>
  )

  const commonDefs = (
    <defs>
      <linearGradient id={gradientId} x1="16" y1="104" x2="124" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#69A7FF" />
        <stop offset="0.56" stopColor="#32D8E4" />
        <stop offset="1" stopColor="#14E6BE" />
      </linearGradient>
      {glow && (
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      )}
    </defs>
  )

  const containerStyle = {
    width: variant === 'wordmark' ? 'auto' : size,
    height: size,
  }

  if (variant === 'wordmark') {
    return (
      <motion.svg
        viewBox="0 0 360 96"
        fill="none"
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        className={`${className}`}
        style={containerStyle}
        {...props}
      >
        {commonDefs}
        <motion.rect 
          x="8" y="12" width="72" height="72" rx="20" fill="#090B0D" 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        <rect x="8.5" y="12.5" width="71" height="71" rx="19.5" stroke="#FFFFFF" strokeOpacity="0.08" />

        <motion.g 
          transform="translate(6 5) scale(0.56)"
          variants={pulseVariants}
          initial="initial"
          animate="animate"
        >
          {glyphPaths}
        </motion.g>

        <motion.text
          x="98"
          y="64"
          fill="#F8FBFF"
          fontFamily="Plus Jakarta Sans, Inter, system-ui"
          fontSize="46"
          fontWeight="700"
          letterSpacing="-0.04em"
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 98 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Pulso
        </motion.text>
      </motion.svg>
    )
  }

  return (
    <motion.svg
      viewBox="0 0 128 128"
      fill="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={`${className}`}
      style={containerStyle}
      {...props}
    >
      {commonDefs}
      <motion.rect 
        x="8" y="8" width="112" height="112" rx="28" fill="#090B0D" 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100 }}
      />
      <rect x="8.5" y="8.5" width="111" height="111" rx="27.5" stroke="#FFFFFF" strokeOpacity="0.08" />

      <motion.g 
        variants={pulseVariants}
        initial="initial"
        animate="animate"
      >
        {glyphPaths}
      </motion.g>
    </motion.svg>
  )
}
