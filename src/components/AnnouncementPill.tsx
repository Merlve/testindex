import React, { useRef, useState, useEffect } from 'react';
import { Megaphone } from 'lucide-react';

interface AnnouncementPillProps {
  message?: string;
  className?: string;
}

export default function AnnouncementPill({ message, className = '' }: AnnouncementPillProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textMeasureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textMeasureRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textMeasureRef.current.offsetWidth;
        setIsOverflowing(textWidth > containerWidth);
      }
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    if (textMeasureRef.current) {
      resizeObserver.observe(textMeasureRef.current);
    }

    window.addEventListener('resize', checkOverflow);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [message]);

  if (!message || !message.trim()) {
    return null;
  }

  const trimmedMessage = message.trim();

  return (
    <div
      className={`relative flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border backdrop-blur-xl backdrop-saturate-[180%] bg-white/50 border-white/60 text-gray-900 shadow-[0_8px_32px_0_rgba(31,38,135,0.18)] dark:bg-black/60 dark:border-white/20 dark:text-white h-9 overflow-hidden ${className}`}
      title={trimmedMessage}
    >
      <div className="flex items-center gap-1.5 shrink-0 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full text-xs font-semibold">
        <Megaphone className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0 animate-pulse" />
        <span className="hidden xs:inline text-[11px] uppercase tracking-wider font-bold">Notice</span>
      </div>

      {/* Hidden element for accurate width measurement */}
      <span
        ref={textMeasureRef}
        className="absolute opacity-0 pointer-events-none whitespace-nowrap -z-50 text-xs sm:text-sm font-medium"
        aria-hidden="true"
      >
        {trimmedMessage}
      </span>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative text-xs sm:text-sm font-medium whitespace-nowrap"
        style={
          isOverflowing
            ? {
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)',
                maskImage:
                  'linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)',
              }
            : undefined
        }
      >
        {isOverflowing ? (
          <div className="inline-flex items-center gap-8 animate-marquee hover:[animation-play-state:paused] cursor-default">
            <span>{trimmedMessage}</span>
            <span aria-hidden="true" className="text-purple-500/60 dark:text-purple-400/60 font-bold">•</span>
            <span>{trimmedMessage}</span>
            <span aria-hidden="true" className="text-purple-500/60 dark:text-purple-400/60 font-bold">•</span>
          </div>
        ) : (
          <div className="truncate">{trimmedMessage}</div>
        )}
      </div>
    </div>
  );
}
