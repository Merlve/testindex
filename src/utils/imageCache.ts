/**
 * In-memory registry of image URLs that have been successfully loaded
 * during the current browser session. This allows React components to
 * mount with loaded=true synchronously and skip placeholder pulses,
 * blur-ups, and fade-in animations when navigating back to pages.
 */
const loadedImageSet = new Set<string>();

export function isImageLoaded(src?: string | null): boolean {
  if (!src) return false;
  return loadedImageSet.has(src);
}

export function markImageLoaded(src?: string | null): void {
  if (src) {
    loadedImageSet.add(src);
  }
}

export function clearImageCache(): void {
  loadedImageSet.clear();
}
