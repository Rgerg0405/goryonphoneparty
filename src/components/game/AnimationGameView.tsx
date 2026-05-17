import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings } from '@/lib/gameTypes';
import DrawingCanvas from './DrawingCanvas';
import { playClick, playNotification } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

export default function AnimationGameView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const totalFrames = settings.animFrames ?? 6;
  const frameTime = settings.animFrameTime ?? 30;
  const channelRef = useRef<any>(null);

  const [phase, setPhase] = useState<'draw' | 'show' | 'end'>('draw');
  const [frameIdx, setFrameIdx] = useState(0);
  const [myFrames, setMyFrames] = useState<string[]>([]);
  const [allAnims, setAllAnims] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState(frameTime);
  const [deadline, setDeadline] = useState(Date.now() + frameTime * 1000);
  const [showingIdx, setShowingIdx] = useState(0);
  const [playFrame, setPlayFrame] = useState(0);

  useEffect(() => {
    const ch = supabase.channel(`anim-${code}`);
    ch.on('broadcast', { event: 'frame:next' }, ({ payload }) => {
      setFrameIdx(payload.idx); setDeadline(payload.deadlineAt); playNotification();
    });
    ch.on('broadcast', { event: 'anim:submit' }, ({ payload }) => {
      setAllAnims((a) => ({ ...a, [payload.playerId]: payload.frames }));
    });
    ch.on('broadcast', { event: 'show:start' }, ({ payload }) => {
      setAllAnims(payload.anims); setPhase('show'); setShowingIdx(0); setPlayFrame(0);
    });
    ch.on('broadcast', { event: 'show:next' }, ({ payload }) => {
      setShowingIdx(payload.idx); setPlayFrame(0);
      if (payload.idx >= players.length) setPhase('end');
    });
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' && isHost) {
        const d = Date.now() + frameTime * 1000;
        setDeadline(d);
        setTimeout(() => ch.send({ type: 'broadcast', event: 'frame:next', payload: { idx: 0, deadlineAt: d } }), 500);
      }
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (phase !== 'draw') return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
    }, 250);
    return () => clearInterval(t);
  }, [phase, deadline]);

  // playback ticker for show phase
  useEffect(() => {
    if (phase !== 'show') return;
    const t = setInterval(() => setPlayFrame((f) => f + 1), 250);
    return () => clearInterval(t);
  }, [phase, showingIdx]);

  function submitFrame(dataUrl: string) {
    const newFrames = [...myFrames, dataUrl];
    setMyFrames(newFrames);
    playClick();
    if (newFrames.length >= totalFrames) {
      channelRef.current?.send({ type: 'broadcast', event: 'anim:submit', payload: { playerId, frames: newFrames } });
      if (isHost) {
        // wait then trigger show
        setTimeout(() => {
          channelRef.current?.send({ type: 'broadcast', event: 'show:start', payload: { anims: { ...allAnims, [playerId]: newFrames } } });
        }, 1500);
      }
    } else if (isHost) {
      const d = Date.now() + frameTime * 1000;
      setDeadline(d);
      channelRef.current?.send({ type: 'broadcast', event: 'frame:next', payload: { idx: newFrames.length, deadlineAt: d } });
    }
  }

  if (phase === 'end') {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        <h2 className="text-3xl font-bold text-center">🎬 Vége!</h2>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  if (phase === 'show') {
    const playerIds = Object.keys(allAnims);
    const showingPid = playerIds[showingIdx];
    const frames = allAnims[showingPid] || [];
    const cur = frames[playFrame % Math.max(1, frames.length)];
    const showingPlayer = players.find((p) => p.player_id === showingPid);
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <div className="game-card text-center font-bold">🎬 {showingPlayer?.username || '...'} animációja ({showingIdx + 1}/{playerIds.length})</div>
        <div className="game-card p-2"><img src={cur} alt="" className="w-full rounded-lg" /></div>
        {isHost && (
          <button className="game-btn-primary w-full" onClick={() => channelRef.current?.send({ type: 'broadcast', event: 'show:next', payload: { idx: showingIdx + 1 } })}>
            Következő ▶️
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-3">
      <div className="game-card flex items-center justify-between py-2 px-4">
        <div className="font-bold">🎬 Képkocka {frameIdx + 1}/{totalFrames}</div>
        <div className="font-bold">{myFrames.length}/{totalFrames} kész</div>
        <div className={`font-bold text-xl ${timeLeft <= 5 ? 'text-destructive animate-pulse' : ''}`}>⏱️ {timeLeft}mp</div>
      </div>
      {myFrames.length > frameIdx ? (
        <div className="game-card text-center py-8 text-muted-foreground">Várakozás a többi játékosra...</div>
      ) : (
        <DrawingCanvas onSubmit={submitFrame} />
      )}
      {myFrames.length > 0 && (
        <div className="game-card">
          <div className="text-xs font-bold mb-1">Előző képkockák</div>
          <div className="flex gap-2 overflow-x-auto">
            {myFrames.map((f, i) => <img key={i} src={f} alt="" className="h-16 rounded border border-border" />)}
          </div>
        </div>
      )}
    </div>
  );
}
