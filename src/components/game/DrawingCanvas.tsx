import { useRef, useState, useEffect, useCallback } from 'react';
import { playClick } from '@/lib/sounds';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Tool = 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle' | 'eyebrow' | 'fur';

const COLORS = [
  '#000000', '#808080', '#C0C0C0', '#FFFFFF',
  '#FF0000', '#FF6600', '#FFFF00', '#66FF00',
  '#00FF00', '#00FF66', '#00FFFF', '#0066FF',
  '#0000FF', '#6600FF', '#FF00FF', '#FF0066',
  '#800000', '#804000', '#808000', '#408000',
  '#008000', '#008040', '#008080', '#004080',
  '#000080', '#400080', '#800080', '#800040',
];

const BRUSH_SIZES = [1, 2, 4, 8, 14, 22, 32];
const DISPLAY_W = 800;
const DISPLAY_H = 500;
const CANVAS_W = 1600;
const CANVAS_H = 1000;

const TOOL_BUTTONS: { id: Tool; icon: string; label: string }[] = [
  { id: 'brush', icon: '✏️', label: 'Ecset' },
  { id: 'eraser', icon: '🧹', label: 'Radír' },
  { id: 'fill', icon: '🪣', label: 'Kitöltés' },
  { id: 'line', icon: '📏', label: 'Vonal' },
  { id: 'rect', icon: '⬜', label: 'Téglalap' },
  { id: 'circle', icon: '⭕', label: 'Kör' },
  { id: 'eyebrow', icon: '🪶', label: 'Szemöldök' },
  { id: 'fur', icon: '🐾', label: 'Szőrzet' },
];

interface Point {
  x: number;
  y: number;
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(from.x, from.y, midX, midY);
  ctx.stroke();
}

interface Props {
  onSubmit: (dataUrl: string) => void;
  isSecret?: boolean;
  disabled?: boolean;
}

export default function DrawingCanvas({ onSubmit, isSecret, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef<Point | null>(null);
  const savedImageData = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    setUndoStack(prev => [...prev.slice(-11), ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)]);
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

  const prepareStroke = useCallback((ctx: CanvasRenderingContext2D, activeTool: Tool) => {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = activeTool === 'eraser' ? '#FFFFFF' : color;
    ctx.fillStyle = activeTool === 'eraser' ? '#FFFFFF' : color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (activeTool) {
      case 'eraser':
        ctx.lineWidth = brushSize * 3;
        break;
      case 'eyebrow':
        ctx.lineWidth = Math.max(1, brushSize * 0.6);
        ctx.globalAlpha = 0.8;
        break;
      case 'fur':
        ctx.lineWidth = Math.max(1, brushSize * 0.35);
        ctx.globalAlpha = 0.9;
        break;
      default:
        ctx.lineWidth = brushSize;
    }
  }, [brushSize, color]);

  const paintSegment = useCallback((ctx: CanvasRenderingContext2D, from: Point, to: Point) => {
    prepareStroke(ctx, tool);

    if (tool === 'fur') {
      const hairs = Math.max(4, Math.round(brushSize * 1.4));
      for (let i = 0; i < hairs; i++) {
        const offsetX = (Math.random() - 0.5) * brushSize * 2.2;
        const offsetY = (Math.random() - 0.5) * brushSize * 2.2;
        const hairEndX = to.x + offsetX;
        const hairEndY = to.y + offsetY;
        ctx.beginPath();
        ctx.moveTo(from.x + offsetX * 0.2, from.y + offsetY * 0.2);
        ctx.lineTo(hairEndX, hairEndY);
        ctx.stroke();
      }
      return;
    }

    if (tool === 'eyebrow') {
      drawSmoothStroke(ctx, from, to);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1, brushSize * 0.3);
      drawSmoothStroke(ctx, { x: from.x + 1.5, y: from.y + 0.5 }, { x: to.x + 1.5, y: to.y + 0.5 });
      ctx.globalAlpha = 1;
      return;
    }

    drawSmoothStroke(ctx, from, to);
  }, [brushSize, prepareStroke, tool]);

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

    lastPos.current = pos;
    paintSegment(ctx, pos, { x: pos.x + 0.1, y: pos.y + 0.1 });
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

    if (lastPos.current) {
      paintSegment(ctx, lastPos.current, pos);
    }
    lastPos.current = pos;
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    savedImageData.current = null;
    lastPos.current = null;
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit(canvas.toDataURL('image/jpeg', 0.92));
  };

  const selectedTool = TOOL_BUTTONS.find((item) => item.id === tool) ?? TOOL_BUTTONS[0];

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="grid w-full max-w-[1120px] gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="game-card space-y-4 p-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">Színpaletta</span>
              <span className="text-xs text-muted-foreground">{color.toUpperCase()}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`w-7 h-7 rounded border-2 transition-transform ${
                  c === color ? 'border-foreground scale-110' : 'border-border/40'
                }`}
                style={{ backgroundColor: c }}
                type="button"
                onClick={() => { setColor(c); playClick(); }}
              />
            ))}
            </div>

            <div className="mt-3">
              <label className="text-sm font-bold mb-1 block">Összes szín</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-full cursor-pointer rounded-lg border border-border bg-card p-1"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">Tool katalógus</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="game-btn text-sm py-2 px-3">
                    🧰 Több tool
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="grid grid-cols-2 gap-2">
                    {TOOL_BUTTONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`game-btn text-sm py-2 px-3 justify-start ${tool === item.id ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
                        onClick={() => { setTool(item.id); playClick(); }}
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-3">
              <div className="font-bold">{selectedTool.icon} {selectedTool.label}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {tool === 'eyebrow'
                  ? 'Finom, vékony, rétegezhető húzások részletekhez.'
                  : tool === 'fur'
                    ? 'Több apró szálat rajzol egyszerre szőrökhöz és textúrához.'
                    : 'Smooth, nagy felbontású rajzolás pontosabb vonalakkal.'}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">Zoom</span>
              <span className="text-sm text-primary font-bold">{Math.round(zoom * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="game-btn px-3 py-2" onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}>
                −
              </button>
              <input
                type="range"
                min={0.75}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <button type="button" className="game-btn px-3 py-2" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
                +
              </button>
            </div>
            <button type="button" className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setZoom(1)}>
              Vissza 100%-ra
            </button>
          </div>
        </div>

        <div className="game-card p-3">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {TOOL_BUTTONS.slice(0, 4).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`game-btn text-sm py-2 px-3 ${tool === t.id ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
                onClick={() => { setTool(t.id); playClick(); }}
              >
                {t.icon} {t.label}
              </button>
            ))}

            <div className="h-8 w-px bg-border mx-1" />

            {BRUSH_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                  brushSize === s ? 'border-primary bg-primary/20' : 'border-border bg-card'
                }`}
                onClick={() => { setBrushSize(s); playClick(); }}
              >
                <div
                  className="rounded-full bg-foreground"
                  style={{ width: Math.min(s + 2, 20), height: Math.min(s + 2, 20) }}
                />
              </button>
            ))}
          </div>

          <div className="overflow-auto rounded-xl border border-border bg-card/50 scroll-smooth max-h-[72vh]">
            <div className="min-w-max p-2">
              <div
                className={`relative overflow-hidden rounded-lg bg-card ${isSecret ? 'blur-md' : ''}`}
                style={{
                  width: `${DISPLAY_W * zoom}px`,
                  height: `${DISPLAY_H * zoom}px`,
                  transition: 'width 180ms ease, height 180ms ease',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  className="w-full h-full cursor-crosshair touch-none"
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
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center mt-3">
            {TOOL_BUTTONS.slice(4).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`game-btn text-sm py-2 px-3 ${tool === t.id ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
                onClick={() => { setTool(t.id); playClick(); }}
                title={t.label}
              >
                {t.icon} {t.label}
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
      </div>
    </div>
  );
}
