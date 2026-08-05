export default function DetailsSkeleton(_props?: { onRefresh?: () => void; refreshingFolder?: boolean }) {
  return (
    <div className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative overflow-hidden">
      {/* Backdrop Image Skeleton */}
      <div className="absolute top-0 left-0 right-0 h-[65vh] md:h-[75vh] pointer-events-none z-0 bg-black/5 dark:bg-white/5 animate-pulse overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/80 dark:via-[#08080a]/80 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/30 dark:via-[#08080a]/30 to-transparent z-10" />
      </div>

      {/* Main Details Header Skeleton */}
      <div className="px-4 sm:px-8 md:px-12 pt-20 sm:pt-24 md:pt-28 relative z-20 flex flex-col md:flex-row gap-6 md:gap-10 mb-8">
        {/* Left Side: Poster & Mobile Info */}
        <div className="flex flex-row md:flex-col gap-5 md:gap-6 items-start">
          {/* Poster Skeleton */}
          <div className="w-32 sm:w-40 md:w-64 h-48 sm:h-60 md:h-96 rounded-xl md:rounded-2xl bg-black/10 dark:bg-white/10 shrink-0 border border-black/5 dark:border-white/5 animate-pulse" />
          
          {/* Mobile Title & Meta Skeleton */}
          <div className="flex-1 min-w-0 md:hidden flex flex-col gap-2.5 pt-2 w-full">
            <div className="h-7 bg-black/10 dark:bg-white/10 rounded-lg w-4/5 animate-pulse" />
            <div className="h-3.5 bg-black/10 dark:bg-white/10 rounded-md w-2/3 animate-pulse" />
            <div className="h-5 w-20 bg-black/10 dark:bg-white/10 rounded-md mt-1 animate-pulse" />
          </div>
        </div>

        {/* Right Side: Desktop Info, Genres, Overview, Actions, Cast */}
        <div className="flex-1 min-w-0 text-left">
          {/* Desktop Title Skeleton */}
          <div className="hidden md:flex flex-row items-center gap-4 mb-3">
            <div className="h-10 lg:h-12 bg-black/10 dark:bg-white/10 rounded-xl w-2/3 animate-pulse" />
          </div>

          {/* Path / Status Line */}
          <div className="hidden md:flex flex-col items-start gap-2 mb-4">
            <div className="h-3.5 bg-black/10 dark:bg-white/10 rounded-md w-1/3 animate-pulse" />
            <div className="h-5 w-20 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
          </div>

          {/* Genres Row */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="h-7 w-20 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
            <div className="h-7 w-24 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
            <div className="h-7 w-16 bg-black/10 dark:bg-white/10 rounded-full animate-pulse" />
          </div>

          {/* Overview Paragraph */}
          <div className="space-y-2.5 mb-6 max-w-3xl">
            <div className="h-4 bg-black/10 dark:bg-white/10 rounded-md w-full animate-pulse" />
            <div className="h-4 bg-black/10 dark:bg-white/10 rounded-md w-[92%] animate-pulse" />
            <div className="h-4 bg-black/10 dark:bg-white/10 rounded-md w-[78%] animate-pulse" />
          </div>

          {/* Action Row: Watchlist & Trailer */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="h-10 w-36 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
            <div className="h-10 w-36 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse" />
          </div>

          {/* Cast & Crew Section */}
          <div className="mb-6">
            <div className="h-6 w-28 bg-black/10 dark:bg-white/10 rounded-md mb-3 animate-pulse" />
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 scrollbar-none">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-20 sm:w-24 md:w-28 shrink-0 flex flex-col items-center animate-pulse">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-xl sm:rounded-2xl bg-black/10 dark:bg-white/10" />
                  <div className="w-16 h-2.5 bg-black/10 dark:bg-white/10 rounded mt-2" />
                  <div className="w-10 h-2 bg-black/10 dark:bg-white/10 rounded mt-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Files / Episodes Section Skeleton */}
      <div className="px-4 sm:px-8 md:px-12 relative z-20 w-full max-w-6xl">
        <div className="bg-[#fbf4eb] dark:bg-[#1a1a22]/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl mt-4">
          <div className="flex justify-between items-center mb-5 pb-3 border-b border-black/5 dark:border-white/5">
            <div className="h-5 w-32 bg-black/10 dark:bg-white/10 rounded-md animate-pulse" />
            <div className="h-8 w-28 bg-black/10 dark:bg-white/10 rounded-lg animate-pulse" />
          </div>

          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3.5 sm:p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-4 h-4 bg-black/10 dark:bg-white/10 rounded shrink-0" />
                  <div className="w-10 h-10 bg-black/10 dark:bg-white/10 rounded-xl shrink-0" />
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
    </div>
  );
}
