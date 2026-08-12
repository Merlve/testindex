export default function DetailsSkeleton(_props?: { onRefresh?: () => void; refreshingFolder?: boolean }) {
  return (
    <div className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative overflow-hidden">
      {/* Backdrop Image Skeleton */}
      <div 
        className="absolute top-0 left-0 right-0 h-[52vh] sm:h-[60vh] md:h-[68vh] pointer-events-none z-0 animate-pulse bg-black/10 dark:bg-white/5" 
        style={{ WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 80%)', maskImage: 'linear-gradient(to top, transparent 0%, black 80%)' }}
      ></div>

      {/* Main Details Section Skeleton */}
      <div className="px-4 sm:px-8 md:px-12 pt-[32vh] sm:pt-[38vh] md:pt-[45vh] relative z-20 flex flex-col items-center text-center gap-6 mb-8 max-w-4xl mx-auto">
        {/* Title/Logo Skeleton */}
        <div className="flex flex-col items-center gap-4 w-full">
           <div className="h-10 sm:h-12 w-3/4 max-w-md bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
        </div>
        
        {/* Action Row */}
        <div className="flex flex-wrap items-center justify-center gap-3">
           <div className="h-10 w-36 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
           <div className="h-10 w-36 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
           <div className="h-10 w-10 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
        </div>

        {/* Genres */}
        <div className="flex flex-wrap justify-center gap-2">
           <div className="h-6 w-16 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
           <div className="h-6 w-20 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
           <div className="h-6 w-24 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
        </div>

        {/* Overview */}
        <div className="max-w-3xl flex flex-col items-center w-full gap-2">
           <div className="h-4 w-full bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
           <div className="h-4 w-11/12 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
           <div className="h-4 w-4/5 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
        </div>
      </div>

      {/* Cast & Crew Skeleton */}
      <div className="px-4 sm:px-8 md:px-12 max-w-7xl mx-auto w-full mb-8">
        <div className="flex gap-3 sm:gap-4 overflow-x-hidden pb-3 pt-1 justify-center">
           {[1, 2, 3, 4, 5, 6].map((i) => (
             <div key={i} className="w-20 sm:w-24 md:w-28 shrink-0 flex flex-col items-center animate-pulse">
               <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl sm:rounded-2xl bg-black/10 dark:bg-white/10" />
               <div className="w-16 h-3 bg-black/10 dark:bg-white/10 rounded mt-2" />
               <div className="w-10 h-2 bg-black/10 dark:bg-white/10 rounded mt-1" />
             </div>
           ))}
        </div>
      </div>

      {/* Files Section Skeleton */}
      <div className="px-4 sm:px-8 md:px-12 relative z-20 w-full max-w-7xl mx-auto">
        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between mb-4">
             <div className="h-6 w-24 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
             <div className="h-8 w-24 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3.5 sm:p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-4 h-4 bg-black/10 dark:bg-white/10 rounded shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 w-3/4 bg-black/10 dark:bg-white/10 rounded-md" />
                  <div className="h-3 w-1/3 bg-black/10 dark:bg-white/10 rounded-md" />
                </div>
              </div>
              <div className="h-8 w-24 bg-black/10 dark:bg-white/10 rounded-xl shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
