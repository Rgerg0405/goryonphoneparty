import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Player, GameSettings } from '@/lib/gameTypes';
import { playClick, playNotification, playPop, playSubmit } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

type Loc = { id: string; name: string; lat: number; lng: number };

const LOCATIONS: Loc[] = [
  { id: 'paris', name: 'Eiffel-torony, Párizs', lat: 48.8584, lng: 2.2945 },
  { id: 'tokyo', name: 'Shibuya, Tokió', lat: 35.6595, lng: 139.7005 },
  { id: 'nyc', name: 'Times Square, New York', lat: 40.758, lng: -73.985 },
  { id: 'sydney', name: 'Operaház, Sydney', lat: -33.8568, lng: 151.2153 },
  { id: 'rio', name: 'Megváltó Krisztus, Rio', lat: -22.9519, lng: -43.2105 },
  { id: 'cairo', name: 'Gízai piramisok', lat: 29.9792, lng: 31.1342 },
  { id: 'london', name: 'Big Ben, London', lat: 51.4994, lng: -0.1244 },
  { id: 'moscow', name: 'Kreml, Moszkva', lat: 55.7520, lng: 37.6175 },
  { id: 'dubai', name: 'Burj Khalifa, Dubaj', lat: 25.1972, lng: 55.2744 },
  { id: 'reykjavik', name: 'Reykjavík', lat: 64.1466, lng: -21.9426 },
  { id: 'bangkok', name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { id: 'rome', name: 'Colosseum, Róma', lat: 41.8902, lng: 12.4922 },
  { id: 'berlin', name: 'Brandenburgi kapu, Berlin', lat: 52.5163, lng: 13.3777 },
  { id: 'capetown', name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
  { id: 'buenosaires', name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
  { id: 'budapest', name: 'Parlament, Budapest', lat: 47.5072, lng: 19.0455 },
  { id: 'venice', name: 'Velence', lat: 45.4408, lng: 12.3155 },
  { id: 'istanbul', name: 'Hagia Sophia, Isztambul', lat: 41.0086, lng: 28.9802 },
  { id: 'machu', name: 'Machu Picchu', lat: -13.1631, lng: -72.5450 },
  { id: 'taj', name: 'Taj Mahal', lat: 27.1751, lng: 78.0421 },
];

const WORLD_MAP_URL = 'https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg';

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function scoreForDistance(km: number) {
  // 0 km = 5000 pts, 10000+ km = 0 pts; exponential falloff
  return Math.max(0, Math.round(5000 * Math.exp(-km / 2000)));
}

type Phase = 'guessing' | 'reveal' | 'end';
type Guess = { playerId: string; username: string; lat: number; lng: number; distance: number; score: number };

export default function GeoGuesserView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const totalRounds = Math.max(1, Math.min(10, settings.geoRounds ?? 5));
  const roundTime = Math.max(20, Math.min(180, settings.geoTime ?? 90));

  const channelRef = useRef<any>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('guessing');
  const [loc, setLoc] = useState<Loc | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [timeLeft, setTimeLeft] = useState(roundTime);
  const [myGuess, setMyGuess] = useState<{ lat: number; lng: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const guessesRef = useRef<Guess[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const scoresRef = useRef<Record<string, number>>({});

  useEffect(() => { guessesRef.current = guesses; }, [guesses]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ dragging: boolean; sx: number; sy: number; ox: number; oy: number; moved: boolean }>({
    dragging: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false,
  });
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [round]);

  const usedLocsRef = useRef<Set<string>>(new Set());

  function pickRandomLoc(): Loc {
    const remaining = LOCATIONS.filter((l) => !usedLocsRef.current.has(l.id));
    const pool = remaining.length > 0 ? remaining : LOCATIONS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    usedLocsRef.current.add(pick.id);
    return pick;
  }

  function hostStartRound(idx: number) {
    const l = pickRandomLoc();
    const d = Date.now() + roundTime * 1000;
    channelRef.current?.send({ type: 'broadcast', event: 'geo:round', payload: { round: idx, loc: l, deadline: d } });
    applyRoundStart(idx, l, d);
  }

  function applyRoundStart(idx: number, l: Loc, d: number) {
    setRound(idx); setLoc(l); setDeadline(d); setPhase('guessing');
    setMyGuess(null); setSubmitted(false); setGuesses([]); guessesRef.current = [];
    playNotification();
  }

  // Setup channel
  useEffect(() => {
    const ch = supabase.channel(`geo-${code}`);
    ch.on('broadcast', { event: 'geo:round' }, ({ payload }) => {
      applyRoundStart(payload.round, payload.loc, payload.deadline);
    });
    ch.on('broadcast', { event: 'geo:guess' }, ({ payload }) => {
      setGuesses((all) => {
        if (all.find((g) => g.playerId === payload.playerId)) return all;
        const next = [...all, payload as Guess];
        guessesRef.current = next;
        // host auto-reveals when all guessed
        if (isHost && next.length >= players.length) {
          setTimeout(() => hostReveal(next), 400);
        }
        return next;
      });
      playPop();
    });
    ch.on('broadcast', { event: 'geo:reveal' }, ({ payload }) => {
      setGuesses(payload.guesses);
      setScores(payload.scores);
      scoresRef.current = payload.scores;
      setPhase('reveal');
      playSubmit();
    });
    ch.on('broadcast', { event: 'geo:end' }, ({ payload }) => {
      setScores(payload.scores);
      setPhase('end');
    });
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' && isHost && round === 0 && !loc) {
        setTimeout(() => hostStartRound(1), 500);
      }
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function hostReveal(currentGuesses?: Guess[]) {
    const gs = currentGuesses || guessesRef.current;
    // fill in zero scores for missing players
    const filled = players.map((p) => {
      const g = gs.find((x) => x.playerId === p.player_id);
      if (g) return g;
      return { playerId: p.player_id, username: p.username, lat: 0, lng: 0, distance: 99999, score: 0 } as Guess;
    });
    const nextScores = { ...scoresRef.current };
    filled.forEach((g) => { nextScores[g.playerId] = (nextScores[g.playerId] || 0) + g.score; });
    scoresRef.current = nextScores;
    channelRef.current?.send({ type: 'broadcast', event: 'geo:reveal', payload: { guesses: filled, scores: nextScores } });
    setGuesses(filled); setScores(nextScores); setPhase('reveal');
  }

  // timer
  useEffect(() => {
    if (phase !== 'guessing' || !deadline) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        if (isHost) setTimeout(() => hostReveal(), 400);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, deadline, isHost]);

  function submitGuess() {
    if (!myGuess || !loc || submitted) return;
    const distance = haversine(myGuess, loc);
    const score = scoreForDistance(distance);
    const payload: Guess = { playerId, username, lat: myGuess.lat, lng: myGuess.lng, distance, score };
    channelRef.current?.send({ type: 'broadcast', event: 'geo:guess', payload });
    setGuesses((all) => {
      if (all.find((g) => g.playerId === playerId)) return all;
      const next = [...all, payload]; guessesRef.current = next;
      if (isHost && next.length >= players.length) setTimeout(() => hostReveal(next), 400);
      return next;
    });
    setSubmitted(true);
    playSubmit();
  }

  function hostNext() {
    if (round >= totalRounds) {
      channelRef.current?.send({ type: 'broadcast', event: 'geo:end', payload: { scores: scoresRef.current } });
      setPhase('end');
      return;
    }
    hostStartRound(round + 1);
  }

  // Stable per-round street view URL so the iframe doesn't re-mount on every render
  const stableStreetViewSrc = useMemo(() => {
    if (!loc) return '';
    const heading = Math.floor(Math.random() * 360);
    return `https://maps.google.com/maps?q&layer=c&cbll=${loc.lat},${loc.lng}&cbp=11,${heading},0,0,0&output=svembed`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.id, round]);

  const sortedScores = useMemo(() => (
    players.map((p) => ({ playerId: p.player_id, username: p.username, score: scores[p.player_id] || 0 }))
      .sort((a, b) => b.score - a.score)
  ), [players, scores]);

  // ============ RENDER ============

  if (phase === 'end') {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-4 text-center">
        <div className="text-6xl animate-bounce">🌍</div>
        <h2 className="text-3xl font-bold">GeoGuesser vége!</h2>
        <div className="game-card text-left">
          <div className="font-bold mb-2">🏆 Végeredmény</div>
          {sortedScores.map((s, i) => (
            <div key={s.playerId} className="flex justify-between border-b border-border/40 py-1">
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {s.username}</span>
              <span className="font-bold text-primary">{s.score} pt</span>
            </div>
          ))}
        </div>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-2 md:p-4 space-y-3">
      <div className="game-card grid grid-cols-3 gap-2 items-center py-2 px-3 text-xs md:text-sm text-center">
        <div className="font-bold">🌍 Kör {round}/{totalRounds}</div>
        <div className={`font-bold text-xl ${timeLeft <= 10 && phase === 'guessing' ? 'text-destructive animate-pulse' : ''}`}>
          ⏱️ {phase === 'guessing' ? `${timeLeft}mp` : 'EREDMÉNY'}
        </div>
        <div className="font-bold">🎯 {guesses.length}/{players.length} tipp</div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Street view */}
        <div className="game-card p-2">
          <div className="text-xs font-bold mb-1 text-center">🛣️ Nézz körül!</div>
          <div className="relative rounded-xl overflow-hidden bg-card" style={{ aspectRatio: '16/10' }}>
            {loc && (
              <iframe
                key={loc.id + round}
                title="Street view"
                src={stableStreetViewSrc}
                className="w-full h-full border-0"
                allow="accelerometer; gyroscope; fullscreen"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            )}
            {phase === 'guessing' && (
              <>
                <div className="absolute top-0 left-0 right-0 h-10 bg-card/95 backdrop-blur pointer-events-none flex items-center justify-center text-xs font-bold">
                  🕵️ Hol vagy? Fedezd fel a környéket!
                </div>
                <div className="absolute bottom-0 left-0 h-7 w-44 bg-card/90 pointer-events-none" />
              </>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="game-card p-2">
          <div className="text-xs font-bold mb-1 text-center">
            {phase === 'guessing' ? '🗺️ Kattints a térképre! (görgő/+ − = zoom, húzd a pánhoz)' : '🗺️ Eredmények'}
          </div>
          <div className="relative">
            <div
              className="relative w-full overflow-hidden rounded-xl border-2 border-border cursor-crosshair select-none touch-none bg-card"
              style={{ aspectRatio: '2/1' }}
              onWheel={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = (e.clientX - rect.left) / rect.width;
                const cy = (e.clientY - rect.top) / rect.height;
                const delta = e.deltaY > 0 ? 0.85 : 1.18;
                const newZoom = Math.max(1, Math.min(8, zoom * delta));
                const k = newZoom / zoom;
                setPan((p) => ({ x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }));
                setZoom(newZoom);
              }}
              onPointerDown={(e) => {
                (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                panRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, moved: false };
              }}
              onPointerMove={(e) => {
                const s = panRef.current; if (!s.dragging) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const dx = (e.clientX - s.sx) / rect.width;
                const dy = (e.clientY - s.sy) / rect.height;
                if (Math.abs(e.clientX - s.sx) > 4 || Math.abs(e.clientY - s.sy) > 4) s.moved = true;
                setPan({ x: s.ox + dx, y: s.oy + dy });
              }}
              onPointerUp={(e) => {
                const s = panRef.current; s.dragging = false;
                if (!s.moved && phase === 'guessing' && !submitted) {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const rawX = (e.clientX - rect.left) / rect.width;
                  const rawY = (e.clientY - rect.top) / rect.height;
                  const x = (rawX - pan.x) / zoom;
                  const y = (rawY - pan.y) / zoom;
                  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                    setMyGuess({ lat: 90 - y * 180, lng: x * 360 - 180 });
                    playClick();
                  }
                }
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})`,
                  transformOrigin: '0 0',
                  backgroundImage: `url(${WORLD_MAP_URL})`,
                  backgroundSize: '100% 100%',
                  willChange: 'transform',
                }}
              >
                {myGuess && phase === 'guessing' && (
                  <MarkerPin lat={myGuess.lat} lng={myGuess.lng} color="#3b82f6" label="te" scale={1 / zoom} />
                )}
                {phase === 'reveal' && (
                  <>
                    {guesses.map((g) => (
                      <MarkerPin key={g.playerId} lat={g.lat} lng={g.lng} color="#3b82f6" label={g.username} scale={1 / zoom} />
                    ))}
                    {loc && <MarkerPin lat={loc.lat} lng={loc.lng} color="#ef4444" label="🎯" scale={1 / zoom} />}
                    {loc && (
                      <svg className="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {guesses.map((g) => {
                          const p1 = latLngToPct(g.lat, g.lng);
                          const p2 = latLngToPct(loc.lat, loc.lng);
                          return <line key={g.playerId} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                            stroke="#3b82f6" strokeWidth={0.3 / zoom} strokeDasharray={`${0.8 / zoom} ${0.5 / zoom}`} opacity="0.7" />;
                        })}
                      </svg>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
              <button className="w-8 h-8 rounded-lg bg-card/95 border border-border font-bold text-lg shadow"
                onClick={() => { const nz = Math.min(8, zoom * 1.4); setPan((p) => ({ x: 0.5 - (0.5 - p.x) * (nz / zoom), y: 0.5 - (0.5 - p.y) * (nz / zoom) })); setZoom(nz); }}>+</button>
              <button className="w-8 h-8 rounded-lg bg-card/95 border border-border font-bold text-lg shadow"
                onClick={() => { const nz = Math.max(1, zoom / 1.4); setPan((p) => ({ x: 0.5 - (0.5 - p.x) * (nz / zoom), y: 0.5 - (0.5 - p.y) * (nz / zoom) })); setZoom(nz); }}>−</button>
              <button className="w-8 h-8 rounded-lg bg-card/95 border border-border text-xs shadow"
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⟲</button>
            </div>
          </div>

          {phase === 'guessing' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="text-xs text-muted-foreground self-center">
                {myGuess ? `📍 ${myGuess.lat.toFixed(1)}°, ${myGuess.lng.toFixed(1)}°` : 'Még nem tippeltél'}
              </div>
              <button className="game-btn-primary text-sm py-2" onClick={submitGuess} disabled={!myGuess || submitted}>
                {submitted ? '✅ Beküldve' : '✅ Tipp beküldése'}
              </button>
            </div>
          )}

          {phase === 'reveal' && (
            <div className="mt-2 space-y-1 text-sm">
              <div className="text-center font-bold">{loc?.name}</div>
              {[...guesses].sort((a, b) => b.score - a.score).map((g) => (
                <div key={g.playerId} className="flex justify-between border-b border-border/40 py-1">
                  <span>{g.username}</span>
                  <span className="text-xs text-muted-foreground">{g.distance.toFixed(0)} km</span>
                  <span className="font-bold text-primary">+{g.score}</span>
                </div>
              ))}
              {isHost && (
                <button className="game-btn-primary w-full mt-2" onClick={hostNext}>
                  {round >= totalRounds ? '🏁 Befejezés' : '▶️ Következő kör'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live leaderboard mini */}
      {sortedScores.some((s) => s.score > 0) && (
        <div className="game-card text-xs flex flex-wrap gap-2 justify-center py-2">
          {sortedScores.map((s, i) => (
            <span key={s.playerId} className="px-2 py-1 rounded-full bg-card border border-border">
              {i === 0 ? '🥇' : ''} {s.username}: <b>{s.score}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function latLngToPct(lat: number, lng: number) {
  return { x: ((lng + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 };
}

function MarkerPin({ lat, lng, color, label, scale = 1 }: { lat: number; lng: number; color: string; label: string; scale?: number }) {
  const p = latLngToPct(lat, lng);
  return (
    <div className="absolute pointer-events-none -translate-x-1/2 -translate-y-full" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
      <div className="flex flex-col items-center" style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}>
        <div className="text-[10px] font-bold px-1 rounded bg-background/80 border border-border whitespace-nowrap mb-0.5">{label}</div>
        <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ backgroundColor: color }} />
      </div>
    </div>
  );
}