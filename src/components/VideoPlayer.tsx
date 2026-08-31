import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type Player from 'video.js/dist/types/player';
import { AlertCircle, X, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SubtitleTrack {
  src: string;
  label: string;
  srclang: string;
}

interface VideoPlayerProps {
  src: string;
  poster?: string;
  type?: string;
  title?: string;
  subtitles?: SubtitleTrack[];
  onClose?: () => void;
}

export default function VideoPlayer({ src, poster, type, title, subtitles, onClose }: VideoPlayerProps) {
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [audioOnlyWarning, setAudioOnlyWarning] = useState(false);
  const [suggestedPlayer, setSuggestedPlayer] = useState('an external player');
  const [gestureFeedback, setGestureFeedback] = useState<{message: React.ReactNode, id: number} | null>(null);

  useEffect(() => {
    if (gestureFeedback) {
      const timer = setTimeout(() => {
        setGestureFeedback(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gestureFeedback]);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) {
        setSuggestedPlayer('mpv or VLC');
      } else if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        setSuggestedPlayer('VLC or Infuse');
      } else if (/Mac/i.test(ua)) {
        setSuggestedPlayer('IINA or VLC');
      } else if (/Win/i.test(ua)) {
        setSuggestedPlayer('PotPlayer or VLC');
      } else {
        setSuggestedPlayer('VLC or mpv');
      }
    }
  }, []);

  // Escape key handler to close player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!videoWrapperRef.current) return;

    // Determine mime type if not provided
    let videoType = type;
    if (!videoType) {
      if (src.endsWith('.mp4')) videoType = 'video/mp4';
      else if (src.endsWith('.webm')) videoType = 'video/webm';
      else if (src.endsWith('.mkv')) videoType = 'video/webm'; // Fallback trick for MKV containers
      else if (src.endsWith('.m3u8')) videoType = 'application/x-mpegURL';
      else videoType = 'video/mp4';
    }

    const videoElement = document.createElement("video-js");
    videoElement.classList.add('vjs-big-play-centered', 'vjs-fill');
    videoWrapperRef.current.innerHTML = '';
    videoWrapperRef.current.appendChild(videoElement);

    const playerOptions: Record<string, any> = {
      autoplay: true,
      controls: true,
      responsive: true,
      fill: true,
      playsinline: true,
      preload: 'auto',
      poster: poster || undefined,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      userActions: { click: false, doubleClick: false },
      sources: [
        {
          src: src,
          type: videoType
        }
      ],
      tracks: subtitles?.map(sub => ({
        kind: 'captions',
        src: sub.src,
        srclang: sub.srclang,
        label: sub.label,
        default: sub.srclang === 'en'
      })) || [],
      controlBar: {
        volumePanel: {
          inline: false
        },
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'playbackRateMenuButton',
          'subsCapsButton',
          'audioTrackButton',
          'pictureInPictureToggle',
          'fullscreenToggle',
        ]
      }
    };

    const player = (playerRef.current = videojs(videoElement, playerOptions, () => {
      // 1. Resume from saved progress
      const progressKey = `watch_progress_${btoa(src).substring(0, 50)}`;
      const savedProgress = localStorage.getItem(progressKey);
      
      if (savedProgress) {
        player.currentTime(parseFloat(savedProgress));
      }

      const checkCodecSupport = () => {
        try {
          const tech = player.tech({ IWillNotUseThisInPlugins: true });
          if (tech && tech.el()) {
            const vidEl = tech.el() as HTMLVideoElement;
            if (vidEl.videoWidth > 0 && vidEl.videoHeight > 0) {
              setAudioOnlyWarning(false);
            } else if (vidEl.currentTime > 1 && vidEl.videoWidth === 0 && vidEl.videoHeight === 0 && !vidEl.paused) {
              setAudioOnlyWarning(true);
            }
          }
        } catch {
          // ignore
        }
      };

      player.on('playing', checkCodecSupport);
      
      // 2. Track and save progress continuously
      let lastSaveTime = 0;
      player.on('timeupdate', () => {
        checkCodecSupport();
        
        const currentTime = player.currentTime();
        const duration = player.duration();
        
        // Save progress every 5 seconds
        if (Math.abs(currentTime - lastSaveTime) > 5) {
          // If we are at the very end (last 30 seconds), clear the progress so it starts over next time
          if (duration > 0 && duration - currentTime < 30) {
            localStorage.removeItem(progressKey);
          } else {
            localStorage.setItem(progressKey, currentTime.toString());
          }
          lastSaveTime = currentTime;
        }
      });
    }));

    // Auto-rotate logic
    const handleOrientationChange = () => {
      const p = playerRef.current as any;
      if (!p) return;
      const isLandscape = window.screen.orientation ? window.screen.orientation.type.startsWith('landscape') : window.matchMedia("(orientation: landscape)").matches;
      
      if (isLandscape) {
        if (!p.isFullscreen()) {
          p.requestFullscreen().catch(() => {});
          if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(() => {});
          }
        }
      } else {
        if (p.isFullscreen()) {
          p.exitFullscreen().catch(() => {});
          if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
          }
        }
      }
    };
    
    window.addEventListener('orientationchange', handleOrientationChange);

    // Gesture control logic
    let lastTapTime = 0;
    let lastTouchTime = 0;
    let singleTapTimeout: any = null;
    
    const handleTap = (e: Event) => {
      const isTouch = e.type === 'touchend';
      if (isTouch) {
        lastTouchTime = Date.now();
      } else if (e.type === 'click' && Date.now() - lastTouchTime < 500) {
        // Prevent ghost clicks on mobile from firing
        return;
      }

      // Ignore clicks on controls and buttons
      const target = e.target as HTMLElement;
      if (
        target.closest('.vjs-control-bar') || 
        target.closest('.vjs-menu') || 
        target.closest('.vjs-button') ||
        target.closest('.vjs-modal-dialog')
      ) {
        return;
      }
      
      if (isTouch) {
        // Prevent browser synthesizing a click or default video behavior
        e.preventDefault();
      }
      
      const p = playerRef.current;
      if (!p || p.isDisposed()) return;
      
      const now = Date.now();
      const timeDiff = now - lastTapTime;
      
      const rect = videoWrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      let clientX = 0;
      if (isTouch) {
        const touch = (e as TouchEvent).changedTouches?.[0];
        if (!touch) return;
        clientX = touch.clientX;
      } else {
        clientX = (e as MouseEvent).clientX;
      }
      
      if (clientX === undefined) return;
      
      const x = clientX - rect.left;
      const width = rect.width;
      
      if (timeDiff > 30 && timeDiff < 400) {
        // Double tap confirmed - cancel any single tap action
        if (singleTapTimeout) {
          clearTimeout(singleTapTimeout);
          singleTapTimeout = null;
        }

        if (x < width * 0.35) {
          // Seek backward 10s
          const newTime = Math.max(0, p.currentTime() - 10);
          p.currentTime(newTime);
          setGestureFeedback({
            message: (
              <div className="flex flex-col items-center">
                 <ChevronsLeft className="w-9 h-9 sm:w-11 sm:h-11 text-white mb-1" />
                 <span className="text-xs sm:text-sm font-bold tracking-wide">Seek -10s</span>
              </div>
            ),
            id: Date.now()
          });
          lastTapTime = 0; // reset
        } else if (x > width * 0.65) {
          // Seek forward 10s
          const duration = p.duration() || 0;
          const newTime = Math.min(duration, p.currentTime() + 10);
          p.currentTime(newTime);
          setGestureFeedback({
            message: (
              <div className="flex flex-col items-center">
                 <ChevronsRight className="w-9 h-9 sm:w-11 sm:h-11 text-white mb-1" />
                 <span className="text-xs sm:text-sm font-bold tracking-wide">Seek +10s</span>
              </div>
            ),
            id: Date.now()
          });
          lastTapTime = 0; // reset
        } else {
          // Center tap: let it behave as a single tap to toggle controls or player UI
          p.userActive(!p.userActive());
          lastTapTime = now;
        }
      } else {
        lastTapTime = now;
        if (singleTapTimeout) clearTimeout(singleTapTimeout);
        singleTapTimeout = setTimeout(() => {
          if (p && !p.isDisposed()) {
            p.userActive(!p.userActive());
          }
        }, 400);
      }
    };

    videoWrapperRef.current?.addEventListener('click', handleTap);
    videoWrapperRef.current?.addEventListener('touchend', handleTap);

    return () => {
      if (singleTapTimeout) clearTimeout(singleTapTimeout);
      window.removeEventListener('orientationchange', handleOrientationChange);
      videoWrapperRef.current?.removeEventListener('click', handleTap);
      videoWrapperRef.current?.removeEventListener('touchend', handleTap);
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, poster, type]);

  return (
    <div 
      className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6"
      onClick={onClose}
    >
      <motion.div 
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/15 flex flex-col justify-center items-center group"
      >
        {/* Top Header Overlay with Title & Close Button */}
        <div className="absolute top-0 left-0 right-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between pointer-events-auto transition-opacity duration-300">
          <h3 className="text-white text-xs sm:text-sm md:text-base font-bold truncate pr-4 drop-shadow-md">
            {title || 'Media Player'}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              title="Close player (Esc)"
              className="p-1.5 sm:p-2 text-white bg-white/10 hover:bg-white/20 active:scale-95 rounded-full backdrop-blur-md border border-white/20 transition shrink-0 cursor-pointer shadow-lg"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Audio Only Non-intrusive Floating Notification */}
        <AnimatePresence>
          {audioOnlyWarning && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-16 left-3 right-3 sm:left-auto sm:right-auto sm:max-w-md z-30 mx-auto p-3 sm:p-4 bg-black/90 backdrop-blur-md border border-yellow-500/40 text-white rounded-2xl shadow-2xl flex items-start gap-3 pointer-events-auto"
            >
              <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-bold text-yellow-300 mb-0.5">Audio-Only Playback</div>
                <p className="text-gray-300 leading-relaxed text-[11px] sm:text-xs">
                  Your browser cannot decode this video codec directly. Open in {suggestedPlayer} for full video playback.
                </p>
              </div>
              <button 
                onClick={() => setAudioOnlyWarning(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg bg-white/10 transition shrink-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video.js Host Container */}
        <div data-vjs-player className="w-full h-full relative" ref={videoWrapperRef} />
        
        {/* Gesture Visual Feedback */}
        <AnimatePresence>
          {gestureFeedback && (
            <motion.div
              key={gestureFeedback.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 pointer-events-none z-[60] flex items-center justify-center"
            >
              <div className="bg-black/60 text-white rounded-3xl p-6 backdrop-blur-sm flex items-center justify-center shadow-2xl">
                {gestureFeedback.message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Classic Single-Row Video.js Control Bar Styles */}
        <style dangerouslySetInnerHTML={{__html: `
          /* Control Bar Container */
          .video-js .vjs-control-bar {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            height: 3.8em !important;
            padding: 0 0.5em !important;
            align-items: center !important;
            background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%) !important;
            z-index: 20 !important;
            bottom: 0 !important;
          }

          /* Progress Bar Expansion */
          .video-js .vjs-progress-control {
            flex: 1 1 10% !important;
            min-width: 40px !important;
            max-width: 400px !important;
            display: flex !important;
            align-items: center !important;
            margin: 0 0.8em !important;
            cursor: pointer !important;
          }

          .video-js .vjs-progress-control .vjs-progress-holder {
            margin: 0 !important;
            width: 100% !important;
            height: 4px !important;
            border-radius: 2px !important;
            transition: height 0.15s ease !important;
          }

          .video-js .vjs-progress-control:hover .vjs-progress-holder {
            height: 6px !important;
          }

          .video-js .vjs-play-progress {
            background-color: #a855f7 !important;
            border-radius: 2px !important;
          }

          /* Timestamps */
          .video-js .vjs-current-time,
          .video-js .vjs-time-divider,
          .video-js .vjs-duration {
            display: flex !important;
            align-items: center !important;
            font-size: 0.85em !important;
            padding: 0 3px !important;
            line-height: 1 !important;
            min-width: auto !important;
            width: auto !important;
            flex-shrink: 0 !important;
          }

          .video-js .vjs-remaining-time {
            display: none !important;
          }

          /* Control Buttons - Equal Sizing and Clean Spacing */
          .video-js .vjs-control-bar > .vjs-button,
          .video-js .vjs-control-bar > .vjs-control {
            width: 2.6em !important;
            height: 2.6em !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 0.15em !important;
            flex-shrink: 0 !important;
            border-radius: 6px !important;
            cursor: pointer !important;
          }

          /* Fix Volume Panel merging with Play Button */
          .video-js .vjs-volume-panel {
            margin-left: 0.3em !important;
            margin-right: 0.5em !important;
          }

          .video-js .vjs-volume-panel .vjs-mute-control {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .video-js .vjs-control-bar .vjs-button:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
          }

          /* Mobile Screen Compact Optimization */
          @media (max-width: 640px) {
            .video-js .vjs-control-bar {
              height: 3.2em !important;
              padding: 0 0.1em !important;
            }
            .video-js .vjs-control-bar > .vjs-button,
            .video-js .vjs-control-bar > .vjs-control {
              width: 1.9em !important;
              height: 1.9em !important;
              margin: 0 0.05em !important;
            }
            .video-js .vjs-current-time,
            .video-js .vjs-time-divider,
            .video-js .vjs-duration {
              font-size: 0.7em !important;
              padding: 0 1px !important;
            }
            .video-js .vjs-progress-control {
              margin: 0 0.25em !important;
            }
          }
        `}} />
      </motion.div>
    </div>
  );
}
