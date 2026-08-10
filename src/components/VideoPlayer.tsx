import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type Player from 'video.js/dist/types/player';
import { AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  type?: string;
  title?: string;
  onClose?: () => void;
}

export default function VideoPlayer({ src, poster, type, title, onClose }: VideoPlayerProps) {
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [audioOnlyWarning, setAudioOnlyWarning] = useState(false);
  const [suggestedPlayer, setSuggestedPlayer] = useState('an external player');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) {
        setSuggestedPlayer('mpv');
      } else if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        setSuggestedPlayer('VLC or Infuse');
      } else if (/Mac/i.test(ua)) {
        setSuggestedPlayer('IINA');
      } else if (/Win/i.test(ua)) {
        setSuggestedPlayer('Potplayer');
      } else {
        setSuggestedPlayer('VLC or mpv');
      }
    }
  }, []);

  useEffect(() => {
    if (!videoWrapperRef.current) return;

    // Determine mime type if not provided
    let videoType = type;
    if (!videoType) {
      if (src.endsWith('.mp4')) videoType = 'video/mp4';
      else if (src.endsWith('.webm')) videoType = 'video/webm';
      else if (src.endsWith('.mkv')) videoType = 'video/webm'; // Trick for MKV fallback
      else if (src.endsWith('.m3u8')) videoType = 'application/x-mpegURL';
      else videoType = 'video/mp4';
    }

    // Recommended React pattern: create the video element dynamically
    const videoElement = document.createElement("video-js");
    videoElement.classList.add('vjs-big-play-centered');
    videoWrapperRef.current.appendChild(videoElement);

    const playerOptions: Record<string, any> = {
      autoplay: true,
      controls: true,
      responsive: true,
      fill: true,
      playsinline: true,
      preload: 'auto',
      poster: poster || undefined,
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
      sources: [
        {
          src: src,
          type: videoType
        }
      ],
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
      // Check for audio-only fallback on loadedmetadata
      player.on('loadedmetadata', () => {
        const tech = player.tech({ IWillNotUseThisInPlugins: true });
        if (tech && tech.el()) {
          const vidEl = tech.el() as HTMLVideoElement;
          // If video has 0x0 dimensions but has duration, it's playing audio-only (unsupported video codec like HEVC in MKV)
          if (vidEl.videoWidth === 0 && vidEl.videoHeight === 0 && vidEl.duration > 0) {
            setAudioOnlyWarning(true);
          }
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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group" style={{ transform: 'translate3d(0,0,0)', willChange: 'transform' }}>
      {/* Title bar inside player */}
      {title && (
        <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex items-center justify-between">
          <h3 className="text-white text-sm sm:text-base font-bold truncate pr-12 drop-shadow">
            {title}
          </h3>
        </div>
      )}

      {audioOnlyWarning && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 text-white p-6 text-center backdrop-blur-sm pointer-events-none">
          <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
          <h3 className="text-lg font-bold mb-2">Video Codec Unsupported</h3>
          <p className="text-sm text-white/70 max-w-sm">
            Your browser does not support this video format (likely HEVC/MKV). The player is falling back to audio only. Use the external player options ({suggestedPlayer}) to watch this file.
          </p>
        </div>
      )}

      <div data-vjs-player className="absolute inset-0 w-full h-full" ref={videoWrapperRef} />
    </div>
  );
}
