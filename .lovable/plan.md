## Phase 2 + bugfixek + új funkciók

Sok van benne, ezért megint két részre bontom, hogy stabil maradjon. Először a bugfixek és a kisebb újdonságok, utána a 4 új játékmód.

### A. 3D Editor javítások és fejlesztések

1. **Gizmo dragging bug fix**
   - A `TransformControls` `dragging-changed` eseményére iratkozom fel; amikor `dragging=true`, `setSelectedId`-t nem engedem váltani és az OrbitControls + pointer events le vannak tiltva a többi meshre. Így egy hátsó alakzat sem "lopja el" a fókuszt drag közben.
   - A háttér meshek `raycast`-jét kikapcsolom drag alatt.

2. **Textúra rajzolás javítás (3D paint mód)**
   - A jelenlegi 2D canvas modal helyett: a kijelölt alakzat egy **külön 3D paint panelba** kerül (saját kis `Canvas` jobb oldalt), megtartva annak forgatását. Bal egér: rajzol a meshre `Raycaster`-rel UV pontosan a `CanvasTexture`-re. Jobb egér / középső: forgat (OrbitControls).
   - Eszközök: ecset, méret, szín, törlés, mentés.
   - A textúra (`CanvasTexture`) megmarad a meshen amikor visszalépsz.

3. **Textúra importálás**
   - A 3D panel oldalsávban: "Textúra feltöltése" gomb → kép fájl betölt `THREE.TextureLoader`-rel, a kijelölt mesh `map`-jaként alkalmazódik.

4. **Szövegek 3D-ben**
   - Új alakzat: **Szöveg**. `troika-three-text` (vagy `Text` a `@react-three/drei`-ből — már elérhető) komponenssel. Választható szöveg, méret, szín, betűtípus (3 default).

5. **3D modell letöltés**
   - A "KÉSZ!" gomb mellé: **GLB export** (`GLTFExporter`-rel). Letöltődik `model.glb` néven. A snapshot beküldés a játékban marad.

### B. Rajzoló (DrawingCanvas) bővítés

1. **Szöveg layer** — kattintásra szöveget helyez el, font/méret/szín állítható, később mozgatható, törölhető.
2. **Kép layer paint-szerű manipuláció** — drag mozgatás + sarok handle-ök skálázáshoz + forgatás handle. (Már létezik image layer, csak interaktív kontrollokat adok hozzá.)
3. **GIF import** — gif fájl betöltve `gifuct-js`-szel, frame-ekre bontva, animált layerként kerül a vászonra (folyamatos lejátszás preview alatt, a beküldött rajznál a kompozit első frame megy ki).
4. **Videó import** — mp4 fájl `HTMLVideoElement` → `THREE`-szerű loop a vásznon, ugyanúgy mozgatható/skálázható, beküldéskor az aktuális frame snapshotolódik.

### C. Phase 2 — új játékmódok

Új fájlok:
```
src/components/game/ScribbleGameView.tsx
src/components/game/BlindFlightView.tsx
src/components/game/AnimationGameView.tsx
src/components/game/PresentationGameView.tsx
src/lib/scribbleWords.ts
src/lib/gifExport.ts (animáció mód + album export)
```

1. **Scribble mód**
   - Sorban van egy rajzoló, random magyar szó (200+ szó). A többiek a chatben tippelnek. Live broadcast a vászonról (`postgres_changes` helyett Realtime Broadcast channel ~400 ms-onként). Pontozás: idő alapján a tippelőnek + a rajzolónak. Körök száma beállítható.

2. **Vakrepülés**
   - A rajzoló egy elsötétített canvason rajzol (nem látja a vonalait). Live a többieknek. Kör végén 1–5 csillag pontozás, leaderboard.

3. **Animáció**
   - Frame-alapú rajzeditor (2–12 frame), GIF export a végén. A normál chainből kimaradnak az írás-lépések; minden játékos animációt készít a chain elemeire.

4. **Vicces Prezentáció**
   - Lobbyban címeket írnak. Mindenki kap egy címet és egy partnert (segéd). Élő prezentáció: segéd váltja a slide-okat (random vicces sablonok + opcionális emoji kép-pool). Nézők ↑/↓ reakció, gauge mutatja a teljesítményt. Végén jegyzet írás. TTS útmutató a mód elején. Mindenki egyszer prezentál.
   - Score + jegyzetek a végén kiírva.

### D. Általános bugfixek
- Album reactions UI néha duplikálta a TTS playt → guardolom session-onként.
- Player avatar fallback ellenőrzés.
- `useGameLogic` újrabelépéskor néha kétszer iratkozott fel a channelre → cleanup szigorúbb.

### E. Szakaszos szállítás

**1. fázis (most):**
- A. 3D Editor javítások (bug, paint, textúra import, szöveg, GLB export)
- B. Rajzoló bővítés (szöveg, kép manipuláció, GIF + videó import)
- D. Általános bugfixek

**2. fázis (utána):**
- C. Mind a 4 új játékmód

Indulhat az 1. fázis?
