import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function DetailsSkeleton({ onRefresh, refreshingFolder }: { onRefresh?: () => void, refreshingFolder?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="-mt-16 min-h-screen bg-[#fffcf9] dark:bg-[#08080a] pb-20 relative overflow-hidden">
      <button onClick={() => navigate(-1)} className="absolute top-20 left-6 z-50 p-2 sm:p-3 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110">
        <ChevronLeft size={24} />
      </button>
      {onRefresh && (
        <button onClick={onRefresh} disabled={refreshingFolder} className="absolute top-20 right-6 z-50 p-2 sm:p-3 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-sm border border-white/20 dark:border-white/10 text-black dark:text-white shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] hover:bg-white/20 dark:hover:bg-black/20 transition-all hover:scale-110" title="Refresh folder">
          <RefreshCw size={24} className={refreshingFolder ? 'animate-spin' : ''} />
        </button>
      )}

      {/* Backdrop Skeleton */}
      <div className="absolute top-0 left-0 right-0 h-[65vh] md:h-[75vh] pointer-events-none z-0 bg-gray-200/20 dark:bg-gray-800/20 animate-pulse overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/80 dark:via-[#08080a]/80 to-transparent z-10"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#fffcf9] dark:from-[#08080a] via-[#fffcf9]/50 dark:via-[#08080a]/50 to-transparent z-10"></div>
      </div>

      <div className="px-4 sm:px-12 pt-20 sm:pt-28 md:pt-32 relative z-20 flex flex-col md:flex-row gap-6 md:gap-10 mb-8">
        <div className="flex flex-row md:flex-col gap-5 md:gap-6 items-start w-full">
          {/* Poster Skeleton */}
          <div className="w-32 h-48 sm:w-40 sm:h-60 md:w-64 md:h-96 bg-gray-300/30 dark:bg-gray-700/30 rounded-xl md:rounded-2xl shrink-0 animate-pulse border border-black/5 dark:border-white/5"></div>
          
          {/* Mobile Title Skeleton */}
          <div className="flex-1 min-w-0 md:hidden flex flex-col gap-3 pt-2 w-full">
            <div className="h-8 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-1/2 animate-pulse"></div>
            <div className="w-10 h-10 bg-gray-300/30 dark:bg-gray-700/30 rounded-xl mt-2 animate-pulse"></div>
          </div>
        </div>

        {/* Desktop Title & Details Skeleton */}
        <div className="hidden md:flex flex-col gap-4 mt-8 flex-1 w-full max-w-4xl">
          <div className="flex justify-between items-start">
             <div className="w-full">
               <div className="h-10 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-2/3 mb-2 animate-pulse"></div>
               <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-1/3 mb-6 animate-pulse"></div>
               <div className="flex gap-2 mb-6">
                 <div className="h-6 w-16 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
                 <div className="h-6 w-20 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
                 <div className="h-6 w-12 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
               </div>
               
               <div className="space-y-3 mb-6">
                 <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-full animate-pulse"></div>
                 <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-[90%] animate-pulse"></div>
                 <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-[80%] animate-pulse"></div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Mobile Description Skeleton */}
      <div className="md:hidden px-4 sm:px-12 mt-6">
         <div className="flex gap-2 mb-4">
           <div className="h-5 w-16 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
           <div className="h-5 w-20 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
           <div className="h-5 w-12 bg-gray-300/30 dark:bg-gray-700/30 rounded-full animate-pulse"></div>
         </div>
         <div className="space-y-2">
           <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-full animate-pulse"></div>
           <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-[90%] animate-pulse"></div>
           <div className="h-4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md w-[80%] animate-pulse"></div>
         </div>
      </div>

      {/* Files Skeleton */}
      <div className="px-4 sm:px-12 relative z-20 w-full max-w-6xl">
        <div className="bg-[#fbf4eb] dark:bg-[#1a1a22]/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl mt-8 md:mt-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 border-b border-black/5 dark:border-white/5 pb-4">
            <div className="h-6 w-32 bg-gray-300/30 dark:bg-gray-700/30 rounded-md animate-pulse"></div>
            <div className="h-8 w-24 bg-gray-300/30 dark:bg-gray-700/30 rounded-md animate-pulse"></div>
          </div>
          
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl p-3 sm:p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-5 h-5 bg-gray-300/30 dark:bg-gray-700/30 rounded"></div>
                  <div className="w-10 h-10 bg-gray-300/30 dark:bg-gray-700/30 rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md"></div>
                    <div className="h-3 w-1/4 bg-gray-300/30 dark:bg-gray-700/30 rounded-md"></div>
                  </div>
                  <div className="h-8 w-8 bg-gray-300/30 dark:bg-gray-700/30 rounded-lg hidden sm:block"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
