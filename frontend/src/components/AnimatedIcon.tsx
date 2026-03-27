import { useEffect, useMemo, useState } from 'react';

interface Props {
  iconUrl: string;
  alt: string;
  animated?: boolean;
  frameTime?: number;
  animationsEnabled?: boolean;
}

export function AnimatedIcon({ iconUrl, alt, animated = false, frameTime = 1, animationsEnabled = true }: Props) {
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
    return <img src={iconUrl} alt={alt} />;
  }

  const style = {
    backgroundImage: `url(${iconUrl})`,
    animationDuration: animationsEnabled ? `${durationMs}ms` : '0ms',
    animationName: animationsEnabled ? 'icon-frames' : 'none',
    backgroundPositionY: '0%',
    ['--frame-count' as string]: String(frameCount),
  };

  return <span className="animated-icon" style={style} role="img" aria-label={alt} />;
}
