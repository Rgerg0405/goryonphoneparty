import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { playClick } from '@/lib/sounds';

type ShapeKind =
  | 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'tetrahedron'
  | 'capsule' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'plane' | 'ring' | 'torusKnot';

type Mode = 'translate' | 'rotate' | 'scale';

interface ShapeItem {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  textureUrl?: string;
}

const SHAPE_BUTTONS: { id: ShapeKind; icon: string; label: string }[] = [
  { id: 'box', icon: '🟦', label: 'Kocka' },
  { id: 'sphere', icon: '⚪', label: 'Gömb' },
  { id: 'cylinder', icon: '🥫', label: 'Henger' },
  { id: 'cone', icon: '🔺', label: 'Kúp' },
  { id: 'torus', icon: '🍩', label: 'Tórusz' },
  { id: 'torusKnot', icon: '🪢', label: 'Csomó' },
  { id: 'tetrahedron', icon: '🔻', label: 'Tetraéder' },
  { id: 'octahedron', icon: '💎', label: 'Oktaéder' },
  { id: 'icosahedron', icon: '⬢', label: 'Ikozaéder' },
  { id: 'dodecahedron', icon: '🎲', label: 'Dodekaéder' },
  { id: 'capsule', icon: '💊', label: 'Kapszula' },
  { id: 'plane', icon: '🟨', label: 'Sík' },
  { id: 'ring', icon: '⭕', label: 'Gyűrű' },
];

const COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#118ab2', '#7c3aed', '#000000', '#ffffff', '#f97316'];

function ShapeMesh({
  shape, selected, onPick, registerRef,
}: {
  shape: ShapeItem; selected: boolean; onPick: () => void; registerRef: (id: string, m: THREE.Mesh | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    registerRef(shape.id, meshRef.current);
    return () => registerRef(shape.id, null);
  });

  const texture = useMemo(() => {
    if (!shape.textureUrl) return null;
    const loader = new THREE.TextureLoader();
    const t = loader.load(shape.textureUrl);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [shape.textureUrl]);

  const material = (
    <meshStandardMaterial
      color={texture ? '#ffffff' : shape.color}
      map={texture || null}
      emissive={selected ? '#444' : '#000'}
      emissiveIntensity={selected ? 0.25 : 0}
      side={shape.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide}
    />
  );

  const common = {
    ref: meshRef,
    position: shape.position,
    rotation: shape.rotation,
    scale: shape.scale,
    onPointerDown: (e: any) => { e.stopPropagation(); onPick(); },
    castShadow: true,
    receiveShadow: true,
  };

  switch (shape.kind) {
    case 'box': return <mesh {...common}><boxGeometry args={[1, 1, 1]} />{material}</mesh>;
    case 'sphere': return <mesh {...common}><sphereGeometry args={[0.6, 32, 32]} />{material}</mesh>;
    case 'cylinder': return <mesh {...common}><cylinderGeometry args={[0.5, 0.5, 1, 32]} />{material}</mesh>;
    case 'cone': return <mesh {...common}><coneGeometry args={[0.5, 1, 32]} />{material}</mesh>;
    case 'torus': return <mesh {...common}><torusGeometry args={[0.5, 0.2, 16, 32]} />{material}</mesh>;
    case 'torusKnot': return <mesh {...common}><torusKnotGeometry args={[0.4, 0.13, 100, 16]} />{material}</mesh>;
    case 'tetrahedron': return <mesh {...common}><tetrahedronGeometry args={[0.7]} />{material}</mesh>;
    case 'octahedron': return <mesh {...common}><octahedronGeometry args={[0.7]} />{material}</mesh>;
    case 'icosahedron': return <mesh {...common}><icosahedronGeometry args={[0.7]} />{material}</mesh>;
    case 'dodecahedron': return <mesh {...common}><dodecahedronGeometry args={[0.7]} />{material}</mesh>;
    case 'capsule': return <mesh {...common}><capsuleGeometry args={[0.35, 0.7, 8, 16]} />{material}</mesh>;
    case 'plane': return <mesh {...common}><planeGeometry args={[1.2, 1.2]} />{material}</mesh>;
    case 'ring': return <mesh {...common}><ringGeometry args={[0.3, 0.6, 32]} />{material}</mesh>;
  }
}

function SceneContent({
  shapes, selectedId, mode, setSelectedId, registerRef, onTransform, orbitRef, transformAttach,
}: {
  shapes: ShapeItem[];
  selectedId: string | null;
  mode: Mode;
  setSelectedId: (id: string | null) => void;
  registerRef: (id: string, m: THREE.Mesh | null) => void;
  onTransform: () => void;
  orbitRef: React.MutableRefObject<any>;
  transformAttach: THREE.Object3D | null;
}) {
  const { camera, gl } = useThree();

  return (
    <>
      <color attach="background" args={['#1b1b2a']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 5]} intensity={1.1} castShadow />
      <Grid args={[20, 20]} cellColor="#444" sectionColor="#888" infiniteGrid />
      {shapes.map((s) => (
        <ShapeMesh key={s.id} shape={s} selected={s.id === selectedId}
          onPick={() => setSelectedId(s.id)}
          registerRef={registerRef} />
      ))}
      {transformAttach && (
        <TransformControls
          object={transformAttach}
          mode={mode}
          onMouseDown={() => { if (orbitRef.current) orbitRef.current.enabled = false; }}
          onMouseUp={() => { if (orbitRef.current) orbitRef.current.enabled = true; onTransform(); }}
          onObjectChange={onTransform}
        />
      )}
      <OrbitControls ref={orbitRef} makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ff6b6b', '#6bff8c', '#6b8cff']} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ===== Texture paint modal =====
function TexturePaintModal({ initial, color: initColor, onClose, onSave }: {
  initial?: string;
  color: string;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [color, setColor] = useState(initColor);
  const [size, setSize] = useState(8);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = initial;
    }
  }, [initial]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    if ('touches' in e && e.touches.length) {
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    }
    const m = e as React.MouseEvent;
    return { x: (m.clientX - r.left) * sx, y: (m.clientY - r.top) * sy };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawingRef.current = true;
    const p = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  };
  const end = () => { drawingRef.current = false; };

  const clearAll = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const save = () => {
    const url = canvasRef.current!.toDataURL('image/png');
    onSave(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="game-card max-w-xl w-full space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">🎨 Textúra rajzolása</h3>
          <button className="game-btn bg-card text-sm py-1 px-3" onClick={onClose}>✕</button>
        </div>
        <canvas ref={canvasRef} width={512} height={512}
          className="w-full aspect-square rounded-lg border-2 border-border bg-white cursor-crosshair touch-none"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="flex items-center gap-2 flex-wrap">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border" />
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs font-bold">Vastagság</span>
            <input type="range" min={2} max={64} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
            <span className="text-xs w-8 text-right">{size}px</span>
          </div>
          <button type="button" className="game-btn bg-card text-sm py-1 px-3" onClick={clearAll}>🗑️ Üres</button>
          <button type="button" className="game-btn-primary text-sm py-1 px-4" onClick={save}>✅ Alkalmaz</button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  onSubmit: (dataUrl: string) => void;
  disabled?: boolean;
}

export default function ThreeDEditor({ onSubmit, disabled }: Props) {
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('translate');
  const [paintOpen, setPaintOpen] = useState(false);

  const meshRefsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const orbitRef = useRef<any>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  const registerRef = useCallback((id: string, m: THREE.Mesh | null) => {
    if (m) meshRefsRef.current.set(id, m); else meshRefsRef.current.delete(id);
  }, []);

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

  const duplicateSelected = () => {
    if (!selected) return;
    const copy: ShapeItem = {
      ...selected,
      id: crypto.randomUUID(),
      position: [selected.position[0] + 0.5, selected.position[1], selected.position[2] + 0.5],
    };
    setShapes((s) => [...s, copy]);
    setSelectedId(copy.id);
    playClick();
  };

  // Keyboard shortcuts G/R/S like Blender
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'g') setMode('translate');
      else if (e.key.toLowerCase() === 'r') setMode('rotate');
      else if (e.key.toLowerCase() === 's') setMode('scale');
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onTransformChange = useCallback(() => {
    if (!selectedId) return;
    const m = meshRefsRef.current.get(selectedId);
    if (!m) return;
    setShapes((all) => all.map((s) => (
      s.id === selectedId ? {
        ...s,
        position: [m.position.x, m.position.y, m.position.z],
        scale: [m.scale.x, m.scale.y, m.scale.z],
        rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
      } : s
    )));
  }, [selectedId]);

  const transformAttach = selectedId ? meshRefsRef.current.get(selectedId) ?? null : null;

  const handleSubmit = () => {
    if (!glRef.current || !sceneRef.current || !cameraRef.current) return;
    glRef.current.render(sceneRef.current, cameraRef.current);
    const dataUrl = glRef.current.domElement.toDataURL('image/jpeg', 0.92);
    onSubmit(dataUrl);
  };

  return (
    <div className="grid w-full max-w-[1200px] gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="game-card space-y-4 p-4 max-h-[80vh] overflow-y-auto">
        <div>
          <div className="font-bold text-sm mb-2">🧰 Mód (G/R/S)</div>
          <div className="grid grid-cols-3 gap-1">
            {(['translate', 'rotate', 'scale'] as Mode[]).map((m) => (
              <button key={m} type="button"
                className={`text-xs py-2 rounded-lg border-2 font-bold ${mode === m ? 'border-primary bg-primary/20' : 'border-border bg-card'}`}
                onClick={() => setMode(m)}>
                {m === 'translate' ? '↔ Mozgat' : m === 'rotate' ? '⟳ Forgat' : '⤢ Méret'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="font-bold text-sm mb-2">🧊 Alakzatok</div>
          <div className="grid grid-cols-2 gap-2">
            {SHAPE_BUTTONS.map((s) => (
              <button key={s.id} type="button" className="game-btn bg-card text-sm py-2 px-2 hover-glow" onClick={() => addShape(s.id)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div className="space-y-3 border-t-2 border-border pt-3">
            <div className="font-bold text-sm">Kijelölt: {selected.kind}</div>

            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="game-btn bg-card text-xs py-2" onClick={duplicateSelected}>📑 Másol (Ctrl+D)</button>
              <button type="button" className="game-btn bg-destructive text-destructive-foreground text-xs py-2" onClick={deleteSelected}>🗑️ Töröl (Del)</button>
            </div>

            <button type="button" className="game-btn-primary text-xs py-2 w-full" onClick={() => setPaintOpen(true)}>
              🎨 Textúra rajzolása
            </button>
            {selected.textureUrl && (
              <button type="button" className="game-btn bg-card text-xs py-1 w-full" onClick={() => updateSelected({ textureUrl: undefined })}>
                ❌ Textúra eltávolítása
              </button>
            )}

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

            <div>
              <div className="text-xs font-bold mb-1">Egyenletes méret</div>
              <input type="range" min={0.1} max={4} step={0.05}
                value={selected.scale[0]}
                onChange={(e) => { const v = Number(e.target.value); updateSelected({ scale: [v, v, v] }); }}
                className="w-full" />
            </div>

            <p className="text-[10px] text-muted-foreground">
              Tipp: A 3D gizmo nyilakkal húzhatod is. Kattints az alakzatra a kijelöléshez.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Kattints egy alakzatra (vagy adj hozzá újat). Húzd a gizmot a mozgatáshoz.</p>
        )}
      </div>

      <div className="game-card p-2">
        <div className="rounded-xl overflow-hidden bg-[#1b1b2a] h-[60vh] max-h-[600px]">
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
            <SceneContent
              shapes={shapes}
              selectedId={selectedId}
              mode={mode}
              setSelectedId={setSelectedId}
              registerRef={registerRef}
              onTransform={onTransformChange}
              orbitRef={orbitRef}
              transformAttach={transformAttach}
            />
          </Canvas>
        </div>

        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          <button type="button" className="game-btn bg-card text-sm py-2 px-3" onClick={() => { setShapes([]); setSelectedId(null); }}>
            🗑️ Üres
          </button>
          <button type="button" className="game-btn-primary text-sm py-2 px-4 hover-glow" onClick={handleSubmit} disabled={disabled || shapes.length === 0}>
            ✅ KÉSZ!
          </button>
        </div>
      </div>

      {paintOpen && selected && (
        <TexturePaintModal
          initial={selected.textureUrl}
          color={selected.color}
          onClose={() => setPaintOpen(false)}
          onSave={(url) => updateSelected({ textureUrl: url })}
        />
      )}
    </div>
  );
}
