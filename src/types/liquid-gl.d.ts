declare module 'liquid-gl' {
  export interface LiquidGLOptions {
    target: string;
    snapshot?: string;
    resolution?: number;
    engine?: 'auto' | 'webgpu' | 'webgl2' | 'webgl';
    zIndex?: number;
    content?: string | boolean;
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: 'none' | 'fade';
    tilt?: boolean;
    tiltFactor?: number;
    tiltEase?: number;
    draggable?: boolean;
    interaction?: 'none' | 'fluid';
    interactionStrength?: number;
    interactionRadius?: number;
    interactionViscosity?: number;
    magnify?: number;
    tint?: string | null;
    helper?: boolean;
    on?: {
      init?: (instance: any) => void;
      dragstart?: (instance: any, info: { x: number; y: number }) => void;
      drag?: (instance: any, info: { x: number; y: number }) => void;
      dragend?: (instance: any, info: { x: number; y: number }) => void;
    };
  }

  export interface LiquidGLLens {
    destroy: () => void;
    setTint?: (tint: string | null) => void;
    setDraggable?: (draggable: boolean) => void;
  }

  function liquidGL(options?: LiquidGLOptions): LiquidGLLens | LiquidGLLens[] | undefined;

  namespace liquidGL {
    function registerDynamic(elements: string | HTMLElement[] | NodeListOf<HTMLElement>): void;
    function syncWith(config?: {
      gsap?: any;
      lenis?: any;
      locomotiveScroll?: any;
      ScrollTrigger?: any;
    }): { lenis?: any; locomotiveScroll?: any };
  }

  export default liquidGL;
}
