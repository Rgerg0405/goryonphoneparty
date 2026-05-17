export interface Player {
  id: string;
  player_id: string;
  party_id: string;
  username: string;
  avatar: string;
  joined_at: string;
}

export interface GameSettings {
  drawTime: number;
  writeTime: number;
  describeTime: number;
  gameMode: string;
  maxPlayers: number;
  allowImageImport?: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  drawTime: 60,
  writeTime: 30,
  describeTime: 30,
  gameMode: 'normal',
  maxPlayers: 14,
  allowImageImport: false,
};

export interface GameEntry {
  id?: string;
  party_id: string;
  session_number: number;
  chain_index: number;
  step: number;
  player_id: string;
  player_name: string;
  entry_type: string;
  content: string;
  created_at?: string;
}

export interface Reaction {
  id: string;
  type: string;
  x: number;
  y: number;
  timestamp: number;
}

export type GamePhase = 'lobby' | 'writing' | 'drawing' | 'describing' | 'album' | 'waiting';

export const GAME_MODES = [
  { id: 'normal', name: 'NORMÁL', description: 'Klasszikus rajzolás és leírás', icon: '✏️' },
  { id: 'secret', name: 'TITOK', description: 'Nem látod mit rajzolsz!', icon: '🔒' },
  { id: 'modeling-3d', name: '3D MODELL', description: 'Rajz helyett 3D modellt építs', icon: '🧊' },
  { id: 'scribble', name: 'SCRIBBLE', description: 'Hamarosan – tippelős rajz', icon: '✍️', soon: true },
  { id: 'blind-flight', name: 'VAKREPÜLÉS', description: 'Hamarosan – sötétben rajzolsz', icon: '🌑', soon: true },
  { id: 'animation', name: 'ANIMÁCIÓ', description: 'Hamarosan – képkockás GIF', icon: '🎬', soon: true },
  { id: 'presentation', name: 'PREZENTÁCIÓ', description: 'Hamarosan – vicces prezi', icon: '🎤', soon: true },
];

export const TIME_OPTIONS = [
  { label: '15mp', value: 15 },
  { label: '30mp', value: 30 },
  { label: '45mp', value: 45 },
  { label: '60mp', value: 60 },
  { label: '90mp', value: 90 },
  { label: '120mp', value: 120 },
  { label: 'Korlátlan', value: 0 },
];

export function generatePartyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'writing': return 'ÍRJ EGY MONDATOT!';
    case 'drawing': return 'RAJZOLD LE!';
    case 'describing': return 'ÍRD LE MIT LÁTSZ!';
    case 'album': return 'ALBUM';
    default: return '';
  }
}

export function speakHungarian(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'hu-HU';
  utterance.rate = 0.9;
  utterance.pitch = 1.1;
  window.speechSynthesis.speak(utterance);
}

let blankCanvasCache: string | null = null;
export function getBlankCanvas(): string {
  if (!blankCanvasCache) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 500;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 800, 500);
    blankCanvasCache = c.toDataURL('image/jpeg', 0.5);
  }
  return blankCanvasCache;
}
