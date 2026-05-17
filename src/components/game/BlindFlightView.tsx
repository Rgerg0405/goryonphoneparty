import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings } from '@/lib/gameTypes';
import { pickScribbleWord } from '@/lib/scribbleWords';
import DrawingCanvas from './DrawingCanvas';
import { playClick, playNotification } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

type Round = { drawerId: string; word: string; deadlineAt: number };

export default function BlindFlightView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const rounds = settings.blindRounds ?? 3;
  const drawTime = settings.blindDrawTime ?? 45;
  const darkness = settings.blindDarkness ?? 0.85;
  const channelRef = useRef<any>(null);

  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [phase, setPhase] = useState<'play' | 'rate' | 'end'>('play');
  const [drawing, setDrawing] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [myRating, setMyRating] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(drawTime);

  const totalRounds = rounds * players.length;
  const currentDrawerId = round?.drawerId ?? players[roundIdx % players.length]?.player_id;
  const isDrawer = currentDrawerId === playerId;

  useEffect(() => {
    const ch = supabase.channel(`blind-${code}`);
    ch.on('broadcast', { event: 'round:start' }, ({ payload }) => {
      setRound(payload); setRoundIdx(payload.idx); setPhase('play'); setDrawing(null); setMyRating(null); playNotification();
    });
    ch.on('broadcast', { event: 'round:final' }, ({ payload }) => {
      setDrawing(payload.dataUrl); setPhase('rate');
    });
    ch.on('broadcast', { event: 'rate' }, ({ payload }) => {
      setScores((sc) => ({ ...sc, [payload.drawerId]: (sc[payload.drawerId] || 0) + payload.stars }));
    });
    ch.on('broadcast', { event: 'round:next' }, ({ payload }) => {
      if (payload.idx >= totalRounds) setPhase('end');
      else if (isHost) startRound(payload.idx);
    });
    ch.subscribe((s) => { if (s === 'SUBSCRIBED' && isHost) setTimeout(() => startRound(0), 700); });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (phase !== 'play' || !round) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((round.deadlineAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [phase, round]);

  function startRound(idx: number) {
    const drawer = players[idx % players.length];
    const r: Round = { drawerId: drawer.player_id, word: pickScribbleWord(), deadlineAt: Date.now() + drawTime * 1000 };
    channelRef.current?.send({ type: 'broadcast', event: 'round:start', payload: { ...r, idx } });
    setRound(r); setRoundIdx(idx); setPhase('play');
  }

  function submitDrawing(dataUrl: string) {
    channelRef.current?.send({ type: 'broadcast', event: 'round:final', payload: { dataUrl, drawerId: playerId, word: round?.word } });
    setDrawing(dataUrl); setPhase('rate');
  }

  function rate(stars: number) {
    if (isDrawer || myRating !== null) return;
    channelRef.current?.send({ type: 'broadcast', event: 'rate', payload: { drawerId: currentDrawerId, stars, raterId: playerId } });
    setMyRating(stars);
    playClick();
    // host advances after a delay
    if (isHost) setTimeout(() => {
      channelRef.current?.send({ type: 'broadcast', event: 'round:next', payload: { idx: roundIdx + 1 } });
    }, 2500);
  }

  if (phase === 'end') {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h2 className="text-3xl font-bold text-center">🌑 Vakrepülés eredmények</h2>
        <div className="game-card space-y-2">
          {sorted.map(([pid, sc], i) => {
            const p = players.find((x) => x.player_id === pid);
            return <div key={pid} className="player-slot"><span className="font-bold w-8">{i + 1}.</span><span className="flex-1 font-bold">{p?.username}</span><span className="text-primary font-bold">⭐ {sc}</span></div>;
          })}
        </div>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  const drawer = players.find((p) => p.player_id === currentDrawerId);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-3">
      <div className="game-card flex items-center justify-between py-2 px-4">
        <div className="font-bold">Kör {roundIdx + 1}/{totalRounds}</div>
        <div className="font-bold">{drawer?.username} rajzol</div>
        {phase === 'play' && <div className={`font-bold text-xl ${timeLeft <= 10 ? 'text-destructive animate-pulse' : ''}`}>⏱️ {timeLeft}mp</div>}
      </div>

      {phase === 'play' && isDrawer && round && (
        <>
          <div className="game-card text-center py-2">
            <p className="text-sm text-muted-foreground">Rajzold le (sötétben):</p>
            <p className="text-2xl font-bold">{round.word}</p>
          </div>
          <DrawingCanvas onSubmit={submitDrawing} darknessOverlay={darkness} />
        </>
      )}
      {phase === 'play' && !isDrawer && (
        <div className="game-card text-center py-12 text-muted-foreground">🌑 A rajzoló vakrepülésben dolgozik...</div>
      )}
      {phase === 'rate' && drawing && (
        <div className="space-y-3">
          <div className="game-card text-center"><p className="font-bold">A szó: {round?.word}</p></div>
          <div className="game-card p-2"><img src={drawing} alt="" className="w-full rounded-lg" /></div>
          {!isDrawer && (
            <div className="game-card text-center space-y-2">
              <p className="font-bold">Pontozd a rajzot!</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} className={`text-3xl ${myRating !== null && s <= myRating ? '' : 'opacity-30'}`}
                    onClick={() => rate(s)} disabled={myRating !== null}>⭐</button>
                ))}
              </div>
            </div>
          )}
          {isDrawer && <div className="game-card text-center text-muted-foreground">Várakozás pontozásra...</div>}
        </div>
      )}
    </div>
  );
}
