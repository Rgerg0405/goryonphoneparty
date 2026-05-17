## Goryon Phone – Nagy Frissítés

Sok új feature van a kérésben, ezért szakaszokra bontom és priorizálva építem ki őket, hogy stabil maradjon.

### 1. AI módok eltávolítása
- `AI PROMPT` és `AI KÉP` módok törlése a `GAME_MODES` listából (`gameTypes.ts`)
- `AIImageView.tsx` komponens törlése
- `ai-generate-image` és `ai-generate-prompts` edge functionök törlése
- `useGameLogic.ts` AI prompt generálás kivétele
- `GamePlayView.tsx` AI mód renderelés kivétele
- `supabase/config.toml` AI function bejegyzések törlése

### 2. Emoji avatarok eltávolítása
- `avatars.ts`: az emoji-only opciók (alien, robot, ghost, clown, skull, dragon, fire, star) törlése – csak képes avatarok maradnak

### 3. 3D Modellezés profibb
- Drag-and-drop transform: `TransformControls` (`@react-three/drei`) integrálása – G (mozgatás), R (forgatás), S (skálázás) gombok
- Több alakzat: prizma, kapszula, oktaéder, ikozaéder, sík, gyűrű
- Texture/Draw módon: kijelölt alakzatra egy modal-ban kanvasszal lehet textúrát rajzolni, ami `CanvasTexture`-ként alkalmazódik a meshre
- Egyszerre több kijelölés, duplikálás, csoportos törlés

### 4. Új játékmódok (működővé tétel)

**Animáció mód:**
- Frame-alapú: a játékos több képkockát rajzol (állítható, 2–12), GIF-ként össze van fűzve
- A normál chain helyett saját chain: rajzol → leírja → újra rajzol stb., a végén minden átfolyik az albumba
- GIF letöltés az album végén (gif.js library)

**GIF letöltés album-ról:**
- Minden játékmód végén az album minden slide-ja (szöveg + kép) GIF-be kerül és letölthető

**Vakrepülés mód:**
- Egy host által választott rajzoló a teljes körön át rajzol – nem látja a vásznát (csak sötét rétget), a többiek live-ban nézik (broadcast-channel képbeküldés ~500ms-onként)
- Kör végén csillag (1–5) pontozás, leaderboard

**Scribble mód (új):**
- Sorban van mindig egy rajzoló, random szót kap a rendszertől
- Beállítható: körök száma, custom szólista (host adja hozzá szövegmezőben)
- Live broadcast a rajzról, többiek chatben tippelnek
- Pontozás idő alapján (gyorsabb tipp = több pont), a rajzoló is kap pontot

**Vicces Prezentáció mód:**
- Lobbyban mindenki ír prezentáció címet
- Mindenki kap 2-t és választ egyet
- Párba sorsol: prezentáló + segéd
- Segéd: dia-anként választ képet (Pexels/Unsplash ingyenes API) vagy random vicces mondat sablonokat
- Prezentáció alatt a segéd váltja a slide-okat élőben
- Nézők ↑/↓ reakcióval értékelnek, gauge mutatja a teljesítményt
- Végén jegyzet írás, körzáráskor összegzés
- TTS útmutató a kör elején

### 5. Normál mód – kép import opció
- Lobby beállítás: „Képek importálása megengedve”
- DrawingCanvas: új layer típus (image), drag/resize/rotate az importált képen, a layers panelben kezelhető

### 6. UI animációk modernizálás
- Több framer/css animáció (hover-glow, scale-bounce, gradient pulzálás), élénkebb tranzíciók
- Lobby zene: `lobby-music.mp3` (royalty free), mute toggle a Headerben, autoplay user-gesture után

### 7. Technikai részletek

```text
új fájlok:
- src/components/game/ScribbleGameView.tsx
- src/components/game/BlindFlightView.tsx
- src/components/game/SillyPresentationView.tsx
- src/components/game/AnimationFrameEditor.tsx
- src/components/game/ImageLayerControls.tsx (drawing image import)
- src/lib/gifExport.ts (gif.js wrapper)
- src/lib/scribbleWords.ts (~300 magyar szó)
- src/lib/presentationAssets.ts (Pexels fetch + random sablon mondatok)
- src/hooks/useLobbyMusic.ts
- supabase/migrations/*.sql (új broadcast nem kell, channels-on megy; csak score mező a game_entries-re ha kell, vagy külön scores tábla)

törlések:
- src/components/game/AIImageView.tsx
- supabase/functions/ai-generate-image
- supabase/functions/ai-generate-prompts
```

### 8. Megjegyzések / felmerülő pontok
- A scribble és blind-flight live broadcastot Supabase Realtime Broadcast channellel oldom meg (DB nélkül, alacsony latency)
- A prezentáció képekhez vagy beépített random URL pool, vagy a saját kéréssel egy Pexels keyt kéne hozzáadni – első körben beépített fallback készlettel indítok, és kapsz egy beállítást, hogy később hozzáadhatsz API kulcsot
- A GIF generálás kliens oldalon megy (gif.js + worker)
- A lobby zenét royalty-free MP3-ként hozzáadom, ki/be kapcsolható

### 9. Szakaszos szállítás
Mivel ez nagyon nagy, **két lépcsőben** szállítom (ugyanazon a beszélgetésen belül egymás után):

**1. fázis (most):**
- AI módok és emojik törlése
- 3D editor drag/transform + új alakzatok + texture-draw
- Kép import a normál rajzba
- Lobby zene + UI animációk
- GIF export album-ról

**2. fázis (rögtön utána):**
- Animáció mód
- Scribble mód
- Vakrepülés mód
- Vicces prezentáció mód

Indulhat?
