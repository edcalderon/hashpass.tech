/**
 * Tutorial levels for the Companion quest. Every level teaches one real Companion feature and ends at a flag
 * that stays locked until the level's quest is done. The game is a short showcase: nothing here is sent anywhere
 * and the quiz copy only states things the Companion page itself already promises.
 *
 * Map legend: '.' air, '#' solid, '=' one-way plank, 'c' token, 'P' start, 'N' quest giver, 'F' flag.
 * Files under src/game that the node tests import use explicit .ts specifiers (Node type stripping).
 */
import type { Brush, LevelDef } from '../types.ts';

export const ROWS = 12;
const GROUND_ROW = 10;

function build(cols: number, draw: (b: Brush) => void): string[] {
  const grid = Array.from({ length: ROWS }, () => Array<string>(cols).fill('.'));
  draw({
    set: (x, y, ch) => {
      grid[y][x] = ch;
    },
    ground: (from, to) => {
      for (let x = from; x <= to; x += 1) for (let y = GROUND_ROW; y < ROWS; y += 1) grid[y][x] = '#';
    },
    plank: (from, to, y) => {
      for (let x = from; x <= to; x += 1) grid[y][x] = '=';
    },
    pillar: (x, height) => {
      for (let y = GROUND_ROW - height; y < GROUND_ROW; y += 1) grid[y][x] = '#';
    },
  });
  return grid.map((row) => row.join(''));
}

export const levels: LevelDef[] = [
  {
    id: 'wake-up',
    title: 'Wake up',
    badge: 'Basics',
    teaches: 'Starting as a guest, and staying safe',
    objective: 'Talk to the Pixel Guide, then reach the flag.',
    needTokens: 0,
    tokenLabel: 'bonus stars',
    skyTop: '#0b1230',
    skyBottom: '#3b2a86',
    hill: '#1a1f5c',
    grass: '#2fbf84',
    dirt: '#1d5a47',
    stars: true,
    npcName: 'Pixel Guide',
    npcLook: 'guide',
    npcLockedSay: '',
    npcDoneSay: 'The flag is open. Go on, Hatchling!',
    rewardStage: null,
    npcSteps: [
      {
        say: 'Welcome! Do you need an account to start chatting with me?',
        choices: [
          { label: 'No, guests can start right away', correct: true, reply: 'Right. A HASHPASS ID is only for keeping things.' },
          { label: 'Yes, sign up first', correct: false, reply: 'Not quite. Guests start first; a HASHPASS ID comes later, when you want to keep something.' },
        ],
      },
      {
        say: 'One safety question about wallets. Who should ever see your wallet seed phrase?',
        choices: [
          { label: 'Nobody, not even support', correct: true, reply: 'Correct. Nobody legitimate will ever ask for it.' },
          { label: 'The event team, if they ask', correct: false, reply: 'Never. A seed phrase gives full control of a wallet.' },
          { label: 'Anyone who says they are support', correct: false, reply: 'Never. Scammers pretend to be support all the time.' },
        ],
      },
    ],
    map: build(46, (b) => {
      b.ground(0, 21);
      b.ground(24, 45);
      b.set(2, 9, 'P');
      b.set(11, 9, 'N');
      b.set(16, 8, 'c');
      b.set(17, 8, 'c');
      b.plank(27, 30, 8);
      b.set(28, 7, 'c');
      b.pillar(33, 1);
      b.pillar(34, 2);
      b.pillar(35, 2);
      b.pillar(36, 1);
      b.set(42, 9, 'F');
    }),
  },
  {
    id: 'programme',
    title: 'The programme',
    badge: 'Programme',
    teaches: 'Answers that come from the event catalog',
    objective: 'Collect 3 session cards, then ask the Speaker.',
    needTokens: 3,
    tokenLabel: 'session cards',
    skyTop: '#10264a',
    skyBottom: '#1d6e8c',
    hill: '#17406a',
    grass: '#7bd26a',
    dirt: '#27506a',
    stars: true,
    npcName: 'Speaker Spark',
    npcLook: 'speaker',
    npcLockedSay: 'Collect 3 session cards first. I only answer once you have seen the programme.',
    npcDoneSay: 'You are curious now. Take the flag!',
    rewardStage: 'curious',
    npcSteps: [
      {
        say: 'Where do my answers about talks and speakers come from?',
        choices: [
          { label: 'The event catalog', correct: true, reply: 'Yes. I answer from the real programme, not from guesses.' },
          { label: 'I make them up', correct: false, reply: 'Never! I read from the event catalog.' },
        ],
      },
      {
        say: 'And if the catalog has no answer, what should I say?',
        choices: [
          { label: 'That I do not know', correct: true, reply: 'Honest beats invented.' },
          { label: 'Invent something plausible', correct: false, reply: 'No. A made-up session time could send you to the wrong room.' },
        ],
      },
    ],
    map: build(56, (b) => {
      b.ground(0, 15);
      b.ground(19, 33);
      b.ground(37, 55);
      b.set(2, 9, 'P');
      b.plank(6, 9, 8);
      b.set(7, 7, 'c');
      b.plank(22, 25, 8);
      b.set(23, 7, 'c');
      b.plank(40, 42, 8);
      b.plank(44, 47, 6);
      b.set(45, 5, 'c');
      b.set(49, 9, 'N');
      b.set(54, 9, 'F');
    }),
  },
  {
    id: 'plan-your-day',
    title: 'Plan your day',
    badge: 'Calendar',
    teaches: 'Turning an answer into a real action',
    objective: 'Collect 3 time slots, then use the calendar post.',
    needTokens: 3,
    tokenLabel: 'time slots',
    skyTop: '#3a2a6e',
    skyBottom: '#f2a35f',
    hill: '#6b3f7a',
    grass: '#9bd75f',
    dirt: '#6b4a2f',
    stars: false,
    npcName: 'Calendar Post',
    npcLook: 'calendar',
    npcLockedSay: 'Collect 3 time slots first. I need them to build your day.',
    npcDoneSay: 'Your day is drafted. The flag is open!',
    rewardStage: 'helpful',
    npcSteps: [
      {
        say: 'Day drafted! In the real Companion this is a calendar file you download. Here it is just a preview.',
      },
      {
        say: 'Does downloading a calendar draft need a HASHPASS ID?',
        choices: [
          { label: 'No, guests can do it', correct: true, reply: 'Right. Guests can download a draft; saving to your agenda needs a HASHPASS ID.' },
          { label: 'Yes, always', correct: false, reply: 'Not for this one. Guests can download a draft.' },
        ],
      },
    ],
    map: build(56, (b) => {
      b.ground(0, 25);
      b.ground(29, 55);
      b.set(2, 9, 'P');
      b.set(8, 8, 'c');
      b.plank(18, 21, 8);
      b.set(19, 7, 'c');
      b.pillar(30, 1);
      b.pillar(31, 2);
      b.pillar(32, 3);
      b.pillar(33, 3);
      b.pillar(34, 2);
      b.set(32, 6, 'c');
      b.set(50, 9, 'N');
      b.set(54, 9, 'F');
    }),
  },
  {
    id: 'meet-someone',
    title: 'Meet someone',
    badge: 'Meetings',
    teaches: 'Meetings that need both people to agree',
    objective: 'Say hi to Sky, then reach the final flag.',
    needTokens: 0,
    tokenLabel: 'bonus stars',
    skyTop: '#1b0f3a',
    skyBottom: '#c04a8f',
    hill: '#3b1d5e',
    grass: '#43d6a1',
    dirt: '#2a3a5c',
    stars: true,
    npcName: 'Sky',
    npcLook: 'mate',
    npcLockedSay: '',
    npcDoneSay: 'See you at the event! The flag is open.',
    rewardStage: null,
    npcSteps: [
      {
        say: 'Hi! I am Sky, another attendee’s pet. Want to request a meeting?',
        choices: [
          { label: 'Send a request', correct: true, reply: 'Request sent. This one is simulated: nobody real was contacted.' },
          { label: 'Maybe later', correct: false, reply: 'No rush. Ask when you are ready.' },
        ],
      },
      {
        say: 'Accepted! Real meetings always need both people to agree. Who decides if it happens?',
        choices: [
          { label: 'Both people', correct: true, reply: 'Yes. Consent comes first. Networking is planned for after launch.' },
          { label: 'Only the one asking', correct: false, reply: 'Both must agree, or it does not happen.' },
        ],
      },
    ],
    map: build(60, (b) => {
      b.ground(0, 19);
      b.ground(22, 39);
      b.ground(43, 59);
      b.set(2, 9, 'P');
      b.set(10, 8, 'c');
      b.set(26, 8, 'c');
      b.set(30, 9, 'N');
      b.pillar(48, 1);
      b.pillar(49, 2);
      b.pillar(50, 3);
      b.pillar(51, 3);
      b.pillar(52, 2);
      b.pillar(53, 1);
      b.set(50, 6, 'c');
      b.set(57, 9, 'F');
    }),
  },
];
