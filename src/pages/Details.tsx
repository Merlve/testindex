import { clearAllLocalCaches } from '../utils/cacheManager';
import DetailsSkeleton from "../components/DetailsSkeleton";
import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Play, Download, Copy, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, 
  X, Edit2, Bookmark, BookmarkCheck, RefreshCw, Check, Film, Tv, MonitorPlay, Sparkles, Loader2, Trash2, Youtube, Eye, EyeOff, User, HardDrive, Search, Folder, Square, CheckSquare, Lock, LogIn, Image as ImageIcon, Type, RotateCcw, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseMediaName, extractFileMetadata, formatBytes } from '../utils/nameParser';
import { getGenresWithIds } from '../utils/genres';
import VideoPlayer from '../components/VideoPlayer';
import { useQueryClient } from '@tanstack/react-query';
import { extractDominantColor, BackdropColorPalette } from '../utils/colorExtractor';

// Helper to identify video files
const isVideoFile = (filename: string) => {
  return /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|ts|m2ts)$/i.test(filename);
};

// Player Selection Intent Modal Component
function IntentPlayerModal({ 
  item, 
  itemPath, 
  token, 
  config, 
  onClose, 
  onPlayWeb,
  onExternalPlay
}: { 
  item: any; 
  itemPath: string; 
  token: string | null; 
  config: any; 
  onClose: () => void; 
  onPlayWeb: (url: string) => void; 
  onExternalPlay: () => void;
}) {
  const [url, setUrl] = useState(item.url || '');
  const [loading, setLoading] = useState(!item.url);
  const [copied, setCopied] = useState(false);
  const [os, setOs] = useState<'unknown' | 'android' | 'ios' | 'macos' | 'windows'>('unknown');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
      const maxTouchPoints = navigator.maxTouchPoints || 0;

      if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) {
        setOs('ios');
      } else if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(platform) || /Mac OS X|macOS/i.test(ua)) {
        setOs('macos');
      } else if (/android/i.test(ua)) {
        setOs('android');
      } else if (/Win/i.test(platform) || /Windows/i.test(ua)) {
        setOs('windows');
      } else {
        setOs('unknown');
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!url && token) {
      setLoading(true);
      const cleanPath = itemPath.replace(/\/+$/, '');
      axios.post('/api/fs/get', { reqPath: `${cleanPath}/${item.name}` }, { headers: { Authorization: token } })
        .then(res => {
          if (isMounted) {
            if (res.data?.data?.raw_url) setUrl(res.data.data.raw_url);
            else setUrl(`${config.openlistUrl || ''}/d/${cleanPath}/${item.name}`);
          }
        })
        .catch(() => {
          if (isMounted) setUrl(`${config.openlistUrl || ''}/d/${cleanPath}/${item.name}`);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (!token && !url) {
      setUrl(`${config.openlistUrl || ''}/d/${itemPath}/${item.name}`);
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [item.name, itemPath, token, config.openlistUrl, url]);

  const meta = extractFileMetadata(item.name, item.size);

  const copyToClipboard = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div 
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#fbf4eb] dark:bg-[#121218] border border-black/10 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-black dark:hover:text-white rounded-full bg-black/5 dark:bg-white/5 transition cursor-pointer">
          <X size={20} />
        </button>

        <div className="flex items-center gap-2 mb-2 text-purple-600 dark:text-purple-400 font-bold text-xs uppercase tracking-wider">
          <MonitorPlay size={16} /> Choose Player
        </div>

        <h3 className="text-base font-bold text-black dark:text-white pr-8 mb-2 leading-snug break-words">
          {item.name}
        </h3>

        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          {meta.resolution && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-600/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
              {meta.resolution}
            </span>
          )}
          {meta.codec && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-500/20">
              {meta.codec}
            </span>
          )}
          {meta.formattedSize && (
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300">
              {meta.formattedSize}
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-500 font-medium animate-pulse text-sm">
            Fetching playback URL...
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`grid gap-2.5 ${os === 'macos' ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {os === 'ios' && (
                <>
                  <a onClick={() => { onExternalPlay(); }}
                    href={`vlc://${url}`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-orange-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 font-bold text-xs flex items-center justify-center shrink-0">VLC</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">VLC</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">iOS / iPadOS</div>
                    </div>
                  </a>

                  <a onClick={() => { onExternalPlay(); }}
                    href={`infuse://x-callback-url/play?url=${encodeURIComponent(url)}`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-blue-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0">INF</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">Infuse</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">iOS / iPadOS</div>
                    </div>
                  </a>
                </>
              )}

              {os === 'macos' && (
                <a onClick={() => { onExternalPlay(); }}
                  href={`iina://weblink?url=${encodeURIComponent(url)}`}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-indigo-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-500 font-bold text-xs flex items-center justify-center shrink-0">IINA</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">IINA Player</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">macOS</div>
                  </div>
                </a>
              )}

              {os === 'android' && (
                <>
                  <a onClick={() => { onExternalPlay(); }}
                    href={`intent://${url.replace(/^https?:\/\//, '')}#Intent;package=is.xyz.mpv;action=android.intent.action.VIEW;scheme=${url.startsWith('https') ? 'https' : 'http'};type=video/*;end;`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-purple-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs flex items-center justify-center shrink-0">MPV</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">MPV</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Android</div>
                    </div>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (url) {
                        onExternalPlay(); onPlayWeb(url);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs flex items-center justify-center shrink-0">
                      <Play size={14} fill="currentColor" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">Play Here</div>
                      <div className="text-[10px] opacity-80 truncate">In Browser</div>
                    </div>
                  </button>
                </>
              )}

              {os === 'windows' && (
                <>
                  <a onClick={() => { onExternalPlay(); }}
                    href={`potplayer://${url}`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-yellow-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 text-yellow-500 font-bold text-xs flex items-center justify-center shrink-0">POT</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">PotPlayer</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Windows</div>
                    </div>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (url) {
                        onExternalPlay(); onPlayWeb(url);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs flex items-center justify-center shrink-0">
                      <Play size={14} fill="currentColor" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">Play Here</div>
                      <div className="text-[10px] opacity-80 truncate">In Browser</div>
                    </div>
                  </button>
                </>
              )}

              {os === 'unknown' && (
                <>
                  <a onClick={() => { onExternalPlay(); }}
                    href={`vlc://${url}`}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:border-orange-500/50 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 font-bold text-xs flex items-center justify-center shrink-0">VLC</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">VLC</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">External App</div>
                    </div>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (url) {
                        onExternalPlay(); onPlayWeb(url);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 transition text-left cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-500 font-bold text-xs flex items-center justify-center shrink-0">
                      <Play size={14} fill="currentColor" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">Play Here</div>
                      <div className="text-[10px] opacity-80 truncate">In Browser</div>
                    </div>
                  </button>
                </>
              )}
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-semibold text-gray-700 dark:text-gray-300 transition cursor-pointer"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              <span>{copied ? 'Direct Link Copied!' : 'Copy Direct Stream URL'}</span>
            </button>

            {/* Platform Download Hints */}
            {os === 'android' && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center italic mt-2.5">
                download mpv-android from{' '}
                <a 
                  href="https://play.google.com/store/apps/details?id=is.xyz.mpv" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-purple-600 dark:hover:text-purple-400 not-italic font-medium"
                >
                  play store
                </a>
              </p>
            )}

            {os === 'windows' && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center italic mt-2.5">
                download Potplayer from{' '}
                <a 
                  href="https://potplayer.tv" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow-600 dark:hover:text-yellow-400 not-italic font-medium"
                >
                  https://potplayer.tv
                </a>
              </p>
            )}

            {os === 'ios' && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center italic mt-2.5">
                install{' '}
                <a 
                  href="https://apps.apple.com/app/vlc-media-player/id650377962" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-orange-600 dark:hover:text-orange-400 not-italic font-medium"
                >
                  VLC
                </a>{' '}
                or{' '}
                <a 
                  href="https://apps.apple.com/app/infuse-video-player/id1136220934" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-600 dark:hover:text-blue-400 not-italic font-medium"
                >
                  infuse
                </a>{' '}
                from the app store
              </p>
            )}

            {os === 'macos' && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center italic mt-2.5">
                install IINA player from{' '}
                <a 
                  href="https://iina.io" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-indigo-600 dark:hover:text-indigo-400 not-italic font-medium"
                >
                  https://iina.io
                </a>
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function FileRowItem({ 
  file, 
  itemPath, 
  meta, 
  isWatched, 
  toggleWatched, 
  setIntentModalData, 
  token, 
  config,
  isSelected,
  toggleSelection,
  tmdbEpisode
}: {
  file: any;
  itemPath: string;
  meta: any;
  isWatched: boolean;
  toggleWatched: (name: string, path: string) => void;
  setIntentModalData: (data: any) => void;
  token: string | null;
  config: any;
  isSelected: boolean;
  toggleSelection: () => void;
  tmdbEpisode?: any;
}) {
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<'copy' | 'download' | null>(null);

  const getUrl = async () => {
    if (file.url) return file.url;
    if (!token) {
      return `${config.openlistUrl || ''}/d/${itemPath}/${file.name}`;
    }
    const cleanPath = itemPath.replace(/\/+$/, '');
    try {
      const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${file.name}` }, { headers: { Authorization: token } });
      if (res.data?.data?.raw_url) return res.data.data.raw_url;
    } catch (e) {
      // ignore
    }
    return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
  };

  const handleCopy = async () => {
    setActionLoading('copy');
    const targetUrl = await getUrl();
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const textArea = document.createElement("textarea");
      textArea.value = targetUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setActionLoading(null);
  };

  const handleDownload = async () => {
    setActionLoading('download');
    const targetUrl = await getUrl();
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionLoading(null);
  };

  let fallbackTitle = file.name;
  if (!tmdbEpisode) {
      if (meta.seasonNum !== null && meta.episodeNum !== null) {
          fallbackTitle = `S${meta.seasonNum.toString().padStart(2, '0')}E${meta.episodeNum.toString().padStart(2, '0')} - Episode ${meta.episodeNum}`;
      } else if (meta.episodeNum !== null) {
          fallbackTitle = `Ep ${meta.episodeNum.toString().padStart(2, '0')} - Episode ${meta.episodeNum}`;
      } else {
          const { cleanName } = parseMediaName(file.name);
          fallbackTitle = cleanName !== 'Unknown' ? cleanName : file.name;
      }
  }

  return (
    <div 
      className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isWatched 
          ? 'bg-black/5 dark:bg-white/5 border-transparent opacity-60 hover:opacity-100' 
          : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-purple-500/40'
      } ${isSelected ? 'ring-2 ring-purple-500 bg-purple-500/5' : ''}`}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <button 
          onClick={toggleSelection}
          className={`shrink-0 p-1 rounded transition cursor-pointer flex items-center justify-center mt-0.5 sm:mt-0 ${
            isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
          title={isSelected ? "Deselect" : "Select"}
        >
          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
        </button>
        {tmdbEpisode && tmdbEpisode.still_path && (
          <img 
            src={`https://image.tmdb.org/t/p/w185${tmdbEpisode.still_path}`} 
            alt={tmdbEpisode.name} 
            className={`hidden sm:block w-32 h-18 object-cover rounded-lg shrink-0 transition ${isWatched ? 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100' : ''}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-semibold break-words leading-snug transition ${isWatched ? 'text-gray-500 dark:text-gray-400' : 'text-black dark:text-white'}`}>
            {tmdbEpisode 
              ? `${meta.seasonNum !== null ? `S${meta.seasonNum.toString().padStart(2, '0')}E${tmdbEpisode.episode_number.toString().padStart(2, '0')}` : tmdbEpisode.episode_number}. ${tmdbEpisode.name}` 
              : fallbackTitle}
          </h4>
          {tmdbEpisode && tmdbEpisode.overview && (
            <p className={`hidden sm:block text-[11px] mt-1 line-clamp-2 transition ${isWatched ? 'text-gray-500/70 dark:text-gray-500/70' : 'text-gray-600 dark:text-gray-400'}`}>
              {tmdbEpisode.overview}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {meta.resolution && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isWatched ? 'bg-gray-500/15 text-gray-500' : 'bg-purple-600/15 text-purple-600 dark:text-purple-300'}`}>
                {meta.resolution}
              </span>
            )}
            {meta.codec && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${isWatched ? 'bg-gray-500/15 text-gray-500' : 'bg-blue-600/15 text-blue-600 dark:text-blue-300'}`}>
                {meta.codec}
              </span>
            )}
            {meta.formattedSize && (
              <span className="text-[11px] text-gray-500 font-medium">
                {meta.formattedSize}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
        <button 
          onClick={() => toggleWatched(file.name, itemPath)}
          className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
            isWatched ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25' : 'bg-black/5 dark:bg-white/5 text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
          }`}
          title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
        >
          {isWatched ? <Check size={16} /> : <Eye size={16} />}
        </button>

        <button
          onClick={handleDownload}
          disabled={actionLoading === 'download'}
          className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center justify-center cursor-pointer disabled:opacity-50"
          title="Download File"
        >
          {actionLoading === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        </button>

        <button
          onClick={handleCopy}
          disabled={actionLoading === 'copy'}
          className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center justify-center cursor-pointer disabled:opacity-50"
          title="Copy Direct Link"
        >
          {actionLoading === 'copy' ? <Loader2 size={16} className="animate-spin" /> : copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>

        <button
          onClick={() => setIntentModalData({ item: file, path: itemPath })}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
        >
          <Play size={14} fill="currentColor" />
          <span>Play</span>
        </button>
      </div>
    </div>
  );
}

const getFolderSeasonNum = (pathStr: string): number | null => {
  const match = pathStr.match(/(?:^|[^a-z])(?:season|s)[\s_.-]*(\d+)/i);
  if (match) return parseInt(match[1], 10);
  if (/(?:^|[^a-z])(specials|extras)/i.test(pathStr)) return 0;
  return null;
};

export default function Details() {
  const navigate = useNavigate();
  const location = useLocation();
  const { '*' : paramPath } = useParams();
  const fullPath = paramPath ? `home/${paramPath}` : 'home';
  const pathParts = fullPath ? fullPath.split('/') : [];
  const name = pathParts[pathParts.length - 1] || '';
  const category = (pathParts[1] || '').toUpperCase();
  const isMovieCategory = category === 'MOVIES';
  const [actualPathOverride, setActualPathOverride] = useState<string | null>(null);

  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<any>({});

  const passedMetaVer = location.state?.metaVer;
  const currentMetaVer = localStorage.getItem('meta_version') || '1';
  const isStale = passedMetaVer && passedMetaVer !== currentMetaVer;

  const [tmdb, setTmdb] = useState<any>(isStale ? null : (location.state?.tmdbData || null));
  const actualOpenlistPath = actualPathOverride || (tmdb?.id ? config?.digitalReleasePaths?.[tmdb.id] : null) || location.state?.item?.openlist_path || location.state?.item?.path || fullPath;

  useEffect(() => {
    axios.get('/api/config').then(res => {
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        setConfig(res.data);
      }
    });
  }, []);

  // Directory items & TMDB state
  const [baseItems, setBaseItems] = useState<any[]>([]);
  const [seasonItems, setSeasonItems] = useState<any[]>([]);

  const [loading, setLoading] = useState(!location.state?.tmdbData);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [toast, setToast] = useState('');
  
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number | null>(null);
  const [currentSeasonEpisodes, setCurrentSeasonEpisodes] = useState<any[]>([]);
  const [tmdbSeasonsData, setTmdbSeasonsData] = useState<Record<number, any>>({});
  const [loadingSeasonFiles, setLoadingSeasonFiles] = useState(false);
  const [baseRefresh, setBaseRefresh] = useState(0);
  const [seasonRefresh, setSeasonRefresh] = useState(0);

  // Playing / Modal State
  const [playingUrl, setPlayingUrl] = useState('');
  const [intentModalData, setIntentModalData] = useState<{ item: any; path: string } | null>(null);

  // Trailer State
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  // Metadata Correction & Logo Fix Modal
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [modalTab, setModalTab] = useState<'info' | 'logo'>('info');
  const [searchTitle, setSearchTitle] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualTmdbId, setManualTmdbId] = useState('');
  const [copiedModalPath, setCopiedModalPath] = useState(false);

  // Logo Fix State
  const [availableLogos, setAvailableLogos] = useState<any[]>([]);
  const [loadingLogos, setLoadingLogos] = useState(false);
  const [selectedLogoPath, setSelectedLogoPath] = useState<string | null>(null);
  const [customLogoInput, setCustomLogoInput] = useState('');
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoSearchQuery, setLogoSearchQuery] = useState('');
  const [searchingLogos, setSearchingLogos] = useState(false);
  const [logoSearchResults, setLogoSearchResults] = useState<any[]>([]);
  const [activeLogoTmdb, setActiveLogoTmdb] = useState<any>(null);

  // Dominant color palette state
  const [colorPalette, setColorPalette] = useState<BackdropColorPalette | null>(null);

  // Watched state
  const [watchedItems, setWatchedItems] = useState<any[]>([]);
  const [isPlotExpanded, setIsPlotExpanded] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Batch selection state
  const [selectedFiles, setSelectedFiles] = useState<{file: any, path: string}[]>([]);
  const [batchCopyLoading, setBatchCopyLoading] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);

  // Clear logo and state on route/file navigation
  useEffect(() => {
    setLogoUrl(null);
    setAvailableLogos([]);
    setActiveLogoTmdb(null);
    setSelectedLogoPath(null);
  }, [fullPath, name]);

  // Page title and metadata updates
  useEffect(() => {
    let cleanName = '';
    let parsedYear = '';
    if (name) {
      const parsed = parseMediaName(name);
      cleanName = parsed.cleanName;
      parsedYear = parsed.year;
    }

    if (tmdb) {
      const mediaTitle = tmdb.title || tmdb.name || cleanName;
      const releaseDate = tmdb.release_date || tmdb.first_air_date || '';
      const releaseYear = (releaseDate || parsedYear || '').substring(0, 4);
      document.title = `${mediaTitle}${releaseYear ? ` (${releaseYear})` : ''} - SHUTTER!`;
    } else if (cleanName) {
      document.title = `${cleanName}${parsedYear ? ` (${parsedYear})` : ''} - SHUTTER!`;
    }

    return () => {
      document.title = "SHUTTER! - Unlimited Movies, Series & Anime";
    };
  }, [tmdb, name]);

  // Fetch TMDB data if missing
  useEffect(() => {
    let isMounted = true;
    if (!tmdb) {
      setLoading(true);
      const parsed = parseMediaName(name);
      const cleanName = parsed.cleanName || name;
      const parsedYear = parsed.year || '';

      const tmdbId = location.state?.item?._jf?.tmdbId || null;
      let url = `/api/meta/search?query=${encodeURIComponent(cleanName)}&type=${category}&year=${parsedYear}&path=${encodeURIComponent(actualOpenlistPath)}`;
      if (tmdbId) {
          url += `&tmdbId=${tmdbId}`;
      }

      axios.get(url)
        .then(res => {
          if (isMounted) {
            if (res.data && (res.data.poster_path || res.data._overridden || res.data.title || res.data.name)) {
              setTmdb(res.data);
            } else {
               // Fallback to search_all if initial search fails
               axios.get(`/api/meta/search_all?query=${encodeURIComponent(cleanName)}&type=${category}&year=${parsedYear}${tmdbId ? `&tmdbId=${tmdbId}` : ''}`)
                 .then(fallbackRes => {
                    if (isMounted && fallbackRes.data?.results?.[0]) {
                      setTmdb(fallbackRes.data.results[0]);
                    }
                 }).catch(console.error);
            }
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, [fullPath, name, category, tmdb, actualOpenlistPath, location.state]);

  // Fetch logo automatically whenever tmdb, name, or category changes
  useEffect(() => {
    let isMounted = true;
    if (!tmdb) {
      setLogoUrl(null);
      return;
    }

    if (tmdb.no_logo) {
      setLogoUrl(null);
      return;
    }

    if (tmdb.custom_logo || tmdb.logo_path) {
      const custom = tmdb.custom_logo || tmdb.logo_path;
      setLogoUrl(custom.startsWith('http') ? custom : `https://image.tmdb.org/t/p/original${custom}`);
      return;
    }

    const tmdbId = tmdb.id || tmdb.tmdb_id || tmdb._jf?.tmdbId || location.state?.item?.tmdbId || location.state?.item?._jf?.tmdbId;
    const isTv = tmdb.media_type === 'tv' || Boolean(tmdb.first_air_date) || Boolean(tmdb.seasons) || Boolean(tmdb.number_of_seasons) || ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
    const mediaType = isTv ? 'tv' : 'movie';

    if (tmdb.images?.logos && Array.isArray(tmdb.images.logos) && tmdb.images.logos.length > 0) {
      const bestLogo = tmdb.images.logos.find((l: any) => l.iso_639_1 === 'en') || 
                       tmdb.images.logos.find((l: any) => !l.iso_639_1) || 
                       tmdb.images.logos[0];
      if (bestLogo?.file_path) {
        setLogoUrl(bestLogo.file_path.startsWith('http') ? bestLogo.file_path : `https://image.tmdb.org/t/p/original${bestLogo.file_path}`);
        return;
      }
    }

    if (tmdbId) {
      axios.get(`/api/meta/images?id=${tmdbId}&type=${mediaType}`)
        .then(res => {
          if (!isMounted) return;
          const logos = res.data?.logos || [];
          if (logos.length > 0) {
            const bestLogo = logos.find((l: any) => l.iso_639_1 === 'en') || 
                             logos.find((l: any) => !l.iso_639_1) || 
                             logos[0];
            if (bestLogo?.file_path) {
              setLogoUrl(bestLogo.file_path.startsWith('http') ? bestLogo.file_path : `https://image.tmdb.org/t/p/original${bestLogo.file_path}`);
            }
          }
        })
        .catch(console.error);
    }
    return () => { isMounted = false; };
  }, [tmdb, category]);

  // Check Watchlist status
  useEffect(() => {
    if (user && user !== 'guest' && actualOpenlistPath) {
      axios.get(`/api/watchlist/check?path=${encodeURIComponent(actualOpenlistPath)}`, { headers: { 'x-user': user } })
        .then(res => setInWatchlist(Boolean(res.data?.inWatchlist)))
        .catch(() => setInWatchlist(false));
    }
  }, [user, actualOpenlistPath]);

  // Fetch Watched items
  useEffect(() => {
    if (user && user !== 'guest') {
      axios.get('/api/watched', { headers: { 'x-user': user } })
        .then(res => {
          if (Array.isArray(res.data)) setWatchedItems(res.data);
        })
        .catch(console.error);
    }
  }, [user]);

  // Fetch Folder Files
  useEffect(() => {
    if (user === 'guest') {
      setBaseItems([]);
      setSeasonItems([]);
      setLoadingFiles(false);
      return;
    }
    let isMounted = true;
    setLoadingFiles(true);

    const cleanPath = actualOpenlistPath.replace(/^\/+/, '');
    // If it's a direct file path, we query its parent directory to get the file object
    const targetFilename = cleanPath.split('/').pop();
    const isDirectFile = targetFilename && isVideoFile(targetFilename);
    const reqPath = isDirectFile ? cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '' : cleanPath;
    
    const payload: any = { reqPath: reqPath };
    if (baseRefresh > 0) payload.refresh = true;

    axios.post('/api/fs/list', payload, { headers: token ? { Authorization: token } : {} })
      .then(res => {
        if (!isMounted) return;
        const content = res.data?.data?.content || [];
        // If the path itself points to a file, just show the file directly
        if (!Array.isArray(content)) {
            // In case the API returns a single file object instead of an array when querying a file path directly
            const singleFile = res.data?.data;
            if (singleFile && !singleFile.is_dir && isVideoFile(singleFile.name)) {
                setBaseItems([singleFile]);
                setSeasonItems([]);
                return;
            }
        }
        
        // If content is somehow empty but we have an item passed in state that is a file
        if (content.length === 0 && location.state?.item && !location.state?.item?.is_dir && isVideoFile(location.state?.item?.name)) {
             setBaseItems([location.state.item]);
             setSeasonItems([]);
             return;
        }

        const dirFolders = content.filter((item: any) => item.is_dir);
        const dirFiles = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));

        // If we are looking at a path that is actually a file, and Openlist returned its parent dir contents,
        // we should just isolate the file we care about.
        const targetFilename = cleanPath.split('/').pop();
        if (targetFilename && isVideoFile(targetFilename)) {
            const exactFileMatch = dirFiles.find((f: any) => f.name === targetFilename || decodeURIComponent(f.name) === decodeURIComponent(targetFilename));
            if (exactFileMatch) {
                setBaseItems([exactFileMatch]);
                setSeasonItems([]);
                return;
            } else {
                // Fallback: If it's explicitly a video file path but not found in the parent dir list
                // (possibly due to pagination limits or encoding mismatches), construct a mock item
                // so the user can still play/download it directly.
                setBaseItems([{
                    name: targetFilename,
                    is_dir: false,
                    size: location.state?.item?.size || 0,
                    modified: location.state?.item?.modified || new Date().toISOString()
                }]);
                setSeasonItems([]);
                return;
            }
        }

        dirFiles.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        setBaseItems(dirFiles);

        if (dirFolders.length > 0) {
          dirFolders.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          setSeasonItems(dirFolders);
          if (activeSeasonIndex === null) {
            setActiveSeasonIndex(0);
          }
        } else {
          setSeasonItems([]);
        }
      })
      .catch(err => {
        console.error('Error fetching folder files:', err);
        // If the API fails but we know it's a direct video file, fallback to the file
        const targetFilename = cleanPath.split('/').pop();
        if (targetFilename && isVideoFile(targetFilename)) {
             setBaseItems([{
                 name: targetFilename,
                 is_dir: false,
                 size: location.state?.item?.size || 0,
                 modified: location.state?.item?.modified || new Date().toISOString()
             }]);
             setSeasonItems([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingFiles(false);
      });

    return () => { isMounted = false; };
  }, [actualOpenlistPath, token, baseRefresh, user]);

  // Fetch TMDB Season Data
  useEffect(() => {
    if (!tmdb || !tmdb.id) return;
    let isMounted = true;

    const seasonsToFetch = new Set<number>();

    // 1. From active season folder
    if (seasonItems.length > 0 && activeSeasonIndex !== null && seasonItems[activeSeasonIndex]) {
       let seasonNum = 1;
       const match = seasonItems[activeSeasonIndex].name.match(/(?:^|[^a-z])(?:season|s)[\s_.-]*(\d+)/i);
       if (match) {
         seasonNum = parseInt(match[1], 10);
       } else if (/specials|extras/i.test(seasonItems[activeSeasonIndex].name)) {
         seasonNum = 0;
       }
       seasonsToFetch.add(seasonNum);
    }

    // 2. From baseItems (for shows without folders or inside a specific season folder)
    if (seasonItems.length === 0 && baseItems.length > 0) {
       const folderSeason = getFolderSeasonNum(actualOpenlistPath.split('/').pop() || '');
       if (folderSeason !== null) {
           seasonsToFetch.add(folderSeason);
       }
       baseItems.forEach(item => {
         const meta = extractFileMetadata(item.name, item.size);
         if (meta.seasonNum !== null) {
           seasonsToFetch.add(meta.seasonNum);
         }
       });
    }

    // 3. From currentSeasonEpisodes (as fallback/additional source)
    if (currentSeasonEpisodes.length > 0) {
       currentSeasonEpisodes.forEach(item => {
         const meta = extractFileMetadata(item.name, item.size);
         if (meta.seasonNum !== null) {
           seasonsToFetch.add(meta.seasonNum);
         } else if (seasonItems[activeSeasonIndex || 0]) {
           const folderSeason = getFolderSeasonNum(seasonItems[activeSeasonIndex || 0].name);
           if (folderSeason !== null) {
             seasonsToFetch.add(folderSeason);
           }
         }
       });
    }

    seasonsToFetch.forEach(seasonNum => {
      setTmdbSeasonsData(prev => {
         if (prev[seasonNum] !== undefined) return prev; // Already fetched or loading
         
         // Fetch new season data
         axios.get(`/api/meta/tv_season?tvId=${tmdb.id}&season=${seasonNum}`)
           .then(res => {
              if (isMounted && res.data) {
                 setTmdbSeasonsData(p => ({ ...p, [seasonNum]: res.data }));
              }
           })
           .catch(() => {});
           
         return { ...prev, [seasonNum]: null };
      });
    });

    return () => { isMounted = false; };
  }, [tmdb, activeSeasonIndex, seasonItems, baseItems, currentSeasonEpisodes]);

  // Fetch Season Episodes when active season changes
  useEffect(() => {
    if (user === 'guest' || activeSeasonIndex === null || !seasonItems[activeSeasonIndex]) {
      setCurrentSeasonEpisodes([]);
      setLoadingSeasonFiles(false);
      return;
    }
    let isMounted = true;
    setLoadingSeasonFiles(true);
    const selectedSeasonFolder = seasonItems[activeSeasonIndex];
    const seasonPath = `${actualOpenlistPath.replace(/^\/+/, '')}/${selectedSeasonFolder.name}`;

    const payload: any = { reqPath: seasonPath };
    if (seasonRefresh > 0) payload.refresh = true;

    axios.post('/api/fs/list', payload, { headers: token ? { Authorization: token } : {} })
      .then(res => {
        if (!isMounted) return;
        const content = res.data?.data?.content || [];
        const episodes = content.filter((item: any) => !item.is_dir && isVideoFile(item.name));
        episodes.sort((a: any, b: any) => {
          const metaA = extractFileMetadata(a.name, a.size);
          const metaB = extractFileMetadata(b.name, b.size);
          if (metaA.episodeNum !== null && metaB.episodeNum !== null) {
            return metaA.episodeNum - metaB.episodeNum;
          }
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });
        setCurrentSeasonEpisodes(episodes);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoadingSeasonFiles(false);
      });

    return () => { isMounted = false; };
  }, [activeSeasonIndex, seasonItems, actualOpenlistPath, token, seasonRefresh, user]);

  const handleRefresh = () => {
    setSeasonRefresh(r => r + 1);
    setBaseRefresh(r => r + 1);
    setToast('Refreshing folder files...');
    setTimeout(() => setToast(''), 2000);
  };

  const handleRefreshRoot = () => {
    setBaseRefresh(r => r + 1);
    setSeasonRefresh(r => r + 1);
    setToast('Refreshing root directory...');
    setTimeout(() => setToast(''), 2000);
  };

  // Toggle Watchlist
  const handleToggleWatchlist = async () => {
    if (!user || user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    const nextState = !inWatchlist;
    setInWatchlist(nextState);
    try {
      await axios.post('/api/watchlist/toggle', {
        item: {
          path: actualOpenlistPath,
          name,
          tmdbData: tmdb,
          category
        }
      }, { headers: { 'x-user': user } });
      setToast(nextState ? 'Added to Watchlist' : 'Removed from Watchlist');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      setInWatchlist(!nextState);
      console.error(e);
    }
  };

  // Helper to open YouTube search fallback
  const openYouTubeTrailerSearch = () => {
    const parsed = parseMediaName(name || '');
    const title = tmdb?.title || tmdb?.name || parsed.cleanName || name || '';
    const releaseDate = tmdb?.release_date || tmdb?.first_air_date || '';
    const year = (releaseDate ? releaseDate.substring(0, 4) : '') || parsed.year || '';
    const searchQuery = [title, year, 'trailer'].filter(Boolean).join(' ');
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    
    const link = document.createElement('a');
    link.href = ytUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToast(`Opening YouTube search: "${searchQuery}"`);
    setTimeout(() => setToast(''), 3000);
  };

  // Watch Trailer Handler
  const handleWatchTrailer = async () => {
    if (!tmdb?.id) {
      openYouTubeTrailerSearch();
      return;
    }
    setLoadingTrailer(true);
    try {
      const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/videos?id=${tmdb.id}&type=${searchType}`);
      const videos = res.data?.results || [];
      const trailer = videos.find((v: any) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube') || videos.find((v: any) => v.site === 'YouTube');
      if (trailer?.key) {
        setTrailerUrl(`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`);
        setShowTrailerModal(true);
      } else {
        openYouTubeTrailerSearch();
      }
    } catch (e) {
      console.error('Error fetching trailer, opening YouTube search:', e);
      openYouTubeTrailerSearch();
    } finally {
      setLoadingTrailer(false);
    }
  };

  // Toggle Watched Status for a File
  const toggleWatched = async (itemName: string, itemPath: string) => {
    if (user === 'guest') {
      setToast('Sign up for the website plan to use this feature');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    
    const isWatched = watchedItems.some(i => i.name === itemName && i.parentPath === itemPath);
    if (isWatched) {
      setWatchedItems(prev => prev.filter(i => !(i.name === itemName && i.parentPath === itemPath)));
    } else {
      setWatchedItems(prev => [...prev, { name: itemName, parentPath: itemPath }]);
    }
    
    try {
      const res = await axios.post('/api/watched/toggle', { name: itemName, parentPath: itemPath }, { headers: { 'x-user': user } });
      if (res.data?.success) {
        queryClient.setQueryData(['watched-list', user], res.data.watched || []);
        queryClient.invalidateQueries({ queryKey: ['watched-list', user] });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Search TMDB for Metadata Correction
  const handleSearchTMDB = async () => {
    if (!searchTitle.trim()) return;
    setSearching(true);
    try {
      const searchType = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category) ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/search_all?query=${encodeURIComponent(searchTitle)}&type=${searchType}`);
      setSearchResults(res.data?.results || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  // Select TMDB Metadata Result
  const handleSelectTMDBResult = async (selected: any) => {
    try {
      const parsed = parseMediaName(name || '');
      const res = await axios.post('/api/meta/override', {
        query: parsed.cleanName,
        type: category,
        year: parsed.year,
        tmdbId: selected.id,
        path: actualOpenlistPath
      }, { headers: { Authorization: token } });
      
      const updatedData = res.data?.data || selected;
      setTmdb(updatedData);
      setShowMetadataModal(false);
      setToast('Metadata updated globally');
      setTimeout(() => setToast(''), 2000);
      localStorage.setItem('meta_version', String(Date.now()));
      clearAllLocalCaches(queryClient);
    } catch (e: any) {
      console.error(e);
      setToast('Failed to save metadata globally');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const handleSaveCustomMetadata = async () => {
    if (!customTitle.trim()) return;
    setSavingCustom(true);
    try {
      const parsed = parseMediaName(name || '');
      const res = await axios.post('/api/meta/override', {
        query: parsed.cleanName,
        type: category,
        year: parsed.year,
        customTitle: customTitle.trim(),
        customYear: customYear.trim() || undefined,
        path: actualOpenlistPath
      }, { headers: { Authorization: token } });
      
      if (res.data && res.data.data) {
        setTmdb(res.data.data);
      }
      setShowMetadataModal(false);
      setToast('Custom metadata saved');
      setTimeout(() => setToast(''), 2000);
      localStorage.setItem('meta_version', String(Date.now()));
      clearAllLocalCaches(queryClient);
    } catch (e: any) {
      console.error(e);
      setToast('Failed to save custom metadata');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSavingCustom(false);
    }
  };

  // Fetch available logos from TMDB by ID and media type
  const fetchAvailableLogos = async (targetId?: number | string, targetType?: string, targetInfo?: any) => {
    const idToUse = targetId || activeLogoTmdb?.id || tmdb?.id || tmdb?.tmdb_id;
    if (!idToUse) {
      if (tmdb?.images?.logos && Array.isArray(tmdb.images.logos)) {
        setAvailableLogos(tmdb.images.logos);
      } else {
        setAvailableLogos([]);
      }
      return;
    }

    if (targetInfo) {
      setActiveLogoTmdb(targetInfo);
    } else if (!activeLogoTmdb && tmdb) {
      setActiveLogoTmdb(tmdb);
    }

    setLoadingLogos(true);
    try {
      const isTv = targetType === 'tv' || targetInfo?.media_type === 'tv' || Boolean(targetInfo?.first_air_date) || tmdb?.media_type === 'tv' || Boolean(tmdb?.first_air_date) || ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
      const searchType = isTv ? 'tv' : 'movie';
      const res = await axios.get(`/api/meta/images?id=${idToUse}&type=${searchType}`);
      const logos = res.data?.logos || [];
      setAvailableLogos(logos);
      if (logos.length > 0 && (selectedLogoPath === null || selectedLogoPath === undefined)) {
        const best = logos.find((l: any) => l.iso_639_1 === 'en') || logos.find((l: any) => !l.iso_639_1) || logos[0];
        if (best?.file_path) {
          setSelectedLogoPath(best.file_path);
        }
      }
    } catch (err) {
      console.error('Error fetching logos:', err);
      if (tmdb?.images?.logos) {
        setAvailableLogos(tmdb.images.logos);
      }
    } finally {
      setLoadingLogos(false);
    }
  };

  // Search for logos using TMDB ID or show/movie title
  const handleSearchLogos = async (overrideQuery?: string) => {
    const query = (overrideQuery !== undefined ? overrideQuery : logoSearchQuery).trim();
    if (!query) return;

    setSearchingLogos(true);
    try {
      if (/^\d+$/.test(query)) {
        // Pure TMDB ID search
        const isTv = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
        const searchType = isTv ? 'tv' : 'movie';
        const info = { id: query, title: `TMDB ID #${query}` };
        setActiveLogoTmdb(info);
        setLogoSearchResults([]);
        await fetchAvailableLogos(query, searchType, info);
      } else {
        // Text title search
        const isTv = ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
        const searchType = isTv ? 'tv' : 'movie';
        const res = await axios.get(`/api/meta/search_all?query=${encodeURIComponent(query)}&type=${category}`);
        const results = res.data?.results || [];
        setLogoSearchResults(results);
        if (results.length > 0) {
          const topResult = results[0];
          setActiveLogoTmdb(topResult);
          const topType = topResult.media_type || (topResult.first_air_date ? 'tv' : 'movie') || searchType;
          await fetchAvailableLogos(topResult.id, topType, topResult);
        } else {
          setAvailableLogos([]);
          setActiveLogoTmdb(null);
        }
      }
    } catch (err) {
      console.error('Error searching logos:', err);
      setToast('Failed to search TMDB for logos');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setSearchingLogos(false);
    }
  };

  // Save / Override Logo Persistently
  const handleSaveLogo = async (overridePath?: string) => {
    const targetLogo = overridePath !== undefined 
      ? overridePath 
      : (customLogoInput.trim() || (selectedLogoPath !== null ? selectedLogoPath : ''));
      
    setSavingLogo(true);
    try {
      const parsed = parseMediaName(name || '');
      const tmdbIdToSave = activeLogoTmdb?.id || tmdb?.id;
      const res = await axios.post('/api/meta/override', {
        query: parsed.cleanName,
        type: category,
        year: parsed.year,
        tmdbId: tmdbIdToSave || undefined,
        customLogo: targetLogo,
        path: actualOpenlistPath,
        updateLogoOnly: true,
        currentData: tmdb // Pass current data just in case server cache is missing
      }, { headers: { Authorization: token } });

      if (res.data?.data) {
        setTmdb(res.data.data);
      } else {
        setTmdb((prev: any) => ({
          ...prev,
          custom_logo: targetLogo,
          logo_path: targetLogo,
          no_logo: targetLogo === ''
        }));
      }

      if (targetLogo) {
        setLogoUrl(targetLogo.startsWith('http') ? targetLogo : `https://image.tmdb.org/t/p/original${targetLogo}`);
      } else {
        setLogoUrl(null);
      }

      setShowMetadataModal(false);
      setToast(targetLogo ? 'Title logo updated persistently' : 'Logo removed (using text title)');
      setTimeout(() => setToast(''), 2500);
      localStorage.setItem('meta_version', String(Date.now()));
      clearAllLocalCaches(queryClient);
    } catch (err: any) {
      console.error('Error saving custom logo:', err);
      setToast('Failed to save logo override');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setSavingLogo(false);
    }
  };

  // Extract Genres
  const genreList = useMemo(() => {
    if (!tmdb) return [];
    if (Array.isArray(tmdb.genres) && tmdb.genres.length > 0) {
      return tmdb.genres.map((g: any) => typeof g === 'string' ? g : g.name).filter(Boolean);
    }
    if (Array.isArray(tmdb.genre_ids) && tmdb.genre_ids.length > 0) {
      return getGenresWithIds(tmdb.genre_ids).map(g => g.name);
    }
    return [];
  }, [tmdb]);

  // Extract Backdrop URL
  const backdropUrl = useMemo(() => {
    if (!tmdb) return '';
    if (tmdb.backdrop_path) {
      return tmdb.backdrop_path.startsWith('http')
        ? tmdb.backdrop_path
        : `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}`;
    }
    if (tmdb.poster_path) {
      return tmdb.poster_path.startsWith('http')
        ? tmdb.poster_path
        : `https://image.tmdb.org/t/p/w780${tmdb.poster_path}`;
    }
    return '';
  }, [tmdb]);

  // Extract Status Text
  const statusText = useMemo(() => {
    if (tmdb?.status) return tmdb.status;
    if (tmdb?.release_date || tmdb?.first_air_date) return 'Released';
    return 'Available';
  }, [tmdb]);

  // Extract Dominant Color from Backdrop Image
  useEffect(() => {
    let isMounted = true;
    if (backdropUrl) {
      extractDominantColor(backdropUrl)
        .then(palette => {
          if (isMounted) setColorPalette(palette);
        })
        .catch(() => {
          if (isMounted) setColorPalette(null);
        });
    } else {
      setColorPalette(null);
    }
    return () => { isMounted = false; };
  }, [backdropUrl]);

  // Batch Selection Logic
  const toggleSelectAll = () => {
    const currentList = seasonItems.length > 0 ? currentSeasonEpisodes : baseItems;
    let currentPath = seasonItems.length > 0 && activeSeasonIndex !== null
      ? `${actualOpenlistPath.replace(/^\/+/, '')}/${seasonItems[activeSeasonIndex].name}`
      : actualOpenlistPath.replace(/^\/+/, '');
      
    // Fix currentPath if actualOpenlistPath is a direct file
    if (seasonItems.length === 0) {
        const targetFilename = currentPath.split('/').pop();
        if (targetFilename && isVideoFile(targetFilename)) {
            currentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '';
        }
    }

    const allSelected = currentList.length > 0 && currentList.every(file => 
      selectedFiles.some(s => s.file.name === file.name && s.path === currentPath)
    );

    if (allSelected) {
      setSelectedFiles(prev => prev.filter(s => s.path !== currentPath));
    } else {
      setSelectedFiles(prev => {
        const newSelection = [...prev];
        currentList.forEach(file => {
          if (!newSelection.some(s => s.file.name === file.name && s.path === currentPath)) {
            newSelection.push({ file, path: currentPath });
          }
        });
        return newSelection;
      });
    }
  };

  const toggleSelection = (file: any, path: string) => {
    setSelectedFiles(prev => {
      const exists = prev.find(item => item.file.name === file.name && item.path === path);
      if (exists) {
        return prev.filter(item => !(item.file.name === file.name && item.path === path));
      } else {
        return [...prev, { file, path }];
      }
    });
  };

  const handleBatchCopy = async () => {
    if (selectedFiles.length === 0) return;
    setBatchCopyLoading(true);
    
    try {
      const links = await Promise.all(selectedFiles.map(async ({ file, path }) => {
        if (file.url) return file.url;
        const cleanPath = path.replace(/\/+$/, '');
        if (!token) {
          return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
        }
        try {
          const res = await axios.post('/api/fs/get', { reqPath: `${cleanPath}/${file.name}` }, { headers: { Authorization: token } });
          if (res.data?.data?.raw_url) return res.data.data.raw_url;
        } catch (e) {
          // ignore
        }
        return `${config.openlistUrl || ''}/d/${cleanPath}/${file.name}`;
      }));

      const targetText = links.join('\n');
      try {
        await navigator.clipboard.writeText(targetText);
      } catch (e) {
        const textArea = document.createElement("textarea");
        textArea.value = targetText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setBatchCopied(true);
      setTimeout(() => {
        setBatchCopied(false);
        setSelectedFiles([]); // clear selection after copy
      }, 2000);
    } catch (e) {
      console.error(e);
    }
    setBatchCopyLoading(false);
  };

  const formatTitleCase = (text: string) => {
    if (!text) return '';
    const isAllUpper = text === text.toUpperCase() && text !== text.toLowerCase();
    const normalized = isAllUpper ? text.toLowerCase() : text;
    return normalized.replace(/(?:^|\s|-|\/)\S/g, (c) => c.toUpperCase());
  };

  const releaseYear = (tmdb?.release_date || tmdb?.first_air_date)
    ? String(tmdb.release_date || tmdb.first_air_date).substring(0, 4)
    : (tmdb?.year || parseMediaName(name).year || '');
    
  const tmdbRating = tmdb?.vote_average ? Number(tmdb.vote_average).toFixed(1) : null;
  let tmdbCountry = tmdb?.production_countries?.[0]?.name || '';
  if (!tmdbCountry && tmdb?.origin_country?.[0]) {
    try {
      tmdbCountry = new Intl.DisplayNames(['en'], { type: 'region' }).of(tmdb.origin_country[0]) || tmdb.origin_country[0];
    } catch (e) {
      tmdbCountry = tmdb.origin_country[0];
    }
  }
      
  const metaInfoStr = [
    tmdbRating ? `⭐${tmdbRating}` : null,
    releaseYear,
    tmdbCountry
  ].filter(Boolean).join(' | ');

  if (loading) return <DetailsSkeleton />;

  return (
    <div 
      className="details-page-root -mt-16 min-h-screen text-black dark:text-white pb-24 relative overflow-hidden transition-colors duration-700 ease-out"
      style={{
        backgroundColor: 'var(--page-bg)',
        '--page-bg': colorPalette ? colorPalette.bgLight : '#fffcf9',
        '--page-bg-dark': colorPalette ? colorPalette.bgDark : '#08080a',
        '--page-glow': colorPalette ? colorPalette.glowLight : 'rgba(130,80,220,0.10)',
        '--page-glow-dark': colorPalette ? colorPalette.glowDark : 'rgba(130,80,220,0.20)',
        '--page-card': colorPalette ? colorPalette.cardLight : 'rgba(0,0,0,0.03)',
        '--page-card-dark': colorPalette ? colorPalette.cardDark : 'rgba(255,255,255,0.05)',
      } as React.CSSProperties}
    >
      {/* Dark mode overrides using inline styles and a tiny script or CSS */}
      <style>{`
        .dark .details-page-root {
          background-color: var(--page-bg-dark) !important;
        }
        .hero-gradient {
          background: linear-gradient(to top, var(--page-bg) 0%, rgba(255,255,255,0) 100%);
        }
        .dark .hero-gradient {
          background: linear-gradient(to top, var(--page-bg-dark) 0%, rgba(0,0,0,0) 100%);
        }
        .hero-glow {
          background: radial-gradient(ellipse 85% 65% at 50% 20%, var(--page-glow) 0%, transparent 80%);
        }
        .dark .hero-glow {
          background: radial-gradient(ellipse 85% 65% at 50% 20%, var(--page-glow-dark) 0%, transparent 80%);
        }
      `}</style>

      {/* Ambient Dominant Color Glow / Tint Layer */}
      {colorPalette && (
        <div 
          className="hero-glow absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] pointer-events-none z-0 blur-3xl opacity-70 dark:opacity-75 transition-opacity duration-1000"
        />
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] bg-black/90 dark:bg-white/90 text-white dark:text-black px-6 py-3 rounded-2xl shadow-2xl text-sm font-semibold backdrop-blur-md border border-white/20 dark:border-black/20"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Backdrop Banner */}
      <div 
        className="relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh] pointer-events-none"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)'
        }}
      >
        {backdropUrl && (
          <img 
            src={backdropUrl} 
            alt={tmdb?.title || tmdb?.name || name} 
            className="w-full h-full object-cover object-center sm:object-top opacity-100 dark:opacity-85 pointer-events-none transition-opacity duration-700"
          />
        )}

        {/* Contrast Overlay - ensures text readability while preserving image brightness */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent from-40% to-white/40 dark:to-black/70 transition-colors duration-700" />

        {/* 1. Standard Color Tint - Guarantees color is physically added to the pixels regardless of dark/light backdrop */}
        {colorPalette && (
          <div 
            className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-50 transition-opacity duration-700"
            style={{
              background: `linear-gradient(to bottom, transparent 60%, rgb(${colorPalette.rgb[0]}, ${colorPalette.rgb[1]}, ${colorPalette.rgb[2]}) 100%)`,
            }}
          />
        )}
        
        {/* 2. Vibrant Screen Layer (Dark Mode Only) - Prevents colors from being crushed by dark backgrounds */}
        {colorPalette && (
          <div 
            className="absolute inset-0 pointer-events-none hidden dark:block mix-blend-screen opacity-40 transition-opacity duration-700"
            style={{
              background: `linear-gradient(to bottom, transparent 60%, rgb(${colorPalette.rgb[0]}, ${colorPalette.rgb[1]}, ${colorPalette.rgb[2]}) 100%)`,
            }}
          />
        )}
        
        {/* Gradients to blend into the dynamic background seamlessly */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-10" />
      </div>

      {/* Content Section positioned below the backdrop with slight overlap */}
      <div className="relative z-20 flex flex-col items-center max-w-4xl mx-auto space-y-5 px-4 sm:px-8 -mt-24 sm:-mt-32 text-center">
        {/* Title or Logo and Subtitle Year */}
        <div className="flex flex-col items-center">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={tmdb?.title || tmdb?.name || parseMediaName(name).cleanName} 
              className="h-20 sm:h-24 md:h-32 object-contain drop-shadow-xl"
              onError={() => setLogoUrl(null)}
            />
          ) : (
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-black dark:text-white drop-shadow-xl leading-tight">
              {formatTitleCase(tmdb?.title || tmdb?.name || parseMediaName(name).cleanName)}
            </h1>
          )}

          {/* Release Year & Meta Info */}
          {metaInfoStr && (
            <span className="mt-2 text-[8.5px] sm:text-[9.5px] font-semibold text-gray-500 dark:text-gray-400 tracking-wider">
              {metaInfoStr}
            </span>
          )}
        </div>

        {/* Genres Row */}
        {genreList.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {genreList.map((genre, idx) => (
              <span 
                key={idx} 
                className="px-3.5 py-1 rounded-full bg-transparent text-gray-700 dark:text-gray-300 border border-black/20 dark:border-white/20 text-xs font-semibold tracking-wide"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            onClick={handleToggleWatchlist}
            title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
            className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer"
          >
            {inWatchlist ? (
              <BookmarkCheck size={20} className="text-purple-600 dark:text-purple-400" />
            ) : (
              <Bookmark size={20} />
            )}
          </button>

          <button
            onClick={handleWatchTrailer}
            disabled={loadingTrailer}
            title="Watch Trailer on YouTube"
            className="p-3 sm:p-3.5 rounded-xl bg-red-600/15 dark:bg-red-500/20 hover:bg-red-600/25 dark:hover:bg-red-500/30 active:scale-95 text-red-600 dark:text-red-400 backdrop-blur-md border border-red-500/30 dark:border-red-500/30 transition flex items-center justify-center shadow-lg cursor-pointer disabled:opacity-50"
          >
            {loadingTrailer ? (
              <Loader2 size={20} className="animate-spin text-red-600 dark:text-red-400" />
            ) : (
              <Youtube size={20} className="text-red-600 dark:text-red-400" />
            )}
          </button>

          {user && user !== 'guest' && (
            <button
              onClick={handleRefreshRoot}
              disabled={loadingFiles}
              title="Refresh Root Directory"
              className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={20} className={loadingFiles ? "animate-spin text-purple-600 dark:text-purple-400" : ""} />
            </button>
          )}

          <button
            onClick={() => {
              const curTitle = tmdb?.title || tmdb?.name || parseMediaName(name).cleanName || '';
              setSearchTitle(curTitle);
              setCustomTitle(curTitle);
              setLogoSearchQuery(curTitle);
              setLogoSearchResults([]);
              setActiveLogoTmdb(tmdb || null);
              const releaseDate = tmdb?.release_date || tmdb?.first_air_date || '';
              setCustomYear((releaseDate || '').substring(0, 4) || parseMediaName(name).year || '');
              setModalTab('info');
              if (tmdb?.no_logo) {
                setSelectedLogoPath('');
              } else if (tmdb?.custom_logo || tmdb?.logo_path) {
                setSelectedLogoPath(tmdb.custom_logo || tmdb.logo_path);
              } else if (logoUrl) {
                const match = logoUrl.match(/https:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)(\/.*)/);
                setSelectedLogoPath(match ? match[1] : logoUrl);
              } else {
                setSelectedLogoPath(null);
              }
              setCustomLogoInput('');
              setShowMetadataModal(true);
            }}
            title="Fix Metadata & Logo"
            className="p-3 sm:p-3.5 rounded-xl bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 active:scale-95 text-black dark:text-white backdrop-blur-md border border-black/10 dark:border-white/15 transition flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Edit2 size={20} />
          </button>
        </div>

        {/* Plot / Overview Text */}
        <div className="w-full max-w-2xl text-center pt-2 pb-4 flex flex-col items-center">
          <p className={`text-gray-800 dark:text-gray-200 text-sm md:text-base leading-relaxed font-medium transition-all ${
            isPlotExpanded ? '' : 'line-clamp-3'
          }`}>
            {tmdb?.overview || 'No overview available for this title.'}
          </p>
          {(tmdb?.overview?.length > 150) && (
            <button
              onClick={() => setIsPlotExpanded(!isPlotExpanded)}
              className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-2 transition cursor-pointer"
            >
              {isPlotExpanded ? 'Show Less' : 'Read More'}
            </button>
          )}
        </div>
      </div>

      {/* Main Files / Playable Media Section (NO Cast & Crew) */}
      <div className="px-4 sm:px-8 md:px-12 max-w-7xl mx-auto py-6 relative z-20 space-y-6">
        {user === 'guest' ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-center max-w-xl mx-auto shadow-xl backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-purple-600/15 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center mb-5 border border-purple-500/20 shadow-inner">
              <Lock size={30} />
            </div>
            <h3 className="text-xl font-extrabold text-black dark:text-white mb-2 tracking-tight">
              Sign in to view media files
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed max-w-md mx-auto">
              Guest preview mode is active. Please log in with your account to access episode listings, stream high-definition video, and download files.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                state={{ from: location.pathname }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <LogIn size={18} />
                <span>Log In to View Files</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Season Selector Tabs (For TV Series) */}
            {seasonItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
              <Tv size={20} className="text-purple-600 dark:text-purple-400" />
              <span>Seasons</span>
            </h2>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
              {seasonItems.map((season, idx) => {
                const isActive = activeSeasonIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveSeasonIndex(idx)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
                      isActive 
                        ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/20' 
                        : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <Folder size={14} />
                    <span>{season.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Media Files List Header */}
        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
          <h2 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
            <Film size={20} className="text-purple-600 dark:text-purple-400" />
            <span>Available Files & Playback</span>
          </h2>
          <div className="flex items-center gap-3">
            {selectedFiles.length > 0 && (
              <button
                onClick={handleBatchCopy}
                disabled={batchCopyLoading}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {batchCopyLoading ? <Loader2 size={14} className="animate-spin" /> : batchCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>Copy {selectedFiles.length} {selectedFiles.length === 1 ? 'Link' : 'Links'}</span>
              </button>
            )}
            {seasonItems.length === 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {baseItems.length} {baseItems.length === 1 ? 'file' : 'files'}
              </span>
            )}
          </div>
        </div>

        {/* Files Display */}
        {loadingFiles || loadingSeasonFiles ? (
          <div className="flex items-center justify-center py-12 text-gray-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-sm font-medium">Loading media files...</span>
          </div>
        ) : (
          <div>
            {/* Select All & Refresh Toggle */}
            {((seasonItems.length > 0 && currentSeasonEpisodes.length > 0) || (seasonItems.length === 0 && baseItems.length > 0)) && (
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleSelectAll} 
                    className={`shrink-0 p-1 rounded transition cursor-pointer flex items-center justify-center ${
                      (seasonItems.length > 0 ? currentSeasonEpisodes : baseItems).every(f => 
                        selectedFiles.some(s => s.file.name === f.name)
                      ) ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                    title="Select All"
                  >
                    {(seasonItems.length > 0 ? currentSeasonEpisodes : baseItems).every(f => 
                      selectedFiles.some(s => s.file.name === f.name)
                    ) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" onClick={toggleSelectAll}>Select All</span>
                </div>

                <button 
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition text-sm font-semibold cursor-pointer"
                  title="Refresh folder contents"
                >
                  <RefreshCw size={14} className={loadingFiles || loadingSeasonFiles ? "animate-spin text-purple-600" : "text-gray-600 dark:text-gray-300"} />
                  <span className="hidden sm:inline text-gray-700 dark:text-gray-300">Refresh</span>
                </button>
              </div>
            )}
            
            {/* Show Season Episodes if TV series, or Base Files if Movie / single folder */}
            {seasonItems.length > 0 ? (
              currentSeasonEpisodes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {currentSeasonEpisodes.map((file, idx) => {
                    const selectedSeasonFolder = seasonItems[activeSeasonIndex || 0];
                    const itemPath = `${actualOpenlistPath.replace(/^\/+/, '')}/${selectedSeasonFolder.name}`;
                    const meta = extractFileMetadata(file.name, file.size);
                    if (meta.seasonNum === null) {
                        const folderSeason = getFolderSeasonNum(selectedSeasonFolder.name);
                        if (folderSeason !== null) {
                            meta.seasonNum = folderSeason;
                        }
                    }
                    const isWatched = watchedItems.some(i => i.name === file.name && i.parentPath === itemPath);
                    const isSelected = selectedFiles.some(i => i.file.name === file.name && i.path === itemPath);
                    const tmdbEpisode = (meta.seasonNum !== null ? tmdbSeasonsData[meta.seasonNum] : null)?.episodes?.find((ep: any) => ep.episode_number === meta.episodeNum);

                    return (
                      <FileRowItem 
                        key={idx}
                        file={file}
                        itemPath={itemPath}
                        meta={meta}
                        isWatched={isWatched}
                        toggleWatched={toggleWatched}
                        setIntentModalData={setIntentModalData}
                        token={token}
                        config={config}
                        isSelected={isSelected}
                        toggleSelection={() => toggleSelection(file, itemPath)}
                        tmdbEpisode={tmdbEpisode}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No playable media files found in this season.
                </div>
              )
            ) : baseItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {baseItems.map((file, idx) => {
                  let itemPath = actualOpenlistPath.replace(/^\/+/, '');
                  const targetFilename = itemPath.split('/').pop();
                  if (targetFilename && isVideoFile(targetFilename)) {
                      itemPath = itemPath.substring(0, itemPath.lastIndexOf('/')) || '';
                  }
                  const meta = extractFileMetadata(file.name, file.size);
                  if (meta.seasonNum === null) {
                      const folderSeason = getFolderSeasonNum(actualOpenlistPath.split('/').pop() || '');
                      if (folderSeason !== null) {
                          meta.seasonNum = folderSeason;
                      }
                  }
                  const isWatched = watchedItems.some(i => i.name === file.name && i.parentPath === itemPath);
                  const isSelected = selectedFiles.some(i => i.file.name === file.name && i.path === itemPath);
                  const tmdbEpisode = (meta.seasonNum !== null ? tmdbSeasonsData[meta.seasonNum] : null)?.episodes?.find((ep: any) => ep.episode_number === meta.episodeNum);

                  return (
                    <FileRowItem 
                      key={idx}
                      file={file}
                      itemPath={itemPath}
                      meta={meta}
                      isWatched={isWatched}
                      toggleWatched={toggleWatched}
                      setIntentModalData={setIntentModalData}
                      token={token}
                      config={config}
                      isSelected={isSelected}
                      toggleSelection={() => toggleSelection(file, itemPath)}
                      tmdbEpisode={tmdbEpisode}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center">
                <span className="text-gray-500 text-sm">
                  {tmdb?.release_date || tmdb?.first_air_date 
                    ? `Digital Release: ${new Date(tmdb.release_date || tmdb.first_air_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                    : 'No playable media files found in this folder.'}
                </span>
                {user === 'admin' && (
                  <button
                    onClick={() => {
                      const newPath = prompt('Enter the Openlist path for this title:', actualOpenlistPath);
                      if (newPath !== null && tmdb?.id) {
                        axios.post('/api/meta/digital-path', { tmdbId: tmdb.id, path: newPath }, { headers: { Authorization: token } })
                          .then(() => {
                            setActualPathOverride(newPath);
                          })
                          .catch(e => alert('Failed to update path: ' + e.message));
                      }
                    }}
                    className="mt-4 px-4 py-2 bg-black/10 dark:bg-white/10 rounded-xl hover:bg-black/20 dark:hover:bg-white/20 transition text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 size={16} />
                    <span>Edit Openlist Path</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Trailer Modal */}
      <AnimatePresence>
        {showTrailerModal && trailerUrl && (
          <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-black rounded-2xl overflow-hidden max-w-4xl w-full aspect-video relative shadow-2xl border border-white/10"
            >
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <a 
                  href={trailerUrl.replace('/embed/', '/watch?v=').replace('?autoplay=1&rel=0', '')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-white bg-black/60 hover:bg-[#FF0000] rounded-full backdrop-blur-md transition cursor-pointer flex items-center justify-center shadow-lg"
                  title="Open on YouTube"
                >
                  <Youtube size={20} />
                </a>
                <button 
                  onClick={() => setShowTrailerModal(false)}
                  className="p-2 text-white bg-black/60 hover:bg-black rounded-full backdrop-blur-md transition cursor-pointer flex items-center justify-center"
                  title="Close Trailer"
                >
                  <X size={20} />
                </button>
              </div>
              <iframe 
                src={trailerUrl} 
                title="Trailer" 
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Intent Player Selection Modal */}
      <AnimatePresence>
        {intentModalData && (
          <IntentPlayerModal 
            item={intentModalData.item}
            itemPath={intentModalData.path}
            token={token}
            config={config}
            onClose={() => setIntentModalData(null)}
            onPlayWeb={(url) => setPlayingUrl(url)}
            onExternalPlay={() => {
              const isWatched = watchedItems.some(i => i.name === intentModalData.item.name && i.parentPath === intentModalData.path);
              if (!isWatched) {
                toggleWatched(intentModalData.item.name, intentModalData.path);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* In-Browser Video Player Component */}
      <AnimatePresence>
        {playingUrl && (
          <VideoPlayer 
            src={playingUrl} 
            title={name} 
            onClose={() => setPlayingUrl('')} 
          />
        )}
      </AnimatePresence>

      {/* Metadata Correction & Logo Fix Modal */}
      <AnimatePresence>
        {showMetadataModal && (
          <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowMetadataModal(false)}>
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#fffcf9] dark:bg-[#121218] border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl relative space-y-4 my-auto overflow-hidden box-border"
            >
              <button 
                onClick={() => setShowMetadataModal(false)} 
                className="absolute top-3.5 right-3.5 p-2 text-gray-500 hover:text-black dark:hover:text-white rounded-full bg-black/5 dark:bg-white/5 transition cursor-pointer z-10"
              >
                <X size={18} />
              </button>

              <div className="flex items-center justify-between pr-8 min-w-0">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    {modalTab === 'info' ? <Edit2 size={16} /> : <ImageIcon size={16} />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-black dark:text-white truncate">
                      {modalTab === 'info' ? 'Fix Metadata' : 'Fix Title Logo'}
                    </h3>
                    <p className="text-[11px] text-gray-500 truncate">
                      {modalTab === 'info' ? 'Search TMDB or specify custom media info' : 'Select or override the title logo from TMDB'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setModalTab('info')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    modalTab === 'info'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <Edit2 size={14} />
                  <span>Metadata Info</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const curTitle = tmdb?.title || tmdb?.name || parseMediaName(name).cleanName || '';
                    setModalTab('logo');
                    setLogoSearchQuery(curTitle);
                    if (tmdb?.id) {
                      setActiveLogoTmdb(tmdb);
                      const isTv = tmdb.media_type === 'tv' || Boolean(tmdb.first_air_date) || ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
                      fetchAvailableLogos(tmdb.id, isTv ? 'tv' : 'movie', tmdb);
                    }
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    modalTab === 'logo'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <ImageIcon size={14} />
                  <span>Fix Logo</span>
                  {logoUrl && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  )}
                </button>
              </div>

              {/* TAB 1: METADATA INFO */}
              {modalTab === 'info' && (
                <div className="space-y-4 w-full min-w-0">
                  {/* Openlist Path Display */}
                  {actualOpenlistPath && (
                    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Folder size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Openlist Path</div>
                          <div 
                            className="text-xs font-mono text-black dark:text-white truncate select-all" 
                            title={actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`}
                          >
                            {actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`}
                          </div>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          const p = actualOpenlistPath.startsWith('/') ? actualOpenlistPath : `/${actualOpenlistPath}`;
                          navigator.clipboard.writeText(p);
                          setCopiedModalPath(true);
                          setTimeout(() => setCopiedModalPath(false), 2000);
                        }}
                        title="Copy Openlist Path"
                        className="p-1.5 rounded-lg bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition shrink-0 cursor-pointer"
                      >
                        {copiedModalPath ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  )}

                  <div className="w-full min-w-0">
                    <label className="block text-gray-600 dark:text-gray-400 mb-1.5 text-[10px] font-bold uppercase tracking-wider">Search TMDB</label>
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <input 
                        type="text"
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchTMDB()}
                        placeholder="Search title..."
                        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                      />
                      <button 
                        onClick={handleSearchTMDB}
                        disabled={searching}
                        title="Search"
                        className="w-10 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      </button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar w-full min-w-0">
                      {searchResults.map((result, idx) => (
                        <div 
                          key={idx}
                          onClick={() => handleSelectTMDBResult(result)}
                          className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-purple-600/10 border border-black/10 dark:border-white/10 hover:border-purple-500/40 cursor-pointer transition flex items-center gap-3 w-full min-w-0"
                        >
                          {result.poster_path && (
                            <img 
                              src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} 
                              alt={result.title || result.name} 
                              className="w-10 h-14 object-cover rounded-lg shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-black dark:text-white truncate">
                              {result.title || result.name}
                            </h4>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">
                              {result.release_date || result.first_air_date || 'N/A'} • {result.media_type || category}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="pt-2 border-t border-black/10 dark:border-white/10 w-full min-w-0">
                    <label className="block text-gray-600 dark:text-gray-400 mb-2 text-[10px] font-bold uppercase tracking-wider">Or Set Custom Metadata</label>
                    <div className="flex flex-col sm:flex-row gap-2 mb-2 w-full min-w-0">
                      <input 
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="Custom Title..."
                        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                      />
                      <input 
                        type="text"
                        value={customYear}
                        onChange={(e) => setCustomYear(e.target.value)}
                        placeholder="Year"
                        className="w-full sm:w-28 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-purple-500 text-black dark:text-white"
                      />
                    </div>
                    <button 
                      onClick={handleSaveCustomMetadata}
                      disabled={savingCustom || !customTitle.trim()}
                      className="w-full px-4 py-2.5 rounded-xl bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-black dark:text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {savingCustom ? <Loader2 size={16} className="animate-spin" /> : <Edit2 size={16} />}
                      Save Custom Metadata
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: FIX LOGO */}
              {modalTab === 'logo' && (
                <div className="space-y-3.5 w-full min-w-0">
                  {/* Search Bar for Logos by TMDB ID or Title */}
                  <div className="w-full min-w-0 space-y-1.5">
                    <label className="block text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                      Search Logo via TMDB ID or Title
                    </label>
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <input
                        type="text"
                        value={logoSearchQuery}
                        onChange={(e) => setLogoSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchLogos()}
                        placeholder="Search TMDB ID (e.g. 550) or show/movie title..."
                        className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:border-purple-500 text-black dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSearchLogos()}
                        disabled={searchingLogos || !logoSearchQuery.trim()}
                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                      >
                        {searchingLogos ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        <span>Search</span>
                      </button>
                    </div>
                  </div>

                  {/* Multiple Search Candidates Picker (if searching by title returned multiple matches) */}
                  {logoSearchResults.length > 1 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        Matched Titles ({logoSearchResults.length})
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar">
                        {logoSearchResults.map((resItem: any, rIdx: number) => {
                          const isCurrentActive = String(activeLogoTmdb?.id) === String(resItem.id);
                          return (
                            <button
                              key={rIdx}
                              type="button"
                              onClick={() => {
                                setActiveLogoTmdb(resItem);
                                const isTv = resItem.media_type === 'tv' || Boolean(resItem.first_air_date) || ['SERIES', 'KDRAMA', 'ADRAMA', 'ANIME'].includes(category);
                                fetchAvailableLogos(resItem.id, isTv ? 'tv' : 'movie', resItem);
                              }}
                              className={`flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border text-left shrink-0 transition cursor-pointer ${
                                isCurrentActive
                                  ? 'bg-purple-600/15 border-purple-500 text-purple-600 dark:text-purple-400 font-bold'
                                  : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {resItem.poster_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${resItem.poster_path}`}
                                  alt=""
                                  className="w-6 h-8 object-cover rounded-md"
                                />
                              ) : (
                                <div className="w-6 h-8 rounded-md bg-purple-600/20 flex items-center justify-center text-[9px] font-bold">
                                  TMDB
                                </div>
                              )}
                              <div className="min-w-0 max-w-[140px]">
                                <div className="text-[11px] truncate font-medium">{resItem.title || resItem.name}</div>
                                <div className="text-[9px] text-gray-500 flex items-center gap-1">
                                  <span>{(resItem.release_date || resItem.first_air_date || '').substring(0, 4)}</span>
                                  <span>•</span>
                                  <span className="font-mono">#{resItem.id}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Selected Logo Preview Banner */}
                  <div className="bg-black/90 dark:bg-black border border-black/10 dark:border-white/15 rounded-xl p-3 flex flex-col items-center justify-center min-h-[84px] relative overflow-hidden">
                    <span className="absolute top-2 left-2.5 text-[9px] uppercase tracking-wider font-bold text-gray-400">
                      Selected Logo Preview
                    </span>
                    {activeLogoTmdb?.id && (
                      <span className="absolute top-2 right-2.5 text-[9px] font-mono text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/30">
                        TMDB #{activeLogoTmdb.id}
                      </span>
                    )}
                    {selectedLogoPath ? (
                      <img
                        src={selectedLogoPath.startsWith('http') ? selectedLogoPath : `https://image.tmdb.org/t/p/w500${selectedLogoPath}`}
                        alt="Logo Preview"
                        className="max-h-12 max-w-[85%] object-contain filter drop-shadow-md mt-3"
                      />
                    ) : selectedLogoPath === '' ? (
                      <div className="text-xs font-medium text-gray-400 mt-4 flex items-center gap-1.5">
                        <Type size={14} className="text-purple-400" />
                        <span>Text Title Mode (No Logo)</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 mt-4">No logo selected</div>
                    )}
                  </div>

                  {/* TMDB Available Logos (Scrollable) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span>Available TMDB Logos</span>
                        {availableLogos.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-600/20 text-purple-600 dark:text-purple-400 text-[10px] font-mono">
                            {availableLogos.length}
                          </span>
                        )}
                        {activeLogoTmdb && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[150px] font-normal">
                            ({activeLogoTmdb.title || activeLogoTmdb.name || `ID ${activeLogoTmdb.id}`})
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => fetchAvailableLogos(activeLogoTmdb?.id || tmdb?.id)}
                        disabled={loadingLogos}
                        className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={loadingLogos ? "animate-spin" : ""} />
                        <span>Reload</span>
                      </button>
                    </div>

                    {loadingLogos ? (
                      <div className="p-6 flex flex-col items-center justify-center gap-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 text-gray-500">
                        <Loader2 size={20} className="animate-spin text-purple-600 dark:text-purple-400" />
                        <span className="text-xs">Fetching official logos from TMDB...</span>
                      </div>
                    ) : availableLogos.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 custom-scrollbar">
                        {availableLogos.map((logo, idx) => {
                          const isSelected = selectedLogoPath === logo.file_path;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedLogoPath(logo.file_path);
                                setCustomLogoInput('');
                              }}
                              className={`relative aspect-[16/9] rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer transition border bg-black/90 hover:bg-black group ${
                                isSelected
                                  ? 'border-purple-500 ring-2 ring-purple-500/50 shadow-md'
                                  : 'border-white/10 hover:border-white/30'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center shadow z-10">
                                  <Check size={10} strokeWidth={3} />
                                </div>
                              )}
                              <img
                                src={`https://image.tmdb.org/t/p/w300${logo.file_path}`}
                                alt="TMDB Logo"
                                className="max-h-9 max-w-full object-contain filter drop-shadow group-hover:scale-105 transition"
                              />
                              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between text-[8px] text-gray-400 px-0.5 pointer-events-none">
                                <span className="uppercase font-mono font-bold bg-white/15 px-1 rounded text-[7px] text-gray-200">
                                  {logo.iso_639_1 ? logo.iso_639_1 : 'ALL'}
                                </span>
                                {logo.width && logo.height && (
                                  <span className="opacity-70 font-mono text-[7px]">
                                    {logo.width}x{logo.height}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-center bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 space-y-1">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No logos found on TMDB</p>
                        <p className="text-[11px] text-gray-500">
                          Search by TMDB ID or title using the search bar above, or provide a custom logo image URL below.
                        </p>
                      </div>
                    )}

                    {/* Remove Logo / Text Mode Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLogoPath('');
                        setCustomLogoInput('');
                      }}
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                        selectedLogoPath === ''
                          ? 'bg-purple-600/10 border-purple-500 text-purple-600 dark:text-purple-400'
                          : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Type size={14} />
                        <span>Use Plain Text Title (Remove Logo)</span>
                      </div>
                      {selectedLogoPath === '' && <Check size={14} className="text-purple-600 dark:text-purple-400" />}
                    </button>
                  </div>

                  {/* Custom Logo URL Input */}
                  <div className="pt-2 border-t border-black/10 dark:border-white/10 space-y-1.5">
                    <label className="block text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                      Or Custom Logo URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customLogoInput}
                        onChange={(e) => {
                          setCustomLogoInput(e.target.value);
                          if (e.target.value.trim()) {
                            setSelectedLogoPath(e.target.value.trim());
                          }
                        }}
                        placeholder="https://example.com/logo.png"
                        className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:border-purple-500 text-black dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Apply Logo Button */}
                  <button
                    type="button"
                    onClick={() => handleSaveLogo()}
                    disabled={savingLogo}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {savingLogo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    <span>Apply & Save Logo Persistently</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
