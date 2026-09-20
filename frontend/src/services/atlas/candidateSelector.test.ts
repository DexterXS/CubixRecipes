import { describe, expect, it } from 'vitest';
import { selectRankedAtlasCandidate } from './candidateSelector';
import { createAtlasLookup } from './atlasLookup';
import type { AtlasCandidate } from './types';

function candidate(overrides: Partial<AtlasCandidate>): AtlasCandidate {
  return {
    raw: '<example:item>',
    key: 'example:item',
    meta: 0,
    quality: 'good',
    source: 'primary',
    size: 32,
    revision: '1',
    ...overrides
  };
}

describe('Atlas v2 candidate selection', () => {
  it('prefers a good ZIP candidate over a question primary candidate', () => {
    const selected = selectRankedAtlasCandidate([
      { candidate: candidate({ quality: 'question', source: 'primary' }), matchRank: 3 },
      { candidate: candidate({ quality: 'good', source: 'zip' }), matchRank: 3 }
    ], { preferredSize: 32 });

    expect(selected?.quality).toBe('good');
    expect(selected?.source).toBe('zip');
  });

  it('does not display invalid candidates', () => {
    const selected = selectRankedAtlasCandidate([
      { candidate: candidate({ quality: 'invalid' }), matchRank: 3 }
    ]);

    expect(selected).toBeNull();
  });

  it('uses the requested atlas size when quality and source are equal', () => {
    const selected = selectRankedAtlasCandidate([
      { candidate: candidate({ size: 256, revision: '2' }), matchRank: 3 },
      { candidate: candidate({ size: 32, revision: '1' }), matchRank: 3 }
    ], { preferredSize: 32 });

    expect(selected?.size).toBe(32);
  });

  it('keeps primary and ZIP candidates in one lookup', () => {
    const lookup = createAtlasLookup({
      primaryAtlas: {
        revision: 'primary-1',
        image_url: '/api/itempanel/atlas.png',
        tile_size: 32,
        columns: 1,
        rows: 1,
        entries: {
          '<example:item>': {
            x: 0,
            y: 0,
            w: 32,
            h: 32,
            display_name: 'Example',
            item_key: 'example:item',
            meta: 0,
            quality: 'question'
          }
        }
      },
      modIconCandidatesByRaw: new Map([
        ['<example:item>', [{
          key: 'example/item',
          modid: 'example',
          iconName: 'item',
          size: 32,
          page: 0,
          atlasFile: 'mod-icons-32-0.png',
          image_url: '/api/mod-icons/atlases/mod-icons-32-0.png',
          x: 0,
          y: 0,
          w: 32,
          h: 32,
          quality: 'good'
        }]]
      ]),
      modIconManifest: {
        revision: 'zip-2',
        maxAtlasSize: 4096,
        fallbackAtlasUrl: '/api/itempanel/atlas.png',
        archives: [],
        atlases: [{ size: 32, page: 0, image_url: '/api/mod-icons/atlases/mod-icons-32-0.png', file: 'mod-icons-32-0.png', columns: 1, rows: 1, tileSize: 32, entries: {} }],
        entries: { x32: {}, x256: {} },
        duplicates: [],
        rejected: [],
        totalMods: 1
      }
    });

    const resolved = lookup.resolve('<example:item>', { preferredSize: 32 });
    expect(resolved?.candidate.source).toBe('zip');
    expect(resolved?.candidate.quality).toBe('good');
  });

  it('uses the active Atlas v2 page URL for primary candidates', () => {
    const lookup = createAtlasLookup({
      atlasV2Index: {
        schemaVersion: 2,
        revision: 'rev-20260920',
        pages: [{
          name: 'itempanel-atlas.png',
          source: 'primary',
          size: 32,
          columns: 2,
          rows: 1,
          tileSize: 32,
          url: '/api/atlas/v2/pages/itempanel-atlas.png?revision=rev-20260920'
        }],
        candidates: [{
          raw: '<example:item>',
          key: 'example:item',
          meta: 0,
          quality: 'good',
          source: 'primary',
          size: 32,
          revision: 'rev-20260920',
          page: 'itempanel-atlas.png',
          x: 32,
          y: 0,
          w: 32,
          h: 32,
          imageUrl: '/api/atlas/v2/pages/itempanel-atlas.png?revision=rev-20260920'
        }]
      }
    });

    const resolved = lookup.resolve('<example:item>');
    expect(resolved?.candidate.imageUrl).toContain('/api/atlas/v2/pages/itempanel-atlas.png');
    expect(resolved?.style?.backgroundPosition).toContain('-32px');
  });
});
