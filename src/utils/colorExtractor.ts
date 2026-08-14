import { FastAverageColor } from 'fast-average-color';

const fac = new FastAverageColor();

export interface BackdropColorPalette {
  rgb: [number, number, number];
  hex: string;
  bgDark: string;
  bgLight: string;
  glowDark: string;
  glowLight: string;
  cardDark: string;
  cardLight: string;
  borderDark: string;
  borderLight: string;
}

const DEFAULT_PALETTE: BackdropColorPalette = {
  rgb: [130, 80, 220],
  hex: '#8250dc',
  bgDark: '#08080a',
  bgLight: '#fffcf9',
  glowDark: 'rgba(130, 80, 220, 0.18)',
  glowLight: 'rgba(130, 80, 220, 0.10)',
  cardDark: 'rgba(255, 255, 255, 0.05)',
  cardLight: 'rgba(0, 0, 0, 0.03)',
  borderDark: 'rgba(255, 255, 255, 0.10)',
  borderLight: 'rgba(0, 0, 0, 0.08)',
};

/**
 * Calculates a rich theme palette from an RGB triplet
 */
export function generatePaletteFromRgb(r: number, g: number, b: number): BackdropColorPalette {
  // Ensure RGB within bounds
  const clampedR = Math.max(0, Math.min(255, Math.round(r)));
  const clampedG = Math.max(0, Math.min(255, Math.round(g)));
  const clampedB = Math.max(0, Math.min(255, Math.round(b)));

  const hex = `#${((1 << 24) + (clampedR << 16) + (clampedG << 8) + clampedB).toString(16).slice(1)}`;

  // Deep darkened tone for dark mode: base around 6-12 lightness with the dominant hue tint
  const darkR = Math.round(clampedR * 0.144 + 6);
  const darkG = Math.round(clampedG * 0.144 + 6);
  const darkB = Math.round(clampedB * 0.144 + 8);
  const bgDark = `rgb(${darkR}, ${darkG}, ${darkB})`;

  // Soft tinted pastel tone for light mode: base around 96-98 lightness with the dominant hue tint
  const lightR = Math.round(255 - (255 - clampedR) * 0.12);
  const lightG = Math.round(255 - (255 - clampedG) * 0.12);
  const lightB = Math.round(255 - (255 - clampedB) * 0.12);
  const bgLight = `rgb(${lightR}, ${lightG}, ${lightB})`;

  return {
    rgb: [clampedR, clampedG, clampedB],
    hex,
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

/**
 * Extracts the dominant color from an image URL using FastAverageColor or Canvas fallback
 */
export async function extractDominantColor(imageUrl: string): Promise<BackdropColorPalette> {
  if (!imageUrl) return DEFAULT_PALETTE;

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
      return generatePaletteFromRgb(r, g, b);
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
          return generatePaletteFromRgb(rSum / count, gSum / count, bSum / count);
        }
      }
    } catch (e2) {
      // Ignore and fallback to default
    }
  }

  return DEFAULT_PALETTE;
}
