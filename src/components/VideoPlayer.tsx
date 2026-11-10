import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  AlertCircle,
  Sun,
  Settings,
  RefreshCw,
  Sliders,
  Expand
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  runtime?: number; // total duration in seconds (optional from TMDB)
  subtitles?: SubtitleTrack[];
  onClose?: () => void;
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
  title,
  tmdbId,
  mediaType,
  season,
  episode,
  filename,
  runtime,
  subtitles: initialSubtitles,
  onClose,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Determine if stream is MKV
  const isMkv = useMemo(() => {
    if (!src) return false;
    const lower = src.toLowerCase();
    return lower.endsWith('.mkv') || lower.includes('.mkv?') || lower.includes('/api/stream/mkv') || (!lower.includes('.mp4') && !lower.includes('.webm') && !lower.includes('.m3u8'));
  }, [src]);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(runtime || 0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Stable progress storage key uniquely tied to TMDB ID or clean filename
  const progressKey = useMemo(() => {
    if (tmdbId) {
      if (season !== undefined && episode !== undefined) {
        return `watch_pos_tmdb_${tmdbId}_s${season}_e${episode}`;
      }
      if (mediaType === 'movie') {
        return `watch_pos_tmdb_${tmdbId}`;
      }
    }

    const rawTarget = filename || title || src || '';
    const cleanName = rawTarget.split('?')[0].split('/').pop() || 'media';
    const sMatch = cleanName.match(/s(\d+)e(\d+)/i);
    if (tmdbId && sMatch) {
      return `watch_pos_tmdb_${tmdbId}_s${parseInt(sMatch[1], 10)}_e${parseInt(sMatch[2], 10)}`;
    }

    const safe = cleanName.replace(/\.(mkv|mp4|avi|mov|webm|flv|wmv|m4v|ts)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    return `watch_pos_file_${safe}`;
  }, [tmdbId, mediaType, season, episode, filename, title, src]);

  // Read saved progress once on initial load (resumes from 5+ seconds)
  const initialSavedTime = useMemo(() => {
    try {
      const saved = localStorage.getItem(progressKey);
      if (saved) {
        const sec = parseFloat(saved);
        if (!isNaN(sec) && sec >= 5) return sec;
      }
    } catch {
      // ignore
    }
    return 0;
  }, [progressKey]);

  // Position & duration tracking refs for bulletproof persistence across unmounts/reloads
  const currentPositionRef = useRef<number>(initialSavedTime);
  const lastSavedStoragePosRef = useRef<number>(initialSavedTime);
  const durationRef = useRef<number>(runtime || 0);

  // Transmuxing Seek Offset (seconds) - starts directly at saved position for MKV!
  const [seekOffset, setSeekOffset] = useState<number>(() => {
    return isMkv && initialSavedTime >= 5 ? Math.floor(initialSavedTime) : 0;
  });

  // Align initial MKV auto-resume offset to nearest keyframe for frame-accurate playback
  useEffect(() => {
    if (isMkv && initialSavedTime >= 5 && src) {
      fetch(`/api/stream/keyframe?url=${encodeURIComponent(src)}&time=${initialSavedTime}`)
        .then(r => r.json())
        .then(d => {
          if (typeof d.keyframe === 'number' && d.keyframe >= 0 && d.keyframe <= initialSavedTime) {
            setSeekOffset(d.keyframe);
            currentPositionRef.current = d.keyframe;
          }
        })
        .catch(() => {});
    }
  }, [isMkv, initialSavedTime, src]);

  // Resumed notification notice
  const [resumedNotice, setResumedNotice] = useState<number | null>(() => {
    return initialSavedTime >= 5 ? Math.floor(initialSavedTime) : null;
  });
  const hasAppliedResumeRef = useRef<boolean>(false);

  // Mobile Swipe Gesture State: Brightness & Volume HUD
  const [brightness, setBrightness] = useState<number>(1.0);
  const [gestureFeedback, setGestureFeedback] = useState<{
    type: 'seek' | 'volume' | 'brightness';
    value: React.ReactNode;
    id: number;
  } | null>(null);

  // Wyzie Subs State
  const [wyzieSubs, setWyzieSubs] = useState<WyzieSubtitleItem[]>([]);
  const [selectedSub, setSelectedSub] = useState<WyzieSubtitleItem | null>(null);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [subDelay, setSubDelay] = useState<number>(0);
  const [showSubModal, setShowSubModal] = useState(false);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Touch tracking refs
  const touchStartRef = useRef<{ x: number; y: number; time: number; target: 'left' | 'right' | 'center' } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const singleTapTimerRef = useRef<any>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const preventClickRef = useRef<boolean>(false);
  const isSwipeRef = useRef<boolean>(false);

  // Keep durationRef synchronized whenever duration updates
  useEffect(() => {
    if (duration > 0) {
      durationRef.current = duration;
    }
  }, [duration]);

  // Probe server for total duration of stream (handles MKV fragmented streaming)
  useEffect(() => {
    let active = true;
    if (!src) return;

    const probeDuration = async () => {
      try {
        const res = await fetch(`/api/stream/duration?url=${encodeURIComponent(src)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data.duration === 'number' && data.duration > 0) {
          setDuration(data.duration);
          durationRef.current = data.duration;
        }
      } catch {
        // fallback to props runtime or loadedmetadata
      }
    };

    probeDuration();
    return () => { active = false; };
  }, [src]);

  // Compute effective stream URL (audio direct passthrough)
  const effectiveSrc = useMemo(() => {
    if (!src) return '';
    if (isMkv) {
      const base = `/api/stream/mkv?url=${encodeURIComponent(src)}`;
      return seekOffset > 0 ? `${base}&ss=${Math.floor(seekOffset)}` : base;
    }
    return src;
  }, [src, isMkv, seekOffset]);

  // Compute effective subtitle URL (shifts VTT cue timestamps to match MKV seek point and manual sync delay)
  const effectiveSubUrl = useMemo(() => {
    if (!selectedSub?.vttUrl) return '';
    const baseOffset = isMkv ? seekOffset : 0;
    const separator = selectedSub.vttUrl.includes('?') ? '&' : '?';
    let url = selectedSub.vttUrl;
    if (baseOffset > 0) {
      url += `${separator}offset=${baseOffset}`;
    }
    if (subDelay !== 0) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}sub_delay=${subDelay}`;
    }
    if (isMkv && src) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}video_url=${encodeURIComponent(src)}`;
    }
    return url;
  }, [selectedSub, isMkv, seekOffset, subDelay, src]);

  // Auto-hide controls after 4s (4000ms) of inactivity
  const startAutoHideTimer = useCallback((delay = 4000) => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, delay);
  }, []);

  const clearAutoHideTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }, []);

  // Keeps controls alive / resets the 4s countdown
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    startAutoHideTimer(4000);
  }, [startAutoHideTimer]);

  // Toggle controls visibility on single screen tap or click
  const toggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) {
        startAutoHideTimer(4000);
      } else {
        clearAutoHideTimer();
      }
      return next;
    });
  }, [startAutoHideTimer, clearAutoHideTimer]);

  // Manage auto-hide timer when modals or play state changes
  useEffect(() => {
    if (showSubModal || showSettingsModal) {
      clearAutoHideTimer();
    } else if (showControls && isPlaying) {
      startAutoHideTimer(4000);
    }
    return () => clearAutoHideTimer();
  }, [showSubModal, showSettingsModal, showControls, isPlaying, clearAutoHideTimer, startAutoHideTimer]);

  // Persist position safely into localStorage
  const persistPosition = useCallback((pos: number) => {
    if (pos < 5) return;
    const totalDur = durationRef.current;
    // Only mark finished and clear if the video has a verified duration > 120s and reached the very end
    if (totalDur > 120 && (totalDur - pos < 30 || pos / totalDur > 0.95)) {
      try {
        localStorage.removeItem(progressKey);
        lastSavedStoragePosRef.current = 0;
      } catch {}
    } else {
      try {
        localStorage.setItem(progressKey, Math.floor(pos).toString());
        lastSavedStoragePosRef.current = pos;
      } catch {}
    }
  }, [progressKey]);

  // Auto-dismiss resumed notice after 6 seconds
  useEffect(() => {
    if (resumedNotice) {
      const t = setTimeout(() => setResumedNotice(null), 6000);
      return () => clearTimeout(t);
    }
  }, [resumedNotice]);

  // Save progress on tab exit / browser close / unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      persistPosition(currentPositionRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      persistPosition(currentPositionRef.current);
    };
  }, [persistPosition]);

  // Fetch Wyzie Subtitles
  useEffect(() => {
    let active = true;

    async function loadWyzieSubtitles() {
      if (!tmdbId) {
        if (initialSubtitles && initialSubtitles.length > 0) {
          const mapped: WyzieSubtitleItem = {
            id: 'init-sub-0',
            url: initialSubtitles[0].src,
            display: initialSubtitles[0].label || 'English (Wyzie)',
            language: initialSubtitles[0].srclang || 'en',
            release: 'Default Track',
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
        if (!res.ok) throw new Error('Subtitles response not ok');
        const data = await res.json();

        if (active && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
          setWyzieSubs(data.subtitles);
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
        console.warn('Wyzie subs load warning:', err);
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
          setSubsEnabled(true);
        }
      } finally {
        if (active) setIsLoadingSubs(false);
      }
    }

    loadWyzieSubtitles();
    return () => { active = false; };
  }, [tmdbId, mediaType, season, episode, filename, initialSubtitles]);

  // Synchronize TextTracks mode when subtitle selection, offset, or URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (subsEnabled && selectedSub) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  }, [subsEnabled, selectedSub, seekOffset, effectiveSubUrl]);

  // Auto-dismiss gesture feedback
  useEffect(() => {
    if (gestureFeedback) {
      const t = setTimeout(() => setGestureFeedback(null), 800);
      return () => clearTimeout(t);
    }
  }, [gestureFeedback]);

  // Controls Actions
  const togglePlay = useCallback(() => {
    resetControlsTimeout();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(e => console.warn('Play error:', e));
    } else {
      v.pause();
    }
  }, [resetControlsTimeout]);

  // Seek relative (+/- seconds)
  const seekRelative = useCallback(async (delta: number) => {
    resetControlsTimeout();
    const v = videoRef.current;
    if (!v) return;

    const displayCurrent = currentPositionRef.current;
    const maxDur = durationRef.current > 0 ? durationRef.current : 86400;
    const target = Math.max(0, Math.min(maxDur, displayCurrent + delta));

    // Show feedback HUD
    setGestureFeedback({
      type: 'seek',
      value: (
        <div className="flex flex-col items-center">
          {delta < 0 ? <ChevronsLeft className="w-9 h-9 mb-1" /> : <ChevronsRight className="w-9 h-9 mb-1" />}
          <span className="text-xs sm:text-sm font-bold tracking-wider">{delta > 0 ? `+${delta}s` : `${delta}s`}</span>
        </div>
      ),
      id: Date.now()
    });

    if (isMkv) {
      // Check if target is within local buffered range
      const localTarget = target - seekOffset;
      let inBuffer = false;
      if (v.buffered && localTarget >= 0) {
        for (let i = 0; i < v.buffered.length; i++) {
          if (localTarget >= v.buffered.start(i) && localTarget <= v.buffered.end(i)) {
            inBuffer = true;
            break;
          }
        }
      }

      if (inBuffer) {
        v.currentTime = localTarget;
        setCurrentTime(localTarget);
        currentPositionRef.current = target;
        persistPosition(target);
      } else {
        setIsBuffering(true);
        const rawOffset = Math.floor(target);
        let finalOffset = rawOffset;
        if (src && target > 0) {
          try {
            const timeoutPromise = new Promise<number>((resolve) => setTimeout(() => resolve(rawOffset), 1000));
            const keyframePromise = fetch(`/api/stream/keyframe?url=${encodeURIComponent(src)}&time=${target}`)
              .then(r => r.json())
              .then(d => (typeof d.keyframe === 'number' && d.keyframe >= 0 && d.keyframe <= target) ? d.keyframe : rawOffset)
              .catch(() => rawOffset);
            finalOffset = await Promise.race([keyframePromise, timeoutPromise]);
          } catch {
            finalOffset = rawOffset;
          }
        }

        setSeekOffset(finalOffset);
        setCurrentTime(0);
        currentPositionRef.current = finalOffset;
        persistPosition(finalOffset);
      }
    } else {
      v.currentTime = target;
      setCurrentTime(target);
      currentPositionRef.current = target;
      persistPosition(target);
    }
  }, [seekOffset, isMkv, src, resetControlsTimeout, persistPosition]);

  // Seek absolute (from progress bar slider)
  const seekAbsolute = useCallback(async (targetSeconds: number) => {
    resetControlsTimeout();
    const v = videoRef.current;
    if (!v) return;

    const maxDur = durationRef.current > 0 ? durationRef.current : 86400;
    const clampedTarget = Math.max(0, Math.min(maxDur, targetSeconds));

    if (isMkv) {
      const localTarget = clampedTarget - seekOffset;
      let inBuffer = false;
      if (v.buffered && localTarget >= 0) {
        for (let i = 0; i < v.buffered.length; i++) {
          if (localTarget >= v.buffered.start(i) && localTarget <= v.buffered.end(i)) {
            inBuffer = true;
            break;
          }
        }
      }

      if (inBuffer) {
        v.currentTime = localTarget;
        setCurrentTime(localTarget);
        currentPositionRef.current = clampedTarget;
        persistPosition(clampedTarget);
      } else {
        setIsBuffering(true);
        const rawOffset = Math.floor(clampedTarget);
        let finalOffset = rawOffset;
        if (src && clampedTarget > 0) {
          try {
            const timeoutPromise = new Promise<number>((resolve) => setTimeout(() => resolve(rawOffset), 1000));
            const keyframePromise = fetch(`/api/stream/keyframe?url=${encodeURIComponent(src)}&time=${clampedTarget}`)
              .then(r => r.json())
              .then(d => (typeof d.keyframe === 'number' && d.keyframe >= 0 && d.keyframe <= clampedTarget) ? d.keyframe : rawOffset)
              .catch(() => rawOffset);
            finalOffset = await Promise.race([keyframePromise, timeoutPromise]);
          } catch {
            finalOffset = rawOffset;
          }
        }

        setSeekOffset(finalOffset);
        setCurrentTime(0);
        currentPositionRef.current = finalOffset;
        persistPosition(finalOffset);
      }
    } else {
      v.currentTime = clampedTarget;
      setCurrentTime(clampedTarget);
      currentPositionRef.current = clampedTarget;
      persistPosition(clampedTarget);
    }
  }, [seekOffset, isMkv, src, resetControlsTimeout, persistPosition]);

  // Volume & Mute
  const adjustVolume = useCallback((delta: number) => {
    resetControlsTimeout();
    const v = videoRef.current;
    if (!v) return;
    const newVol = Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100));
    v.volume = newVol;
    v.muted = newVol === 0;
    setVolume(newVol);
    setIsMuted(newVol === 0);

    setGestureFeedback({
      type: 'volume',
      value: (
        <div className="flex flex-col items-center">
          {newVol === 0 ? <VolumeX className="w-8 h-8 mb-1" /> : <Volume2 className="w-8 h-8 mb-1" />}
          <span className="text-xs sm:text-sm font-bold">{Math.round(newVol * 100)}%</span>
        </div>
      ),
      id: Date.now()
    });
  }, [volume, resetControlsTimeout]);

  const toggleMute = useCallback(() => {
    resetControlsTimeout();
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !isMuted;
    v.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      v.volume = 0.5;
      setVolume(0.5);
    }
  }, [isMuted, volume, resetControlsTimeout]);

  // Brightness adjust
  const adjustBrightness = useCallback((delta: number) => {
    resetControlsTimeout();
    const nextB = Math.max(0.2, Math.min(1.5, Math.round((brightness + delta) * 100) / 100));
    setBrightness(nextB);

    setGestureFeedback({
      type: 'brightness',
      value: (
        <div className="flex flex-col items-center">
          <Sun className="w-8 h-8 mb-1 text-yellow-400" />
          <span className="text-xs sm:text-sm font-bold">{Math.round(nextB * 100)}%</span>
        </div>
      ),
      id: Date.now()
    });
  }, [brightness, resetControlsTimeout]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    resetControlsTimeout();
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, [resetControlsTimeout]);

  // Aspect Ratio Cycle (Fit -> Cover -> Fill)
  const cycleAspectRatio = useCallback(() => {
    resetControlsTimeout();
    setAspectRatio(prev => {
      if (prev === 'contain') return 'cover';
      if (prev === 'cover') return 'fill';
      return 'contain';
    });
  }, [resetControlsTimeout]);

  // Safe Close Handler (persists playback position before exiting)
  const handleClose = useCallback(() => {
    persistPosition(currentPositionRef.current);
    if (onClose) onClose();
  }, [persistPosition, onClose]);

  // Handle video metadata loaded: seek non-mkv if saved progress exists
  const handleLoadedMetadata = useCallback(() => {
    if (!hasAppliedResumeRef.current && initialSavedTime >= 5) {
      hasAppliedResumeRef.current = true;
      if (!isMkv && videoRef.current) {
        videoRef.current.currentTime = initialSavedTime;
      }
    }
  }, [initialSavedTime, isMkv]);

  // Desktop Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      resetControlsTimeout();

      if (e.key === 'Escape') {
        if (showSubModal) setShowSubModal(false);
        else if (showSettingsModal) setShowSettingsModal(false);
        else if (isFullscreen) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        } else if (onClose) handleClose();
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
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
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShowSubModal(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showSubModal, showSettingsModal, onClose, togglePlay, seekRelative, adjustVolume, toggleMute, toggleFullscreen, resetControlsTimeout]);

  // Touch handlers for mobile swipe & double-tap
  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = touch.clientX - rect.left;
    const width = rect.width;
    let target: 'left' | 'right' | 'center' = 'center';
    if (x < width * 0.38) target = 'left';
    else if (x > width * 0.62) target = 'right';

    isSwipeRef.current = false;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      target
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touchStartRef.current.y - touch.clientY;
    const deltaX = touch.clientX - touchStartRef.current.x;

    // Vertical swipe check (must exceed horizontal drag threshold)
    if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.4) {
      isSwipeRef.current = true;
      const step = (deltaY > 0 ? 0.02 : -0.02);
      if (touchStartRef.current.target === 'left') {
        adjustBrightness(step);
      } else if (touchStartRef.current.target === 'right') {
        adjustVolume(step);
      }
      touchStartRef.current.y = touch.clientY; // incremental
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTimeRef.current = Date.now();
    if (!touchStartRef.current) return;

    if (isSwipeRef.current) {
      touchStartRef.current = null;
      isSwipeRef.current = false;
      return;
    }

    const dt = Date.now() - touchStartRef.current.time;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    // If tap (not a drag or swipe)
    if (dt < 350 && deltaX < 20 && deltaY < 20) {
      // Prevent synthetic click from firing second toggle
      preventClickRef.current = true;
      setTimeout(() => {
        preventClickRef.current = false;
      }, 600);

      const clickX = touch.clientX - rect.left;
      const width = rect.width;
      const now = Date.now();
      const diffTap = now - lastTapRef.current.time;

      if (diffTap > 60 && diffTap < 360) {
        // Double tap confirmed
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        if (clickX < width * 0.38) {
          seekRelative(-10);
        } else if (clickX > width * 0.62) {
          seekRelative(10);
        } else {
          togglePlay();
        }
        lastTapRef.current = { time: 0, x: 0 };
      } else {
        // Single tap: toggles controls (stays on for ~4s, or tap again dismisses immediately)
        lastTapRef.current = { time: now, x: clickX };
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = setTimeout(() => {
          toggleControls();
        }, 260);
      }
    }

    touchStartRef.current = null;
  };

  // Desktop mouse activity handler
  const handleMouseMove = () => {
    // Avoid synthetic mouse movements right after touch
    if (Date.now() - lastTouchTimeRef.current < 800) return;
    resetControlsTimeout();
  };

  // Container click handler (desktop mouse clicks)
  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Ignore synthetic click right after mobile touch
    if (preventClickRef.current || Date.now() - lastTouchTimeRef.current < 800) {
      return;
    }
    toggleControls();
  };

  const totalCurrentDisplayTime = seekOffset + currentTime;

  return (
    <div 
      className="fixed inset-0 z-[130] bg-black flex items-center justify-center p-0 select-none overflow-hidden"
      onClick={handleClose}
    >
      <style>{`
        video::cue {
          background-color: rgba(10, 10, 15, 0.85);
          color: #ffffff;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 1.15rem;
          line-height: 1.35;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9);
          border-radius: 4px;
          padding: 2px 6px;
        }
      `}</style>

      <motion.div 
        ref={containerRef}
        onClick={handleContainerClick}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="relative w-full h-full bg-black overflow-hidden flex flex-col justify-center items-center group cursor-pointer"
        style={{ filter: `brightness(${brightness})` }}
      >
        {/* ========================================================= */}
        {/* Native HTML5 Video Element with Stream Transmuxer          */}
        {/* ========================================================= */}
        <video
          ref={videoRef}
          src={effectiveSrc}
          poster={poster}
          playsInline
          autoPlay
          crossOrigin="anonymous"
          className={`w-full h-full ${
            aspectRatio === 'contain' 
              ? 'object-contain' 
              : aspectRatio === 'cover' 
                ? 'object-cover' 
                : 'object-fill'
          }`}
          onLoadedMetadata={() => {
            handleLoadedMetadata();
            if (videoRef.current) {
              const dur = videoRef.current.duration;
              if (dur && isFinite(dur) && dur > 0) {
                const full = dur + seekOffset;
                if (full > durationRef.current) {
                  setDuration(full);
                  durationRef.current = full;
                }
              }
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            startAutoHideTimer(4000);
          }}
          onPause={() => {
            setIsPlaying(false);
            clearAutoHideTimer();
            persistPosition(currentPositionRef.current);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => setIsBuffering(false)}
          onTimeUpdate={() => {
            if (videoRef.current) {
              const cur = videoRef.current.currentTime || 0;
              setCurrentTime(cur);
              const totalCur = seekOffset + cur;
              currentPositionRef.current = totalCur;
              if (Math.abs(totalCur - lastSavedStoragePosRef.current) >= 1.5) {
                persistPosition(totalCur);
              }
            }
          }}
          onDurationChange={() => {
            if (videoRef.current) {
              const dur = videoRef.current.duration;
              if (dur && isFinite(dur) && dur > 0) {
                const full = dur + seekOffset;
                if (full > durationRef.current) {
                  setDuration(full);
                  durationRef.current = full;
                }
              }
            }
          }}
          onError={(e) => {
            console.error('Video playback error:', e);
            setIsBuffering(false);
            setPlaybackError('Stream failed or format not supported. Click retry or check connection.');
          }}
        >
          {subsEnabled && selectedSub && effectiveSubUrl && (
            <track
              key={`${selectedSub.id || selectedSub.vttUrl}_${isMkv ? seekOffset : 0}_${subDelay}`}
              src={effectiveSubUrl}
              kind="subtitles"
              label={selectedSub.display}
              srcLang={selectedSub.language || 'en'}
              default
              onLoad={(e) => {
                const el = e.currentTarget as HTMLTrackElement;
                if (el && el.track && subsEnabled) {
                  el.track.mode = 'showing';
                }
              }}
            />
          )}
        </video>

        {/* Buffering Spinner */}
        {isBuffering && !playbackError && (
          <div className="absolute inset-0 pointer-events-none z-20 flex flex-col items-center justify-center gap-3 bg-black/30 backdrop-blur-[2px]">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow-md">
              {isMkv ? 'Direct Playing MKV via Stream Engine...' : 'Loading Stream...'}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {playbackError && (
          <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-12 h-12 text-rose-500 animate-pulse" />
            <div className="max-w-md">
              <h4 className="text-white font-bold text-base mb-1">Playback Interrupted</h4>
              <p className="text-gray-300 text-xs sm:text-sm mb-4 leading-relaxed">{playbackError}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    setIsBuffering(true);
                    if (videoRef.current) {
                      videoRef.current.load();
                      videoRef.current.play().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
                </button>
                {onClose && (
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resumed Notification Badge */}
        <AnimatePresence>
          {resumedNotice && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="liquid-glass absolute top-16 left-1/2 z-50 bg-[#161622]/95 border border-purple-500/40 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 text-white backdrop-blur-md text-xs pointer-events-auto"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Resumed from <strong className="font-mono text-purple-300">{formatTime(resumedNotice)}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  seekAbsolute(0);
                  setResumedNotice(null);
                }}
                className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[11px] font-bold border border-white/20 transition cursor-pointer active:scale-95"
              >
                Start from 0:00
              </button>
              <button
                type="button"
                onClick={() => setResumedNotice(null)}
                className="p-0.5 text-gray-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gesture On-Screen HUD Feedback */}
        <AnimatePresence>
          {gestureFeedback && (
            <motion.div
              key={gestureFeedback.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 pointer-events-none z-[60] flex items-center justify-center"
            >
              <div className="bg-black/80 text-white rounded-3xl p-6 backdrop-blur-md flex items-center justify-center shadow-2xl border border-white/10 min-w-[120px]">
                {gestureFeedback.value}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* Top Header Overlay: Title, Wyzie Badge, Controls, Close   */}
        {/* ========================================================= */}
        <AnimatePresence>
          {showControls && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 z-40 p-3 sm:p-5 bg-gradient-to-b from-black/95 via-black/60 to-transparent flex items-center justify-between pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Media Title & Wyzie Badge */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
                <div className="min-w-0">
                  <h3 className="text-white text-xs sm:text-sm md:text-base font-bold truncate drop-shadow-md">
                    {title || filename || 'Media Stream'}
                  </h3>
                  {selectedSub && subsEnabled ? (
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-purple-300">
                      <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                      <span className="truncate">
                        Wyzie Subs: {selectedSub.display} {selectedSub.isBestMatch && '• Best Match'}
                        {subDelay !== 0 && ` (${subDelay > 0 ? `+${subDelay.toFixed(1)}s` : `${subDelay.toFixed(1)}s`})`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[10px] sm:text-xs text-gray-400">
                      Direct Play • In-Browser Stream
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Subtitle Selector Button */}
                <button
                  type="button"
                  onClick={() => setShowSubModal(true)}
                  title="Wyzie Subtitles"
                  className={`p-2 rounded-full border transition backdrop-blur-md cursor-pointer active:scale-95 ${
                    subsEnabled && selectedSub 
                      ? 'bg-purple-600/40 border-purple-500 text-purple-200' 
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  <SubtitlesIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Stream Settings Button */}
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  title="Stream Settings"
                  className="p-2 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md cursor-pointer active:scale-95"
                >
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Close Button */}
                {onClose && (
                  <button
                    type="button"
                    onClick={handleClose}
                    title="Close player (Esc)"
                    className="p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md border border-white/20 transition cursor-pointer shadow-lg"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center Play/Pause Large Action (on hover / mobile tap) */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 pointer-events-none flex items-center justify-center z-30"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="liquid-glass pointer-events-auto p-4 sm:p-5 rounded-full bg-black/60 hover:bg-black/80 text-white hover:text-purple-300 border border-white/20 backdrop-blur-md transition active:scale-90 shadow-2xl cursor-pointer"
              >
                {isPlaying ? <Pause className="w-8 h-8 sm:w-10 sm:h-10" /> : <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* Bottom Control Bar: Scrubber, Time, Audio, Speed, Fullscreen */}
        {/* ========================================================= */}
        <AnimatePresence>
          {showControls && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 z-40 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2.5 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress Scrubber Bar */}
              <div className="w-full flex items-center gap-3">
                <span className="text-white/85 text-[11px] sm:text-xs font-mono min-w-[44px]">
                  {formatTime(totalCurrentDisplayTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : Math.max(100, totalCurrentDisplayTime + 60)}
                  step={0.5}
                  value={Math.min(totalCurrentDisplayTime, duration > 0 ? duration : totalCurrentDisplayTime + 60)}
                  onChange={(e) => seekAbsolute(parseFloat(e.target.value))}
                  className="w-full h-1.5 sm:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:h-2.5 transition-all"
                />
                <span className="text-white/85 text-[11px] sm:text-xs font-mono min-w-[44px] text-right">
                  {duration > 0 ? formatTime(duration) : '--:--'}
                </span>
              </div>

              {/* Bottom Buttons Row */}
              <div className="flex items-center justify-between">
                {/* Left controls */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Play/Pause */}
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2 text-white hover:text-purple-400 active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                  </button>

                  {/* Seek -10s */}
                  <button
                    type="button"
                    onClick={() => seekRelative(-10)}
                    title="Seek -10s"
                    className="p-2 text-white/90 hover:text-white active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Volume Control */}
                  <div className="flex items-center gap-1 group/vol">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-2 text-white/90 hover:text-white active:scale-95 rounded-lg hover:bg-white/10 transition cursor-pointer"
                    >
                      {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (videoRef.current) {
                          videoRef.current.volume = val;
                          videoRef.current.muted = val === 0;
                        }
                        setVolume(val);
                        setIsMuted(val === 0);
                      }}
                      className="w-16 sm:w-20 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500 hidden sm:block"
                    />
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Aspect Ratio Toggle (Contain / Cover / Fill) */}
                  <button
                    type="button"
                    onClick={cycleAspectRatio}
                    title={`Aspect Ratio: ${aspectRatio.toUpperCase()}`}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-white text-[11px] font-semibold border border-white/15 transition cursor-pointer flex items-center gap-1"
                  >
                    <Expand className="w-3.5 h-3.5" />
                    <span className="uppercase text-[10px]">{aspectRatio}</span>
                  </button>

                  {/* Playback speed selector */}
                  <select
                    value={playbackRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value);
                      setPlaybackRate(rate);
                      if (videoRef.current) videoRef.current.playbackRate = rate;
                    }}
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
                    type="button"
                    onClick={() => setSubsEnabled(prev => !prev)}
                    title={subsEnabled ? 'Disable Subtitles' : 'Enable Subtitles'}
                    className={`p-2 rounded-lg transition cursor-pointer active:scale-95 ${
                      subsEnabled && selectedSub 
                        ? 'text-purple-400 bg-purple-500/20' 
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <SubtitlesIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
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

        {/* ========================================================= */}
        {/* Stream Settings Modal                                     */}
        {/* ========================================================= */}
        <AnimatePresence>
          {showSettingsModal && (
            <div 
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowSettingsModal(false)}
            >
              <motion.div 
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#16161f] border border-white/15 rounded-3xl p-5 sm:p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4 text-white"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-purple-400" />
                    <h4 className="font-bold text-sm sm:text-base">Stream Engine Settings</h4>
                  </div>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-300 font-semibold mb-1.5 block">Audio Passthrough</label>
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-600/20 border border-purple-500/40 text-xs text-white">
                      <Check className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <p className="font-semibold text-white">Direct AAC Passthrough (-c:a copy)</p>
                        <p className="text-[10px] text-gray-300 mt-0.5">Stream copy active: 0% server CPU overhead with native original audio track.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-300 font-semibold mb-1.5 block">Brightness ({Math.round(brightness * 100)}%)</label>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.05}
                      value={brightness}
                      onChange={(e) => setBrightness(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>Dim</span>
                      <span>Default (100%)</span>
                      <span>Max</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ========================================================= */}
        {/* Wyzie Subtitle Selector Modal (Mobile Drawer / Desktop)   */}
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

                {/* Subtitle Timing Sync Fine-Tuning */}
                {subsEnabled && selectedSub && (
                  <div className="py-2.5 px-3 my-2 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Subtitle Timing Sync
                      </span>
                      <span className="font-mono text-purple-300 font-bold">
                        {subDelay === 0 ? 'Automatic (0.0s)' : subDelay > 0 ? `+${subDelay.toFixed(1)}s` : `${subDelay.toFixed(1)}s`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setSubDelay(prev => Math.round((prev - 0.5) * 10) / 10)}
                        title="Display subtitles 0.5s earlier"
                        className="flex-1 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-[11px] font-semibold text-gray-200 transition text-center"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubDelay(prev => Math.round((prev - 0.1) * 10) / 10)}
                        title="Display subtitles 0.1s earlier"
                        className="flex-1 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-[11px] font-semibold text-gray-200 transition text-center"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubDelay(0)}
                        disabled={subDelay === 0}
                        title="Reset subtitle sync"
                        className="flex-1 py-1 bg-purple-600/30 hover:bg-purple-600/50 disabled:opacity-40 disabled:hover:bg-purple-600/30 active:scale-95 rounded-lg text-[11px] font-semibold text-purple-200 border border-purple-500/30 transition text-center"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubDelay(prev => Math.round((prev + 0.1) * 10) / 10)}
                        title="Display subtitles 0.1s later"
                        className="flex-1 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-[11px] font-semibold text-gray-200 transition text-center"
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubDelay(prev => Math.round((prev + 0.5) * 10) / 10)}
                        title="Display subtitles 0.5s later"
                        className="flex-1 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg text-[11px] font-semibold text-gray-200 transition text-center"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                )}

                {/* Subtitles List */}
                <div className="flex-1 overflow-y-auto py-2 space-y-2">
                  {/* Off Option */}
                  <button
                    type="button"
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
                    <span>Subtitles Off</span>
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
                        type="button"
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
