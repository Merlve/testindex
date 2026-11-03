import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Subtitles as SubtitlesIcon, 
  RotateCcw, 
  ChevronsLeft, 
  ChevronsRight, 
  Check, 
  Sparkles, 
  Cpu, 
  AlertCircle,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Vidstack imports and styles
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { MediaPlayer, MediaProvider, Track, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';

export interface SubtitleTrack {
  src: string;
  label: string;
  srclang: string;
  default?: boolean;
}

export interface WyzieSubtitleItem {
  id: string;
  url: string;
  display: string;
  language: string;
  release: string;
  origin?: string;
  isHearingImpaired?: boolean;
  downloadCount?: number;
  isBestMatch?: boolean;
  vttUrl: string;
}

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  type?: string;
  title?: string;
  tmdbId?: number | string;
  mediaType?: 'movie' | 'tv' | 'episode' | string;
  season?: number;
  episode?: number;
  filename?: string;
  subtitles?: SubtitleTrack[];
  onClose?: () => void;
}

// Utility: Detect Safari engine (Desktop Safari & iOS Safari/WebKit)
export function detectIsSafari(): boolean {
  if (typeof window === 'undefined' || !navigator) return false;
  const ua = navigator.userAgent;
  const isSafariUA = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS|Android/i.test(ua);
  const isAppleVendor = typeof navigator.vendor === 'string' && /Apple Computer/.test(navigator.vendor);
  return isSafariUA || (isAppleVendor && !/Chrome|Chromium|Edg|CriOS|FxiOS/i.test(ua));
}

// Helper: Format seconds to mm:ss or hh:mm:ss
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  src,
  poster,
  type,
  title,
  tmdbId,
  mediaType,
  season,
  episode,
  filename,
  subtitles: initialSubtitles,
  onClose,
}: VideoPlayerProps) {
  // Engine selection: Vidstack on Chrome/Edge/Firefox, libmedia (AVPlayer) on Safari
  const isSafariBrowser = detectIsSafari();
  const [engine, setEngine] = useState<'vidstack' | 'libmedia'>(() => {
    return isSafariBrowser ? 'libmedia' : 'vidstack';
  });

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [avPlayerLoading, setAvPlayerLoading] = useState(false);
  const [avPlayerError, setAvPlayerError] = useState<string | null>(null);

  // Wyzie Subs State
  const [wyzieSubs, setWyzieSubs] = useState<WyzieSubtitleItem[]>([]);
  const [selectedSub, setSelectedSub] = useState<WyzieSubtitleItem | null>(null);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [showSubModal, setShowSubModal] = useState(false);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);

  // Touch gesture feedback (e.g. ±10s seek)
  const [gestureFeedback, setGestureFeedback] = useState<{ message: React.ReactNode; id: number } | null>(null);

  // Refs
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const vidstackPlayerRef = useRef<MediaPlayerInstance>(null);
  const avPlayerContainerRef = useRef<HTMLDivElement>(null);
  const avPlayerInstanceRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<any>(null);

  // Save/Restore Watch Progress Key
  const progressKey = `watch_progress_${btoa(src).substring(0, 50)}`;

  // Dismiss gesture feedback after 800ms
  useEffect(() => {
    if (gestureFeedback) {
      const timer = setTimeout(() => setGestureFeedback(null), 850);
      return () => clearTimeout(timer);
    }
  }, [gestureFeedback]);

  // Fetch Wyzie Subtitles automatically for Movie / Episode
  useEffect(() => {
    let active = true;

    async function loadWyzieSubtitles() {
      if (!tmdbId) {
        // Fallback to initial subtitles if no TMDB ID
        if (initialSubtitles && initialSubtitles.length > 0) {
          const mapped: WyzieSubtitleItem = {
            id: 'default-initial',
            url: initialSubtitles[0].src,
            display: initialSubtitles[0].label || 'English',
            language: initialSubtitles[0].srclang || 'en',
            release: 'Default Subtitle',
            isBestMatch: true,
            vttUrl: initialSubtitles[0].src,
          };
          setWyzieSubs([mapped]);
          setSelectedSub(mapped);
          setSubsEnabled(true);
        }
        return;
      }

      setIsLoadingSubs(true);
      try {
        const queryParams = new URLSearchParams({
          tmdb_id: String(tmdbId),
          type: String(mediaType || 'movie'),
          language: 'en',
          filename: String(filename || ''),
        });
        if (season !== undefined && season !== null) queryParams.append('season', String(season));
        if (episode !== undefined && episode !== null) queryParams.append('episode', String(episode));

        const res = await fetch(`/api/subtitles/list?${queryParams.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch subtitles from Wyzie');
        const data = await res.json();

        if (active && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          setWyzieSubs(data.subtitles);
          // Pick best match automatically
          const best = data.bestMatch || data.subtitles[0];
          setSelectedSub(best);
          setSubsEnabled(true);
        } else if (active && initialSubtitles && initialSubtitles.length > 0) {
          const fallback: WyzieSubtitleItem = {
            id: 'fallback-sub',
            url: initialSubtitles[0].src,
            display: initialSubtitles[0].label || 'English',
            language: initialSubtitles[0].srclang || 'en',
            release: 'Standard Match',
            isBestMatch: true,
            vttUrl: initialSubtitles[0].src,
          };
          setWyzieSubs([fallback]);
          setSelectedSub(fallback);
          setSubsEnabled(true);
        }
      } catch (err) {
        console.warn('Wyzie subs fetch error:', err);
        if (active && initialSubtitles && initialSubtitles.length > 0) {
          const fallback: WyzieSubtitleItem = {
            id: 'fallback-sub',
            url: initialSubtitles[0].src,
            display: initialSubtitles[0].label || 'English',
            language: initialSubtitles[0].srclang || 'en',
            release: 'Standard Match',
            isBestMatch: true,
            vttUrl: initialSubtitles[0].src,
          };
          setWyzieSubs([fallback]);
          setSelectedSub(fallback);
        }
      } finally {
        if (active) setIsLoadingSubs(false);
      }
    }

    loadWyzieSubtitles();

    return () => {
      active = false;
    };
  }, [tmdbId, mediaType, season, episode, filename, initialSubtitles]);

  // Activity timer to auto-hide player controls on mobile & desktop
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  // Save Progress periodically
  const saveProgress = useCallback((time: number, totalDuration: number) => {
    if (totalDuration > 0 && totalDuration - time < 25) {
      localStorage.removeItem(progressKey);
    } else if (time > 3) {
      localStorage.setItem(progressKey, time.toString());
    }
  }, [progressKey]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      resetControlsTimeout();

      if (e.key === 'Escape') {
        if (showSubModal) {
          setShowSubModal(false);
        } else if (isFullscreen) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(10);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        seekRelative(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjustVolume(0.1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjustVolume(-0.1);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setSubsEnabled(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showSubModal, onClose, isPlaying, volume, isMuted, currentTime, duration]);

  // -------------------------------------------------------------
  // libmedia (AVPlayer) Implementation for Safari & MKV decoding
  // -------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'libmedia') return;

    let destroyed = false;
    let player: any = null;

    async function initAVPlayer() {
      if (!avPlayerContainerRef.current) return;
      setAvPlayerLoading(true);
      setAvPlayerError(null);

      try {
        // Dynamically import AVPlayer in browser
        const avModule = await import('@libmedia/avplayer');
        const AVPlayerClass = avModule.default;

        if (destroyed || !avPlayerContainerRef.current) return;

        // Clean container
        avPlayerContainerRef.current.innerHTML = '';

        player = new AVPlayerClass({
          container: avPlayerContainerRef.current as HTMLDivElement,
          enableWebCodecs: true,
          enableHardware: true,
          enableWorker: true,
          enableAudioWorklet: true,
        });

        avPlayerInstanceRef.current = player;

        // Restore saved progress if available
        const savedTime = localStorage.getItem(progressKey);
        const startTimeMs = savedTime ? parseFloat(savedTime) * 1000 : 0;

        // Event listeners
        player.on('playing', () => {
          if (!destroyed) {
            setIsPlaying(true);
            setAvPlayerLoading(false);
          }
        });

        player.on('paused', () => {
          if (!destroyed) setIsPlaying(false);
        });

        player.on('stopped', () => {
          if (!destroyed) setIsPlaying(false);
        });

        player.on('time', (pts: any) => {
          if (destroyed) return;
          const sec = Number(pts) / 1000;
          setCurrentTime(sec);
          // Get duration from player if available
          try {
            const durMs = Number(player.getDuration());
            if (durMs > 0) setDuration(durMs / 1000);
          } catch {
            // ignore
          }
          saveProgress(sec, duration);
        });

        player.on('error', (err: any) => {
          console.error('AVPlayer error:', err);
          if (!destroyed) {
            setAvPlayerLoading(false);
            setAvPlayerError('Failed to decode MKV stream with AVPlayer. Switch to Vidstack or open externally.');
          }
        });

        const isMkv = src.toLowerCase().endsWith('.mkv') || src.includes('.mkv?');
        await player.load(src, {
          ext: isMkv ? 'mkv' : undefined,
        });

        if (startTimeMs > 3000) {
          try {
            await player.seek(BigInt(Math.floor(startTimeMs)));
          } catch {
            // ignore
          }
        }

        // Apply external subtitle if selected
        if (selectedSub && subsEnabled && selectedSub.vttUrl) {
          try {
            await player.loadExternalSubtitle({
              source: selectedSub.vttUrl,
              lang: selectedSub.language,
              title: selectedSub.display,
            });
          } catch (e) {
            console.warn('AVPlayer subtitle load warning:', e);
          }
        }

        await player.play();
        if (!destroyed) {
          setIsPlaying(true);
          setAvPlayerLoading(false);
        }
      } catch (err: any) {
        console.error('AVPlayer initialization error:', err);
        if (!destroyed) {
          setAvPlayerLoading(false);
          setAvPlayerError(err.message || 'WASM/WebCodecs demuxer could not be initialized in this browser.');
        }
      }
    }

    initAVPlayer();

    return () => {
      destroyed = true;
      if (player) {
        try {
          player.destroy();
        } catch {
          // ignore
        }
        avPlayerInstanceRef.current = null;
      }
    };
  }, [engine, src]);

  // Load external subtitles in AVPlayer if selectedSub or subsEnabled changes
  useEffect(() => {
    if (engine === 'libmedia' && avPlayerInstanceRef.current && selectedSub && subsEnabled) {
      try {
        avPlayerInstanceRef.current.loadExternalSubtitle({
          source: selectedSub.vttUrl,
          lang: selectedSub.language,
          title: selectedSub.display,
        }).catch((e: any) => console.warn('AVPlayer subtitle update error:', e));
      } catch {
        // ignore
      }
    }
  }, [engine, selectedSub, subsEnabled]);

  // -------------------------------------------------------------
  // Controls Handlers
  // -------------------------------------------------------------
  const togglePlay = () => {
    resetControlsTimeout();
    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (!p) return;
      if (p.paused) {
        p.play();
        setIsPlaying(true);
      } else {
        p.pause();
        setIsPlaying(false);
      }
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (!p) return;
      if (isPlaying) {
        p.pause();
        setIsPlaying(false);
      } else {
        p.play();
        setIsPlaying(true);
      }
    }
  };

  const seekRelative = (deltaSeconds: number) => {
    resetControlsTimeout();
    const newFeedbackMsg = deltaSeconds < 0 ? (
      <div className="flex flex-col items-center">
        <ChevronsLeft className="w-10 h-10 text-white mb-1" />
        <span className="text-xs sm:text-sm font-bold tracking-wide">Seek {deltaSeconds}s</span>
      </div>
    ) : (
      <div className="flex flex-col items-center">
        <ChevronsRight className="w-10 h-10 text-white mb-1" />
        <span className="text-xs sm:text-sm font-bold tracking-wide">Seek +{deltaSeconds}s</span>
      </div>
    );
    setGestureFeedback({ message: newFeedbackMsg, id: Date.now() });

    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (!p) return;
      const targetTime = Math.max(0, Math.min(p.duration || 0, p.currentTime + deltaSeconds));
      p.currentTime = targetTime;
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (!p) return;
      const targetTime = Math.max(0, Math.min(duration || 0, currentTime + deltaSeconds));
      p.seek(BigInt(Math.floor(targetTime * 1000)));
      setCurrentTime(targetTime);
    }
  };

  const seekAbsolute = (targetSeconds: number) => {
    resetControlsTimeout();
    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (p) p.currentTime = targetSeconds;
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (p) {
        p.seek(BigInt(Math.floor(targetSeconds * 1000)));
        setCurrentTime(targetSeconds);
      }
    }
  };

  const adjustVolume = (delta: number) => {
    resetControlsTimeout();
    const newVol = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVol);
    setIsMuted(newVol === 0);

    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (p) {
        p.volume = newVol;
        p.muted = newVol === 0;
      }
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (p && typeof p.setVolume === 'function') {
        p.setVolume(newVol);
      }
    }
  };

  const toggleMute = () => {
    resetControlsTimeout();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (p) p.muted = nextMuted;
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (p && typeof p.setVolume === 'function') {
        p.setVolume(nextMuted ? 0 : volume);
      }
    }
  };

  const changePlaybackRate = (rate: number) => {
    resetControlsTimeout();
    setPlaybackRate(rate);
    if (engine === 'vidstack') {
      const p = vidstackPlayerRef.current;
      if (p) p.playbackRate = rate;
    } else if (engine === 'libmedia') {
      const p = avPlayerInstanceRef.current;
      if (p && typeof p.setPlaybackRate === 'function') {
        p.setPlaybackRate(rate);
      }
    }
  };

  const toggleFullscreen = () => {
    resetControlsTimeout();
    const elem = playerContainerRef.current;
    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Touch gesture handling on video surface (Double-tap seek ±10s, single tap toggle controls)
  const handleSurfaceTap = (e: React.MouseEvent | React.TouchEvent) => {
    resetControlsTimeout();
    const now = Date.now();
    const diff = now - lastTapTimeRef.current;
    const rect = playerContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
    }

    const x = clientX - rect.left;
    const width = rect.width;

    if (diff > 50 && diff < 380) {
      // Double tap confirmed
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }

      if (x < width * 0.35) {
        seekRelative(-10);
      } else if (x > width * 0.65) {
        seekRelative(10);
      } else {
        togglePlay();
      }
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        setShowControls(prev => !prev);
      }, 350);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-md flex items-center justify-center p-0 sm:p-2 md:p-4 select-none"
      onClick={onClose}
    >
      <motion.div 
        ref={playerContainerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetControlsTimeout}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative w-full h-full sm:max-w-6xl sm:aspect-video sm:h-auto bg-black rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col justify-center items-center group"
      >
        {/* ========================================================= */}
        {/* Top Header Overlay: Title, Wyzie Status, Engine Badge, Close */}
        {/* ========================================================= */}
        <AnimatePresence>
          {showControls && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 z-40 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto"
            >
              {/* Media Title & Best Subtitle Badge */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
                <div className="min-w-0">
                  <h3 className="text-white text-xs sm:text-sm md:text-base font-bold truncate drop-shadow-md">
                    {title || 'Media Player'}
                  </h3>
                  {selectedSub && subsEnabled && (
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-purple-300">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="truncate">Wyzie Subs: {selectedSub.display} {selectedSub.isBestMatch && '• Best Match'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Engine Badge & Player Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Engine Selector Pill */}
                <button
                  onClick={() => setEngine(prev => prev === 'vidstack' ? 'libmedia' : 'vidstack')}
                  title={`Current Engine: ${engine === 'vidstack' ? 'Vidstack (Blink/Gecko)' : 'libmedia AVPlayer (Safari WASM Demuxer)'}. Click to switch.`}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 text-white/90 transition backdrop-blur-md cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Engine:</span>
                  <span className="text-purple-300 capitalize">{engine === 'libmedia' ? 'AVPlayer (WASM)' : 'Vidstack'}</span>
                </button>

                {/* Subtitle Menu Button */}
                <button
                  onClick={() => setShowSubModal(true)}
                  title="Wyzie Subtitles"
                  className={`p-1.5 sm:p-2 rounded-full border transition backdrop-blur-md cursor-pointer ${
                    subsEnabled && selectedSub 
                      ? 'bg-purple-600/40 border-purple-500 text-purple-200' 
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  <SubtitlesIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Close Button */}
                {onClose && (
                  <button
                    onClick={onClose}
                    title="Close player (Esc)"
                    className="p-1.5 sm:p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md border border-white/20 transition cursor-pointer shadow-lg"
                  >
                    <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* ENGINE 1: VIDSTACK PLAYER (Chrome, Edge, Firefox)        */}
        {/* ========================================================= */}
        {engine === 'vidstack' && (
          <div className="w-full h-full relative flex items-center justify-center">
            <MediaPlayer
              ref={vidstackPlayerRef}
              title={title || 'Media Player'}
              src={src}
              poster={poster}
              playsInline
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(detail) => {
                setCurrentTime(detail.currentTime);
                saveProgress(detail.currentTime, duration);
              }}
              onDurationChange={(dur) => setDuration(dur)}
              className="w-full h-full vds-player"
            >
              <MediaProvider>
                {/* Dynamically bind Wyzie Subtitles track */}
                {selectedSub && subsEnabled && (
                  <Track
                    src={selectedSub.vttUrl}
                    kind="subtitles"
                    label={`${selectedSub.display} ${selectedSub.isBestMatch ? '(Best Match)' : ''}`}
                    lang={selectedSub.language || 'en'}
                    default={true}
                  />
                )}
              </MediaProvider>

              {/* Default Vidstack video layout with full mobile & desktop controls */}
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>

            {/* Transparent touch catcher for double tap seek gestures */}
            <div 
              className="absolute inset-0 z-20 pointer-events-auto"
              style={{ pointerEvents: showControls ? 'none' : 'auto' }}
              onClick={handleSurfaceTap}
            />
          </div>
        )}

        {/* ========================================================= */}
        {/* ENGINE 2: libmedia (AVPlayer) (Safari WASM Demuxer MKV)  */}
        {/* ========================================================= */}
        {engine === 'libmedia' && (
          <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            {/* AVPlayer Canvas/Video DOM Mounting Node */}
            <div 
              ref={avPlayerContainerRef}
              onClick={handleSurfaceTap}
              className="w-full h-full flex items-center justify-center relative cursor-pointer"
            />

            {/* AVPlayer Loading State */}
            {avPlayerLoading && (
              <div className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-white text-xs sm:text-sm font-semibold tracking-wide">
                  Demuxing MKV with WASM + WebCodecs...
                </div>
              </div>
            )}

            {/* AVPlayer Error Fallback Notice */}
            {avPlayerError && (
              <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center p-6 text-center gap-4">
                <AlertCircle className="w-12 h-12 text-yellow-400" />
                <div className="max-w-md">
                  <h4 className="text-white font-bold text-base mb-1">MKV Decoding Notice</h4>
                  <p className="text-gray-300 text-xs sm:text-sm mb-4 leading-relaxed">{avPlayerError}</p>
                  <button
                    onClick={() => setEngine('vidstack')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Switch to Vidstack Engine
                  </button>
                </div>
              </div>
            )}

            {/* AVPlayer Custom Sleek Control Bar (Mobile & Desktop) */}
            <AnimatePresence>
              {showControls && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-0 left-0 right-0 z-40 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col gap-2 pointer-events-auto"
                >
                  {/* Progress Bar / Scrubber */}
                  <div className="w-full flex items-center gap-3">
                    <span className="text-white/80 text-[11px] sm:text-xs font-mono min-w-[42px]">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => seekAbsolute(parseFloat(e.target.value))}
                      className="w-full h-1.5 sm:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500 transition-all hover:h-2.5"
                    />
                    <span className="text-white/80 text-[11px] sm:text-xs font-mono min-w-[42px] text-right">
                      {formatTime(duration)}
                    </span>
                  </div>

                  {/* Buttons Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {/* Play/Pause */}
                      <button
                        onClick={togglePlay}
                        className="p-2 text-white hover:text-purple-400 active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                      </button>

                      {/* Seek -10s */}
                      <button
                        onClick={() => seekRelative(-10)}
                        title="Seek -10s"
                        className="p-2 text-white/90 hover:text-white active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      {/* Volume / Mute */}
                      <div className="flex items-center gap-1 group/vol">
                        <button
                          onClick={toggleMute}
                          className="p-2 text-white/90 hover:text-white active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                        >
                          {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setVolume(val);
                            setIsMuted(val === 0);
                            if (avPlayerInstanceRef.current && typeof avPlayerInstanceRef.current.setVolume === 'function') {
                              avPlayerInstanceRef.current.setVolume(val);
                            }
                          }}
                          className="w-16 sm:w-20 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500 hidden sm:block"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                      {/* Playback speed selector */}
                      <select
                        value={playbackRate}
                        onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
                        className="bg-white/10 text-white text-[11px] sm:text-xs rounded-lg px-2 py-1 border border-white/15 outline-none cursor-pointer hover:bg-white/20 transition"
                      >
                        <option value="0.5" className="bg-[#121218] text-white">0.5x</option>
                        <option value="0.75" className="bg-[#121218] text-white">0.75x</option>
                        <option value="1" className="bg-[#121218] text-white">1x</option>
                        <option value="1.25" className="bg-[#121218] text-white">1.25x</option>
                        <option value="1.5" className="bg-[#121218] text-white">1.5x</option>
                        <option value="2" className="bg-[#121218] text-white">2x</option>
                      </select>

                      {/* Subtitles CC Button */}
                      <button
                        onClick={() => setShowSubModal(true)}
                        title="Wyzie Subtitles"
                        className={`p-2 rounded-lg transition cursor-pointer ${
                          subsEnabled && selectedSub 
                            ? 'text-purple-400 bg-purple-500/20' 
                            : 'text-white/80 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <SubtitlesIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      {/* Fullscreen */}
                      <button
                        onClick={toggleFullscreen}
                        title="Toggle Fullscreen (F)"
                        className="p-2 text-white/90 hover:text-white active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                      >
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ========================================================= */}
        {/* Gesture Visual Feedback Modal                             */}
        {/* ========================================================= */}
        <AnimatePresence>
          {gestureFeedback && (
            <motion.div
              key={gestureFeedback.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 pointer-events-none z-[60] flex items-center justify-center"
            >
              <div className="bg-black/70 text-white rounded-3xl p-5 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/10">
                {gestureFeedback.message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* Wyzie Subtitle Selector Modal (Mobile Bottom-Sheet & Desktop) */}
        {/* ========================================================= */}
        <AnimatePresence>
          {showSubModal && (
            <div 
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={() => setShowSubModal(false)}
            >
              <motion.div 
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.95 }}
                className="bg-[#16161f] border border-white/15 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[80vh] overflow-hidden text-white"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <SubtitlesIcon className="w-5 h-5 text-purple-400" />
                    <h4 className="font-bold text-sm sm:text-base">Wyzie Subtitles</h4>
                  </div>
                  <button
                    onClick={() => setShowSubModal(false)}
                    className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Subtitles List */}
                <div className="flex-1 overflow-y-auto py-3 space-y-2">
                  {/* Off Option */}
                  <button
                    onClick={() => {
                      setSubsEnabled(false);
                      setShowSubModal(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs sm:text-sm transition cursor-pointer ${
                      !subsEnabled 
                        ? 'bg-purple-600/30 border border-purple-500/50 text-white font-semibold' 
                        : 'bg-white/5 hover:bg-white/10 text-gray-300'
                    }`}
                  >
                    <span>Off</span>
                    {!subsEnabled && <Check className="w-4 h-4 text-purple-400" />}
                  </button>

                  {/* Loading indicator */}
                  {isLoadingSubs && (
                    <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      Searching Wyzie Subs...
                    </div>
                  )}

                  {/* List of Wyzie Subs */}
                  {!isLoadingSubs && wyzieSubs.map((sub) => {
                    const isSelected = subsEnabled && selectedSub?.id === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setSelectedSub(sub);
                          setSubsEnabled(true);
                          setShowSubModal(false);
                        }}
                        className={`w-full flex items-start justify-between p-3 rounded-xl text-left transition cursor-pointer ${
                          isSelected 
                            ? 'bg-purple-600/30 border border-purple-500/50 text-white' 
                            : 'bg-white/5 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-xs sm:text-sm text-white">
                              {sub.display}
                            </span>
                            {sub.isBestMatch && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/30 text-purple-300 border border-purple-500/40">
                                <Sparkles className="w-2.5 h-2.5" /> Best Match
                              </span>
                            )}
                            {sub.isHearingImpaired && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-gray-300">
                                CC
                              </span>
                            )}
                          </div>
                          {sub.release && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[280px]">
                              {sub.release}
                            </p>
                          )}
                          {typeof sub.downloadCount === 'number' && sub.downloadCount > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {sub.downloadCount.toLocaleString()} downloads
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0 mt-1" />}
                      </button>
                    );
                  })}

                  {!isLoadingSubs && wyzieSubs.length === 0 && (
                    <div className="py-6 text-center text-xs text-gray-400">
                      No subtitles found for this title on Wyzie.
                    </div>
                  )}
                </div>

                {/* Footer info */}
                <div className="pt-2 border-t border-white/10 text-[11px] text-gray-400 flex items-center justify-between">
                  <span>Powered by Wyzie Subs</span>
                  <span>Auto-matches WEB-DL / BluRay</span>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
