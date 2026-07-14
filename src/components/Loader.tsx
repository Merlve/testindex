import { motion } from 'motion/react';

export default function Loader() {
  return (
    <div className="flex flex-col items-center justify-center p-12 min-h-[50vh] w-full">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <motion.div className="absolute inset-0 border-4 border-purple-500/20 rounded-full" />
        <motion.div
          className="absolute inset-0 border-4 border-purple-500 rounded-full border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="w-4 h-4 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.8)]"
          animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.div 
        className="mt-8 flex items-center gap-1"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-xs font-bold tracking-[0.2em] text-purple-400 uppercase">Loading</span>
      </motion.div>
    </div>
  );
}
