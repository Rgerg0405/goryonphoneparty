import { useMemo, useState } from 'react';

interface Props {
  videoId: string;
  label: string;
  active?: boolean;
  compact?: boolean;
}

export default function YouTubeMusicPlayer({ videoId, label, active = true, compact = false }: Props) {
  const [enabled, setEnabled] = useState(false);
  const src = useMemo(() => (
    `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=1&rel=0&modestbranding=1`
  ), [videoId]);

  if (!active) return null;

  return (
    <div className={compact ? 'w-full' : 'relative'}>
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={compact ? 'game-btn-secondary text-sm py-2 px-3 w-full' : 'game-btn-secondary text-sm py-1 px-3'}
        title={enabled ? 'Zene kikapcsolása' : 'Zene indítása'}
      >
        {enabled ? '🎵 Zene megy' : `🎵 ${label}`}
      </button>
      {enabled && (
        <div className={compact ? 'mt-2 rounded-xl overflow-hidden border-2 border-border bg-card' : 'absolute right-0 mt-2 w-64 rounded-xl overflow-hidden border-2 border-border bg-card shadow-xl'}>
          <iframe
            title={label}
            src={src}
            allow="autoplay; encrypted-media; picture-in-picture"
            className="w-full aspect-video"
          />
        </div>
      )}
    </div>
  );
}