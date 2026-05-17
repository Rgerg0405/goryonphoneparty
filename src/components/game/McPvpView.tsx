import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Player, GameSettings } from '@/lib/gameTypes';
import { supabase } from '@/integrations/supabase/client';
import { playPop, playSubmit, playNotification } from '@/lib/sounds';

interface Props {
  code: string; players: Player[]; playerId: string; username: string;
  isHost: boolean; settings: GameSettings; onFinish: () => void;
}

type PlayerState = {
  pid: string; username: string;
  x: number; y: number; z: number;
  yaw: number;
  hp: number;
  apples: number;
  alive: boolean;
};

const ARENA = 30;
const GRAVITY = 22;
const JUMP = 8;
const MOVE_SPEED = 6;
const MAX_HP = 20;
const SWORD_DMG = 5;
const SWORD_RANGE = 3.2;
const APPLE_HEAL = 8;

function Arena() {
  // Build a few minecraft-like blocks
  const blocks = useMemo(() => {
    const out: { pos: [number, number, number]; color: string; size?: number }[] = [];
    // Cobblestone walls
    for (let x = -ARENA; x <= ARENA; x += 2) {
      out.push({ pos: [x, 0.5, -ARENA], color: '#6b6b6b' });
      out.push({ pos: [x, 0.5, ARENA], color: '#6b6b6b' });
      out.push({ pos: [x, 2.5, -ARENA], color: '#5a5a5a' });
      out.push({ pos: [x, 2.5, ARENA], color: '#5a5a5a' });
    }
    for (let z = -ARENA; z <= ARENA; z += 2) {
      out.push({ pos: [-ARENA, 0.5, z], color: '#6b6b6b' });
      out.push({ pos: [ARENA, 0.5, z], color: '#6b6b6b' });
      out.push({ pos: [-ARENA, 2.5, z], color: '#5a5a5a' });
      out.push({ pos: [ARENA, 2.5, z], color: '#5a5a5a' });
    }
    // Some random pillars
    const seed = 12345;
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 8; i++) {
      const x = Math.floor((rnd() - 0.5) * (ARENA - 4)) * 2;
      const z = Math.floor((rnd() - 0.5) * (ARENA - 4)) * 2;
      out.push({ pos: [x, 0.5, z], color: '#8b7355' });
      out.push({ pos: [x, 1.5, z], color: '#8b7355' });
    }
    return out;
  }, []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA * 2 + 4, ARENA * 2 + 4]} />
        <meshStandardMaterial color="#4a7c3a" />
      </mesh>
      {blocks.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
    </>
  );
}

function OtherPlayer({ p }: { p: PlayerState }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(p.x, p.y, p.z);
    ref.current.rotation.y = p.yaw;
  });
  if (!p.alive) return null;
  return (
    <group ref={ref}>
      {/* body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 1.6, 0.4]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
      {/* sword */}
      <mesh position={[0.5, 0.2, 0.3]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial color="#dddddd" metalness={0.7} />
      </mesh>
      {/* name */}
      <mesh position={[0, 1.8, 0]}>
        <sprite>
          <spriteMaterial color="#ffd166" />
        </sprite>
      </mesh>
      <Billboard text={`${p.username} ❤️${p.hp}`} y={2} />
    </group>
  );
}

function Billboard({ text, y }: { text: string; y: number }) {
  const { camera } = useThree();
  const ref = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, [text]);
  useFrame(() => {
    if (ref.current) ref.current.lookAt(camera.position);
  });
  return (
    <sprite ref={ref} position={[0, y, 0]} scale={[2, 0.5, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}

function FirstPersonController({
  meRef, keysRef, onShake, alive,
}: {
  meRef: React.MutableRefObject<PlayerState | null>;
  keysRef: React.MutableRefObject<Set<string>>;
  onShake: React.MutableRefObject<number>;
  alive: boolean;
}) {
  const { camera } = useThree();
  const vyRef = useRef(0);
  const groundedRef = useRef(true);

  useFrame((_, dt) => {
    const me = meRef.current;
    if (!me || !alive) return;
    const keys = keysRef.current;
    // Use camera yaw from PointerLockControls (camera.rotation.y is set by it via Euler order; better: derive direction)
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const yaw = Math.atan2(-dir.x, -dir.z);
    me.yaw = yaw;
    const forward = new THREE.Vector3(Math.sin(yaw + Math.PI), 0, Math.cos(yaw + Math.PI));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    let dx = 0, dz = 0;
    if (keys.has('w')) { dx += forward.x; dz += forward.z; }
    if (keys.has('s')) { dx -= forward.x; dz -= forward.z; }
    if (keys.has('a')) { dx -= right.x; dz -= right.z; }
    if (keys.has('d')) { dx += right.x; dz += right.z; }
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }
    me.x += dx * MOVE_SPEED * dt;
    me.z += dz * MOVE_SPEED * dt;
    // gravity
    vyRef.current -= GRAVITY * dt;
    if (keys.has(' ') && groundedRef.current) {
      vyRef.current = JUMP;
      groundedRef.current = false;
    }
    me.y += vyRef.current * dt;
    if (me.y <= 0.9) { me.y = 0.9; vyRef.current = 0; groundedRef.current = true; }
    // arena bounds
    const lim = ARENA - 1.2;
    me.x = Math.max(-lim, Math.min(lim, me.x));
    me.z = Math.max(-lim, Math.min(lim, me.z));
    // camera follow
    let shake = 0;
    if (onShake.current > 0) {
      shake = Math.sin(Date.now() / 30) * 0.1 * onShake.current;
      onShake.current = Math.max(0, onShake.current - dt * 4);
    }
    camera.position.set(me.x + shake, me.y + 0.8, me.z);
  });
  return null;
}

function HandSword({ swingRef }: { swingRef: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    // attach to camera
    const offset = new THREE.Vector3(0.35, -0.35, -0.7);
    offset.applyQuaternion(camera.quaternion);
    ref.current.position.copy(camera.position).add(offset);
    ref.current.quaternion.copy(camera.quaternion);
    const swing = swingRef.current;
    if (swing > 0) {
      const a = Math.sin((1 - swing) * Math.PI) * 1.2;
      ref.current.rotateX(-a);
      ref.current.rotateZ(a * 0.5);
      swingRef.current = Math.max(0, swing - 0.05);
    }
  });
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.08, 0.7, 0.08]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[0.12, 0.2, 0.12]} />
        <meshStandardMaterial color="#7c3a1d" />
      </mesh>
    </group>
  );
}

export default function McPvpView({ code, players, playerId, username, isHost, settings, onFinish }: Props) {
  const duration = Math.max(60, Math.min(600, settings.pvpDuration ?? 180));
  const statesRef = useRef<Map<string, PlayerState>>(new Map());
  const meRef = useRef<PlayerState | null>(null);
  const channelRef = useRef<any>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const swingRef = useRef(0);
  const shakeRef = useRef(0);
  const lastBcRef = useRef(0);
  const lastAttackRef = useRef(0);
  const [, force] = useState(0);
  const rerender = () => force((v) => v + 1);
  const [phase, setPhase] = useState<'play' | 'end'>('play');
  const [winner, setWinner] = useState<PlayerState | null>(null);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [killFeed, setKillFeed] = useState<{ killer: string; victim: string; t: number }[]>([]);
  const startedAtRef = useRef(Date.now());

  // init states
  useEffect(() => {
    players.forEach((p, i) => {
      const a = (i / players.length) * Math.PI * 2;
      const r = ARENA * 0.6;
      const ps: PlayerState = {
        pid: p.player_id, username: p.username,
        x: Math.cos(a) * r, y: 0.9, z: Math.sin(a) * r,
        yaw: 0, hp: MAX_HP, apples: 3, alive: true,
      };
      statesRef.current.set(p.player_id, ps);
      if (p.player_id === playerId) meRef.current = ps;
    });
    startedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Channel
  useEffect(() => {
    const ch = supabase.channel(`pvp-${code}`);
    ch.on('broadcast', { event: 'pvp:pos' }, ({ payload }) => {
      if (payload.pid === playerId) return;
      const p = statesRef.current.get(payload.pid);
      if (p) {
        p.x = payload.x; p.y = payload.y; p.z = payload.z; p.yaw = payload.yaw;
      }
    });
    ch.on('broadcast', { event: 'pvp:hit' }, ({ payload }) => {
      if (payload.victim === playerId) {
        const me = meRef.current;
        if (!me || !me.alive) return;
        me.hp = Math.max(0, me.hp - SWORD_DMG);
        shakeRef.current = 1;
        playPop();
        if (me.hp <= 0) {
          me.alive = false;
          channelRef.current?.send({ type: 'broadcast', event: 'pvp:died', payload: { victim: playerId, killer: payload.killer, killerName: payload.killerName } });
        }
        rerender();
      }
    });
    ch.on('broadcast', { event: 'pvp:died' }, ({ payload }) => {
      const p = statesRef.current.get(payload.victim);
      if (p) p.alive = false;
      setKillFeed((f) => [...f.slice(-4), { killer: payload.killerName, victim: p?.username || '?', t: Date.now() }]);
      playNotification();
    });
    ch.on('broadcast', { event: 'pvp:heal' }, ({ payload }) => {
      const p = statesRef.current.get(payload.pid);
      if (p) { p.hp = payload.hp; p.apples = payload.apples; }
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Input
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'e') eatApple();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const md = (e: MouseEvent) => {
      if (e.button === 0) attack();
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', md);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', md);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast pos
  useEffect(() => {
    const t = setInterval(() => {
      const me = meRef.current;
      if (!me) return;
      channelRef.current?.send({
        type: 'broadcast', event: 'pvp:pos',
        payload: { pid: playerId, x: me.x, y: me.y, z: me.z, yaw: me.yaw },
      });
    }, 80);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer + end check
  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, duration - Math.floor((Date.now() - startedAtRef.current) / 1000));
      setTimeLeft(left);
      const alivePlayers = Array.from(statesRef.current.values()).filter((p) => p.alive);
      if ((alivePlayers.length <= 1 && players.length > 1) || left <= 0) {
        clearInterval(t);
        // winner: last alive, or highest HP
        const all = Array.from(statesRef.current.values());
        const w = alivePlayers[0] || all.sort((a, b) => b.hp - a.hp)[0];
        setWinner(w);
        setPhase('end');
      }
      rerender();
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, players.length]);

  const attack = () => {
    const me = meRef.current;
    if (!me || !me.alive) return;
    const now = Date.now();
    if (now - lastAttackRef.current < 500) return;
    lastAttackRef.current = now;
    swingRef.current = 1;
    playSubmit();
    // raycast: find closest player in front within range
    const fwd = new THREE.Vector3(Math.sin(me.yaw + Math.PI), 0, Math.cos(me.yaw + Math.PI));
    let bestPid: string | null = null;
    let bestDist = SWORD_RANGE;
    statesRef.current.forEach((p) => {
      if (p.pid === playerId || !p.alive) return;
      const dx = p.x - me.x, dz = p.z - me.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) return;
      const ndx = dx / dist, ndz = dz / dist;
      const dot = ndx * fwd.x + ndz * fwd.z;
      if (dot > 0.65) { bestDist = dist; bestPid = p.pid; }
    });
    if (bestPid) {
      channelRef.current?.send({
        type: 'broadcast', event: 'pvp:hit',
        payload: { victim: bestPid, killer: playerId, killerName: username },
      });
    }
  };

  const eatApple = () => {
    const me = meRef.current;
    if (!me || !me.alive || me.apples <= 0 || me.hp >= MAX_HP) return;
    me.apples -= 1;
    me.hp = Math.min(MAX_HP, me.hp + APPLE_HEAL);
    playPop();
    channelRef.current?.send({
      type: 'broadcast', event: 'pvp:heal',
      payload: { pid: playerId, hp: me.hp, apples: me.apples },
    });
    rerender();
  };

  if (phase === 'end') {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <div className="game-card p-6 text-center">
          <h2 className="text-4xl font-bold mb-3">⚔️ VÉGE!</h2>
          {winner ? (
            <div className="text-2xl font-bold mb-4">🏆 Győztes: {winner.username}</div>
          ) : (
            <div>Döntetlen</div>
          )}
          <div className="space-y-1 max-w-md mx-auto">
            {Array.from(statesRef.current.values())
              .sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.hp - a.hp)
              .map((p) => (
                <div key={p.pid} className="flex justify-between p-2 rounded bg-card border-2 border-border">
                  <span className="font-bold">{p.username}</span>
                  <span>{p.alive ? `❤️ ${p.hp}` : '💀'}</span>
                </div>
              ))}
          </div>
          <button className="game-btn-primary mt-4" onClick={onFinish}>🔄 Új játék</button>
        </div>
      </div>
    );
  }

  const me = meRef.current;
  const alive = me?.alive ?? false;

  return (
    <div className="fixed inset-0 bg-black select-none">
      <Canvas shadows camera={{ fov: 75, position: [0, 1.7, 0] }}>
        <color attach="background" args={['#87ceeb']} />
        <fog attach="fog" args={['#87ceeb', 30, 80]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 10]} intensity={1.1} castShadow />
        <Arena />
        {Array.from(statesRef.current.values()).filter((p) => p.pid !== playerId).map((p) => (
          <OtherPlayer key={p.pid} p={p} />
        ))}
        <FirstPersonController meRef={meRef} keysRef={keysRef} onShake={shakeRef} alive={alive} />
        {alive && <HandSword swingRef={swingRef} />}
        {alive && <PointerLockControls />}
      </Canvas>
      {/* HUD */}
      <div className="absolute top-4 left-4 game-card p-3 text-sm font-bold pointer-events-none space-y-1">
        <div>❤️ HP: {me?.hp ?? 0}/{MAX_HP}</div>
        <div>🍎 Aranyalma: {me?.apples ?? 0} (E)</div>
        <div>⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</div>
      </div>
      <div className="absolute top-4 right-4 game-card p-3 text-xs font-bold pointer-events-none max-w-[220px]">
        <div className="mb-1">⚔️ Életben</div>
        {Array.from(statesRef.current.values()).filter((p) => p.alive).map((p) => (
          <div key={p.pid} className="flex justify-between">
            <span>{p.username}</span>
            <span>❤️{p.hp}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-4 game-card p-2 text-[11px] font-bold pointer-events-none max-w-[260px]">
        {killFeed.slice(-4).map((k, i) => (
          <div key={i}>{k.killer} 🗡️ {k.victim}</div>
        ))}
      </div>
      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-2 h-2 bg-white rounded-full opacity-70" />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 game-card p-2 text-xs font-bold pointer-events-none">
        WASD mozgás · SPACE ugrás · LMB kard · E aranyalma · Klikk a képernyőre
      </div>
      {!alive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-destructive text-6xl font-bold">
          💀 KIESTÉL
        </div>
      )}
    </div>
  );
}