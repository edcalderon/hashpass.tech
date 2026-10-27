/**
 * Original pixel sprites for the Companion. Each sprite is drawn as its left half (8 columns) and
 * mirrored to 16x16, so they stay symmetric and easy to edit. Characters map to `palette`;
 * '.' is transparent and 'p' marks pupils (they blink).
 */
const mirror = (half: string[]) => half.map((row) => row + [...row].reverse().join(''));

export const spriteHalves = {
  hatchling: [
    '........',
    '........',
    '....oooo',
    '...oaaaa',
    '..oaccaa',
    '..oacaaa',
    '..oaaaaa',
    '.oaaaaaa',
    '.oaeppaa',
    '.oaappaa',
    '.oakaaao',
    '.obaaaaa',
    '..osstss',
    '...ooooo',
    '........',
    '........',
  ],
  curious: [
    '.......y',
    '.......o',
    '...ooooo',
    '..oaaaaa',
    '.oaaccaa',
    '.oaacaaa',
    'oaaaaaaa',
    'oaeeeaaa',
    'oaeppaaa',
    'oaeeeaaa',
    'oakaaaao',
    '.obaaaaa',
    '..obbbbb',
    '..ooo...',
    '........',
    '........',
  ],
  helpful: [
    '.......y',
    '....oooo',
    '...oaaaa',
    '..oaccaa',
    '..oacaaa',
    '..oaaaaa',
    'w.oaaaaa',
    'wwoaeppa',
    'xwoaappa',
    'xwoakaao',
    'xxoaaaaa',
    'wwoaaagh',
    '.woabbgg',
    '...ooooo',
    '..oo....',
    '........',
  ],
};

export const sprites = {
  hatchling: {
    label: 'Hatchling',
    palette: { o: '#10243a', a: '#7fe7f2', b: '#3fb6c9', c: '#e8fdff', e: '#ffffff', p: '#10243a', k: '#ff8fb1', s: '#f4ead2', t: '#cdbf9b' },
    rows: mirror(spriteHalves.hatchling),
  },
  curious: {
    label: 'Curious',
    palette: { o: '#25103f', a: '#a78bfa', b: '#7c5ce0', c: '#e0d6ff', e: '#ffffff', p: '#25103f', k: '#ff8fb1', y: '#ffd84d' },
    rows: mirror(spriteHalves.curious),
  },
  helpful: {
    label: 'Helpful',
    palette: { o: '#3a2406', a: '#ffd166', b: '#f2a93b', c: '#fff3c4', e: '#ffffff', p: '#3a2406', k: '#ff8fb1', w: '#ffffff', x: '#bfe9ff', g: '#2fbf84', h: '#ffffff', y: '#ffffff' },
    rows: mirror(spriteHalves.helpful),
  },
  cloud: {
    label: 'Cloud',
    palette: { w: '#9fb4d9', l: '#c9d8f2' },
    rows: [
      '................',
      '......wwww......',
      '....wwllllww....',
      '..wwllllllllww..',
      '.wllllllllllllw.',
      'wllllllllllllllw',
      '.wwwwwwwwwwwwww.',
      '................',
    ],
  },
};
