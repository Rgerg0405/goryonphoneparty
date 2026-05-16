import { useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { playClick } from '@/lib/sounds';

type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'tetrahedron';

interface ShapeItem {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
}

const SHAPE_BUTTONS: { id: ShapeKind; icon: string; label: string }[] = [
  { id: 'box', icon: '🟦', label: 'Kocka' },
  { id: 'sphere', icon: '⚪', label: 'Gömb' },
  { id: 'cylinder', icon: '🥫', label: 'Henger' },
  { id: 'cone', icon: '🔺', label: 'Kúp' },
  { id: 'torus', icon: '🍩', label: 'Tórusz' },
  { id: 'tetrahedron', icon: '🔻', label: 'Tetraéder' },
];

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#7c3aed', '#000000', '#ffffff', '#f97316'];

function MeshFor({ shape, selected, onPick }: { shape: ShapeItem; selected: boolean; onPick: () => void }) {
  const common = {
    position: shape.position,
    rotation: shape.rotation,
    scale: shape.scale,
    onClick: (e: any) => { e.stopPropagation(); onPick(); },
  };
  const mat = (
    <meshStandardMaterial color={shape.color} emissive={selected ? '#444' : '#000'} emissiveIntensity={selected ? 0.3 : 0} />
  );
  switch (shape.kind) {
    case 'box':
      return <mesh {...common}><boxGeometry args={[1, 1, 1]} />{mat}</mesh>;
    case 'sphere':
      return <mesh {...common}><sphereGeometry args={[0.6, 32, 32]} />{mat}</mesh>;
    case 'cylinder':
      return <mesh {...common}><cylinderGeometry args={[0.5, 0.5, 1, 32]} />{mat}</mesh>;
    case 'cone':
      return <mesh {...common}><coneGeometry args={[0.5, 1, 32]} />{mat}</mesh>;
    case 'torus':
      return <mesh {...common}><torusGeometry args={[0.5, 0.2, 16, 32]} />{mat}</mesh>;
    case 'tetrahedron':
      return <mesh {...common}><tetrahedronGeometry args={[0.7]} />{mat}</mesh>;
  }
}

interface Props {
  onSubmit: (dataUrl: string) => void;
  disabled?: boolean;
}

export default function ThreeDEditor({ onSubmit, disabled }: Props) {
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  const addShape = useCallback((kind: ShapeKind) => {
    const item: ShapeItem = {
      id: crypto.randomUUID(),
      kind,
      position: [Math.random() * 2 - 1, 0.5, Math.random() * 2 - 1],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    setShapes((s) => [...s, item]);
    setSelectedId(item.id);
    playClick();
  }, []);

  const selected = shapes.find((s) => s.id === selectedId) || null;

  const updateSelected = (patch: Partial<ShapeItem>) => {
    if (!selectedId) return;
    setShapes((all) => all.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setShapes((s) => s.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };

  const handleSubmit = () => {
    if (!glRef.current || !sceneRef.current || !cameraRef.current) return;
    glRef.current.render(sceneRef.current, cameraRef.current);
    const dataUrl = glRef.current.domElement.toDataURL('image/jpeg', 0.92);
    onSubmit(dataUrl);
  };

  return (
    <div className="grid w-full max-w-[1120px] gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="game-card space-y-4 p-4">
        <div>
          <div className="font-bold text-sm mb-2">🧊 Alakzatok</div>
          <div className="grid grid-cols-2 gap-2">
            {SHAPE_BUTTONS.map((s) => (
              <button key={s.id} type="button" className="game-btn bg-card text-sm py-2 px-2" onClick={() => addShape(s.id)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div className="space-y-3 border-t-2 border-border pt-3">
            <div className="font-bold text-sm">Kijelölt: {selected.kind}</div>

            <div>
              <div className="text-xs font-bold mb-1">Méret X</div>
              <input type="range" min={0.1} max={4} step={0.05}
                value={selected.scale[0]}
                onChange={(e) => updateSelected({ scale: [Number(e.target.value), selected.scale[1], selected.scale[2]] })}
                className="w-full" />
            </div>
            <div>
              <div className="text-xs font-bold mb-1">Méret Y</div>
              <input type="range" min={0.1} max={4} step={0.05}
                value={selected.scale[1]}
                onChange={(e) => updateSelected({ scale: [selected.scale[0], Number(e.target.value), selected.scale[2]] })}
                className="w-full" />
            </div>
            <div>
              <div className="text-xs font-bold mb-1">Méret Z</div>
              <input type="range" min={0.1} max={4} step={0.05}
                value={selected.scale[2]}
                onChange={(e) => updateSelected({ scale: [selected.scale[0], selected.scale[1], Number(e.target.value)] })}
                className="w-full" />
            </div>

            <div>
              <div className="text-xs font-bold mb-1">Pozíció (X / Y / Z)</div>
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    type="number"
                    step={0.1}
                    value={selected.position[i]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const p: [number, number, number] = [...selected.position] as any;
                      p[i] = v;
                      updateSelected({ position: p });
                    }}
                    className="game-input text-sm py-1 px-2"
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold mb-1">Forgatás Y</div>
              <input type="range" min={0} max={Math.PI * 2} step={0.05}
                value={selected.rotation[1]}
                onChange={(e) => updateSelected({ rotation: [selected.rotation[0], Number(e.target.value), selected.rotation[2]] })}
                className="w-full" />
            </div>

            <div>
              <div className="text-xs font-bold mb-1">Szín</div>
              <div className="grid grid-cols-8 gap-1">
                {COLORS.map((c) => (
                  <button key={c} type="button" style={{ background: c }}
                    className={`h-6 rounded border-2 ${selected.color === c ? 'border-foreground' : 'border-border/40'}`}
                    onClick={() => updateSelected({ color: c })} />
                ))}
              </div>
              <input type="color" value={selected.color} onChange={(e) => updateSelected({ color: e.target.value })}
                className="w-full h-9 mt-2 rounded border border-border" />
            </div>

            <button type="button" className="game-btn bg-destructive text-destructive-foreground w-full text-sm py-2"
              onClick={deleteSelected}>🗑️ Törlés</button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Kattints egy alakzatra a kijelöléshez vagy adj hozzá újat.</p>
        )}
      </div>

      <div className="game-card p-2">
        <div className="rounded-xl overflow-hidden bg-[#1b1b2a] h-[60vh] max-h-[560px]">
          <Canvas
            shadows
            camera={{ position: [4, 4, 6], fov: 50 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={({ gl, scene, camera }) => {
              glRef.current = gl;
              sceneRef.current = scene;
              cameraRef.current = camera;
            }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <color attach="background" args={['#1b1b2a']} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
            <Grid args={[20, 20]} cellColor="#444" sectionColor="#888" infiniteGrid />
            {shapes.map((s) => (
              <MeshFor key={s.id} shape={s} selected={s.id === selectedId} onPick={() => setSelectedId(s.id)} />
            ))}
            <OrbitControls makeDefault />
            <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
              <GizmoViewport axisColors={['#ff6b6b', '#6bff8c', '#6b8cff']} labelColor="white" />
            </GizmoHelper>
          </Canvas>
        </div>

        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          <button type="button" className="game-btn bg-card text-sm py-2 px-3" onClick={() => { setShapes([]); setSelectedId(null); }}>
            🗑️ Üres
          </button>
          <button type="button" className="game-btn-primary text-sm py-2 px-4" onClick={handleSubmit} disabled={disabled || shapes.length === 0}>
            ✅ KÉSZ!
          </button>
        </div>
      </div>
    </div>
  );
}