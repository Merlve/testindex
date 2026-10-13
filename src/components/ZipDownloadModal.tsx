import React, { useState, useEffect } from 'react';
import { X, Archive, Folder, Download, Loader2, CheckCircle2, ShieldCheck, FolderArchive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { formatBytes } from '../utils/nameParser';

interface ZipDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  title: string;
  showFolderPath: string;
  seasonItems: Array<{ name: string; is_dir?: boolean }>;
  token: string | null;
  user: string | null;
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
  user
}: ZipDownloadModalProps) {
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dirSizes, setDirSizes] = useState<Record<string, SizeInfo>>({});

  if (!isOpen) return null;

  // Clean base path without leading /home or home/
  // e.g. /home/ANIME/365.Days.to.the.Wedding.2024 -> ANIME/365.Days.to.the.Wedding.2024
  let cleanBasePath = (showFolderPath || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
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
      const folderName = season.name;
      const fullWebdavPath = `${cleanBasePath}/${folderName}`;
      const fullOpenlistPath = `${cleanOpenlistBase}/${folderName}`;
      directories.push({
        id: `season-${folderName}`,
        name: folderName,
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

    // Build the authenticated server-side proxy route:
    // Notice: in the WebDAV path, there is no /home, but just the path that follows after
    const downloadUrl = `/api/webdav/download-zip?path=${encodeURIComponent(dir.path)}&token=${encodeURIComponent(token)}`;

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
        className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="bg-[#fbf4eb] dark:bg-[#121217] border border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-7 w-full max-w-xl shadow-2xl overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-purple-600/15 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/30 shrink-0 shadow-inner">
                <Archive size={20} className="stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-xl font-bold text-black dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                  <span>Download Folder as ZIP</span>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-purple-500 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase">
                    {category}
                  </span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs sm:max-w-md mt-0.5" title={title}>
                  {title}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-500 hover:text-black dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Info Banner */}
          <div className="my-3.5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-2.5 text-xs text-purple-700 dark:text-purple-300">
            <ShieldCheck size={16} className="text-purple-500 shrink-0" />
            <span className="font-semibold text-xs sm:text-sm">Zip Generator</span>
          </div>

          {/* Success Toast */}
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-3.5 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>{successMsg}</span>
            </motion.div>
          )}

          {/* Available Directories List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            <div className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider px-1">
              Available Directories ({directories.length})
            </div>

            {directories.map((dir) => {
              const isCurrentDownloading = downloadingPath === dir.path;

              const sizeInfo =
                dir.isEntireFolder && seasonItems && seasonItems.length > 0
                  ? entireShowTotalSize !== undefined
                    ? { size: entireShowTotalSize, fileCount: entireShowTotalFiles || 0, loading: false }
                    : undefined
                  : dirSizes[dir.id];

              return (
                <div
                  key={dir.id}
                  className="p-3 sm:p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/10 transition flex items-center justify-between gap-2.5 sm:gap-3 overflow-hidden group"
                >
                  {/* Left Side: Icon & Details with strict min-w-0 flex-1 to prevent button overlap */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 overflow-hidden">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      dir.isEntireFolder 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    }`}>
                      {dir.isEntireFolder ? <FolderArchive size={18} /> : <Folder size={18} />}
                    </div>

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-xs sm:text-sm font-bold text-black dark:text-white truncate" title={dir.name}>
                        {dir.name}
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                        {sizeInfo ? (
                          <>
                            <span className="font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                              {formatBytes(sizeInfo.size)}
                            </span>
                            <span className="opacity-60">•</span>
                            <span className="whitespace-nowrap">{sizeInfo.fileCount} {sizeInfo.fileCount === 1 ? 'file' : 'files'}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 animate-pulse whitespace-nowrap">
                            Calculating size...
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5" title={`/${dir.path}`}>
                        /{dir.path}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Download Button */}
                  <button
                    type="button"
                    onClick={() => handleDownload(dir)}
                    disabled={isCurrentDownloading}
                    className="shrink-0 flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-purple-600 hover:bg-purple-500 active:scale-95 text-white shadow-md shadow-purple-600/25 transition cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    title={`Download ${dir.zipFilename}`}
                  >
                    {isCurrentDownloading ? (
                      <>
                        <Loader2 size={13} className="animate-spin shrink-0" />
                        <span>Starting...</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} className="shrink-0" />
                        <span className="truncate max-w-[120px] sm:max-w-[180px]">
                          {getButtonLabel(dir)}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate max-w-[200px] sm:max-w-none">resume not supported</span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black dark:text-white transition cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
