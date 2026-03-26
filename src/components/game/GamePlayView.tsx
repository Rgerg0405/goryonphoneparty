import { useState, useMemo } from 'react';
import { GamePhase, getPhaseLabel } from '@/lib/gameTypes';
import DrawingCanvas from './DrawingCanvas';
import { playClick } from '@/lib/sounds';

const GORYON_VIDEOS = [
  { id: 'BjjcJW7NxgE', start: 162 },
  { id: 'BjjcJW7NxgE', start: 210 },
  { id: 'BjjcJW7NxgE', start: 311 },
  { id: 'BjjcJW7NxgE', start: 432 },
  { id: 'BjjcJW7NxgE', start: 1141 },
  { id: 'g-RiCGKPYb8', start: 0 },
  { id: 'IUw6qc-2Kgo', start: 0 },
  { id: 'ruDH5SlrcfY', start: 0 },
  { id: 'PJAZf_2aIr4', start: 187 },
  { id: 'TzTiuzc5I50', start: 0 },
  { id: 've1UBtWGXdA', start: 0 },
  { id: 've1UBtWGXdA', start: 198 },
  { id: 'Wdldno14pBo', start: 0 },
];

interface Props {
  phase: GamePhase;
  step: number;
  totalSteps: number;
  currentContent: string | null;
  timeRemaining: number;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  isHost: boolean;
  isSecret: boolean;
  onSubmit: (content: string) => void;
}

export default function GamePlayView({
  phase, step, totalSteps, currentContent, timeRemaining,
  hasSubmitted, submittedCount, totalPlayers, isHost, isSecret, onSubmit,
}: Props) {
  const [text, setText] = useState('');

  const randomVideo = useMemo(() => {
    return GORYON_VIDEOS[Math.floor(Math.random() * GORYON_VIDEOS.length)];
  }, [hasSubmitted && phase]);

  const handleTextSubmit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
    playClick();
  };

  const handleDrawSubmit = (dataUrl: string) => {
    onSubmit(dataUrl);
  };

  const isTextPhase = phase === 'writing' || phase === 'describing';

  return (
    <div className="flex flex-col items-center gap-3 p-4 max-w-5xl mx-auto w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between w-full game-card py-2 px-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{getPhaseLabel(phase)}</span>
          <span className="text-sm text-muted-foreground">
            Kör {step + 1}/{totalSteps}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isHost && (
            <span className="text-sm font-bold text-primary">
              ✅ {submittedCount}/{totalPlayers}
            </span>
          )}

          {timeRemaining > 0 && (
            <div className={`flex items-center gap-2 font-bold text-xl ${timeRemaining <= 10 ? 'text-destructive animate-pulse' : ''}`}>
              ⏱️ {timeRemaining}mp
            </div>
          )}
        </div>
      </div>

      {/* Timer bar */}
      {timeRemaining > 0 && (
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{
              width: `${(timeRemaining / (phase === 'drawing'
                ? 60 : 30)) * 100}%`,
            }}
          />
        </div>
      )}

      {hasSubmitted ? (
        <div className="flex flex-col items-center gap-4 py-8 w-full max-w-2xl">
          <span className="text-6xl animate-bounce-in">✅</span>
          <h2 className="text-2xl font-bold">Beküldve!</h2>
          <p className="text-muted-foreground">Várakozás a többi játékosra...</p>
          {isHost && (
            <p className="text-sm text-primary font-bold">
              {submittedCount}/{totalPlayers} beérkezett
            </p>
          )}
          
          {/* YouTube video while waiting */}
          <div className="w-full mt-4">
            <p className="text-center text-lg font-bold mb-2 text-primary">
              🎬 Ameddig várakozol nézd a Mestert
            </p>
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-border shadow-lg">
              <iframe
                src={`https://www.youtube.com/embed/${randomVideo.id}?autoplay=1&start=${randomVideo.start}&mute=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="GoryON videó"
              />
            </div>
          </div>
        </div>
      ) : isTextPhase ? (
        <div className="flex flex-col items-center gap-4 w-full max-w-2xl">
          {/* Show content to describe */}
          {phase === 'describing' && currentContent && (
            <div className="w-full">
              <p className="text-sm font-bold text-muted-foreground mb-2">Mit látsz ezen a képen?</p>
              <div className="border-2 border-border rounded-xl overflow-hidden bg-white">
                <img src={currentContent} alt="Rajz" className="w-full h-auto" />
              </div>
            </div>
          )}

          <div className="w-full">
            <p className="text-sm font-bold text-muted-foreground mb-2">
              {phase === 'writing' ? 'Írj egy vicces mondatot:' : 'Írd le mit látsz:'}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="game-input min-h-[120px] resize-none"
              placeholder={phase === 'writing'
                ? 'Pl.: Egy zsiráf gördeszkázik a Holdon...'
                : 'Írd le mit látsz a képen...'}
              maxLength={200}
              autoFocus
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-muted-foreground">{text.length}/200</span>
              <button
                className="game-btn-primary"
                onClick={handleTextSubmit}
                disabled={!text.trim()}
              >
                ✅ KÜLDÉS!
              </button>
            </div>
          </div>
        </div>
      ) : phase === 'drawing' ? (
        <div className="w-full">
          {currentContent && (
            <div className="game-card mb-3 text-center">
              <p className="text-sm font-bold text-muted-foreground mb-1">Rajzold le ezt:</p>
              <p className="text-xl font-bold">"{currentContent}"</p>
            </div>
          )}
          <DrawingCanvas onSubmit={handleDrawSubmit} isSecret={isSecret} />
        </div>
      ) : null}
    </div>
  );
}
