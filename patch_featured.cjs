const fs = require('fs');
let code = fs.readFileSync('src/components/FeaturedSlide.tsx', 'utf8');

const oldHtml = `<AnimatePresence mode="popLayout">
          <motion.div 
            key={slideIndex}
            initial={{ opacity: 0.5, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0.5, scale: 1.02 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            {backdrop && (
              <img src={backdrop} className="absolute inset-0 w-full h-full object-cover opacity-60 z-0 pointer-events-none" alt="Backdrop" />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a]/90 via-[#fffcf9]/60 dark:via-[#08080a]/60 to-transparent z-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[#f0e6da] dark:bg-[#121216] flex items-center justify-center text-black/5 dark:text-white/5 text-7xl sm:text-9xl font-black italic select-none">
          {featured.name.toUpperCase()}
        </div>`;

const newHtml = `<div className="absolute inset-0 bg-[#f0e6da] dark:bg-[#121216] flex items-center justify-center text-black/5 dark:text-white/5 text-7xl sm:text-9xl font-black italic select-none pointer-events-none">
          {featured.name.toUpperCase()}
        </div>
        <AnimatePresence mode="popLayout">
          <motion.div 
            key={slideIndex}
            initial={{ opacity: 0.5, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0.5, scale: 1.02 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
          >
            {backdrop && (
              <img src={backdrop} className="absolute inset-0 w-full h-full object-cover opacity-60 z-0" alt="Backdrop" />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a]/90 via-[#fffcf9]/60 dark:via-[#08080a]/60 to-transparent z-10 pointer-events-none"></div>`;

code = code.replace(oldHtml, newHtml);
fs.writeFileSync('src/components/FeaturedSlide.tsx', code);
