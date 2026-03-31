'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { MaterialIcon } from './MaterialIcon'
import { useEffect } from 'react'

interface SuccessPaymentAnimationProps {
  show: boolean
  onComplete?: () => void
  duration?: number
}

export function SuccessPaymentAnimation({ 
  show, 
  onComplete, 
  duration = 2000 
}: SuccessPaymentAnimationProps) {
  
  useEffect(() => {
    if (show && onComplete) {
      const timer = setTimeout(onComplete, duration)
      return () => clearTimeout(timer)
    }
  }, [show, onComplete, duration])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          <div className="relative flex flex-col items-center">
             {/* Partículas radiales (Efecto Dopamina) */}
             {[...Array(16)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-3 w-3 rounded-full bg-emerald-400"
                  initial={{ scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    scale: [0, 1.5, 0],
                    x: Math.cos(i * 22.5 * Math.PI / 180) * 140,
                    y: Math.sin(i * 22.5 * Math.PI / 180) * 140
                  }}
                  transition={{ 
                    duration: 0.9, 
                    ease: "easeOut", 
                    delay: 0.1 + (i % 3) * 0.05 
                  }}
                />
             ))}

             {/* Brillos aleatorios */}
             {[...Array(8)].map((_, i) => (
                <motion.div
                  key={`sparkle-${i}`}
                  className="absolute h-1.5 w-1.5 rounded-full bg-yellow-300"
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0.5, 2, 0.5],
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200
                  }}
                  transition={{ 
                    duration: 1.2, 
                    repeat: Infinity,
                    delay: Math.random() * 0.5 
                  }}
                />
             ))}

             {/* Círculo Principal con Check */}
             <motion.div
               className="relative flex h-36 w-36 items-center justify-center rounded-full bg-[#10B981] text-white shadow-[0_0_60px_rgba(16,185,129,0.5)]"
               initial={{ scale: 0, rotate: -45 }}
               animate={{ scale: 1, rotate: 0 }}
               transition={{ 
                 type: 'spring', 
                 damping: 10, 
                 stiffness: 150,
                 delay: 0.1
               }}
             >
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <MaterialIcon name="verified" className="text-[72px]" />
                </motion.div>
                
                {/* Anillos de expansión múltiples */}
                <motion.div 
                  className="absolute inset-0 rounded-full border-4 border-emerald-400"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
                <motion.div 
                  className="absolute inset-0 rounded-full border-2 border-emerald-300"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.8, opacity: 0 }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
                />
             </motion.div>

             <motion.div
               className="mt-10 text-center"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.4 }}
             >
               <h2 className="font-display text-[28px] font-bold tracking-tight text-[#1E293B]">
                 Pago Confirmado
               </h2>
               <p className="mt-2 font-medium text-slate-400">
                 Preparamos tu plan personalizado...
               </p>
             </motion.div>

             {/* Glow de fondo */}
             <div className="absolute -z-10 h-64 w-64 rounded-full bg-emerald-100/50 blur-3xl" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
