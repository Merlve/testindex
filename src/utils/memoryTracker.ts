export function initMemoryTracker() {
  if (!import.meta.env.DEV) return;

  // Extend window object temporarily for development
  (window as any).memoryTracker = {
    log: [] as any[],
    check: () => {
      const perf = window.performance as any;
      if (!perf || !perf.memory) {
        console.warn('performance.memory API is not supported in this browser.');
        return;
      }
      const memory = perf.memory;
      const stats = {
        time: new Date().toISOString(),
        usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        limitMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
      };
      console.log(`[Memory Tracker] Used: ${stats.usedMB}MB / Total: ${stats.totalMB}MB / Limit: ${stats.limitMB}MB`);
      (window as any).memoryTracker.log.push(stats);
      return stats;
    },
    start: (intervalMs = 5000) => {
      if ((window as any).memoryTracker.intervalId) return;
      console.log(`[Memory Tracker] Started tracking every ${intervalMs}ms`);
      (window as any).memoryTracker.check();
      (window as any).memoryTracker.intervalId = window.setInterval(() => {
        (window as any).memoryTracker.check();
      }, intervalMs);
    },
    stop: () => {
      if ((window as any).memoryTracker.intervalId) {
        clearInterval((window as any).memoryTracker.intervalId);
        (window as any).memoryTracker.intervalId = null;
        console.log('[Memory Tracker] Stopped tracking.');
      }
    }
  };
  
  console.log('[Memory Tracker] Initialized in development mode. Access via window.memoryTracker');
  console.log('[Memory Tracker] Use window.memoryTracker.start(), window.memoryTracker.stop(), or window.memoryTracker.check()');
}
