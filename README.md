# RidePlay

A handlebar dashboard for iPhone that you install from Safari (a PWA). It shows GPS speed, gives turn-by-turn navigation on a map inside the app, and controls Spotify.

**Try it first:** open `https://<your-site>/?demo` to see the whole app with a simulated ride and fake music. No keys needed.

---

## 1. Put it on GitHub (one command)

You need **Git** and the **GitHub CLI** (`gh`) installed. Then, in this folder, run:

- **Mac / Linux:** `./setup-github.sh`
- **Windows:** `powershell -ExecutionPolicy Bypass -File .\setup-github.ps1`

The script signs you in to GitHub (in the browser), creates a public `ride-play` repo, pushes the code and turns on GitHub Pages. Your app will be at `https://<username>.github.io/moto-dash/`.

From then on, every push to `main` redeploys automatically (`.github/workflows/deploy.yml`), and phones get the new version the next time they open the app.

> **Why public?** Free GitHub accounts can only host Pages from public repos. That's safe here: no keys live in the code. You type them into the app on your phone.
> **Want it private?** Create a private repo instead and connect it to Netlify or Vercel (free, both support private repos).

## 2. Spotify app (Client ID)

1. Go to https://developer.spotify.com/dashboard → **Create app**.
2. **Redirect URI:** your exact site URL, including the trailing slash, e.g. `https://username.github.io/Ride-Play/`.
   (The app's Setup screen shows the exact value it will use.)
3. Under "Which API/SDKs", tick **Web API**, then save.
4. Copy the **Client ID**. You don't need a client secret; this app uses PKCE.

A new Spotify app starts in development mode. That's fine for personal use: your own account works. Anyone else has to be added under **User Management**.

## 3. Maps: no key needed

Search and turn-by-turn routing work out of the box with free public services: **Valhalla** (FOSSGIS server, with a real motorcycle profile) for routes and **Photon** (komoot) for place search. They're fair-use servers, about one request per second, which is plenty for one rider.

**Optional:** if you add an OpenRouteService key (sign up via openrouteservice.org), the app uses ORS first and falls back to the free services if ORS fails.

**Map tiles** come from OpenStreetMap (no key), darkened for the dark theme. For CARTO's nicer dark/light map styles, request a free key at https://carto.com/basemaps/apikey and add it with `gh secret set CARTO_KEY`.

## 4. On your iPhone

1. Open your URL in **Safari** → **Share → Add to Home Screen**.
2. Open **RidePlay** from the Home Screen (not from Safari).
3. Tap **Setup & API keys**, paste both keys, then tap **Save keys**.
4. Tap **Log in with Spotify** and approve. You'll land back in the app.
5. Allow location when asked. Choose **While Using the App** and keep **Precise** on.
6. Open the Spotify app once so it shows up as a playback device.

---

## Features

The layout takes its cue from in-car dashboards: an app dock on the left and big touch targets.

- **Dashboard:** speed dial (colour changes with speed), trip stats, a now-playing widget with progress and controls, and your top destinations.
- **Maps:** "Where to?" search with favourites. In-app turn-by-turn navigation with voice and automatic rerouting.
- **Music (Spotify):**
  - **Now Playing:** large album art, seek bar, shuffle and repeat.
  - **Liked Songs:** tap a song to play from there, or use Play / Shuffle.
  - **Playlists:** your library as a cover grid; tap to play.
- **Settings:** appearance (Auto/Dark/Light), battery saver, units, voice, navigation app, GPS diagnostics, Spotify account, keys, trip reset.
- **Animations:** short and smooth; turned off by battery saver or iOS *Reduce Motion*.

## API keys: set once, never type them again

Add them as GitHub repository secrets. Each deploy builds them into the app:

```
gh secret set SPOTIFY_CLIENT_ID
gh secret set ORS_API_KEY        # optional
gh workflow run deploy.yml
```

(Each `gh secret set` asks you to paste the value.) Keys you type in the app's **Setup & API keys** screen still work as a fallback.

> The site is public, so anyone who opens it can read these keys. That's normal for a browser-only app. The Spotify Client ID isn't a secret (sign-in uses PKCE), and the OpenRouteService key only gives access to your free routing quota. If it's ever abused, regenerate it and update the secret.

## How it saves battery

- **Dark theme by default.** iPhone OLED screens use much less power showing black. Light and Auto themes are one tap away (the sun/moon button).
- **Auto-dim (on by default):** the screen never locks while RidePlay is open, but after 30 s / 1 min / 2 min without a touch it fades to dark (darker pixels use less power on OLED). The first touch only wakes it, so it can't press a button by accident, and it brightens by itself before each turn when navigating. Turn it off in **Settings → Display** to get the old behaviour (screen on while riding, allowed to lock after 5 min parked).
- **Liquid Glass is opt-in.** The see-through look blurs what's behind each panel, which costs GPU time, so it's off by default and battery saver switches it off.
- **GPS stops completely** when the app is in the background.
- **Spotify is only asked "what's playing" while it's on screen:** every 5 s when playing, every 12 s when paused, and never when hidden.
- **The map only redraws when you've moved a few metres.** Routes and markers are drawn on one canvas.
- **Battery saver:** music updates every 15 s, no animations, no album art, no glass or song colours.
- **Animations are short one-offs** that only fade, slide or scale. There are no looping animations and no blur effects. The clock updates once a minute.
- **Liked Songs** loads 50 at a time as you scroll, uses the smallest album art, and is reused for 5 minutes instead of re-downloaded.

The screen plus GPS will still use battery on long rides. **A USB charger on the bike is the real fix.**

## ⚠️ Motorcycle-specific

- **Vibration can damage iPhone cameras.** Apple warns that high-power motorcycle engines can damage the iPhone camera's optical image stabilisation and autofocus. Use a mount with a vibration dampener.
- **Voice guidance** plays through whatever audio output is connected, including a Bluetooth helmet headset. Prompts come at about 400 m and 80 m before each turn.
- **Routing uses Valhalla's motorcycle profile** by default. If you add an OpenRouteService key, ORS routes with its car profile instead (it has no motorcycle profile), which follows the same roads.
- Navigate hands-free: set the destination before you ride.

## How speed is measured

Speed comes from the iPhone's GPS **Doppler** reading, which is measured from the satellite signal itself, so position jumps and a vibrating or shaking phone don't affect it.

If the phone gives no Doppler speed (usually indoors, where it locates you by Wi‑Fi), the app estimates speed from your position only when the fixes are precise (±20 m or better) and you've clearly moved further than the GPS error, over 3–10 s.

You need to see over 5 km/h twice in a row to count as moving, and fall below about 3 km/h to count as stopped. Distance is speed × time while moving, and top speed has to hold for two readings in a row.

**Check it yourself:** the GPS badge shows accuracy (e.g. `GPS ±5 m`). **Long-press the speed dial** for a diagnostics line: the speed source, the raw reading, and moving/stopped. GPS needs open sky; indoors you'll mostly see 0.

## Handy gestures

- **Rearrange the app icons:** long-press any icon in the side dock; the icons jiggle and you can drag them into the order you like. Tap **Done** (or anywhere outside the dock) to finish.
- **Full-width map:** the button next to "Where to?" hides the panel; the small "Where to?" pill brings it back.
- **Saved places:** tap one to see the route on the map, then **Go** (or **Open in Apple Maps**).

## Known iOS limits

- Location stops when the screen locks or you switch apps. Keep RidePlay on screen while riding.
- If the screen still dims, set **Settings → Display & Brightness → Auto-Lock → Never** for rides.
- Shuffle can be switched on/off from RidePlay, but **Smart Shuffle** can only be turned on in the Spotify app: Spotify's Web API doesn't offer it. RidePlay shows when it's on.
- Music actually plays in the Spotify app. RidePlay is a remote control, and Spotify requires **Premium** for that.
- Map © OpenStreetMap contributors, tiles © CARTO (free for light personal use). Routing by Valhalla on the FOSSGIS server, search by Photon (komoot).

## Files

```
index.html, styles.css    UI (4 screens), themes
config.js                 optional hard-coded keys
js/app.js                 wiring, screens, settings, battery policy
js/gps.js                 speed, distance, ride time, max speed
js/nav.js                 Leaflet map, route matching, rerouting, voice
js/routing.js             search + directions (Valhalla/Photon, optional ORS)
js/spotify.js             PKCE login, token refresh, playback
js/demo.js                ?demo mode
sw.js, manifest.webmanifest, icons/   PWA install + offline shell
.github/workflows/deploy.yml  auto-deploy to GitHub Pages
setup-github.sh / .ps1        one-time repo + Pages setup
vendor/leaflet/           map library (bundled, no CDN)
```
