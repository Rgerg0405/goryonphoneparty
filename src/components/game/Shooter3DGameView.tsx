import { Canvas, useFrame } from '@react-three/fiber';
import { PointerLockControls, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Player, GameSettings } from '@/lib/gameTypes';
import { playClick, playPop } from '@/lib/sounds';
import YouTubeMusicPlayer from './YouTubeMusicPlayer';

interface Props {
  players: Player[];
  playerId: string;
  isHost: boolean;
  settings: GameSettings;
  onFinish: () => void;
}

type Target = { id: string; pos: [number, number, number]; size: number; color: string; hit: boolean };

const TARGET_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#f97316', '#7c3aed'];

function makeTargets(count: number): Target[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `target-${i}`,
    pos: [(Math.random() - 0.5) * 28, Math.random() * 5 + 1, -Math.random() * 30 - 6],
    size: Math.random() * 0.55 + 0.45,
    color: TARGET_COLORS[i % TARGET_COLORS.length],
    hit: false,
  }));
}

function TargetMesh({ target, onHit }: { target: Target; onHit: (id: string) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current || target.hit) return;
    ref.current.rotation.y += delta * 1.8;
    ref.current.position.y = target.pos[1] + Math.sin(Date.now() / 450 + target.pos[0]) * 0.25;
  });
  if (target.hit) return null;
  return (
    <mesh ref={ref} position={target.pos} scale={target.size} onClick={(e) => { e.stopPropagation(); onHit(target.id); }}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={target.color} emissive={target.color} emissiveIntensity={0.35} roughness={0.4} />
    </mesh>
  );
}

function ShooterScene({ targets, onHit }: { targets: Target[]; onHit: (id: string) => void }) {
  return (
    <>
      <color attach="background" args={['#141414']} />
      <fog attach="fog" args={['#141414', 12, 48]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 8, 4]} intensity={1.2} />
      <pointLight position={[0, 3, 2]} intensity={1.5} color="#06d6a0" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -14]} receiveShadow>
        <planeGeometry args={[42, 60]} />
        <meshStandardMaterial color="#2f2f22" roughness={0.85} />
      </mesh>
      {targets.map((t) => <TargetMesh key={t.id} target={t} onHit={onHit} />)}
      <Text position={[0, 6.8, -12]} fontSize={0.8} color="#ffd166" anchorX="center">
        Goryon 3D Shooter
      </Text>
      <PointerLockControls />
    </>
  );
}

export default function Shooter3DGameView({ players, playerId, isHost, settings, onFinish }: Props) {
  const totalTime = settings.shooterTime ?? 90;
  const targetCount = settings.shooterTargets ?? 28;
  const [targets, setTargets] = useState<Target[]>(() => makeTargets(targetCount));
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [ended, setEnded] = useState(false);
  const player = useMemo(() => players.find((p) => p.player_id === playerId), [players, playerId]);

  useEffect(() => {
    if (ended) return;
    const deadline = Date.now() + totalTime * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(timer);
        setEnded(true);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [ended, totalTime]);

  const hit = (id: string) => {
    setTargets((all) => all.map((t) => t.id === id ? { ...t, hit: true } : t));
    setScore((s) => s + 100);
    playPop();
  };

  const reset = () => {
    setTargets(makeTargets(targetCount));
    setScore(0);
    setTimeLeft(totalTime);
    setEnded(false);
    playClick();
  };

  if (ended || targets.every((t) => t.hit)) {
    return (
      <div className="max-w-xl mx-auto p-4 space-y-4 text-center">
        <h2 className="text-3xl font-bold">🎯 Shooter vége!</h2>
        <div className="game-card space-y-2">
          <div className="text-6xl">{score}</div>
          <div className="font-bold text-primary">pont — {player?.username || 'Játékos'}</div>
        </div>
        <button className="game-btn-secondary w-full" onClick={reset}>🔁 Újrapróba</button>
        {isHost && <button className="game-btn-primary w-full" onClick={onFinish}>Vissza a lobbyba</button>}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-2 md:p-4 space-y-3">
      <div className="game-card grid grid-cols-3 gap-2 items-center text-center py-2 px-3">
        <div className="font-bold">🎯 {score} pont</div>
        <div className={`font-bold text-xl ${timeLeft <= 10 ? 'text-destructive animate-pulse' : ''}`}>⏱️ {timeLeft}mp</div>
        <YouTubeMusicPlayer videoId="h-ile9tMNM0" label="Shooter zene" compact />
      </div>
      <div className="game-card p-2 relative">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/80">
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
        </div>
        <div className="rounded-xl overflow-hidden h-[68vh] min-h-[420px] bg-card">
          <Canvas camera={{ position: [0, 2.2, 4], fov: 70 }} shadows>
            <ShooterScene targets={targets} onHit={hit} />
          </Canvas>
        </div>
      </div>
      <div className="game-card text-center text-xs text-muted-foreground py-2">
        Kattints a 3D nézetbe az egérzárhoz, egérrel célozz, kattintással lőj. Telefonon húzd a nézetet és koppints a célokra.
      </div>
    </div>
  );
}