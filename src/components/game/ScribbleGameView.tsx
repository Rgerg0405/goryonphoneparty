import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings } from '@/lib/gameTypes';
import { pickScribbleWord } from '@/lib/scribbleWords';
import DrawingCanvas from './DrawingCanvas';
import { getAvatarDisplay } from '@/lib/avatars';
import { playClick, playPop, playNotification } from '@/lib/sounds';

interface Props {
  code: string;
  players: Player[];
  playerId: string;
  username: string;
  isHost: boolean;
  settings: GameSettings;
  onFinish: () => void;
}

type Msg = { id: string; pid: string; name: string; text: string; correct: boolean; t: number };
type Round = { drawerId: string; word: string; startAt: number; deadlineAt: number };

export default function ScribbleGameView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const rounds = settings.scribbleRounds ?? 3;
  const drawTime = settings.scribbleDrawTime ?? 60;
  const channelRef = useRef<any>(null);

  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [phase, setPhase] = useState<'wait' | 'play' | 'reveal' | 'end'>('wait');
  const [guess, setGuess] = useState('');
  const [liveDrawing, setLiveDrawing] = useState<string | null>(null);

  // build rotation: every round, drawer = players[(round) % players.length]
  const totalRounds = rounds * players.length;
  const currentDrawerId = useMemo(() => round?.drawerId ?? players[roundIdx % players.length]?.player_id, [round, roundIdx, players]);
  const isDrawer = currentDrawerId === playerId;

  useEffect(() => {
    const ch = supabase.channel(`scribble-${code}`);
    ch.on('broadcast', { event: 'round:start' }, ({ payload }) => {
      setRound(payload);
      setSolved(new Set());
      setMessages([]);
      setLiveDrawing(null);
      setPhase('play');
      playNotification();
    });
    ch.on('broadcast', { event: 'guess' }, ({ payload }) => {
      setMessages((m) => [...m, payload].slice(-50));
      if (payload.correct) {
        setSolved((s) => new Set([...Array.from(s), payload.pid]));
        setScores((sc) => ({ ...sc, [payload.pid]: (sc[payload.pid] || 0) + payload.points }));
        playPop();
      }
    });
    ch.on('broadcast', { event: 'live:draw' }, ({ payload }) => {
      if (payload.drawerId !== playerId) setLiveDrawing(payload.dataUrl);
    });
    ch.on('broadcast', { event: 'round:end' }, ({ payload }) => {
      setPhase('reveal');
      setScores(payload.scores);
      // reveal then next
      setTimeout(() => {
        if (payload.nextIdx >= totalRounds) {
          setPhase('end');
        } else if (isHost) {
          startRound(payload.nextIdx);
        }
      }, 3500);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && isHost) {
        // small delay so subscribers attach
        setTimeout(() => startRound(0), 700);
      }
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // timer
  useEffect(() => {
    if (phase !== 'play' || !round) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((round.deadlineAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        if (isHost) endRound();
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  function startRound(idx: number) {
    const drawer = players[idx % players.length];
    const r: Round = {
      drawerId: drawer.player_id,
      word: pickScribbleWord(settings.scribbleCustomWords),
      startAt: Date.now(),
      deadlineAt: Date.now() + drawTime * 1000,
    };
    setRoundIdx(idx);
    channelRef.current?.send({ type: 'broadcast', event: 'round:start', payload: { ...r, idx } });
    setRound(r);
    setPhase('play');
  }

  function endRound() {
    channelRef.current?.send({ type: 'broadcast', event: 'round:end', payload: { scores, nextIdx: roundIdx + 1 } });
    setPhase('reveal');
  }

  // drawer broadcasts canvas every 700ms
  const handleLiveDraw = (dataUrl: string) => {
    if (!isDrawer) return;
    channelRef.current?.send({ type: 'broadcast', event: 'live:draw', payload: { drawerId: playerId, dataUrl } });
  };

  function submitGuess() {
    if (!guess.trim() || !round || isDrawer || solved.has(playerId)) return;
    const ok = guess.trim().toLowerCase() === round.word.toLowerCase();
    const points = ok ? Math.max(20, Math.round(timeLeft * 2)) : 0;
    const payload: Msg & { points: number } = {
      id: crypto.randomUUID(), pid: playerId, name: username, text: ok ? '✅ kitalálta!' : guess.trim(),
      correct: ok, t: Date.now(), points,
    } as any;
    channelRef.current?.send({ type: 'broadcast', event: 'guess', payload });
    setGuess('');
    playClick();
  }

  const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (phase === 'end') {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h2 className="text-3xl font-bold text-center">🏁 Scribble eredmények</h2>
        <div className="game-card space-y-2">
          {sortedScores.length === 0 && <p className="text-center text-muted-foreground">Nincs pontszám.</p>}
          {sortedScores.map(([pid, sc], i) => {
            const p = players.find((x) => x.player_id === pid);
            return (
              <div key={pid} className="flex items-center gap-3 player-slot">
                <span className="text-2xl font-bold w-8">{i + 1}.</span>
                <span className="font-bold flex-1">{p?.username || 'Ismeretlen'}</span>
                <span className="font-bold text-primary">{sc} pt</span>
              </div>
            );
          })}
        </div>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  const drawer = players.find((p) => p.player_id === currentDrawerId);

  return (
    <div className="max-w-5xl mx-auto p-4 grid lg:grid-cols-[1fr_300px] gap-3">
      <div className="space-y-3">
        <div className="game-card py-2 px-4 flex items-center justify-between">
          <div className="font-bold">Kör {roundIdx + 1}/{totalRounds}</div>
          <div className="font-bold">
            {drawer && (
              <span className="flex items-center gap-2">
                ✏️ {drawer.username} rajzol
              </span>
            )}
          </div>
          <div className={`font-bold text-xl ${timeLeft <= 10 ? 'text-destructive animate-pulse' : ''}`}>⏱️ {timeLeft}mp</div>
        </div>

        {isDrawer && phase === 'play' && round && (
          <>
            <div className="game-card text-center py-2">
              <p className="text-sm text-muted-foreground">A te szavad:</p>
              <p className="text-3xl font-bold">{round.word}</p>
            </div>
            <DrawingCanvas onSubmit={() => {}} hideSubmit onChange={handleLiveDraw} />
          </>
        )}

        {!isDrawer && phase === 'play' && (
          <div className="game-card p-2">
            <div className="rounded-xl overflow-hidden bg-white" style={{ aspectRatio: '16/10' }}>
              {liveDrawing ? (
                <img src={liveDrawing} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">A rajzoló kezd...</div>
              )}
            </div>
          </div>
        )}

        {phase === 'reveal' && round && (
          <div className="game-card text-center py-6">
            <p className="text-sm text-muted-foreground">A szó volt:</p>
            <p className="text-4xl font-bold">{round.word}</p>
            <p className="text-muted-foreground mt-2">Következő kör...</p>
          </div>
        )}
      </div>

      <div className="game-card flex flex-col h-[70vh]">
        <div className="font-bold text-sm mb-2">💬 Tippek</div>
        <div className="flex-1 overflow-y-auto space-y-1 text-sm">
          {messages.map((m) => (
            <div key={m.id} className={`px-2 py-1 rounded ${m.correct ? 'bg-primary/20 font-bold' : 'bg-card'}`}>
              <span className="font-bold">{m.name}:</span> {m.text}
            </div>
          ))}
        </div>
        {!isDrawer && phase === 'play' && !solved.has(playerId) && (
          <div className="flex gap-2 mt-2">
            <input value={guess} onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
              className="game-input flex-1" placeholder="Tipp..." autoFocus />
            <button className="game-btn-primary" onClick={submitGuess}>OK</button>
          </div>
        )}
        <div className="mt-3 border-t-2 border-border pt-2">
          <div className="text-xs font-bold mb-1">🏆 Eredmény</div>
          {sortedScores.slice(0, 5).map(([pid, sc]) => {
            const p = players.find((x) => x.player_id === pid);
            return (
              <div key={pid} className="flex justify-between text-xs">
                <span>{p?.username || '...'}</span>
                <span className="font-bold">{sc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
