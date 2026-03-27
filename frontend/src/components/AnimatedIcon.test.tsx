import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AnimatedIcon } from './AnimatedIcon';

afterEach(() => {
  vi.restoreAllMocks();
});

test('animated icon with disabled animations renders first frame without playback', async () => {
  class MockImage {
    naturalWidth = 16;
    naturalHeight = 64;
    onload: null | (() => void) = null;

    set src(_value: string) {
      if (this.onload) {
        setTimeout(() => this.onload && this.onload(), 0);
      }
    }
  }

  vi.stubGlobal('Image', MockImage);

  const { container } = render(<AnimatedIcon iconUrl="/api/icons/test" alt="test" animated frameTime={1} animationsEnabled={false} />);

  await waitFor(() => {
    const node = container.querySelector('.animated-icon') as HTMLElement | null;
    expect(node).toBeTruthy();
    expect(node?.style.animationName).toBe('none');
  });
});
