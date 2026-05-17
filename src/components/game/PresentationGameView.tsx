import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings, speakHungarian } from '@/lib/gameTypes';
import { playClick, playNotification, playPop } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

const SLIDE_EMOJIS = ['🦒','🚀','🎩','🐉','🍕','🌈','🦄','💻','📈','🧠','🪐','🐙','🍩','🎲','💡','🦖','🎤','🪩','🧙','🥑'];
const PRES_TEMPLATES = [
  'Miért fontos ez a következő 10 évben?',
  'A 3 alapelv',
  'Egy meglepő statisztika',
  'Egy személyes történet',
  'A jövő képe',
  'Akcióra hívás',
];

type PresState = 'collect' | 'pres' | 'rate' | 'end';

export default function PresentationGameView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const slidesPerTalk = settings.presSlides ?? 5;
  const slideTime = settings.presSlideTime ?? 25;
  const channelRef = useRef<any>(null);

  const [phase, setPhase] = useState<PresState>('collect');
  const [myTitle, setMyTitle] = useState('');
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [presenterIdx, setPresenterIdx] = useState(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [slides, setSlides] = useState<{ emoji: string; template: string }[]>([]);
  const [gauge, setGauge] = useState(0); // -N..+N
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteInput, setNoteInput] = useState('');

  const presenterId = players[presenterIdx]?.player_id;
  const isPresenter = presenterId === playerId;
  const presentedTitle = titles[presenterId] || '?';

  useEffect(() => {
    const ch = supabase.channel(`pres-${code}`);
    ch.on('broadcast', { event: 'title' }, ({ payload }) => {
      setTitles((t) => ({ ...t, [payload.targetId]: payload.title }));
    });
    ch.on('broadcast', { event: 'pres:start' }, ({ payload }) => {
      setPhase('pres'); setPresenterIdx(payload.idx); setSlideIdx(0); setGauge(0); setSlides(payload.slides); setTitles(payload.titles);
      const p = players[payload.idx];
      if (p) speakHungarian(`Most ${p.username} prezentál: ${payload.titles[p.player_id]}`);
      playNotification();
    });
    ch.on('broadcast', { event: 'pres:slide' }, ({ payload }) => {
      setSlideIdx(payload.idx); setGauge(0); playClick();
    });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      setGauge((g) => g + payload.delta); playPop();
    });
    ch.on('broadcast', { event: 'pres:end' }, ({ payload }) => {
      setNotes(payload.notes || {}); setPhase('rate');
    });
    ch.on('broadcast', { event: 'pres:next' }, ({ payload }) => {
      if (payload.idx >= players.length) { setPhase('end'); return; }
      if (isHost) startPresentation(payload.idx);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function submitTitle() {
    if (!myTitle.trim()) return;
    // Each player names the NEXT player's title
    const nextPlayer = players[(players.findIndex((p) => p.player_id === playerId) + 1) % players.length];
    channelRef.current?.send({ type: 'broadcast', event: 'title', payload: { targetId: nextPlayer.player_id, title: myTitle.trim() } });
    setMyTitle('');
    playClick();
    if (isHost) setTimeout(() => startPresentation(0), 1500);
  }

  function startPresentation(idx: number) {
    const slides = Array.from({ length: slidesPerTalk }, () => ({
      emoji: SLIDE_EMOJIS[Math.floor(Math.random() * SLIDE_EMOJIS.length)],
      template: PRES_TEMPLATES[Math.floor(Math.random() * PRES_TEMPLATES.length)],
    }));
    channelRef.current?.send({ type: 'broadcast', event: 'pres:start', payload: { idx, slides, titles } });
    setTimeout(() => channelRef.current?.send({ type: 'broadcast', event: 'pres:end', payload: { notes } }), slidesPerTalk * slideTime * 1000);
  }

  function nextSlide() {
    if (!isPresenter) return;
    const ni = slideIdx + 1;
    if (ni >= slidesPerTalk) {
      channelRef.current?.send({ type: 'broadcast', event: 'pres:end', payload: { notes } });
      return;
    }
    channelRef.current?.send({ type: 'broadcast', event: 'pres:slide', payload: { idx: ni } });
  }

  function react(delta: number) {
    if (isPresenter) return;
    channelRef.current?.send({ type: 'broadcast', event: 'react', payload: { delta } });
  }

  function submitNote() {
    if (!noteInput.trim()) return;
    const newNotes = { ...notes, [presenterId]: [(notes[presenterId] || ''), `${username}: ${noteInput.trim()}`].filter(Boolean).join(' | ') };
    setNotes(newNotes);
    setNoteInput('');
    channelRef.current?.send({ type: 'broadcast', event: 'pres:end', payload: { notes: newNotes } });
    if (isHost) setTimeout(() => channelRef.current?.send({ type: 'broadcast', event: 'pres:next', payload: { idx: presenterIdx + 1 } }), 1500);
  }

  if (phase === 'end') {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        <h2 className="text-3xl font-bold text-center">🎤 Prezentációk vége!</h2>
        <div className="game-card space-y-3">
          {players.map((p) => (
            <div key={p.player_id} className="border-b border-border pb-2">
              <div className="font-bold">{p.username} — "{titles[p.player_id] || '?'}"</div>
              {notes[p.player_id] && <div className="text-xs text-muted-foreground">📝 {notes[p.player_id]}</div>}
            </div>
          ))}
        </div>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  if (phase === 'collect') {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-3">
        <h2 className="text-2xl font-bold text-center">🎤 Adj egy címet a következő játékosnak!</h2>
        <p className="text-center text-muted-foreground text-sm">Minél viccesebb, annál jobb.</p>
        <input className="game-input" value={myTitle} onChange={(e) => setMyTitle(e.target.value)} placeholder="pl. A pizza új vallása..." />
        <button className="game-btn-primary w-full" onClick={submitTitle} disabled={!myTitle.trim()}>Küldés</button>
        <div className="text-xs text-muted-foreground">Beérkezett: {Object.keys(titles).length}/{players.length}</div>
      </div>
    );
  }

  if (phase === 'pres') {
    const slide = slides[slideIdx];
    const presenter = players[presenterIdx];
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-3">
        <div className="game-card text-center">
          <p className="text-xs text-muted-foreground">{presenter?.username} prezentál — slide {slideIdx + 1}/{slidesPerTalk}</p>
          <p className="text-2xl font-bold">"{presentedTitle}"</p>
        </div>
        {slide && (
          <div className="game-card text-center py-10 space-y-2">
            <div className="text-9xl">{slide.emoji}</div>
            <div className="text-2xl font-bold">{slide.template}</div>
          </div>
        )}
        <div className="game-card flex items-center justify-between py-2 px-4">
          <button className="game-btn bg-card" onClick={() => react(-1)} disabled={isPresenter}>👎</button>
          <div className="flex-1 mx-3 h-3 bg-muted rounded-full overflow-hidden relative">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, 50 + gauge * 5))}%` }} />
          </div>
          <button className="game-btn bg-card" onClick={() => react(1)} disabled={isPresenter}>👍</button>
        </div>
        {isPresenter && (
          <button className="game-btn-primary w-full" onClick={nextSlide}>Következő slide ▶️</button>
        )}
      </div>
    );
  }

  // rate phase
  return (
    <div className="max-w-xl mx-auto p-4 space-y-3">
      <h2 className="text-2xl font-bold text-center">📝 Jegyzet a prezentációhoz</h2>
      <p className="text-center text-muted-foreground">{players[presenterIdx]?.username} — "{presentedTitle}"</p>
      <textarea className="game-input min-h-[100px]" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Mit gondolsz?" />
      <button className="game-btn-primary w-full" onClick={submitNote}>Mehet a következő</button>
    </div>
  );
}
