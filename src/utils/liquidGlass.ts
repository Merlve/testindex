import { useEffect, useRef } from 'react';
import liquidGL, { type LiquidGLOptions, type LiquidGLLens } from 'liquid-gl';

export interface LiquidGlassCustomOptions extends Omit<LiquidGLOptions, 'target'> {
  target?: string;
}

export const liquidGlassPresets = {
  // Balanced optical refraction for header navigation, action pills, floating badges
  navbar: {
    refraction: 0.018,
    aberration: 0.012,
    bevelDepth: 0.06,
    bevelWidth: 0.14,
    frost: 1.2,
    shadow: true,
    specular: true,
    reveal: 'fade' as const,
    interaction: 'fluid' as const,
    interactionStrength: 0.35,
    interactionRadius: 0.4,
    interactionViscosity: 0.6,
  },
  // Frosted modals, dialogs, overlays
  modal: {
    refraction: 0.015,
    aberration: 0.008,
    bevelDepth: 0.05,
    bevelWidth: 0.12,
    frost: 1.8,
    shadow: true,
    specular: true,
    reveal: 'fade' as const,
  },
  // Compact badges, pills, small tags
  pill: {
    refraction: 0.02,
    aberration: 0.015,
    bevelDepth: 0.08,
    bevelWidth: 0.18,
    frost: 1.0,
    shadow: true,
    specular: true,
    reveal: 'fade' as const,
    interaction: 'fluid' as const,
    interactionStrength: 0.4,
  },
  // Clean crystal clear refraction
  crystal: {
    refraction: 0.03,
    aberration: 0.02,
    bevelDepth: 0.07,
    bevelWidth: 0.15,
    frost: 0.2,
    shadow: true,
    specular: true,
    reveal: 'fade' as const,
  },
};

let nextLensId = 1;

/**
 * React hook to apply liquid-gl refraction to a DOM element ref or selector.
 * Falls back safely to CSS backdrop-filter if WebGL/WebGPU is not supported or errors.
 */
export function useLiquidGlass<T extends HTMLElement = HTMLDivElement>(
  options: LiquidGlassCustomOptions = liquidGlassPresets.navbar,
  deps: any[] = []
) {
  const elementRef = useRef<T | null>(null);
  const lensInstanceRef = useRef<LiquidGLLens | LiquidGLLens[] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let targetSelector = options.target;
    let autoAssignedDataId: string | null = null;

    if (!targetSelector && elementRef.current) {
      let dataId = elementRef.current.getAttribute('data-liquid-id');
      if (!dataId) {
        dataId = `liquid-lens-${nextLensId++}`;
        elementRef.current.setAttribute('data-liquid-id', dataId);
      }
      autoAssignedDataId = dataId;
      targetSelector = `[data-liquid-id="${dataId}"]`;
    }

    if (!targetSelector) return;

    let destroyed = false;

    // Slight delay or next frame ensures DOM layout is rendered and stable
    const timer = setTimeout(() => {
      if (destroyed) return;
      try {
        const instances = liquidGL({
          ...options,
          target: targetSelector!,
        });
        if (instances) {
          lensInstanceRef.current = instances;
        }
      } catch (err) {
        // Graceful fallback to CSS backdrop-blur without breaking the app
        console.warn('liquid-gl initialization failed, continuing with CSS fallback:', err);
      }
    }, 50);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (lensInstanceRef.current) {
        try {
          if (Array.isArray(lensInstanceRef.current)) {
            lensInstanceRef.current.forEach((lens) => lens?.destroy?.());
          } else {
            lensInstanceRef.current.destroy?.();
          }
        } catch (cleanupErr) {
          console.warn('liquid-gl lens cleanup error:', cleanupErr);
        }
        lensInstanceRef.current = null;
      }
    };
  }, deps);

  return elementRef;
}

/**
 * Directly initialize liquidGL on a CSS selector (e.g. for multiple global class targets).
 */
export function initGlobalLiquidGlass(
  selector: string = '.liquid-glass',
  options: LiquidGlassCustomOptions = liquidGlassPresets.navbar
): () => void {
  if (typeof window === 'undefined') return () => {};

  try {
    const instances = liquidGL({
      ...options,
      target: selector,
    });
    return () => {
      if (instances) {
        if (Array.isArray(instances)) {
          instances.forEach((lens) => lens?.destroy?.());
        } else {
          instances.destroy?.();
        }
      }
    };
  } catch (err) {
    console.warn('liquid-gl global init failed:', err);
    return () => {};
  }
}
