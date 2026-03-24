import { useEffect, useMemo, useState } from 'react';

interface Props {
  iconUrl: string;
  alt: string;
  animated?: boolean;
  frameTime?: number;
  block3d?: boolean;
}

export function AnimatedIcon({ iconUrl, alt, animated = false, frameTime = 1, block3d = false }: Props) {
  const [frameCount, setFrameCount] = useState(1);

  useEffect(() => {
    if (!animated) {
      setFrameCount(1);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 1;
      const height = img.naturalHeight || width;
      const guessedFrames = Math.max(1, Math.floor(height / Math.max(width, 1)));
      setFrameCount(guessedFrames);
    };
    img.src = iconUrl;
  }, [animated, iconUrl]);

  const durationMs = useMemo(() => {
    const ticks = Math.max(1, frameTime);
    return Math.max(300, frameCount * ticks * 50);
  }, [frameCount, frameTime]);

  if (!animated || frameCount <= 1) {
    if (block3d) {
      const style = { ['--icon-url' as string]: `url(${iconUrl})` };
      return (
        <span className="icon-3d" style={style} role="img" aria-label={alt}>
          <span className="icon-3d-face icon-3d-face-top" />
          <span className="icon-3d-face icon-3d-face-front" />
          <span className="icon-3d-face icon-3d-face-side" />
        </span>
      );
    }
    return <img src={iconUrl} alt={alt} />;
  }

  const style = {
    backgroundImage: `url(${iconUrl})`,
    animationDuration: `${durationMs}ms`,
    ['--frame-count' as string]: String(frameCount),
  };

  return <span className="animated-icon" style={style} role="img" aria-label={alt} />;
}
