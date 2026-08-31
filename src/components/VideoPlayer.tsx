import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type Player from 'video.js/dist/types/player';
import { AlertCircle, X } from 'lucide-react';
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
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'remainingTimeDisplay',
          'playbackRateMenuButton',
          'subsCapsButton',
          'audioTrackButton',
          'qualitySelector',
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

    return () => {
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
        
        {/* Force timestamp visibility over remaining time */}
        <style dangerouslySetInnerHTML={{__html: `
          .video-js .vjs-time-control { display: block !important; }
          .video-js .vjs-remaining-time { display: none !important; }
        `}} />
      </motion.div>
    </div>
  );
}
