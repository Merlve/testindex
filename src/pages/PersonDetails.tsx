import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ChevronLeft, Home, Search, Calendar, MapPin, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { extractDominantColor, BackdropColorPalette, getCachedPalette, useIsDarkMode } from '../utils/colorExtractor';
import SearchModal from '../components/SearchModal';

const PersonDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isDarkMode = useIsDarkMode();

  const [person, setPerson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Fetch person details
  useEffect(() => {
    let isMounted = true;
    const fetchPerson = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: token } : {};
        const response = await axios.get(`/api/meta/person/${id}`, { headers });
        if (isMounted) {
          if (response.data && response.data.name) {
            setPerson(response.data);
          } else {
            setPerson({
              id,
              name: 'Person Details',
              biography: 'Details for this person will be displayed here.',
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch person details:', error);
        if (isMounted) {
          setPerson({
            id,
            name: 'Person Details',
            biography: 'Details for this person are currently unavailable.',
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPerson();
    return () => { isMounted = false; };
  }, [id, token]);

  // High-resolution picture URL for backdrop and avatar
  const profileUrl = useMemo(() => {
    if (!person?.profile_path) return null;
    return person.profile_path.startsWith('http')
      ? person.profile_path
      : `https://image.tmdb.org/t/p/w1280${person.profile_path}`;
  }, [person?.profile_path]);

  // Color extraction & palette (identical to details page)
  const initialPalette = useMemo(() => {
    if (!profileUrl) return null;
    return getCachedPalette(profileUrl);
  }, [profileUrl]);

  const [colorPalette, setColorPalette] = useState<BackdropColorPalette | null>(initialPalette);

  useEffect(() => {
    let isMounted = true;
    if (profileUrl) {
      const cached = getCachedPalette(profileUrl);
      if (cached) {
        setColorPalette(cached);
        return;
      }
      extractDominantColor(profileUrl)
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
  }, [profileUrl]);

  // Active color tokens
  const activeBg = colorPalette 
    ? (isDarkMode ? colorPalette.darkBlendBg : colorPalette.rawBg) 
    : (isDarkMode ? '#0b0e14' : '#f8fafc');

  const activeTextPrimary = colorPalette
    ? (isDarkMode ? colorPalette.darkTextPrimary : colorPalette.lightTextPrimary)
    : (isDarkMode ? '#ffffff' : '#0f172a');

  const activeTextSecondary = colorPalette
    ? (isDarkMode ? colorPalette.darkTextSecondary : colorPalette.lightTextSecondary)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.78)' : 'rgba(15, 23, 42, 0.78)');

  const activeTextMuted = colorPalette
    ? (isDarkMode ? colorPalette.darkTextMuted : colorPalette.lightTextMuted)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.52)' : 'rgba(15, 23, 42, 0.58)');

  const activeSurface = colorPalette
    ? (isDarkMode ? colorPalette.darkSurface : colorPalette.lightSurface)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)');

  const activeSurfaceHover = colorPalette
    ? (isDarkMode ? colorPalette.darkSurfaceHover : colorPalette.lightSurfaceHover)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.10)');

  const activeBorder = colorPalette
    ? (isDarkMode ? colorPalette.darkBorder : colorPalette.lightBorder)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.12)');

  const activeBadgeBg = colorPalette
    ? (isDarkMode ? colorPalette.darkBadgeBg : colorPalette.lightBadgeBg)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)');

  const activeBadgeBorder = colorPalette
    ? (isDarkMode ? colorPalette.darkBadgeBorder : colorPalette.lightBadgeBorder)
    : (isDarkMode ? 'rgba(255, 255, 255, 0.13)' : 'rgba(0, 0, 0, 0.15)');

  const activeAccent = colorPalette
    ? (isDarkMode ? colorPalette.darkAccent : colorPalette.lightAccent)
    : (isDarkMode ? 'rgb(130, 80, 220)' : 'rgb(109, 40, 217)');

  const activeGlow = colorPalette
    ? (isDarkMode ? colorPalette.darkGlow : colorPalette.lightGlow)
    : 'rgba(130, 80, 220, 0.22)';


  return (
    <div 
      className="person-details-root details-page-root min-h-[100dvh] pb-24 relative"
      style={{
        backgroundColor: 'var(--details-bg)',
        color: 'var(--details-text-primary)',
        '--details-bg': activeBg,
        '--details-text-primary': activeTextPrimary,
        '--details-text-secondary': activeTextSecondary,
        '--details-text-muted': activeTextMuted,
        '--details-surface': activeSurface,
        '--details-surface-hover': activeSurfaceHover,
        '--details-border': activeBorder,
        '--details-badge-bg': activeBadgeBg,
        '--details-badge-border': activeBadgeBorder,
        '--details-glow': activeGlow,
        '--details-accent': activeAccent,
        '--details-dark-bg': colorPalette ? colorPalette.darkBlendBg : '#0b0e14',
        '--details-light-bg': colorPalette ? colorPalette.rawBg : '#f8fafc',
      } as React.CSSProperties}
    >
      {/* Complete Theme Harmony & Glass Styling */}
      <style>{`
        .person-details-root {
          background-color: var(--details-bg) !important;
          color: var(--details-text-primary) !important;
        }
        .dark .person-details-root {
          background-color: var(--details-bg) !important;
          color: var(--details-text-primary) !important;
        }
        .details-nav-icon-btn {
          background-color: var(--details-surface);
          border: 1px solid var(--details-border);
          color: var(--details-text-primary);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18), inset 0 1px 1px 0 rgba(255, 255, 255, 0.16);
        }
        .details-nav-icon-btn:hover {
          background-color: var(--details-surface-hover);
          border-color: var(--details-accent);
          color: var(--details-accent);
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25), 0 0 20px var(--details-glow);
        }
        .person-details-root { --backdrop-h: 50vh; }
        @media (min-width: 640px) { .person-details-root { --backdrop-h: 60vh; } }
        @media (min-width: 768px) { .person-details-root { --backdrop-h: 70vh; } }
      `}</style>

      {/* Top Floating Glass Navigation Icons (Always visible on Person Details) */}
      <div className="fixed top-4 left-4 md:left-6 z-40 pointer-events-auto flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/');
            }
          }}
          aria-label="Back"
          title="Back"
          className="details-nav-icon-btn flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <ChevronLeft size={22} className="shrink-0" />
        </button>
        <Link
          to="/"
          aria-label="Home"
          title="Home"
          className="details-nav-icon-btn flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Home size={20} className="shrink-0" />
        </Link>
      </div>

      <div className="fixed top-4 right-4 md:right-6 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={() => setShowSearchModal(true)}
          aria-label="Search"
          title="Search"
          className="details-nav-icon-btn flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full backdrop-blur-xl backdrop-saturate-[180%] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Search size={20} className="shrink-0" />
        </button>
      </div>

      {/* Placeholder to push content down into normal flow */}
      <div className="w-full h-[var(--backdrop-h)] pointer-events-none" />

      {/* Hero Backdrop Container (Actors picture made larger just like our backdrops in details page) */}
      <div className="absolute top-0 left-0 w-full h-[var(--backdrop-h)] overflow-hidden z-0 pointer-events-none">
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {profileUrl && (
            <img 
              src={profileUrl} 
              alt={person?.name || 'Person backdrop'} 
              className="w-full h-full object-cover object-top opacity-85 pointer-events-none transition-opacity duration-700"
            />
          )}

          {/* Seamless blend overlay into the solid adaptive background */}
          <div 
            className="absolute inset-0 pointer-events-none transition-colors duration-700" 
            style={{
              background: isDarkMode
                ? `linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.45) 65%, var(--details-bg) 100%)`
                : `linear-gradient(to bottom, transparent 35%, var(--details-bg) 100%)`
            }}
          />

          {/* Dynamic hue tint layer to harmonize artwork into the solid tone */}
          {colorPalette && (
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-700"
              style={{
                opacity: isDarkMode ? 0.35 : 0.20,
                background: `linear-gradient(to bottom, transparent 50%, var(--details-bg) 100%)`,
              }}
            />
          )}

          {/* Top scrim for clear readability under top floating navigation pills */}
          <div 
            className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-10 transition-opacity duration-700"
            style={{
              background: isDarkMode
                ? 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 100%)'
            }}
          />
        </div>
      </div>

      {/* Main Content Section positioned below the backdrop with slight negative overlap */}
      <div className="relative z-20 flex flex-col items-center max-w-4xl mx-auto space-y-6 px-4 sm:px-8 -mt-24 sm:-mt-32 text-center">
        {loading ? (
          <div className="flex flex-col items-center gap-4 w-full animate-pulse">
            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl bg-black/10 dark:bg-white/10" />
            <div className="h-10 w-64 bg-black/10 dark:bg-white/10 rounded-xl" />
            <div className="h-5 w-32 bg-black/10 dark:bg-white/10 rounded-lg" />
            <div className="w-full max-w-2xl h-36 bg-black/10 dark:bg-white/10 rounded-2xl mt-4" />
          </div>
        ) : person ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center w-full space-y-6"
          >
            {/* Portrait Badge / Avatar with Glass Border & Glow */}
            <div className="relative group">
              {profileUrl ? (
                <img
                  src={profileUrl}
                  alt={person.name}
                  className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl object-cover shadow-2xl border-2 transition-transform duration-300 group-hover:scale-105"
                  style={{
                    borderColor: 'var(--details-border)',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5), 0 0 30px var(--details-glow)',
                  }}
                />
              ) : (
                <div 
                  className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl flex items-center justify-center font-bold text-4xl shadow-2xl border-2"
                  style={{
                    backgroundColor: 'var(--details-surface)',
                    borderColor: 'var(--details-border)',
                    color: 'var(--details-text-primary)'
                  }}
                >
                  {person.name?.[0] || '?'}
                </div>
              )}
            </div>

            {/* Name & Primary Role */}
            <div className="flex flex-col items-center gap-2">
              <h1 
                className="text-3xl sm:text-5xl font-extrabold tracking-tight"
                style={{ color: 'var(--details-text-primary)' }}
              >
                {person.name}
              </h1>

              {person.known_for_department && (
                <div 
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border backdrop-blur-md"
                  style={{
                    backgroundColor: 'var(--details-badge-bg)',
                    borderColor: 'var(--details-badge-border)',
                    color: 'var(--details-accent)',
                  }}
                >
                  <Award size={13} />
                  <span>{person.known_for_department}</span>
                </div>
              )}

              {/* Personal Details Row */}
              {(person.birthday || person.place_of_birth) && (
                <div 
                  className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm font-medium pt-1"
                  style={{ color: 'var(--details-text-muted)' }}
                >
                  {person.birthday && (
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} style={{ color: 'var(--details-accent)' }} />
                      Born {person.birthday}{person.deathday ? ` - Died ${person.deathday}` : ''}
                    </span>
                  )}
                  {person.place_of_birth && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} style={{ color: 'var(--details-accent)' }} />
                      {person.place_of_birth}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Biography Section */}
            {person.biography && (
              <div 
                className="w-full text-left rounded-3xl p-6 sm:p-8 border backdrop-blur-xl transition-all"
                style={{
                  backgroundColor: 'var(--details-surface)',
                  borderColor: 'var(--details-border)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.15)',
                }}
              >
                <h2 
                  className="text-base sm:text-lg font-bold mb-3 flex items-center gap-2"
                  style={{ color: 'var(--details-text-primary)' }}
                >
                  Biography
                </h2>
                <div 
                  className="leading-relaxed text-sm sm:text-base whitespace-pre-line relative"
                  style={{ color: 'var(--details-text-secondary)' }}
                >
                  {isBioExpanded || person.biography.length <= 380
                    ? person.biography
                    : `${person.biography.slice(0, 380)}...`}

                  {person.biography.length > 380 && (
                    <button
                      type="button"
                      onClick={() => setIsBioExpanded(!isBioExpanded)}
                      className="mt-3 text-xs sm:text-sm font-semibold flex items-center gap-1 hover:underline cursor-pointer transition-colors"
                      style={{ color: 'var(--details-accent)' }}
                    >
                      {isBioExpanded ? (
                        <><span>Show Less</span><ChevronUp size={14} /></>
                      ) : (
                        <><span>Read More</span><ChevronDown size={14} /></>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}


          </motion.div>
        ) : (
          <div className="text-center py-16" style={{ color: 'var(--details-text-muted)' }}>
            Person not found.
          </div>
        )}
      </div>

      {/* Global Search Modal */}
      {showSearchModal && (
        <SearchModal onClose={() => setShowSearchModal(false)} />
      )}
    </div>
  );
};

export default PersonDetails;
