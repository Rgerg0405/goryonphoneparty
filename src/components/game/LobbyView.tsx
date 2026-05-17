import { Player, GameSettings, GAME_MODES, TIME_OPTIONS } from '@/lib/gameTypes';
import { getAvatarDisplay } from '@/lib/avatars';
import { playClick } from '@/lib/sounds';
import { toast } from '@/hooks/use-toast';

interface Props {
  players: Player[];
  settings: GameSettings;
  isHost: boolean;
  partyCode: string;
  onStartGame: () => void;
  onUpdateSettings: (s: Partial<GameSettings>) => void;
}

export default function LobbyView({ players, settings, isHost, partyCode, onStartGame, onUpdateSettings }: Props) {
  const maxSlots = settings.maxPlayers;
  const emptySlots = Math.max(0, maxSlots - players.length);

  const copyInviteLink = () => {
    const link = `${window.location.origin}/party/${partyCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: '📋 Link másolva!', description: 'Küldd el a barátaidnak!' });
    playClick();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto w-full">
      {/* Players panel */}
      <div className="game-card lg:w-80 flex-shrink-0">
        <h2 className="text-xl font-bold mb-3 text-center">
          🎮 JÁTÉKOSOK {players.length}/{maxSlots}
        </h2>

        <div className="flex flex-col gap-2">
          {players.map((p) => {
            const av = getAvatarDisplay(p.avatar);
            return (
              <div key={p.player_id} className="player-slot animate-slide-in">
                {av.src ? (
                  <img src={av.src} alt="" className="w-10 h-10 rounded-lg border border-border object-cover" />
                ) : (
                  <span className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-xl bg-card">
                    {av.emoji}
                  </span>
                )}
                <span className="font-bold text-lg flex-1 truncate">{p.username}</span>
                {players[0]?.player_id === p.player_id && (
                  <span className="text-primary text-xl" title="Host">👑</span>
                )}
              </div>
            );
          })}

          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} className="player-slot-empty">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center text-xl opacity-30">👤</span>
              <span className="font-bold opacity-30">ÜRES</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center - Game modes */}
      <div className="game-card flex-1">
        <h2 className="text-xl font-bold mb-3 text-center">🎲 JÁTÉKMÓDOK</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {GAME_MODES.map((mode: any) => (
            <button
              key={mode.id}
              className={`mode-card relative ${settings.gameMode === mode.id ? 'active' : ''} ${mode.soon ? 'opacity-60' : 'hover-glow'}`}
              onClick={() => {
                if (isHost && !mode.soon) onUpdateSettings({ gameMode: mode.id });
                playClick();
              }}
              disabled={!isHost || mode.soon}
              title={mode.description}
            >
              <span className="text-3xl">{mode.icon}</span>
              <span className="font-bold text-sm">{mode.name}</span>
              {mode.soon && (
                <span className="absolute -top-1 -right-1 text-[10px] bg-accent text-accent-foreground rounded-full px-2 py-0.5 font-bold border border-border">SOON</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right - Settings */}
      <div className="game-card lg:w-72 flex-shrink-0">
        <h2 className="text-xl font-bold mb-3 text-center">⚙️ BEÁLLÍTÁSOK</h2>

        <div className="flex flex-col gap-4">
          <div>
            <label className="font-bold text-sm mb-1 block">✏️ Írás idő</label>
            <div className="flex flex-wrap gap-1">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={`w-${t.value}`}
                  className={`text-xs py-1 px-2 rounded-lg border-2 font-bold transition-all ${
                    settings.writeTime === t.value
                      ? 'border-primary bg-primary/20'
                      : 'border-border/30 bg-card'
                  }`}
                  onClick={() => { if (isHost) onUpdateSettings({ writeTime: t.value }); playClick(); }}
                  disabled={!isHost}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-sm mb-1 block">🎨 Rajzolás idő</label>
            <div className="flex flex-wrap gap-1">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={`d-${t.value}`}
                  className={`text-xs py-1 px-2 rounded-lg border-2 font-bold transition-all ${
                    settings.drawTime === t.value
                      ? 'border-primary bg-primary/20'
                      : 'border-border/30 bg-card'
                  }`}
                  onClick={() => { if (isHost) onUpdateSettings({ drawTime: t.value }); playClick(); }}
                  disabled={!isHost}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-sm mb-1 block">📝 Leírás idő</label>
            <div className="flex flex-wrap gap-1">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={`desc-${t.value}`}
                  className={`text-xs py-1 px-2 rounded-lg border-2 font-bold transition-all ${
                    settings.describeTime === t.value
                      ? 'border-primary bg-primary/20'
                      : 'border-border/30 bg-card'
                  }`}
                  onClick={() => { if (isHost) onUpdateSettings({ describeTime: t.value }); playClick(); }}
                  disabled={!isHost}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-sm mb-1 block">👥 Max játékosok</label>
            <div className="flex gap-1 flex-wrap">
              {[4, 6, 8, 10, 14].map((n) => (
                <button
                  key={n}
                  className={`text-xs py-1 px-2 rounded-lg border-2 font-bold ${
                    settings.maxPlayers === n
                      ? 'border-primary bg-primary/20'
                      : 'border-border/30 bg-card'
                  }`}
                  onClick={() => { if (isHost) onUpdateSettings({ maxPlayers: n }); playClick(); }}
                  disabled={!isHost}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-sm mb-2 block">🖼️ Kép import a rajzba</label>
            <button
              type="button"
              disabled={!isHost}
              onClick={() => { if (isHost) onUpdateSettings({ allowImageImport: !settings.allowImageImport }); playClick(); }}
              className={`w-full text-xs py-2 px-3 rounded-lg border-2 font-bold transition-all ${
                settings.allowImageImport ? 'border-primary bg-primary/20' : 'border-border/30 bg-card'
              }`}
            >
              {settings.allowImageImport ? '✅ Engedélyezve' : '❌ Tiltva'}
            </button>
            <p className="text-[10px] text-muted-foreground mt-1">Ha be van kapcsolva, a rajzolók egy képet is feltölthetnek új rétegként.</p>
          </div>

          <ModeSpecificSettings settings={settings} isHost={isHost} onUpdateSettings={onUpdateSettings} />
        </div>
      </div>

      {/* Bottom action bar - absolutely positioned or at the bottom */}
        <div className="fixed bottom-0 left-0 right-0 flex flex-wrap justify-center gap-2 md:gap-4 p-2 md:p-4 bg-background/80 backdrop-blur border-t-2 border-border z-30">
        <span className="game-btn bg-card font-mono text-base md:text-xl tracking-widest py-2 md:py-3 px-3 md:px-6">
          🔑 {partyCode}
        </span>

        <button className="game-btn-secondary flex items-center gap-2 text-sm md:text-lg py-2 md:py-3 px-3 md:px-6" onClick={copyInviteLink}>
          🔗 MEGHÍVÁS
        </button>

        {isHost && (
          <button
            className="game-btn-primary flex items-center gap-2 animate-pulse-glow disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-lg py-2 md:py-3 px-3 md:px-6"
            onClick={onStartGame}
            disabled={players.length < 2}
          >
            ▶️ INDÍTÁS {players.length < 2 && '(min. 2 játékos)'}
          </button>
        )}
      </div>
    </div>
  );
}

function ModeSpecificSettings({ settings, isHost, onUpdateSettings }: {
  settings: GameSettings; isHost: boolean; onUpdateSettings: (s: Partial<GameSettings>) => void;
}) {
  const mode = settings.gameMode;
  if (mode === 'scribble') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">✍️ Scribble beállítások</div>
        <NumberRow label="Körök" value={settings.scribbleRounds ?? 3} min={1} max={10} disabled={!isHost} onChange={(v) => onUpdateSettings({ scribbleRounds: v })} />
        <NumberRow label="Rajz idő (mp)" value={settings.scribbleDrawTime ?? 60} min={20} max={180} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ scribbleDrawTime: v })} />
        <label className="block">
          <span className="text-[11px] font-bold block mb-1">Saját szavak (vesszővel)</span>
          <textarea value={settings.scribbleCustomWords ?? ''} disabled={!isHost}
            onChange={(e) => onUpdateSettings({ scribbleCustomWords: e.target.value })}
            className="game-input min-h-[60px] text-xs" placeholder="opcionális, pl.: zsiráf, holdfény, pizza..." />
        </label>
      </div>
    );
  }
  if (mode === 'blind-flight') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🌑 Vakrepülés beállítások</div>
        <NumberRow label="Körök" value={settings.blindRounds ?? 3} min={1} max={10} disabled={!isHost} onChange={(v) => onUpdateSettings({ blindRounds: v })} />
        <NumberRow label="Rajz idő (mp)" value={settings.blindDrawTime ?? 45} min={20} max={120} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ blindDrawTime: v })} />
        <label className="block">
          <span className="text-[11px] font-bold block mb-1">Sötétség: {Math.round((settings.blindDarkness ?? 0.85) * 100)}%</span>
          <input type="range" min={0.4} max={1} step={0.05} value={settings.blindDarkness ?? 0.85}
            disabled={!isHost}
            onChange={(e) => onUpdateSettings({ blindDarkness: Number(e.target.value) })} className="w-full" />
        </label>
      </div>
    );
  }
  if (mode === 'animation') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🎬 Animáció beállítások</div>
        <NumberRow label="Képkockák" value={settings.animFrames ?? 6} min={2} max={12} disabled={!isHost} onChange={(v) => onUpdateSettings({ animFrames: v })} />
        <NumberRow label="Idő / képkocka (mp)" value={settings.animFrameTime ?? 30} min={10} max={120} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ animFrameTime: v })} />
      </div>
    );
  }
  if (mode === 'presentation') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🎤 Prezentáció beállítások</div>
        <NumberRow label="Slide-ok" value={settings.presSlides ?? 5} min={3} max={10} disabled={!isHost} onChange={(v) => onUpdateSettings({ presSlides: v })} />
        <NumberRow label="Slide idő (mp)" value={settings.presSlideTime ?? 25} min={10} max={60} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ presSlideTime: v })} />
      </div>
    );
  }
  if (mode === 'shooter-3d') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🎯 3D Shooter beállítások</div>
        <NumberRow label="Játékidő (mp)" value={settings.shooterTime ?? 90} min={30} max={180} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ shooterTime: v })} />
        <NumberRow label="Célpontok" value={settings.shooterTargets ?? 28} min={10} max={80} disabled={!isHost} onChange={(v) => onUpdateSettings({ shooterTargets: v })} />
      </div>
    );
  }
  if (mode === 'modeling-3d') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🧊 3D modell tippek</div>
        <p className="text-[10px] text-muted-foreground">Shift+kattintás: több kijelölés. Ctrl+G csoportosít. G/R/S: mód.</p>
      </div>
    );
  }
  if (mode === 'geoguesser') {
    return (
      <div className="border-t-2 border-border/40 pt-3 space-y-2">
        <div className="font-bold text-xs">🌍 GeoGuesser beállítások</div>
        <NumberRow label="Körök" value={settings.geoRounds ?? 5} min={1} max={10} disabled={!isHost} onChange={(v) => onUpdateSettings({ geoRounds: v })} />
        <NumberRow label="Kör idő (mp)" value={settings.geoTime ?? 90} min={20} max={180} step={5} disabled={!isHost} onChange={(v) => onUpdateSettings({ geoTime: v })} />
      </div>
    );
  }
  return null;
}

function NumberRow({ label, value, min, max, step = 1, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold flex-1">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 px-2 py-1 text-xs rounded border-2 border-border bg-card font-bold text-right" />
    </div>
  );
}
