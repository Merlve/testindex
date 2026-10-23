import React, { useState, useEffect } from 'react';
import { X, Archive, Folder, Download, Loader2, CheckCircle2, ShieldCheck, FolderArchive, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { formatBytes, formatSeasonDisplayName } from '../utils/nameParser';
import type { BackdropColorPalette } from '../utils/colorExtractor';
import { useIsDarkMode } from '../utils/colorExtractor';

interface ZipDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  title: string;
  showFolderPath: string;
  seasonItems: Array<{ name: string; is_dir?: boolean }>;
  token: string | null;
  user: string | null;
  colorPalette?: BackdropColorPalette | null;
}

interface DirectoryOption {
  id: string;
  name: string;
  zipFilename: string;
  path: string;
  openlistPath: string;
  isEntireFolder?: boolean;
  description?: string;
}

interface SizeInfo {
  size: number;
  fileCount: number;
  loading: boolean;
}

export default function ZipDownloadModal({
  isOpen,
  onClose,
  category,
  title,
  showFolderPath,
  seasonItems,
  token,
  user,
  colorPalette
}: ZipDownloadModalProps) {
  const isDarkMode = useIsDarkMode();
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dirSizes, setDirSizes] = useState<Record<string, SizeInfo>>({});

  if (!isOpen) return null;

  // Clean base path without leading /home or home/
  // e.g. /home/ANIME/365.Days.to.the.Wedding.2024 -> ANIME/365.Days.to.the.Wedding.2024
  let cleanBasePath = (showFolderPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  try {
    while (cleanBasePath.includes('%')) {
      const decoded = decodeURIComponent(cleanBasePath);
      if (decoded === cleanBasePath) break;
      cleanBasePath = decoded;
    }
  } catch (e) {}

  if (cleanBasePath.toLowerCase().startsWith('home/')) {
    cleanBasePath = cleanBasePath.substring(5);
  } else if (cleanBasePath.toLowerCase() === 'home') {
    cleanBasePath = '';
  }
  cleanBasePath = cleanBasePath.replace(/^\/+/, '').replace(/\/+$/, '');

  const showFolderName = cleanBasePath.split('/').filter(Boolean).pop() || title || 'Series';

  // OpenList full path starting with /home
  const openlistBase = '/' + (showFolderPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const cleanOpenlistBase = openlistBase.toLowerCase().startsWith('/home') ? openlistBase : `/home${openlistBase}`;

  // Build the list of available directories to download
  const directories: DirectoryOption[] = [];

  // 1. Season / Sub-directory folders
  if (seasonItems && seasonItems.length > 0) {
    seasonItems.forEach((season) => {
      let folderName = season.name;
      try {
        if (folderName.includes('%')) folderName = decodeURIComponent(folderName);
      } catch (e) {}
      const fullWebdavPath = `${cleanBasePath}/${folderName}`;
      const fullOpenlistPath = `${cleanOpenlistBase}/${folderName}`;
      directories.push({
        id: `season-${folderName}`,
        name: formatSeasonDisplayName(folderName) || folderName,
        zipFilename: `${folderName}.zip`,
        path: fullWebdavPath,
        openlistPath: fullOpenlistPath,
        description: `Season folder archive`
      });
    });

    // Also include the entire show folder - with concise mobile-friendly label
    directories.push({
      id: 'entire-show',
      name: `All Folders (Complete Series)`,
      zipFilename: `${showFolderName}.zip`,
      path: cleanBasePath,
      openlistPath: cleanOpenlistBase,
      isEntireFolder: true,
      description: `Complete title archive including all seasons`
    });
  } else {
    // Single folder
    directories.push({
      id: 'root-show',
      name: showFolderName || 'Complete Directory',
      zipFilename: `${showFolderName}.zip`,
      path: cleanBasePath,
      openlistPath: cleanOpenlistBase,
      isEntireFolder: true,
      description: `Complete title directory archive`
    });
  }

  // Calculate sizes for each subdirectory
  useEffect(() => {
    let isMounted = true;

    directories.forEach(async (dir) => {
      if (dir.isEntireFolder && seasonItems && seasonItems.length > 0) {
        return; // Derived from season directories
      }

      try {
        const res = await axios.post(
          '/api/fs/list',
          { reqPath: dir.openlistPath },
          { headers: token ? { Authorization: token } : {} }
        );
        if (!isMounted) return;

        const content = res.data?.data?.content || [];
        const files = Array.isArray(content) ? content.filter((item: any) => !item.is_dir) : [];
        const totalSize = files.reduce((acc: number, f: any) => acc + (Number(f.size) || 0), 0);

        setDirSizes((prev) => ({
          ...prev,
          [dir.id]: { size: totalSize, fileCount: files.length, loading: false }
        }));
      } catch (e) {
        if (!isMounted) return;
        setDirSizes((prev) => ({
          ...prev,
          [dir.id]: { size: 0, fileCount: 0, loading: false }
        }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, showFolderPath, token]);

  // Compute entire show size from individual season folder tallies
  const allSeasonsLoaded =
    seasonItems &&
    seasonItems.length > 0 &&
    seasonItems.every((s) => dirSizes[`season-${s.name}`] && !dirSizes[`season-${s.name}`].loading);

  const entireShowTotalSize = allSeasonsLoaded
    ? seasonItems.reduce((acc, s) => acc + (dirSizes[`season-${s.name}`]?.size || 0), 0)
    : undefined;

  const entireShowTotalFiles = allSeasonsLoaded
    ? seasonItems.reduce((acc, s) => acc + (dirSizes[`season-${s.name}`]?.fileCount || 0), 0)
    : undefined;

  const handleDownload = (dir: DirectoryOption) => {
    if (!token || user === 'guest') {
      alert('Please log in with your account to download folders as ZIP.');
      return;
    }

    setDownloadingPath(dir.path);
    setSuccessMsg(`Preparing ${dir.zipFilename} download...`);

    const safeZipName = encodeURIComponent(dir.zipFilename)
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/'/g, '%27');

    // Build the authenticated server-side proxy route with filename in path:
    const downloadUrl = `/api/webdav/download-zip/${safeZipName}?path=${encodeURIComponent(dir.path)}&token=${encodeURIComponent(token)}`;

    // Trigger browser native download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', dir.zipFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setSuccessMsg(`Download initiated for ${dir.zipFilename}! Check your browser downloads.`);
      setTimeout(() => {
        setDownloadingPath(null);
        setSuccessMsg(null);
      }, 3500);
    }, 1500);
  };

  const handleCopyLink = async (dir: DirectoryOption) => {
    if (!token || user === 'guest') {
      alert('Please log in with your account to copy the download link.');
      return;
    }

    const safeZipName = encodeURIComponent(dir.zipFilename)
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/'/g, '%27');

    const downloadUrl = `${window.location.origin}/api/webdav/download-zip/${safeZipName}?path=${encodeURIComponent(dir.path)}&token=${encodeURIComponent(token)}`;

    try {
      await navigator.clipboard.writeText(downloadUrl);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = downloadUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    setCopiedPath(dir.path);
    setSuccessMsg(`Download link for ${dir.zipFilename} copied! Ready for downloader app.`);
    setTimeout(() => {
      setCopiedPath(null);
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    }, 2000);
  };

  // Helper to format button label without overflowing narrow screens
  const getButtonLabel = (dir: DirectoryOption) => {
    if (dir.isEntireFolder) {
      return 'Download ZIP';
    }
    // For short season filenames like S01.zip, keep the exact zip name
    if (dir.zipFilename.length <= 12) {
      return dir.zipFilename;
    }
    return 'Download ZIP';
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="zip-download-modal-card rounded-2xl sm:rounded-3xl p-4 sm:p-7 w-full max-w-xl shadow-2xl overflow-hidden relative border transition-colors duration-300"
          style={{
            backgroundColor: 'var(--details-bg, #0b0e14)',
            color: 'var(--details-text-primary, #ffffff)',
            borderColor: 'var(--details-border, rgba(255, 255, 255, 0.15))',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 45px var(--details-glow, rgba(130, 80, 220, 0.20))',
            ...(colorPalette ? {
              '--details-bg': isDarkMode ? colorPalette.darkBlendBg : colorPalette.rawBg,
              '--details-text-primary': isDarkMode ? colorPalette.darkTextPrimary : colorPalette.lightTextPrimary,
              '--details-text-secondary': isDarkMode ? colorPalette.darkTextSecondary : colorPalette.lightTextSecondary,
              '--details-text-muted': isDarkMode ? colorPalette.darkTextMuted : colorPalette.lightTextMuted,
              '--details-surface': isDarkMode ? colorPalette.darkSurface : colorPalette.lightSurface,
              '--details-surface-hover': isDarkMode ? colorPalette.darkSurfaceHover : colorPalette.lightSurfaceHover,
              '--details-border': isDarkMode ? colorPalette.darkBorder : colorPalette.lightBorder,
              '--details-badge-bg': isDarkMode ? colorPalette.darkBadgeBg : colorPalette.lightBadgeBg,
              '--details-badge-border': isDarkMode ? colorPalette.darkBadgeBorder : colorPalette.lightBadgeBorder,
              '--details-glow': isDarkMode ? colorPalette.darkGlow : colorPalette.lightGlow,
              '--details-accent': isDarkMode ? colorPalette.darkAccent : colorPalette.lightAccent,
            } : {})
          } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Complete Theme Isolation for Modal */}
          <style>{`
            .zip-download-modal-card {
              background-color: var(--details-bg, #0b0e14) !important;
              color: var(--details-text-primary, #ffffff) !important;
            }
          `}</style>

          {/* Header */}
          <div 
            className="flex items-start justify-between gap-3 pb-3.5 border-b"
            style={{ borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border"
                style={{
                  backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.08))',
                  borderColor: 'var(--details-accent, #9333ea)',
                  borderWidth: '1.5px',
                  color: 'var(--details-accent, #9333ea)'
                }}
              >
                <Archive size={20} className="stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h3 
                  className="text-base sm:text-xl font-bold tracking-tight flex items-center gap-2 flex-wrap"
                  style={{ color: 'var(--details-text-primary, #ffffff)' }}
                >
                  <span>Download Folder as ZIP</span>
                  <span 
                    className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase border"
                    style={{
                      backgroundColor: 'var(--details-badge-bg, rgba(255, 255, 255, 0.08))',
                      borderColor: 'var(--details-badge-border, rgba(255, 255, 255, 0.15))',
                      color: 'var(--details-accent, #a855f7)'
                    }}
                  >
                    {category}
                  </span>
                </h3>
                <p 
                  className="text-xs truncate max-w-xs sm:max-w-md mt-0.5" 
                  title={title}
                  style={{ color: 'var(--details-text-secondary, rgba(255, 255, 255, 0.70))' }}
                >
                  {title}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl transition cursor-pointer shrink-0 border"
              style={{
                backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.06))',
                borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))',
                color: 'var(--details-text-secondary, rgba(255, 255, 255, 0.70))'
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Info Banner */}
          <div 
            className="my-3.5 p-3 rounded-xl flex items-center gap-2.5 text-xs font-semibold border"
            style={{
              backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.06))',
              borderColor: 'var(--details-border, rgba(255, 255, 255, 0.14))',
              color: 'var(--details-text-primary, #ffffff)'
            }}
          >
            <ShieldCheck size={16} className="shrink-0" style={{ color: 'var(--details-accent, #a855f7)' }} />
            <span className="text-xs sm:text-sm">Zip Generator</span>
          </div>

          {/* Success Toast */}
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-3.5 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                color: '#34d399'
              }}
            >
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </motion.div>
          )}

          {/* Available Directories List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            <div 
              className="text-xs font-bold uppercase tracking-wider px-1"
              style={{ color: 'var(--details-text-muted, rgba(255, 255, 255, 0.50))' }}
            >
              Available Directories ({directories.length})
            </div>

            {directories.map((dir) => {
              const isCurrentDownloading = downloadingPath === dir.path;
              const isCopied = copiedPath === dir.path;

              const sizeInfo =
                dir.isEntireFolder && seasonItems && seasonItems.length > 0
                  ? entireShowTotalSize !== undefined
                    ? { size: entireShowTotalSize, fileCount: entireShowTotalFiles || 0, loading: false }
                    : undefined
                  : dirSizes[dir.id];

              return (
                <div
                  key={dir.id}
                  className="p-3 sm:p-3.5 rounded-2xl border transition flex items-center justify-between gap-2.5 sm:gap-3 overflow-hidden group"
                  style={{
                    backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.06))',
                    borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))'
                  }}
                >
                  {/* Left Side: Icon & Details */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 overflow-hidden">
                    <div 
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                      style={
                        dir.isEntireFolder
                          ? {
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              borderColor: 'rgba(245, 158, 11, 0.35)',
                              color: '#f59e0b',
                            }
                          : {
                              backgroundColor: 'var(--details-badge-bg, rgba(255, 255, 255, 0.08))',
                              borderColor: 'var(--details-accent, #a855f7)',
                              borderWidth: '1.5px',
                              color: 'var(--details-accent, #a855f7)',
                            }
                      }
                    >
                      {dir.isEntireFolder ? <FolderArchive size={18} /> : <Folder size={18} />}
                    </div>

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div 
                        className="text-xs sm:text-sm font-bold truncate" 
                        title={dir.name}
                        style={{ color: 'var(--details-text-primary, #ffffff)' }}
                      >
                        {dir.name}
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] mt-0.5 flex-wrap">
                        {sizeInfo ? (
                          <>
                            <span 
                              className="font-semibold px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap border"
                              style={{
                                backgroundColor: 'var(--details-badge-bg, rgba(255, 255, 255, 0.08))',
                                borderColor: 'var(--details-badge-border, rgba(255, 255, 255, 0.15))',
                                color: 'var(--details-accent, #a855f7)'
                              }}
                            >
                              {formatBytes(sizeInfo.size)}
                            </span>
                            <span style={{ color: 'var(--details-text-muted, rgba(255, 255, 255, 0.40))' }}>•</span>
                            <span 
                              className="whitespace-nowrap"
                              style={{ color: 'var(--details-text-secondary, rgba(255, 255, 255, 0.70))' }}
                            >
                              {sizeInfo.fileCount} {sizeInfo.fileCount === 1 ? 'file' : 'files'}
                            </span>
                          </>
                        ) : (
                          <span 
                            className="text-[10px] animate-pulse whitespace-nowrap"
                            style={{ color: 'var(--details-text-muted, rgba(255, 255, 255, 0.50))' }}
                          >
                            Calculating size...
                          </span>
                        )}
                      </div>

                      <div 
                        className="text-[10px] font-mono truncate mt-0.5" 
                        title={`/${dir.path}`}
                        style={{ color: 'var(--details-text-muted, rgba(255, 255, 255, 0.45))' }}
                      >
                        /{dir.path}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Action Buttons (Copy Link & Download) */}
                  <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                    {/* Copy Link Button for Downloader Apps */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(dir)}
                      className="p-2 sm:px-2.5 sm:py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer shrink-0"
                      style={
                        isCopied
                          ? {
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              borderColor: 'rgba(16, 185, 129, 0.35)',
                              color: '#34d399',
                            }
                          : {
                              backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.06))',
                              borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))',
                              color: 'var(--details-text-secondary, rgba(255, 255, 255, 0.75))',
                            }
                      }
                      title={`Copy link for ${dir.zipFilename} to use in downloader apps (1DM, ADM, aria2, IDM, etc.)`}
                      aria-label={`Copy link for ${dir.zipFilename}`}
                    >
                      {isCopied ? (
                        <>
                          <Check size={14} className="text-emerald-400 shrink-0" />
                          <span className="hidden sm:inline text-[11px] font-bold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} className="shrink-0" />
                          <span className="hidden sm:inline text-[11px]">Copy</span>
                        </>
                      )}
                    </button>

                    {/* Download ZIP Button: Adaptive surface background with non-flushing accented border */}
                    <button
                      type="button"
                      onClick={() => handleDownload(dir)}
                      disabled={isCurrentDownloading}
                      className="shrink-0 flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-60 whitespace-nowrap active:scale-95 border"
                      style={{
                        backgroundColor: 'var(--details-surface-hover, rgba(255, 255, 255, 0.12))',
                        borderColor: 'var(--details-accent, #9333ea)',
                        borderWidth: '1.5px',
                        color: 'var(--details-text-primary, #ffffff)',
                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
                      }}
                      title={`Download ${dir.zipFilename}`}
                    >
                      {isCurrentDownloading ? (
                        <>
                          <Loader2 size={13} className="animate-spin shrink-0" style={{ color: 'var(--details-accent)' }} />
                          <span>Starting...</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} className="shrink-0" style={{ color: 'var(--details-accent)' }} />
                          <span className="truncate max-w-[100px] sm:max-w-[170px]">
                            {getButtonLabel(dir)}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div 
            className="mt-4 pt-3 border-t flex items-center justify-between text-xs"
            style={{ borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))' }}
          >
            <span 
              className="truncate max-w-[200px] sm:max-w-none"
              style={{ color: 'var(--details-text-muted, rgba(255, 255, 255, 0.50))' }}
            >
              resume not supported
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 border"
              style={{
                backgroundColor: 'var(--details-surface, rgba(255, 255, 255, 0.06))',
                borderColor: 'var(--details-border, rgba(255, 255, 255, 0.12))',
                color: 'var(--details-text-primary, #ffffff)'
              }}
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
