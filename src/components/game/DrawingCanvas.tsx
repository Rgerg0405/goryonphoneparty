import { useRef, useState, useEffect, useCallback } from 'react';
import { playClick } from '@/lib/sounds';

type Tool = 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle';

const COLORS = [
  '#000000', '#808080', '#C0C0C0', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFFF00', '#66FF00',
  '#00FF00', '#00FF66', '#00FFFF', '#0066FF',
  '#0000FF', '#6600FF', '#FF00FF', '#FF0066',
  '#800000', '#804000', '#808000', '#408000',
  '#008000', '#008040', '#008080', '#004080',
  '#000080', '#400080', '#800080', '#800040',
];

const BRUSH_SIZES = [2, 5, 10, 20, 35];
const CANVAS_W = 800;
const CANVAS_H = 500;

interface Props {
  onSubmit: (dataUrl: string) => void;
  isSecret?: boolean;
  disabled?: boolean;
}

export default function DrawingCanvas({ onSubmit, isSecret, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const startPos = useRef({ x: 0, y: 0 });
  const savedImageData = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    setUndoStack(prev => [...prev.slice(-20), ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    ctx.putImageData(prev, 0, 0);
    playClick();
  }, [undoStack]);

  const clearCanvas = useCallback(() => {
    saveState();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    playClick();
  }, [saveState]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    const me = e as React.MouseEvent;
    return {
      x: (me.clientX - rect.left) * scaleX,
      y: (me.clientY - rect.top) * scaleY,
    };
  };

  const hexToRgb = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });

  const floodFill = (sx: number, sy: number) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const d = imgData.data;
    const tIdx = (sy * CANVAS_W + sx) * 4;
    const tR = d[tIdx], tG = d[tIdx + 1], tB = d[tIdx + 2], tA = d[tIdx + 3];
    const fill = hexToRgb(color);
    if (tR === fill.r && tG === fill.g && tB === fill.b) return;
    const visited = new Uint8Array(CANVAS_W * CANVAS_H);
    const stack: number[] = [sx, sy];
    while (stack.length > 0) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) continue;
      const key = y * CANVAS_W + x;
      if (visited[key]) continue;
      const idx = key * 4;
      const diff = Math.abs(d[idx] - tR) + Math.abs(d[idx + 1] - tG) + Math.abs(d[idx + 2] - tB) + Math.abs(d[idx + 3] - tA);
      if (diff > 60) continue;
      visited[key] = 1;
      d[idx] = fill.r; d[idx + 1] = fill.g; d[idx + 2] = fill.b; d[idx + 3] = 255;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    saveState();
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;

    if (tool === 'fill') {
      floodFill(Math.floor(pos.x), Math.floor(pos.y));
      return;
    }

    if (['line', 'rect', 'circle'].includes(tool)) {
      startPos.current = pos;
      savedImageData.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      setIsDrawing(true);
      return;
    }

    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
    ctx.stroke();
    setIsDrawing(true);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;

    if (['line', 'rect', 'circle'].includes(tool) && savedImageData.current) {
      ctx.putImageData(savedImageData.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const sp = startPos.current;
      if (tool === 'line') {
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(pos.x, pos.y);
      } else if (tool === 'rect') {
        ctx.rect(sp.x, sp.y, pos.x - sp.x, pos.y - sp.y);
      } else {
        const rx = Math.abs(pos.x - sp.x) / 2;
        const ry = Math.abs(pos.y - sp.y) / 2;
        const cx = sp.x + (pos.x - sp.x) / 2;
        const cy = sp.y + (pos.y - sp.y) / 2;
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      return;
    }

    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    savedImageData.current = null;
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit(canvas.toDataURL('image/jpeg', 0.7));
  };

  const toolButtons: { id: Tool; icon: string; label: string }[] = [
    { id: 'brush', icon: '✏️', label: 'Ecset' },
    { id: 'eraser', icon: '🧹', label: 'Radír' },
    { id: 'fill', icon: '🪣', label: 'Kitöltés' },
    { id: 'line', icon: '📏', label: 'Vonal' },
    { id: 'rect', icon: '⬜', label: 'Téglalap' },
    { id: 'circle', icon: '⭕', label: 'Kör' },
  ];

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex gap-2 w-full max-w-[850px]">
        {/* Color palette */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div className="grid grid-cols-4 gap-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`w-7 h-7 rounded border-2 transition-transform ${
                  c === color ? 'border-foreground scale-110' : 'border-border/40'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => { setColor(c); playClick(); }}
              />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className={`relative flex-1 border-2 border-border rounded-lg overflow-hidden bg-white ${isSecret ? 'blur-md' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full h-auto cursor-crosshair touch-none"
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        </div>
      </div>

      {/* Tools bar */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {toolButtons.map((t) => (
          <button
            key={t.id}
            className={`game-btn text-sm py-2 px-3 ${
              tool === t.id ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            onClick={() => { setTool(t.id); playClick(); }}
            title={t.label}
          >
            {t.icon} {t.label}
          </button>
        ))}

        <div className="h-8 w-px bg-border mx-1" />

        {/* Brush sizes */}
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all ${
              brushSize === s ? 'border-primary bg-primary/20' : 'border-border bg-card'
            }`}
            onClick={() => { setBrushSize(s); playClick(); }}
          >
            <div
              className="rounded-full bg-foreground"
              style={{ width: Math.min(s, 20), height: Math.min(s, 20) }}
            />
          </button>
        ))}

        <div className="h-8 w-px bg-border mx-1" />

        <button className="game-btn bg-card text-sm py-2 px-3" onClick={undo} disabled={undoStack.length === 0}>
          ↩️ Vissza
        </button>
        <button className="game-btn bg-card text-sm py-2 px-3" onClick={clearCanvas}>
          🗑️ Törlés
        </button>

        <button className="game-btn-primary text-sm py-2 px-4" onClick={handleSubmit} disabled={disabled}>
          ✅ KÉSZ!
        </button>
      </div>
    </div>
  );
}
