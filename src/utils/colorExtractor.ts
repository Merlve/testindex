import React, { useState, useEffect } from 'react';
import { FastAverageColor } from 'fast-average-color';

const fac = new FastAverageColor();

// In-memory memoization cache for extracted color palettes to make navigation instant
const paletteCache = new Map<string, BackdropColorPalette>();

export function getCachedPalette(imageUrl?: string | null): BackdropColorPalette | null {
  if (!imageUrl) return null;
  return paletteCache.get(imageUrl) || null;
}

export function setCachedPalette(imageUrl: string, palette: BackdropColorPalette): void {
  if (imageUrl && palette) {
    if (paletteCache.size > 200) {
      const firstKey = paletteCache.keys().next().value;
      if (firstKey) paletteCache.delete(firstKey);
    }
    paletteCache.set(imageUrl, palette);
  }
}

export function clearPaletteCache(): void {
  paletteCache.clear();
}

/**
 * Reactive hook to track the active theme (light vs dark mode)
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });

  useEffect(() => {
    const update = () => {
      if (typeof document !== 'undefined') {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    update();

    window.addEventListener('theme-change', update);
    const observer = new MutationObserver(update);
    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    return () => {
      window.removeEventListener('theme-change', update);
      observer.disconnect();
    };
  }, []);

  return isDark;
}

export interface BackdropColorPalette {
  rgb: [number, number, number];
  hex: string;

  // Exact extracted color (no darkness added) for Light Mode
  rawBg: string;
  // Deep rich dark blend for Dark Mode
  darkBlendBg: string;

  // Dark Mode specific adaptive tokens:
  darkBg: string;
  darkTextPrimary: string;
  darkTextSecondary: string;
  darkTextMuted: string;
  darkSurface: string;
  darkSurfaceHover: string;
  darkBorder: string;
  darkBadgeBg: string;
  darkBadgeBorder: string;
  darkAccent: string;
  darkGlow: string;

  // Light Mode specific adaptive tokens (matching exact extracted color):
  lightBg: string;
  lightTextPrimary: string;
  lightTextSecondary: string;
  lightTextMuted: string;
  lightSurface: string;
  lightSurfaceHover: string;
  lightBorder: string;
  lightBadgeBg: string;
  lightBadgeBorder: string;
  lightAccent: string;
  lightGlow: string;
  isLightBgLight: boolean;

  // Backward compatibility / default fields
  solidBg: string;             // Active solidBg default
  textPrimary: string;         // Adaptive high-contrast text color
  textSecondary: string;       // Adaptive secondary text
  textMuted: string;           // Adaptive muted text
  cardBg: string;              // Frosted card surface
  cardBgHover: string;         // Card hover surface
  cardBorder: string;          // Subtle card border
  badgeBg: string;             // Metadata badge background
  badgeBorder: string;         // Metadata badge border
  glow: string;                // Ambient glow color matching dominant hue
  accent: string;              // Vibrant accent hue for highlights and buttons
  isDarkBackground: boolean;   // true if background is deep/dark

  // Legacy fields for backward compatibility
  bgDark: string;
  bgLight: string;
  glowDark: string;
  glowLight: string;
  cardDark: string;
  cardLight: string;
  borderDark: string;
  borderLight: string;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const normR = r / 255;
  const normG = g / 255;
  const normB = b / 255;
  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case normR:
        h = (normG - normB) / d + (normG < normB ? 6 : 0);
        break;
      case normG:
        h = (normB - normR) / d + 2;
        break;
      case normB:
        h = (normR - normG) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normalizedH = ((h % 360 + 360) % 360) / 360;

  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let normalizedT = t;
    if (normalizedT < 0) normalizedT += 1;
    if (normalizedT > 1) normalizedT -= 1;
    if (normalizedT < 1 / 6) return p + (q - p) * 6 * normalizedT;
    if (normalizedT < 1 / 2) return q;
    if (normalizedT < 2 / 3) return p + (q - p) * (2 / 3 - normalizedT) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, normalizedH + 1 / 3);
  const g = hue2rgb(p, q, normalizedH);
  const b = hue2rgb(p, q, normalizedH - 1 / 3);

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates a deep rich solid palette and adaptive contrast text from an RGB triplet
 */
export function generatePaletteFromRgb(r: number, g: number, b: number): BackdropColorPalette {
  const clampedR = Math.max(0, Math.min(255, Math.round(r)));
  const clampedG = Math.max(0, Math.min(255, Math.round(g)));
  const clampedB = Math.max(0, Math.min(255, Math.round(b)));

  const hex = `#${((1 << 24) + (clampedR << 16) + (clampedG << 8) + clampedB).toString(16).slice(1)}`;
  const [h, s] = rgbToHsl(clampedR, clampedG, clampedB);

  // 1. Dark Mode Theme: Deep rich dark blend (the dark blend color)
  let darkBgR: number;
  let darkBgG: number;
  let darkBgB: number;

  if (s < 0.08) {
    darkBgR = 14;
    darkBgG = 15;
    darkBgB = 18;
  } else {
    const richSaturation = Math.min(0.75, Math.max(0.35, s * 1.15));
    const deepLightness = 0.095;
    [darkBgR, darkBgG, darkBgB] = hslToRgb(h, richSaturation, deepLightness);
  }

  const darkBlendBg = `rgb(${darkBgR}, ${darkBgG}, ${darkBgB})`;
  const darkTextPrimary = '#ffffff';
  const darkTextSecondary = 'rgba(255, 255, 255, 0.78)';
  const darkTextMuted = 'rgba(255, 255, 255, 0.52)';
  const darkSurface = 'rgba(255, 255, 255, 0.06)';
  const darkSurfaceHover = 'rgba(255, 255, 255, 0.10)';
  const darkBorder = 'rgba(255, 255, 255, 0.10)';
  const darkBadgeBg = 'rgba(255, 255, 255, 0.08)';
  const darkBadgeBorder = 'rgba(255, 255, 255, 0.13)';
  const [darkAccR, darkAccG, darkAccB] = hslToRgb(h, Math.max(0.65, s), 0.60);
  const darkAccent = `rgb(${darkAccR}, ${darkAccG}, ${darkAccB})`;
  const darkGlow = `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.22)`;

  // 2. Light Mode Theme: Exact extracted color from the backdrop/poster (no darkness added!)
  const rawBg = `rgb(${clampedR}, ${clampedG}, ${clampedB})`;
  const lightBg = rawBg;

  // Determine luminance of the exact extracted color to ensure high-contrast readability
  const lightLuminance = getRelativeLuminance(clampedR, clampedG, clampedB);
  const isLightBgLight = lightLuminance >= 0.40;

  // Adaptive typography and surfaces tailored to the exact extracted color:
  const lightTextPrimary = isLightBgLight ? '#0a0d14' : '#ffffff';
  const lightTextSecondary = isLightBgLight ? 'rgba(10, 13, 20, 0.88)' : 'rgba(255, 255, 255, 0.85)';
  const lightTextMuted = isLightBgLight ? 'rgba(10, 13, 20, 0.65)' : 'rgba(255, 255, 255, 0.60)';

  // Contrast surfaces for light mode:
  const lightSurface = isLightBgLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.12)';
  const lightSurfaceHover = isLightBgLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)';
  const lightBorder = isLightBgLight ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.22)';
  const lightBadgeBg = isLightBgLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const lightBadgeBorder = isLightBgLight ? 'rgba(0, 0, 0, 0.24)' : 'rgba(255, 255, 255, 0.25)';

  // Accent for light mode: if background is bright, use deep saturated tone; if background is dark, use vibrant pop
  const [lightAccR, lightAccG, lightAccB] = hslToRgb(
    h,
    Math.max(0.70, s),
    isLightBgLight ? 0.32 : 0.65
  );
  const lightAccent = `rgb(${lightAccR}, ${lightAccG}, ${lightAccB})`;
  const lightGlow = isLightBgLight 
    ? `rgba(${Math.max(0, clampedR - 40)}, ${Math.max(0, clampedG - 40)}, ${Math.max(0, clampedB - 40)}, 0.15)`
    : `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.25)`;

  // Legacy variants for backward compatibility
  const darkR = Math.round(clampedR * 0.144 + 6);
  const darkG = Math.round(clampedG * 0.144 + 6);
  const darkB = Math.round(clampedB * 0.144 + 8);
  const bgDark = `rgb(${darkR}, ${darkG}, ${darkB})`;

  const lightR = Math.round(255 - (255 - clampedR) * 0.12);
  const lightG = Math.round(255 - (255 - clampedG) * 0.12);
  const lightB = Math.round(255 - (255 - clampedB) * 0.12);
  const bgLight = `rgb(${lightR}, ${lightG}, ${lightB})`;

  return {
    rgb: [clampedR, clampedG, clampedB],
    hex,
    rawBg,
    darkBlendBg,

    // Dark Mode tokens
    darkBg: darkBlendBg,
    darkTextPrimary,
    darkTextSecondary,
    darkTextMuted,
    darkSurface,
    darkSurfaceHover,
    darkBorder,
    darkBadgeBg,
    darkBadgeBorder,
    darkAccent,
    darkGlow,

    // Light Mode tokens (exact extracted color)
    lightBg,
    lightTextPrimary,
    lightTextSecondary,
    lightTextMuted,
    lightSurface,
    lightSurfaceHover,
    lightBorder,
    lightBadgeBg,
    lightBadgeBorder,
    lightAccent,
    lightGlow,
    isLightBgLight,

    // Default / Backward compatibility
    solidBg: darkBlendBg,
    textPrimary: darkTextPrimary,
    textSecondary: darkTextSecondary,
    textMuted: darkTextMuted,
    cardBg: darkSurface,
    cardBgHover: darkSurfaceHover,
    cardBorder: darkBorder,
    badgeBg: darkBadgeBg,
    badgeBorder: darkBadgeBorder,
    glow: darkGlow,
    accent: darkAccent,
    isDarkBackground: true,
    bgDark,
    bgLight,
    glowDark: `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.264)`,
    glowLight: `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.144)`,
    cardDark: `rgba(${Math.min(255, clampedR + 40)}, ${Math.min(255, clampedG + 40)}, ${Math.min(255, clampedB + 40)}, 0.084)`,
    cardLight: `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.048)`,
    borderDark: `rgba(${Math.min(255, clampedR + 80)}, ${Math.min(255, clampedG + 80)}, ${Math.min(255, clampedB + 80)}, 0.18)`,
    borderLight: `rgba(${clampedR}, ${clampedG}, ${clampedB}, 0.144)`,
  };
}

const DEFAULT_PALETTE: BackdropColorPalette = generatePaletteFromRgb(130, 80, 220);

/**
 * Extracts the dominant color from an image URL using FastAverageColor or Canvas fallback
 */
export async function extractDominantColor(imageUrl: string): Promise<BackdropColorPalette> {
  if (!imageUrl) return DEFAULT_PALETTE;

  const cached = paletteCache.get(imageUrl);
  if (cached) return cached;

  const corsUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'cors_for_color=1';

  try {
    const result = await fac.getColorAsync(corsUrl, {
      algorithm: 'dominant',
      mode: 'precision',
      crossOrigin: 'anonymous',
      ignoredColor: [
        [255, 255, 255, 255, 10], // ignore pure white
        [0, 0, 0, 255, 10],       // ignore pure black
      ],
    });

    if (result && result.value && result.value.length >= 3) {
      const [r, g, b] = result.value;
      const palette = generatePaletteFromRgb(r, g, b);
      setCachedPalette(imageUrl, palette);
      return palette;
    }
  } catch (err) {
    // Fallback: manual canvas sampling with crossOrigin anonymous
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = corsUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 40;
        canvas.height = 40;
        ctx.drawImage(img, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Skip extreme dark/bright pixels to find actual dominant hue
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness > 20 && brightness < 235) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }
        }
        if (count > 0) {
          const palette = generatePaletteFromRgb(rSum / count, gSum / count, bSum / count);
          setCachedPalette(imageUrl, palette);
          return palette;
        }
      }
    } catch (e2) {
      // Ignore and fallback to default
    }
  }

  return DEFAULT_PALETTE;
}
