import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings, speakHungarian } from '@/lib/gameTypes';
import { playClick, playNotification, playPop, playWhoosh, playApplause, playSlideChange, fireConfetti } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

const SLIDE_EMOJIS = ['🦒','🚀','🎩','🐉','🍕','🌈','🦄','💻','📈','🧠','🪐','🐙','🍩','🎲','💡','🦖','🎤','🪩','🧙','🥑','🐢','🍔','🛸','🔥','💎','🌵'];
const PRES_TEMPLATES = [
  'Miért fontos ez a következő 10 évben?',
  'A 3 alapelv',
  'Egy meglepő statisztika',
  'Egy személyes történet',
  'A jövő képe',
  'Akcióra hívás',
  'A legnagyobb félreértés',
  'A titkos összetevő',
  'Konkurencia elemzés',
  'A 5 lépéses módszer',
];

type Phase = 'intro' | 'collect' | 'pres' | 'notes' | 'recap' | 'end';

type Slide = { emoji: string; template: string };

export default function PresentationGameView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const slidesPerTalk = Math.max(3, Math.min(10, settings.presSlides ?? 5));
  const slideTime = Math.max(10, settings.presSlideTime ?? 25);
  const channelRef = useRef<any>(null);
  const notesRef = useRef<Record<string, string[]>>({});
  const gaugeRef = useRef<Record<string, number>>({}); // per-presenter running gauge
  const titlesRef = useRef<Record<string, string>>({});

  const [phase, setPhase] = useState<Phase>('intro');
  const [titles, setTitles] = useState<Record<string, string>>({}); // targetId -> title
  const [myTitle, setMyTitle] = useState('');
  const [presenterIdx, setPresenterIdx] = useState(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideDeadline, setSlideDeadline] = useState(0);
  const [slideTimeLeft, setSlideTimeLeft] = useState(0);
  const [gauge, setGauge] = useState(0);
  const [noteInput, setNoteInput] = useState('');
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [submittedNotes, setSubmittedNotes] = useState<Set<string>>(new Set());

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { titlesRef.current = titles; }, [titles]);

  const presenter = players[presenterIdx];
  const presenterId = presenter?.player_id;
  const isPresenter = presenterId === playerId;
  const presentedTitle = titles[presenterId] || '(cím nélkül)';

  // ============ INTRO: TTS + auto-advance ============
  useEffect(() => {
    if (phase !== 'intro') return;
    speakHungarian('Üdv a Vicces Prezentáció módban! Mindenki kap egy címet, amit le kell adnia, majd egyenként prezentálnotok kell egy ismeretlen témáról. A közönség értékel egy gauge-on, és írhat jegyzeteket.');
    const t = setTimeout(() => setPhase('collect'), 6000);
    return () => clearTimeout(t);
  }, [phase]);

  // ============ CHANNEL ============
  useEffect(() => {
    const ch = supabase.channel(`pres-${code}`);
    ch.on('broadcast', { event: 'title' }, ({ payload }) => {
      setTitles((t) => {
        const updated = { ...t, [payload.targetId]: payload.title };
        titlesRef.current = updated;
        if (isHost && Object.keys(updated).length >= players.length) {
          channelRef.current?.send({ type: 'broadcast', event: 'titles:done', payload: { titles: updated } });
          setTimeout(() => startPresentation(0, updated), 300);
        }
        return updated;
      });
    });
    ch.on('broadcast', { event: 'titles:done' }, ({ payload }) => {
      setTitles(payload.titles);
      titlesRef.current = payload.titles;
      setPhase('pres');
    });
    ch.on('broadcast', { event: 'pres:start' }, ({ payload }) => {
      setPhase('pres');
      setPresenterIdx(payload.idx);
      setSlideIdx(0);
      setGauge(0);
      setSlides(payload.slides);
      setTitles(payload.titles);
      titlesRef.current = payload.titles;
      setSlideDeadline(Date.now() + slideTime * 1000);
      const p = players[payload.idx];
      if (p) speakHungarian(`Most ${p.username} prezentál: ${payload.titles[p.player_id] || 'titokzatos téma'}`);
      playNotification(); playWhoosh();
    });
    ch.on('broadcast', { event: 'pres:slide' }, ({ payload }) => {
      setSlideIdx(payload.idx);
      setGauge(0);
      setSlideDeadline(Date.now() + slideTime * 1000);
      playSlideChange();
    });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      setGauge((g) => Math.max(-20, Math.min(20, g + payload.delta)));
      playPop();
    });
    ch.on('broadcast', { event: 'pres:notes' }, ({ payload }) => {
      setPhase('notes');
      setPresenterIdx(payload.idx);
      setSubmittedNotes(new Set());
    });
    ch.on('broadcast', { event: 'note' }, ({ payload }) => {
      setNotes((all) => {
        const list = all[payload.presenterId] || [];
        return { ...all, [payload.presenterId]: [...list, `${payload.from}: ${payload.text}`] };
      });
      setSubmittedNotes((s) => new Set([...Array.from(s), payload.fromId]));
    });
    ch.on('broadcast', { event: 'pres:next' }, ({ payload }) => {
      if (payload.idx >= players.length) {
        setPhase('recap');
      } else {
        if (isHost) startPresentation(payload.idx, titlesRef.current);
      }
    });
    ch.on('broadcast', { event: 'pres:end' }, () => setPhase('recap'));
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ============ Slide timer (auto-advance) ============
  useEffect(() => {
    if (phase !== 'pres' || !slideDeadline) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((slideDeadline - Date.now()) / 1000));
      setSlideTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        if (isPresenter) nextSlide();
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, slideDeadline, isPresenter]);

  // ============ TITLE COLLECTION ============
  function submitTitle() {
    if (!myTitle.trim()) return;
    const myIdx = players.findIndex((p) => p.player_id === playerId);
    const targetId = players[(myIdx + 1) % players.length].player_id;
    const updated = { ...titles, [targetId]: myTitle.trim() };
    setTitles(updated);
    channelRef.current?.send({ type: 'broadcast', event: 'title', payload: { targetId, title: myTitle.trim() } });
    setMyTitle('');
    playClick();
    // host: when all titles in, start
    if (isHost) {
      setTimeout(() => {
        // re-check after broadcast settles
        setTitles((cur) => {
          const got = Object.keys(cur).length;
          if (got >= players.length) {
            channelRef.current?.send({ type: 'broadcast', event: 'titles:done', payload: { titles: cur } });
            startPresentation(0, cur);
          }
          return cur;
        });
      }, 800);
    }
  }

  // host force-start titles
  function forceStartPresentations() {
    // fill in missing titles
    const filled: Record<string, string> = { ...titles };
    players.forEach((p) => { if (!filled[p.player_id]) filled[p.player_id] = '(meglepetés téma)'; });
    setTitles(filled);
    channelRef.current?.send({ type: 'broadcast', event: 'titles:done', payload: { titles: filled } });
    titlesRef.current = filled;
    setTimeout(() => startPresentation(0, filled), 500);
  }

  function startPresentation(idx: number, sourceTitles = titlesRef.current) {
    const newSlides: Slide[] = Array.from({ length: slidesPerTalk }, () => ({
      emoji: SLIDE_EMOJIS[Math.floor(Math.random() * SLIDE_EMOJIS.length)],
      template: PRES_TEMPLATES[Math.floor(Math.random() * PRES_TEMPLATES.length)],
    }));
    setPresenterIdx(idx); setSlideIdx(0); setSlides(newSlides); setGauge(0); setPhase('pres');
    setSlideDeadline(Date.now() + slideTime * 1000);
    channelRef.current?.send({ type: 'broadcast', event: 'pres:start', payload: { idx, slides: newSlides, titles: sourceTitles } });
    const p = players[idx];
    if (p) speakHungarian(`Most ${p.username} prezentál: ${sourceTitles[p.player_id] || 'titokzatos téma'}`);
    playNotification();
  }

  function nextSlide() {
    if (!isPresenter) return;
    const ni = slideIdx + 1;
    if (ni >= slidesPerTalk) {
      // store gauge as score for this presenter
      gaugeRef.current[presenterId] = (gaugeRef.current[presenterId] || 0) + gauge;
      channelRef.current?.send({ type: 'broadcast', event: 'pres:notes', payload: { idx: presenterIdx } });
      setPhase('notes');
      setSubmittedNotes(new Set());
      return;
    }
    setSlideIdx(ni); setGauge(0);
    setSlideDeadline(Date.now() + slideTime * 1000);
    channelRef.current?.send({ type: 'broadcast', event: 'pres:slide', payload: { idx: ni } });
  }

  function react(delta: number) {
    if (isPresenter) return;
    setGauge((g) => Math.max(-20, Math.min(20, g + delta)));
    channelRef.current?.send({ type: 'broadcast', event: 'react', payload: { delta } });
  }

  function submitNote() {
    if (submittedNotes.has(playerId)) return;
    const text = noteInput.trim();
    if (text) {
      channelRef.current?.send({ type: 'broadcast', event: 'note', payload: {
        presenterId, fromId: playerId, from: username, text,
      } });
      setNotes((all) => {
        const list = all[presenterId] || [];
        return { ...all, [presenterId]: [...list, `${username}: ${text}`] };
      });
    }
    setSubmittedNotes((s) => new Set([...Array.from(s), playerId]));
    setNoteInput('');
    playClick();
  }

  // host advances after all notes (or skip)
  useEffect(() => {
    if (phase !== 'notes' || !isHost) return;
    const total = players.length; // all players can leave a note (presenter included optional)
    if (submittedNotes.size >= total) {
      const next = presenterIdx + 1;
      const t = setTimeout(() => {
        channelRef.current?.send({ type: 'broadcast', event: 'pres:next', payload: { idx: next } });
        if (next >= players.length) setPhase('recap');
        else startPresentation(next, titlesRef.current);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [submittedNotes, phase, isHost, presenterIdx, players.length]);

  function hostSkipNotes() {
    const next = presenterIdx + 1;
    channelRef.current?.send({ type: 'broadcast', event: 'pres:next', payload: { idx: next } });
    if (next >= players.length) setPhase('recap');
    else startPresentation(next, titlesRef.current);
  }

  // ===================== RENDER =====================
  if (phase === 'intro') {
    return (
      <div className="max-w-xl mx-auto p-6 text-center space-y-4">
        <div className="text-7xl animate-bounce">🎤</div>
        <h2 className="text-3xl font-bold">Vicces Prezentáció</h2>
        <p className="text-muted-foreground">A szabályok felolvasásra kerülnek...</p>
        {isHost && <button className="game-btn-primary" onClick={() => setPhase('collect')}>⏭️ Kihagyás</button>}
      </div>
    );
  }

  if (phase === 'collect') {
    const myIdx = players.findIndex((p) => p.player_id === playerId);
    const targetPlayer = players[(myIdx + 1) % players.length];
    const myAlreadySubmitted = !!titles[targetPlayer?.player_id];
    return (
      <div className="max-w-xl mx-auto p-4 space-y-3">
        <h2 className="text-2xl font-bold text-center">🎤 Adj címet {targetPlayer?.username}-nak</h2>
        <p className="text-center text-muted-foreground text-sm">Minél viccesebb a cím, annál jobb a prezi!</p>
        {!myAlreadySubmitted ? (
          <>
            <input className="game-input" value={myTitle} onChange={(e) => setMyTitle(e.target.value)}
              placeholder="pl. A pizza új vallása..." onKeyDown={(e) => e.key === 'Enter' && submitTitle()} autoFocus />
            <button className="game-btn-primary w-full" onClick={submitTitle} disabled={!myTitle.trim()}>Küldés</button>
          </>
        ) : (
          <div className="game-card text-center">✅ Küldve! Várakozás a többiekre...</div>
        )}
        <div className="text-xs text-muted-foreground text-center">Beérkezett: {Object.keys(titles).length}/{players.length}</div>
        {isHost && (
          <button className="game-btn bg-card text-xs py-2 w-full" onClick={forceStartPresentations}>
            ⏭️ Indítás most ({Object.keys(titles).length}/{players.length})
          </button>
        )}
      </div>
    );
  }

  if (phase === 'pres') {
    const slide = slides[slideIdx];
    const bgGradients = [
      'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
      'linear-gradient(135deg, #48dbfb 0%, #1dd1a1 100%)',
      'linear-gradient(135deg, #5f27cd 0%, #ee5253 100%)',
      'linear-gradient(135deg, #00d2d3 0%, #54a0ff 100%)',
      'linear-gradient(135deg, #feca57 0%, #ff9ff3 100%)',
      'linear-gradient(135deg, #1dd1a1 0%, #5f27cd 100%)',
    ];
    const bg = bgGradients[slideIdx % bgGradients.length];
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-3">
        <div className="game-card ios-glass text-center animate-slide-up">
          <p className="text-xs text-muted-foreground">{presenter?.username} prezentál — slide {slideIdx + 1}/{slidesPerTalk}</p>
          <p className="text-3xl font-bold">"{presentedTitle}"</p>
          <p className={`text-sm font-bold ${slideTimeLeft <= 5 ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}>⏱️ {slideTimeLeft}mp</p>
        </div>
        {slide && (
          <div key={slideIdx} className="rounded-2xl text-center py-10 md:py-16 px-4 space-y-4 animate-blur-in shadow-2xl" style={{ background: bg, color: '#fff', minHeight: '40vh' }}>
            <div className="text-7xl md:text-9xl animate-spring-in drop-shadow-lg">{slide.emoji}</div>
            <div className="text-2xl md:text-4xl font-bold drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{slide.template}</div>
          </div>
        )}
        <div className="game-card ios-glass flex items-center justify-between py-3 px-4">
          <button className="game-btn bg-card text-3xl px-4" onClick={() => react(-1)} disabled={isPresenter}>👎</button>
          <div className="flex-1 mx-3 h-4 bg-muted rounded-full overflow-hidden relative border border-border">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground/40" />
            <div className={`absolute top-0 bottom-0 transition-all ${gauge >= 0 ? 'bg-primary' : 'bg-destructive'}`}
              style={{
                left: gauge >= 0 ? '50%' : `${50 + gauge * 2.5}%`,
                width: `${Math.abs(gauge) * 2.5}%`,
              }} />
          </div>
          <button className="game-btn bg-card text-3xl px-4" onClick={() => react(1)} disabled={isPresenter}>👍</button>
        </div>
        {isPresenter ? (
          <button className="game-btn-primary w-full" onClick={() => { playWhoosh(); nextSlide(); }}>Következő slide ▶️</button>
        ) : (
          <div className="game-card text-center text-xs text-muted-foreground">Te a közönségben vagy. Reagálj a gombokkal!</div>
        )}
      </div>
    );
  }

  if (phase === 'notes') {
    const mineSent = submittedNotes.has(playerId);
    return (
      <div className="max-w-xl mx-auto p-4 space-y-3">
        <h2 className="text-2xl font-bold text-center">📝 Jegyzet</h2>
        <p className="text-center text-muted-foreground">
          {presenter?.username} — "{presentedTitle}"
        </p>
        {!mineSent ? (
          <>
            <textarea className="game-input min-h-[100px]" value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)} placeholder="Mit gondolsz? (üresen is küldhető)" />
            <button className="game-btn-primary w-full" onClick={submitNote}>Küldés</button>
          </>
        ) : (
          <div className="game-card text-center">✅ Jegyzet elküldve. Várakozás...</div>
        )}
        <div className="text-xs text-muted-foreground text-center">Beérkezett: {submittedNotes.size}/{players.length}</div>
        {isHost && (
          <button className="game-btn bg-card text-xs py-2 w-full" onClick={hostSkipNotes}>
            ⏭️ Tovább most
          </button>
        )}
      </div>
    );
  }

  // recap / end
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3 animate-zoom-in">
      <h2 className="text-3xl font-bold text-center animate-spring-in">🎤 Prezentációk vége!</h2>
      <div className="game-card space-y-3">
        {players.map((p) => (
          <div key={p.player_id} className="border-b border-border pb-2">
            <div className="font-bold">{p.username} — "{titles[p.player_id] || '?'}"</div>
            {(notes[p.player_id] || []).length > 0 && (
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {(notes[p.player_id] || []).map((n, i) => <li key={i}>📝 {n}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
    </div>
  );
}
