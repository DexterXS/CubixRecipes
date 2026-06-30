import { useEffect, useState } from 'react';
import { buildIconSurfaceCssVars, type IconSurfaceSettings, type IconViewport } from './iconSurfaces';

function readIconViewport(): IconViewport {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 900 };
  }
  return { width: window.innerWidth || 1280, height: window.innerHeight || 900 };
}

export function useIconViewport(): IconViewport {
  const [viewport, setViewport] = useState<IconViewport>(() => readIconViewport());

  useEffect(() => {
    const updateViewport = () => setViewport(readIconViewport());
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  return viewport;
}

export function useIconSurfaceCssVars(settings: Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined) {
  const viewport = useIconViewport();
  return buildIconSurfaceCssVars(settings, viewport);
}
