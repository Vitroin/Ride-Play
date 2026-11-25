# Moto Dash

A handlebar dashboard for iPhone that you install from Safari (a PWA). It shows GPS speed, gives turn-by-turn navigation on a map inside the app, and controls Spotify.

**Try it first:** open `https://<your-site>/?demo` to see the whole app with a simulated ride and fake music. No keys needed.

---

## 1. Put it on GitHub (one command)

You need **Git** and the **GitHub CLI** (`gh`) installed. Then, in this folder, run:

- **Mac / Linux:** `./setup-github.sh`
- **Windows:** `powershell -ExecutionPolicy Bypass -File .\setup-github.ps1`

The script signs you in to GitHub (in the browser), creates a public `moto-dash` repo, pushes the code and turns on GitHub Pages. Your app will be at `https://<username>.github.io/moto-dash/`.

From then on, every push to `main` redeploys automatically (`.github/workflows/deploy.yml`), and phones get the new version the next time they open the app.

> **Why public?** Free GitHub accounts can only host Pages from public repos. That's safe here: no keys live in the code. You type them into the app on your phone.
> **Want it private?** Create a private repo instead and connect it to Netlify or Vercel (free, both support private repos).

## 2. Spotify app (Client ID)

1. Go to https://developer.spotify.com/dashboard → **Create app**.
2. **Redirect URI:** your exact site URL, including the trailing slash, e.g. `https://username.github.io/moto-dash/`.
   (The app's Setup screen shows the exact value it will use.)
3. Under "Which API/SDKs", tick **Web API**, then save.
4. Copy the **Client ID**. You don't need a client secret; this app uses PKCE.

A new Spotify app starts in development mode. That's fine for personal use: your own account works. Anyone else has to be added under **User Management**.

## 3. OpenRouteService key (routing and search)

Sign up at https://openrouteservice.org/dev → create a token. The free plan's daily limit is far more than one rider will use.

## 4. On your iPhone

1. Open your URL in **Safari** → **Share → Add to Home Screen**.
2. Open **Moto Dash** from the Home Screen (not from Safari).
3. Tap **Setup & API keys**, paste both keys, then tap **Save keys**.
4. Tap **Log in with Spotify** and approve. You'll land back in the app.
5. Allow location when asked. Choose **While Using the App** and keep **Precise** on.
6. Open the Spotify app once so it shows up as a playback device.

---

## How it saves battery

- **Dark theme by default.** iPhone OLED screens use much less power showing black. Light and Auto themes are one tap away (the sun/moon button).
- **Screen only stays on when it's useful:** while you're on the dashboard or navigating. If you're parked for 5 minutes, it's allowed to dim. In menus, it's released.
- **GPS stops completely** when the app is in the background.
- **Spotify is only asked "what's playing" while it's on screen:** every 5 s when playing, every 12 s when paused, and never when hidden.
- **The map only redraws when you've moved a few metres.** Routes and markers are drawn on one canvas.
- **Battery saver (leaf button):** music updates every 15 s, standard-resolution map tiles (about ¼ the data), no animations, no album art.
- **No constant animations and no blur effects.** The clock updates once a minute.

The screen plus GPS will still use battery on long rides. **A USB charger on the bike is the real fix.**

## ⚠️ Motorcycle-specific

- **Vibration can damage iPhone cameras.** Apple warns that high-power motorcycle engines can damage the iPhone camera's optical image stabilisation and autofocus. Use a mount with a vibration dampener.
- **Voice guidance** plays through whatever audio output is connected, including a Bluetooth helmet headset. Prompts come at about 400 m and 80 m before each turn.
- **Routing uses the car road profile.** OpenRouteService has no motorcycle profile, and the car profile follows the roads motorbikes use.
- Navigate hands-free: set the destination before you ride.

## Known iOS limits

- Location stops when the screen locks or you switch apps. Keep Moto Dash on screen while riding.
- If the screen still dims, set **Settings → Display & Brightness → Auto-Lock → Never** for rides.
- Music actually plays in the Spotify app. Moto Dash is a remote control, and Spotify requires **Premium** for that.
- Map © OpenStreetMap contributors, tiles © CARTO (free for light personal use).

## Files

```
index.html, styles.css    UI (4 screens), themes
config.js                 optional hard-coded keys
js/app.js                 wiring, screens, settings, battery policy
js/gps.js                 speed, distance, ride time, max speed
js/nav.js                 Leaflet map, route matching, rerouting, voice
js/routing.js             OpenRouteService search + directions
js/spotify.js             PKCE login, token refresh, playback
js/demo.js                ?demo mode
sw.js, manifest.webmanifest, icons/   PWA install + offline shell
.github/workflows/deploy.yml  auto-deploy to GitHub Pages
setup-github.sh / .ps1        one-time repo + Pages setup
vendor/leaflet/           map library (bundled, no CDN)
```
