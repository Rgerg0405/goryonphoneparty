import { useParams, useNavigate } from 'react-router-dom';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { useGameLogic } from '@/hooks/useGameLogic';
import Header from '@/components/game/Header';
import LobbyView from '@/components/game/LobbyView';
import GamePlayView from '@/components/game/GamePlayView';
import AlbumView from '@/components/game/AlbumView';
import ScribbleGameView from '@/components/game/ScribbleGameView';
import BlindFlightView from '@/components/game/BlindFlightView';
import AnimationGameView from '@/components/game/AnimationGameView';
import PresentationGameView from '@/components/game/PresentationGameView';
import bannerBg from '@/assets/goryonbanner.jpg';
import { useState } from 'react';
import { AVATARS, getAvatarDisplay } from '@/lib/avatars';
import { playClick } from '@/lib/sounds';

export default function PartyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { playerId, username, setUsername, avatar, setAvatar } = usePlayerIdentity();

  // If no username, show join form
  if (!username) {
    return <JoinForm code={code!} setUsername={setUsername} avatar={avatar} setAvatar={setAvatar} />;
  }

  return <PartyContent code={code!} playerId={playerId} username={username} avatar={avatar} />;
}

function JoinForm({ code, setUsername, avatar, setAvatar }: {
  code: string;
  setUsername: (n: string) => void;
  avatar: string;
  setAvatar: (a: string) => void;
}) {
  const [name, setName] = useState('');

  const handleJoin = () => {
    if (!name.trim()) return;
    setUsername(name.trim());
    playClick();
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${bannerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="min-h-screen flex flex-col" style={{ background: 'hsla(48, 100%, 50%, 0.85)' }}>
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="game-card max-w-md w-full p-6 space-y-4">
            <h2 className="text-2xl font-bold text-center">🚪 Csatlakozás: {code}</h2>
            <div>
              <label className="font-bold text-sm mb-1 block">Felhasználónév</label>
              <input
                type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="game-input" placeholder="A neved..." maxLength={20} autoFocus
              />
            </div>
            <div>
              <label className="font-bold text-sm mb-1 block">Profilkép</label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map((av) => {
                  const display = getAvatarDisplay(av.id);
                  return (
                    <button
                      key={av.id}
                      className={`w-12 h-12 rounded-xl border-2 overflow-hidden transition-all ${
                        avatar === av.id ? 'border-primary scale-110' : 'border-border/30'
                      }`}
                      onClick={() => { setAvatar(av.id); playClick(); }}
                    >
                      {display.src ? (
                        <img src={display.src} alt={av.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-xl bg-card">{display.emoji}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className="game-btn-primary w-full text-xl" onClick={handleJoin} disabled={!name.trim()}>
              🎮 CSATLAKOZÁS
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function PartyContent({ code, playerId, username, avatar }: {
  code: string; playerId: string; username: string; avatar: string;
}) {
  const game = useGameLogic(code, playerId, username, avatar);

  if (game.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="game-card p-8 text-center">
          <div className="text-5xl mb-4 animate-bounce">🎮</div>
          <p className="text-xl font-bold">Csatlakozás...</p>
        </div>
      </div>
    );
  }

  if (game.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="game-card p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <p className="text-xl font-bold text-destructive">{game.error}</p>
          <a href="/" className="game-btn-primary mt-4 inline-block">Vissza</a>
        </div>
      </div>
    );
  }

  const isSecret = game.settings.gameMode === 'secret';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${bannerBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="min-h-screen flex flex-col" style={{ background: 'hsla(48, 100%, 50%, 0.88)' }}>
        <Header musicActive={game.phase === 'lobby'} />

        <main className="flex-1 pb-20">
          {game.phase === 'lobby' && (
            <LobbyView
              players={game.players}
              settings={game.settings}
              isHost={game.isHost}
              partyCode={code}
              onStartGame={game.startGame}
              onUpdateSettings={game.updateSettings}
            />
          )}

          {(game.phase === 'writing' || game.phase === 'drawing' || game.phase === 'describing') && (
            <GamePlayView
              phase={game.phase}
              step={game.step}
              totalSteps={game.totalSteps}
              currentContent={game.currentContent}
              timeRemaining={game.timeRemaining}
              hasSubmitted={game.hasSubmitted}
              submittedCount={game.submittedCount}
              totalPlayers={game.totalPlayers}
              isHost={game.isHost}
              isSecret={isSecret}
              gameMode={game.settings.gameMode}
              allowImageImport={game.settings.allowImageImport}
              onSubmit={game.submitEntry}
            />
          )}

          {game.phase === 'custom-mode' && game.settings.gameMode === 'scribble' && (
            <ScribbleGameView code={code} players={game.players} playerId={playerId} username={username}
              isHost={game.isHost} settings={game.settings} onFinish={game.startNewGame} />
          )}
          {game.phase === 'custom-mode' && game.settings.gameMode === 'blind-flight' && (
            <BlindFlightView code={code} players={game.players} playerId={playerId} username={username}
              isHost={game.isHost} settings={game.settings} onFinish={game.startNewGame} />
          )}
          {game.phase === 'custom-mode' && game.settings.gameMode === 'animation' && (
            <AnimationGameView code={code} players={game.players} playerId={playerId} username={username}
              isHost={game.isHost} settings={game.settings} onFinish={game.startNewGame} />
          )}
          {game.phase === 'custom-mode' && game.settings.gameMode === 'presentation' && (
            <PresentationGameView code={code} players={game.players} playerId={playerId} username={username}
              isHost={game.isHost} settings={game.settings} onFinish={game.startNewGame} />
          )}

          {game.phase === 'album' && (
            <AlbumView
              entries={game.albumEntries}
              slide={game.albumSlide}
              players={game.players}
              playerOrder={game.playerOrder}
              totalSteps={game.totalSteps}
              isHost={game.isHost}
              reactions={game.reactions}
              onNextSlide={game.nextSlide}
              onPrevSlide={game.prevSlide}
              onSendReaction={game.sendReaction}
              onSendComment={game.sendComment}
              onNewGame={game.startNewGame}
            />
          )}
        </main>
      </div>
    </div>
  );
}
