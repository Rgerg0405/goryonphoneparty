import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Player, GameSettings, GameEntry, GamePhase, Reaction,
  DEFAULT_SETTINGS, getBlankCanvas, speakHungarian,
} from '@/lib/gameTypes';
import { playClick, playSubmit, playNotification, playTimerWarning, playPop, playSlideChange } from '@/lib/sounds';
import { toast } from '@/hooks/use-toast';

/** Retry a query until it returns data or max attempts reached */
async function fetchWithRetry<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  maxAttempts = 5,
  delayMs = 600,
): Promise<T | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await queryFn();
    if (data && (Array.isArray(data) ? data.length > 0 : true)) return data;
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

interface GameState {
  partyId: string;
  isHost: boolean;
  players: Player[];
  settings: GameSettings;
  phase: GamePhase;
  step: number;
  totalSteps: number;
  playerOrder: string[];
  currentContent: string | null;
  myChainIndex: number;
  timeRemaining: number;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  sessionNumber: number;
  albumEntries: GameEntry[];
  albumSlide: { chain: number; step: number };
  reactions: Reaction[];
  error: string | null;
  loading: boolean;
}

const initialState: GameState = {
  partyId: '',
  isHost: false,
  players: [],
  settings: DEFAULT_SETTINGS,
  phase: 'lobby',
  step: 0,
  totalSteps: 0,
  playerOrder: [],
  currentContent: null,
  myChainIndex: 0,
  timeRemaining: 0,
  hasSubmitted: false,
  submittedCount: 0,
  totalPlayers: 0,
  sessionNumber: 1,
  albumEntries: [],
  albumSlide: { chain: 0, step: 0 },
  reactions: [],
  error: null,
  loading: true,
};

export function useGameLogic(code: string | undefined, playerId: string, username: string, avatar: string) {
  const [game, setGame] = useState<GameState>(initialState);
  const gameRef = useRef<GameState>(initialState);
  const channelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const timeRef = useRef(0);
  const submissionsRef = useRef<Set<string>>(new Set());

  const updateGame = useCallback((updates: Partial<GameState>) => {
    gameRef.current = { ...gameRef.current, ...updates };
    setGame({ ...gameRef.current });
  }, []);

  const refreshPlayers = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('party_players')
      .select('*')
      .eq('party_id', pid)
      .order('joined_at');
    if (data) {
      updateGame({ players: data as unknown as Player[] });
    }
  }, [updateGame]);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (seconds <= 0) {
      updateGame({ timeRemaining: 0 });
      return;
    }
    timeRef.current = seconds;
    updateGame({ timeRemaining: seconds });

    timerRef.current = setInterval(() => {
      timeRef.current -= 1;
      if (timeRef.current <= 5 && timeRef.current > 0) playTimerWarning();
      if (timeRef.current <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        updateGame({ timeRemaining: 0 });
        if (gameRef.current.isHost) {
          handleTimerExpired();
        }
        return;
      }
      updateGame({ timeRemaining: timeRef.current });
    }, 1000);
  }, [updateGame]);

  const advanceStep = useCallback(async () => {
    const g = gameRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const nextStep = g.step + 1;

    if (nextStep >= g.totalSteps) {
      // Game over → album
      await supabase.from('parties').update({ status: 'album' }).eq('id', g.partyId);

      const data = await fetchWithRetry(() =>
        supabase
          .from('game_entries')
          .select('*')
          .eq('party_id', g.partyId)
          .eq('session_number', g.sessionNumber)
          .order('chain_index')
          .order('step'),
        5, 500
      );

      channelRef.current?.send({
        type: 'broadcast',
        event: 'album:start',
        payload: { sessionNumber: g.sessionNumber },
      });

      updateGame({
        phase: 'album',
        albumEntries: (data || []) as unknown as GameEntry[],
        albumSlide: { chain: 0, step: 0 },
      });

      playNotification();
      return;
    }

    const nextPhase: GamePhase = nextStep % 2 === 1 ? 'drawing' : 'describing';
    const timeForPhase = nextPhase === 'drawing' ? g.settings.drawTime : g.settings.describeTime;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:phase',
      payload: {
        phase: nextPhase,
        step: nextStep,
        totalSteps: g.totalSteps,
        playerOrder: g.playerOrder,
        timeRemaining: timeForPhase,
        sessionNumber: g.sessionNumber,
        partyId: g.partyId,
      },
    });

    submissionsRef.current = new Set();

    const myIndex = g.playerOrder.indexOf(playerId);
    const N = g.playerOrder.length;
    const chainIndex = ((myIndex - nextStep) % N + N) % N;

    // Load my assignment from DB with retry
    const prevEntry = await fetchWithRetry(() =>
      supabase
        .from('game_entries')
        .select('content')
        .eq('party_id', g.partyId)
        .eq('session_number', g.sessionNumber)
        .eq('chain_index', chainIndex)
        .eq('step', nextStep - 1)
        .maybeSingle(),
      5, 500
    );

    updateGame({
      phase: nextPhase,
      step: nextStep,
      currentContent: prevEntry?.content || null,
      myChainIndex: chainIndex,
      hasSubmitted: false,
      submittedCount: 0,
      timeRemaining: timeForPhase,
    });

    if (timeForPhase > 0) startTimer(timeForPhase);
    playNotification();
  }, [playerId, updateGame, startTimer]);

  const handleTimerExpired = useCallback(async () => {
    const g = gameRef.current;
    if (!g.isHost) return;

    // Insert blank entries for missing players
    const missingPlayers = g.playerOrder.filter(pid => !submissionsRef.current.has(pid));
    for (const pid of missingPlayers) {
      const pIdx = g.playerOrder.indexOf(pid);
      const N = g.playerOrder.length;
      const chainIdx = ((pIdx - g.step) % N + N) % N;
      const player = g.players.find(p => p.player_id === pid);
      const entryType = g.step % 2 === 0 ? 'text' : 'drawing';

      await supabase.from('game_entries').insert({
        party_id: g.partyId,
        session_number: g.sessionNumber,
        chain_index: chainIdx,
        step: g.step,
        player_id: pid,
        player_name: player?.username || 'Ismeretlen',
        entry_type: entryType,
        content: entryType === 'text' ? '(nem válaszolt)' : getBlankCanvas(),
      });
    }

    await advanceStep();
  }, [advanceStep]);

  // Init
  useEffect(() => {
    if (!code || !username) return;

    let mounted = true;

    const init = async () => {
      const { data: party, error: partyError } = await supabase
        .from('parties')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (!mounted) return;
      if (partyError || !party) {
        updateGame({ error: 'Party nem található!', loading: false });
        return;
      }

      const isHost = party.host_id === playerId;
      gameRef.current.partyId = party.id;
      gameRef.current.isHost = isHost;
      gameRef.current.settings = (party.settings as unknown as GameSettings) || DEFAULT_SETTINGS;

      // Upsert player
      await supabase.from('party_players').upsert(
        { party_id: party.id, player_id: playerId, username, avatar },
        { onConflict: 'party_id,player_id' }
      );

      await refreshPlayers(party.id);

      // Channel
      const channel = supabase.channel(`party-${code}`);

      channel.on('broadcast', { event: 'game:phase' }, ({ payload }) => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        submissionsRef.current = new Set();

        const myIndex = payload.playerOrder.indexOf(playerId);
        const N = payload.playerOrder.length;
        const chainIndex = ((myIndex - payload.step) % N + N) % N;

        updateGame({
          phase: payload.phase,
          step: payload.step,
          totalSteps: payload.totalSteps,
          playerOrder: payload.playerOrder,
          totalPlayers: payload.playerOrder.length,
          hasSubmitted: false,
          submittedCount: 0,
          myChainIndex: chainIndex,
          timeRemaining: payload.timeRemaining,
          currentContent: null, // Will load from DB
        });

        // Load assignment from DB
        if (payload.step > 0) {
          supabase
            .from('game_entries')
            .select('content')
            .eq('party_id', payload.partyId)
            .eq('session_number', payload.sessionNumber)
            .eq('chain_index', chainIndex)
            .eq('step', payload.step - 1)
            .maybeSingle()
            .then(({ data }) => {
              if (mounted) updateGame({ currentContent: data?.content || null });
            });
        }

        if (payload.timeRemaining > 0) {
          timeRef.current = payload.timeRemaining;
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            timeRef.current -= 1;
            if (timeRef.current <= 5 && timeRef.current > 0) playTimerWarning();
            if (timeRef.current <= 0) {
              clearInterval(timerRef.current!);
              timerRef.current = null;
              updateGame({ timeRemaining: 0 });
              return;
            }
            updateGame({ timeRemaining: timeRef.current });
          }, 1000);
        }

        playNotification();
      });

      channel.on('broadcast', { event: 'player:submit' }, ({ payload }) => {
        if (!gameRef.current.isHost) return;
        submissionsRef.current.add(payload.playerId);
        const count = submissionsRef.current.size;
        updateGame({ submittedCount: count });
        if (count >= gameRef.current.playerOrder.length) {
          advanceStep();
        }
      });

      channel.on('broadcast', { event: 'player:joined' }, () => {
        refreshPlayers(party.id);
      });

      channel.on('broadcast', { event: 'settings:update' }, ({ payload }) => {
        updateGame({ settings: payload });
      });

      channel.on('broadcast', { event: 'album:start' }, ({ payload }) => {
        supabase
          .from('game_entries')
          .select('*')
          .eq('party_id', gameRef.current.partyId)
          .eq('session_number', payload.sessionNumber)
          .order('chain_index')
          .order('step')
          .then(({ data }) => {
            if (mounted) {
              updateGame({
                phase: 'album',
                albumEntries: (data || []) as unknown as GameEntry[],
                albumSlide: { chain: 0, step: 0 },
              });
            }
          });
        playNotification();
      });

      channel.on('broadcast', { event: 'album:slide' }, ({ payload }) => {
        updateGame({ albumSlide: payload });
        playSlideChange();
        // TTS
        const entry = gameRef.current.albumEntries.find(
          (e) => e.chain_index === payload.chain && e.step === payload.step
        );
        if (entry?.entry_type === 'text') {
          speakHungarian(entry.content);
        }
      });

      channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const reaction: Reaction = {
          id: crypto.randomUUID(),
          type: payload.type,
          x: Math.random() * 70 + 15,
          y: Math.random() * 70 + 15,
          timestamp: Date.now(),
        };
        updateGame({ reactions: [...gameRef.current.reactions, reaction] });
        playPop();
        setTimeout(() => {
          updateGame({
            reactions: gameRef.current.reactions.filter((r) => r.id !== reaction.id),
          });
        }, 3000);
      });

      channel.on('broadcast', { event: 'comment' }, ({ payload }) => {
        toast({ title: payload.playerName, description: payload.text });
        speakHungarian(payload.text);
      });

      channel.on('broadcast', { event: 'new:game' }, () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        submissionsRef.current = new Set();
        updateGame({
          phase: 'lobby',
          step: 0,
          totalSteps: 0,
          playerOrder: [],
          currentContent: null,
          hasSubmitted: false,
          submittedCount: 0,
          albumEntries: [],
          albumSlide: { chain: 0, step: 0 },
          reactions: [],
          sessionNumber: gameRef.current.sessionNumber + 1,
        });
        refreshPlayers(party.id);
      });

      await channel.subscribe();
      channelRef.current = channel;

      channel.send({
        type: 'broadcast',
        event: 'player:joined',
        payload: { playerId, username, avatar },
      });

      updateGame({
        partyId: party.id,
        isHost,
        settings: (party.settings as unknown as GameSettings) || DEFAULT_SETTINGS,
        loading: false,
      });
    };

    init();

    return () => {
      mounted = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code, playerId, username, avatar]);

  // Actions
  const startGame = useCallback(async () => {
    const g = gameRef.current;
    if (!g.isHost || g.players.length < 2) return;

    playClick();
    const order = g.players.map((p) => p.player_id);
    const totalSteps = order.length;

    await supabase.from('parties').update({ status: 'playing' }).eq('id', g.partyId);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'game:phase',
      payload: {
        phase: 'writing',
        step: 0,
        totalSteps,
        playerOrder: order,
        timeRemaining: g.settings.writeTime,
        sessionNumber: g.sessionNumber,
        partyId: g.partyId,
      },
    });

    submissionsRef.current = new Set();
    const myIndex = order.indexOf(playerId);

    updateGame({
      phase: 'writing',
      step: 0,
      totalSteps,
      playerOrder: order,
      totalPlayers: order.length,
      currentContent: null,
      myChainIndex: myIndex,
      hasSubmitted: false,
      submittedCount: 0,
      timeRemaining: g.settings.writeTime,
    });

    if (g.settings.writeTime > 0) startTimer(g.settings.writeTime);
    playNotification();
  }, [playerId, updateGame, startTimer]);

  const submitEntry = useCallback(async (content: string) => {
    const g = gameRef.current;
    const entryType = g.step % 2 === 0 ? 'text' : 'drawing';

    await supabase.from('game_entries').insert({
      party_id: g.partyId,
      session_number: g.sessionNumber,
      chain_index: g.myChainIndex,
      step: g.step,
      player_id: playerId,
      player_name: username,
      entry_type: entryType,
      content,
    });

    channelRef.current?.send({
      type: 'broadcast',
      event: 'player:submit',
      payload: { playerId },
    });

    if (g.isHost) {
      submissionsRef.current.add(playerId);
      const count = submissionsRef.current.size;
      updateGame({ hasSubmitted: true, submittedCount: count });
      if (count >= g.playerOrder.length) {
        await advanceStep();
      }
    } else {
      updateGame({ hasSubmitted: true });
    }

    playSubmit();
  }, [playerId, username, updateGame, advanceStep]);

  const updateSettings = useCallback(async (newSettings: Partial<GameSettings>) => {
    const updated = { ...gameRef.current.settings, ...newSettings };
    updateGame({ settings: updated });
    await supabase.from('parties').update({ settings: updated as any }).eq('id', gameRef.current.partyId);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'settings:update',
      payload: updated,
    });
    playClick();
  }, [updateGame]);

  const nextSlide = useCallback(() => {
    const g = gameRef.current;
    if (!g.isHost) return;
    const { chain, step } = g.albumSlide;
    const maxStep = g.totalSteps - 1;
    const numChains = g.playerOrder.length;

    let newChain = chain;
    let newStep = step + 1;
    if (newStep > maxStep) {
      newStep = 0;
      newChain = chain + 1;
    }
    if (newChain >= numChains) return;

    updateGame({ albumSlide: { chain: newChain, step: newStep } });
    channelRef.current?.send({
      type: 'broadcast',
      event: 'album:slide',
      payload: { chain: newChain, step: newStep },
    });

    const entry = g.albumEntries.find(
      (e) => e.chain_index === newChain && e.step === newStep
    );
    if (entry?.entry_type === 'text') speakHungarian(entry.content);
    playSlideChange();
  }, [updateGame]);

  const prevSlide = useCallback(() => {
    const g = gameRef.current;
    if (!g.isHost) return;
    const { chain, step } = g.albumSlide;
    const maxStep = g.totalSteps - 1;

    let newChain = chain;
    let newStep = step - 1;
    if (newStep < 0) {
      newChain = chain - 1;
      newStep = maxStep;
    }
    if (newChain < 0) return;

    updateGame({ albumSlide: { chain: newChain, step: newStep } });
    channelRef.current?.send({
      type: 'broadcast',
      event: 'album:slide',
      payload: { chain: newChain, step: newStep },
    });
    playSlideChange();
  }, [updateGame]);

  const sendReaction = useCallback((type: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { type, playerId },
    });
    // Add locally
    const reaction: Reaction = {
      id: crypto.randomUUID(),
      type,
      x: Math.random() * 70 + 15,
      y: Math.random() * 70 + 15,
      timestamp: Date.now(),
    };
    updateGame({ reactions: [...gameRef.current.reactions, reaction] });
    playPop();
    setTimeout(() => {
      updateGame({
        reactions: gameRef.current.reactions.filter((r) => r.id !== reaction.id),
      });
    }, 3000);
  }, [playerId, updateGame]);

  const sendComment = useCallback((text: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'comment',
      payload: { text, playerName: username, playerId },
    });
    toast({ title: username, description: text });
    speakHungarian(text);
    playClick();
  }, [playerId, username]);

  const startNewGame = useCallback(async () => {
    const g = gameRef.current;
    if (!g.isHost) return;
    const newSession = g.sessionNumber + 1;

    await supabase.from('parties').update({ status: 'lobby' }).eq('id', g.partyId);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'new:game',
      payload: {},
    });

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    submissionsRef.current = new Set();

    updateGame({
      phase: 'lobby',
      step: 0,
      totalSteps: 0,
      playerOrder: [],
      currentContent: null,
      hasSubmitted: false,
      submittedCount: 0,
      albumEntries: [],
      albumSlide: { chain: 0, step: 0 },
      reactions: [],
      sessionNumber: newSession,
    });

    await refreshPlayers(g.partyId);
    playNotification();
  }, [updateGame, refreshPlayers]);

  return {
    ...game,
    startGame,
    submitEntry,
    updateSettings,
    nextSlide,
    prevSlide,
    sendReaction,
    sendComment,
    startNewGame,
  };
}
