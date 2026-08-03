import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';


type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  isUnderlyingDark?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export default function ThemeToggle({ isUnderlyingDark = false, align = 'left', className = '' }: ThemeToggleProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('themeMode');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      const oldSaved = localStorage.getItem('theme');
      if (oldSaved === 'light' || oldSaved === 'dark') return oldSaved;
    }
    return 'system';
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('themeMode');
      if (saved === 'light') return false;
      if (saved === 'dark') return true;
      const oldSaved = localStorage.getItem('theme');
      if (oldSaved === 'light') return false;
      if (oldSaved === 'dark') return true;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  // Handle theme application & OS system preference listener
  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);

    const applyTheme = (darkMode: boolean) => {
      setIsDark(darkMode);
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (darkMode) {
        document.documentElement.classList.add('dark');
        if (themeMeta) themeMeta.setAttribute('content', '#08080a');
      } else {
        document.documentElement.classList.remove('dark');
        if (themeMeta) themeMeta.setAttribute('content', '#fffcf9');
      }
      // Broadcast theme change for any listeners
      window.dispatchEvent(new CustomEvent('theme-change', { detail: { themeMode, isDark: darkMode } }));
    };

    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(themeMode === 'dark');
    }
  }, [themeMode]);

  // Listen for sync from other tabs or components
  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.themeMode && customEvent.detail.themeMode !== themeMode) {
        setThemeMode(customEvent.detail.themeMode);
      }
    };
    window.addEventListener('theme-change', handleSync);
    return () => window.removeEventListener('theme-change', handleSync);
  }, [themeMode]);

  const alignClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }[align];

  return (
    <div className={`inline-flex items-center ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition text-current cursor-pointer flex items-center justify-center focus:outline-none"
        title={`Theme options (${themeMode})`}
        aria-label="Toggle theme options"
        aria-expanded={isOpen}
      >
        {themeMode === 'system' ? (
          <Monitor size={19} className="transition-transform duration-200 hover:scale-105" />
        ) : isDark ? (
          <Moon size={19} className="transition-transform duration-200 hover:scale-105" />
        ) : (
          <Sun size={19} className="transition-transform duration-200 hover:scale-105" />
        )}
      </button>

      <>
        {isOpen && (
          <div
            className={`absolute ${alignClasses} top-full mt-3 w-36 p-1.5 rounded-2xl border backdrop-blur-3xl backdrop-saturate-[200%] shadow-2xl z-50 text-xs font-semibold space-y-1 transform-gpu will-change-transform ${
              isUnderlyingDark
                ? 'bg-neutral-900/60 border-white/25 text-white shadow-[0_12px_40px_0_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.25)] dark:bg-black/60 dark:border-white/20 dark:text-white'
                : 'bg-white/60 border-white/70 text-gray-900 shadow-[0_12px_40px_0_rgba(31,38,135,0.2),inset_0_1px_1px_0_rgba(255,255,255,0.8)] dark:bg-black/60 dark:border-white/20 dark:text-white'
            }`}
          >
            <button
              onClick={() => {
                setThemeMode('light');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-left cursor-pointer ${
                themeMode === 'light'
                  ? 'bg-purple-600/15 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shadow-sm'
                  : 'hover:bg-black/5 dark:hover:bg-white/10 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sun size={14} className="shrink-0" />
                <span>Light</span>
              </div>
              {themeMode === 'light' && <Check size={13} className="shrink-0 text-purple-600 dark:text-purple-400" />}
            </button>

            <button
              onClick={() => {
                setThemeMode('dark');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-left cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-purple-600/15 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shadow-sm'
                  : 'hover:bg-black/5 dark:hover:bg-white/10 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Moon size={14} className="shrink-0" />
                <span>Dark</span>
              </div>
              {themeMode === 'dark' && <Check size={13} className="shrink-0 text-purple-600 dark:text-purple-400" />}
            </button>

            <button
              onClick={() => {
                setThemeMode('system');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-left cursor-pointer ${
                themeMode === 'system'
                  ? 'bg-purple-600/15 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20 shadow-sm'
                  : 'hover:bg-black/5 dark:hover:bg-white/10 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Monitor size={14} className="shrink-0" />
                <span>System</span>
              </div>
              {themeMode === 'system' && <Check size={13} className="shrink-0 text-purple-600 dark:text-purple-400" />}
            </button>
          </div>
        )}
      </>
    </div>
  );
}

