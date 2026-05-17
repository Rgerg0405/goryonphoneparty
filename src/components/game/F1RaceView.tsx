import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Player, GameSettings } from '@/lib/gameTypes';
import { supabase } from '@/integrations/supabase/client';
import ThreeDEditor from './ThreeDEditor';
import { playPop, playSubmit, playNotification } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

type CarState = {
  pid: string;
  username: string;
  x: number; z: number;
  angle: number;
  speed: number;
  lap: number;
  checkpoint: number; // last passed checkpoint index
  finished: boolean;
  finishTime?: number;
  texture?: string; // car snapshot dataUrl
};

const TRACK_RX = 60;
const TRACK_RZ = 35;
const TRACK_W = 9;
// Checkpoints around the oval (angle in radians from center)
const CHECKPOINT_ANGLES = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#7c3aed', '#f97316', '#22d3ee', '#e11d48', '#84cc16', '#ec4899'];

function trackPoint(angle: number, offset = 0) {
  return [Math.cos(angle) * (TRACK_RX + offset), Math.sin(angle) * (TRACK_RZ + offset)];
}

function Track() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * TRACK_RX, 0.02, Math.sin(a) * TRACK_RZ));
    }
    return pts;
  }, []);
  const innerPts = useMemo(() => points.map((p) => {
    const len = Math.hypot(p.x, p.z);
    const n = TRACK_W;
    return new THREE.Vector3(p.x * (1 - n / len), 0.02, p.z * (1 - n / len));
  }), [points]);
  const outerPts = useMemo(() => points.map((p) => {
    const len = Math.hypot(p.x, p.z);
    const n = TRACK_W;
    return new THREE.Vector3(p.x * (1 + n / len), 0.02, p.z * (1 + n / len));
  }), [points]);

  // Build track surface as a ring of triangles
  const trackGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = innerPts[i], b = outerPts[i], c = innerPts[i + 1], d = outerPts[i + 1];
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      verts.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }, [innerPts, outerPts, points]);

  return (
    <>
      {/* Grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#3a7a35" roughness={1} />
      </mesh>
      {/* Asphalt */}
      <mesh geometry={trackGeo}>
        <meshStandardMaterial color="#1f1f1f" side={THREE.DoubleSide} />
      </mesh>
      {/* White track lines */}
      <line>
        <bufferGeometry attach="geometry" onUpdate={(g) => g.setFromPoints(innerPts)} />
        <lineBasicMaterial color="#ffffff" />
      </line>
      <line>
        <bufferGeometry attach="geometry" onUpdate={(g) => g.setFromPoints(outerPts)} />
        <lineBasicMaterial color="#ffffff" />
      </line>
      {/* Start/finish line */}
      <mesh position={[TRACK_RX, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK_W * 2, 1.2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

function CarMesh({ car, color, isMe }: { car: CarState; color: string; isMe: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    if (!car.texture) return null;
    const loader = new THREE.TextureLoader();
    return loader.load(car.texture);
  }, [car.texture]);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(car.x, 0.4, car.z);
    ref.current.rotation.y = -car.angle;
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <boxGeometry args={[2.6, 0.7, 1.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {texture && (
        <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 1.2]} />
          <meshBasicMaterial map={texture} transparent />
        </mesh>
      )}
      {/* wheels */}
      {[[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, -0.2, z]}>
          <cylinderGeometry args={[0.3, 0.3, 0.3, 12]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
      {isMe && (
        <mesh position={[0, 1.6, 0]}>
          <coneGeometry args={[0.3, 0.6, 8]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      )}
    </group>
  );
}

function ChaseCamera({ target }: { target: React.MutableRefObject<CarState | null> }) {
  const { camera } = useThree();
  useFrame(() => {
    const me = target.current;
    if (!me) return;
    const camDist = 8, camHeight = 4;
    const tx = me.x - Math.cos(me.angle) * camDist;
    const tz = me.z + Math.sin(me.angle) * camDist;
    camera.position.lerp(new THREE.Vector3(tx, camHeight, tz), 0.12);
    camera.lookAt(me.x, 0.5, me.z);
  });
  return null;
}

function RaceScene({ carsRef, playerId, colorMap, meRef }: {
  carsRef: React.MutableRefObject<Map<string, CarState>>;
  playerId: string;
  colorMap: Map<string, string>;
  meRef: React.MutableRefObject<CarState | null>;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((v) => v + 1), 33);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 80, 300]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 60, 20]} intensity={1.1} castShadow />
      <Track />
      {Array.from(carsRef.current.values()).map((c) => (
        <CarMesh key={c.pid} car={c} color={colorMap.get(c.pid) || '#fff'} isMe={c.pid === playerId} />
      ))}
      <ChaseCamera target={meRef} />
    </>
  );
}

export default function F1RaceView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const totalLaps = Math.max(1, settings.f1Laps ?? 3);
  const designTime = Math.max(30, settings.f1DesignTime ?? 90);
  const [phase, setPhase] = useState<'design' | 'countdown' | 'race' | 'end'>('design');
  const [designLeft, setDesignLeft] = useState(designTime);
  const [countdown, setCountdown] = useState(3);
  const [myTexture, setMyTexture] = useState<string | null>(null);
  const [submittedSet, setSubmittedSet] = useState<Set<string>>(new Set());
  const [finishers, setFinishers] = useState<{ pid: string; username: string; time: number }[]>([]);
  const carsRef = useRef<Map<string, CarState>>(new Map());
  const meRef = useRef<CarState | null>(null);
  const channelRef = useRef<any>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const lastBcRef = useRef(0);
  const raceStartRef = useRef(0);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    players.forEach((p, i) => m.set(p.player_id, COLORS[i % COLORS.length]));
    return m;
  }, [players]);

  // Init cars at grid (line of starting positions on straight after start line)
  useEffect(() => {
    players.forEach((p, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = TRACK_RX + (col === 0 ? -1.5 : 1.5);
      const z = -2 - row * 3.5;
      const car: CarState = {
        pid: p.player_id, username: p.username,
        x, z, angle: Math.PI / 2, speed: 0,
        lap: 0, checkpoint: -1, finished: false,
      };
      carsRef.current.set(p.player_id, car);
      if (p.player_id === playerId) meRef.current = car;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Channel
  useEffect(() => {
    const ch = supabase.channel(`f1-${code}`);
    ch.on('broadcast', { event: 'f1:design' }, ({ payload }) => {
      const car = carsRef.current.get(payload.pid);
      if (car) car.texture = payload.texture;
      setSubmittedSet((s) => new Set(s).add(payload.pid));
    });
    ch.on('broadcast', { event: 'f1:start' }, ({ payload }) => {
      raceStartRef.current = payload.startAt;
      setPhase('countdown');
    });
    ch.on('broadcast', { event: 'f1:car' }, ({ payload }) => {
      if (payload.pid === playerId) return;
      const c = carsRef.current.get(payload.pid);
      if (c) {
        c.x = payload.x; c.z = payload.z; c.angle = payload.angle;
        c.lap = payload.lap; c.finished = payload.finished;
      }
    });
    ch.on('broadcast', { event: 'f1:finish' }, ({ payload }) => {
      setFinishers((arr) => arr.find((f) => f.pid === payload.pid) ? arr : [...arr, payload]);
      const c = carsRef.current.get(payload.pid);
      if (c) c.finished = true;
      playNotification();
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Design timer
  useEffect(() => {
    if (phase !== 'design') return;
    const deadline = Date.now() + designTime * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setDesignLeft(left);
      const allSubmitted = players.every((p) => submittedSet.has(p.player_id));
      if (left <= 0 || allSubmitted) {
        clearInterval(t);
        if (isHost) {
          const startAt = Date.now() + 4000;
          channelRef.current?.send({ type: 'broadcast', event: 'f1:start', payload: { startAt } });
          raceStartRef.current = startAt;
          setPhase('countdown');
        }
      }
    }, 300);
    return () => clearInterval(t);
  }, [phase, designTime, players, submittedSet, isHost]);

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((raceStartRef.current - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) {
        clearInterval(t);
        raceStartRef.current = Date.now();
        setPhase('race');
      }
    }, 200);
    return () => clearInterval(t);
  }, [phase]);

  // Keyboard
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  // Physics loop
  useEffect(() => {
    if (phase !== 'race') return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const me = meRef.current;
      if (me && !me.finished) {
        const keys = keysRef.current;
        const accel = (keys.has('w') || keys.has('arrowup')) ? 18 : 0;
        const brake = (keys.has('s') || keys.has('arrowdown')) ? 22 : 0;
        const steerL = (keys.has('a') || keys.has('arrowleft')) ? 1 : 0;
        const steerR = (keys.has('d') || keys.has('arrowright')) ? 1 : 0;
        // accel
        me.speed += accel * dt;
        me.speed -= brake * dt * (me.speed > 0 ? 1 : -0.4);
        // drag
        me.speed *= 0.985;
        me.speed = Math.max(-12, Math.min(34, me.speed));
        // steering (proportional to speed)
        const steer = (steerL - steerR) * 2.0 * (Math.min(1, Math.abs(me.speed) / 6));
        me.angle += steer * dt;
        // off track penalty
        const dist = Math.hypot(me.x / TRACK_RX, me.z / TRACK_RZ);
        const onTrack = dist > 1 - TRACK_W / Math.min(TRACK_RX, TRACK_RZ) && dist < 1 + TRACK_W / Math.min(TRACK_RX, TRACK_RZ);
        if (!onTrack) me.speed *= 0.92;
        // move
        me.x += Math.cos(me.angle) * me.speed * dt;
        me.z -= Math.sin(me.angle) * me.speed * dt;
        // checkpoints: angle around center
        const carAngle = Math.atan2(me.z, me.x);
        const norm = (carAngle + Math.PI * 2) % (Math.PI * 2);
        const nextCp = (me.checkpoint + 1) % CHECKPOINT_ANGLES.length;
        const cpAngle = CHECKPOINT_ANGLES[nextCp];
        if (Math.abs(((norm - cpAngle + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.25) {
          me.checkpoint = nextCp;
          if (nextCp === 0) {
            me.lap += 1;
            playPop();
            if (me.lap >= totalLaps && !me.finished) {
              me.finished = true;
              const time = (Date.now() - raceStartRef.current) / 1000;
              const payload = { pid: playerId, username, time };
              channelRef.current?.send({ type: 'broadcast', event: 'f1:finish', payload });
              setFinishers((arr) => arr.find((f) => f.pid === playerId) ? arr : [...arr, payload]);
              playSubmit();
            }
          }
        }
        // broadcast
        if (now - lastBcRef.current > 80) {
          lastBcRef.current = now;
          channelRef.current?.send({
            type: 'broadcast', event: 'f1:car',
            payload: { pid: playerId, x: me.x, z: me.z, angle: me.angle, lap: me.lap, finished: me.finished },
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // End check
  useEffect(() => {
    if (phase === 'race' && finishers.length >= Math.min(players.length, totalLaps > 0 ? players.length : 1)) {
      setTimeout(() => setPhase('end'), 1500);
    }
  }, [finishers, phase, players.length, totalLaps]);

  const submitDesign = (dataUrl: string) => {
    setMyTexture(dataUrl);
    const car = carsRef.current.get(playerId);
    if (car) car.texture = dataUrl;
    setSubmittedSet((s) => new Set(s).add(playerId));
    channelRef.current?.send({ type: 'broadcast', event: 'f1:design', payload: { pid: playerId, texture: dataUrl } });
    playSubmit();
  };

  if (phase === 'design') {
    return (
      <div className="max-w-7xl mx-auto p-4 space-y-3">
        <div className="game-card p-3 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold">🏎️ Tervezd meg az autód! ({designLeft}mp)</h2>
          <div className="text-sm font-bold">
            Kész: {submittedSet.size}/{players.length}
          </div>
        </div>
        {myTexture ? (
          <div className="game-card p-4 text-center space-y-3">
            <img src={myTexture} alt="autó" className="mx-auto max-h-64 rounded border-2 border-border" />
            <p className="font-bold">Autód beküldve! Várunk a többiekre... 🏁</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {players.map((p) => (
                <div key={p.player_id} className={`px-3 py-1 rounded-full text-xs font-bold ${submittedSet.has(p.player_id) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {p.username} {submittedSet.has(p.player_id) ? '✅' : '⏳'}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ThreeDEditor onSubmit={submitDesign} />
        )}
      </div>
    );
  }

  if (phase === 'end') {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <div className="game-card p-4 text-center">
          <h2 className="text-3xl font-bold mb-3">🏆 VÉGEREDMÉNY</h2>
          <div className="space-y-2">
            {finishers.map((f, i) => (
              <div key={f.pid} className="flex items-center justify-between p-3 rounded bg-card border-2 border-border">
                <span className="text-2xl font-bold">{['🥇', '🥈', '🥉'][i] || `${i + 1}.`}</span>
                <span className="font-bold flex-1 text-center">{f.username}</span>
                <span className="font-mono">{f.time.toFixed(2)}s</span>
              </div>
            ))}
            {players.filter((p) => !finishers.find((f) => f.pid === p.player_id)).map((p) => (
              <div key={p.player_id} className="flex items-center justify-between p-2 rounded bg-muted/40">
                <span>DNF</span>
                <span className="font-bold">{p.username}</span>
                <span>—</span>
              </div>
            ))}
          </div>
          <button className="game-btn-primary mt-4" onClick={onFinish}>🔄 Új játék</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas shadows camera={{ fov: 70, position: [TRACK_RX, 8, -10] }}>
        <RaceScene carsRef={carsRef} playerId={playerId} colorMap={colorMap} meRef={meRef} />
      </Canvas>
      {/* HUD */}
      <div className="absolute top-4 left-4 game-card p-3 text-sm font-bold pointer-events-none">
        <div>🏁 Kör: {(meRef.current?.lap ?? 0) + 1}/{totalLaps}</div>
        <div>💨 {Math.abs(Math.round((meRef.current?.speed ?? 0) * 8))} km/h</div>
      </div>
      <div className="absolute top-4 right-4 game-card p-3 text-xs font-bold pointer-events-none max-w-[200px]">
        <div className="mb-1">🏆 Ranglista</div>
        {Array.from(carsRef.current.values()).sort((a, b) => (b.lap - a.lap) || (a.pid === playerId ? -1 : 1)).map((c) => (
          <div key={c.pid} className="flex justify-between">
            <span>{c.username}</span>
            <span>{c.finished ? '🏁' : `L${c.lap + 1}`}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 game-card p-2 text-xs font-bold pointer-events-none">
        WASD / nyilak vezetés
      </div>
      {phase === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="text-9xl font-bold text-primary">{countdown > 0 ? countdown : 'GO!'}</div>
        </div>
      )}
    </div>
  );
}