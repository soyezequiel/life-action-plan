'use client'

import React from 'react'
import { motion } from 'framer-motion'
import PulsoLogoAnimated from '@/components/ui/PulsoLogoAnimated'

export default function LogoAnimationDebugPage() {
  return (
    <div className="min-h-screen bg-[#090B0D] text-[#F8FBFF] p-12 flex flex-col items-center gap-24 selection:bg-[#14E6BE]/30">
      
      {/* Hero Section */}
      <section className="flex flex-col items-center gap-8 max-w-2xl text-center">
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ duration: 1, ease: "easeOut" }}
           className="relative"
        >
          {/* Subtle background glow */}
          <div className="absolute inset-0 bg-[#14E6BE]/10 blur-[100px] rounded-full scale-150" />
          
          <PulsoLogoAnimated variant="wordmark" size="160px" speed={2} glow={true} />
        </motion.div>
        
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Identity: Pulso</h1>
          <p className="text-[#F8FBFF]/40 text-lg max-w-md">
            Design system for the high-fidelity action planner. 
            Built with Framer Motion and SVG Filters.
          </p>
        </div>
      </section>

      {/* Grid of Variants */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full max-w-5xl">
        <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-colors">
          <PulsoLogoAnimated variant="mark" size={80} speed={1.5} />
          <div className="text-center">
            <h3 className="font-medium text-sm text-[#F8FBFF]/60 uppercase tracking-widest">Default Mark</h3>
            <p className="text-xs text-[#F8FBFF]/30 mt-1">Balanced speed (1.5s)</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-colors">
          <PulsoLogoAnimated variant="mark" size={80} speed={0.8} />
          <div className="text-center">
            <h3 className="font-medium text-sm text-[#F8FBFF]/60 uppercase tracking-widest">Fast Pulse</h3>
            <p className="text-xs text-[#F8FBFF]/30 mt-1">Intense feedback (0.8s)</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-colors">
          <PulsoLogoAnimated variant="mark" size={80} speed={3} glow={false} />
          <div className="text-center">
            <h3 className="font-medium text-sm text-[#F8FBFF]/60 uppercase tracking-widest">Minimalist</h3>
            <p className="text-xs text-[#F8FBFF]/30 mt-1">No glow, Slow (3s)</p>
          </div>
        </div>
      </section>

      {/* Full Splash Demo */}
      <section className="w-full max-w-4xl h-[400px] rounded-[32px] overflow-hidden relative border border-white/[0.05] bg-[#0A0D10] flex items-center justify-center group">
         {/* Animated Grid Background */}
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ 
           backgroundImage: 'radial-gradient(circle, #F8FBFF 1px, transparent 1px)',
           backgroundSize: '24px 24px'
         }} />

         <div className="relative z-10 flex flex-col items-center gap-6">
            <PulsoLogoAnimated variant="mark" size={120} speed={1.2} />
            <motion.div 
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-[11px] font-bold uppercase tracking-[0.4em] text-[#F8FBFF]/40 text-center"
            >
              Initializing Neural Core
            </motion.div>
         </div>
      </section>

      <footer className="mt-12 text-[#F8FBFF]/20 text-[10px] uppercase tracking-widest">
        &copy; 2026 Pulso Action Plan &bull; All systems operational
      </footer>
    </div>
  )
}
