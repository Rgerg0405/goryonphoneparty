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
        <div className="grid grid-cols-3 gap-3">
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
        </div>
      </div>

      {/* Bottom action bar - absolutely positioned or at the bottom */}
      <div className="fixed bottom-0 left-0 right-0 flex justify-center gap-4 p-4 bg-background/80 backdrop-blur border-t-2 border-border z-30">
        <span className="game-btn bg-card font-mono text-xl tracking-widest">
          🔑 {partyCode}
        </span>

        <button className="game-btn-secondary flex items-center gap-2" onClick={copyInviteLink}>
          🔗 MEGHÍVÁS
        </button>

        {isHost && (
          <button
            className="game-btn-primary flex items-center gap-2 animate-pulse-glow disabled:opacity-50 disabled:cursor-not-allowed"
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
