# 360 Ha Noi Opera House Tour — Starter

Self-contained VR walkthrough site. A-Frame is vendored locally in `vendor/`
— no CDN, no third-party tour platform. Everything runs from these files.

## Run it locally

From this folder:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser.

To test on a VR headset, put your PC and headset on the same Wi-Fi network,
then open `http://<your-pc-lan-ip>:8000` in the headset's browser
(find your LAN IP with `ipconfig` on Windows or `ifconfig`/`ip a` on
Mac/Linux — it looks like `192.168.x.x`). `localhost` will not resolve
from the headset itself.

Click the "Enter VR" button (bottom-right, auto-shown by A-Frame when a
headset is detected) to go into stereo head-tracked mode.

## Swap in your real photos

1. Export each room from Insta360 Studio as **Export 360 photo**
   (not "reframed photo") → Original Resolution → JPG.
2. Compress: resize to ~6-8K wide, convert to WebP (~80-90% quality).
   You're already doing this — keep files in the 2-5MB range.
3. Drop the `.webp` files into `rooms/`, replacing (or alongside) the
   placeholder images.
4. Edit `rooms/rooms.json`:
   - one entry per room, `image` pointing to your file
   - `hotspots` array linking to neighboring rooms

### Positioning hotspots

`yaw` (-180 to 180) is the horizontal direction, `pitch` (-90 to 90) is
up/down tilt, both measured from the room's forward view (yaw 0 = straight
ahead when the panorama loads).

Fastest way to get accurate values: open the scene, press **Ctrl+Alt+I**
to open A-Frame's inspector, drag a hotspot to the right spot in the
actual panorama, and read its position back — or just iterate by trial
and error, reloading after each edit to `rooms.json`.

## Project structure

```
tour360/
├── index.html          # A-Frame scene + UI shell
├── css/style.css        # UI chrome (loading screen, top bar, room list)
├── js/tour.js            # Loads rooms.json, builds scenes/hotspots dynamically
├── rooms/
│   ├── rooms.json        # Room + hotspot manifest — edit this to add rooms
│   └── *.webp             # Panorama images (replace placeholders with real exports)
└── vendor/
    └── aframe.min.js      # A-Frame library, vendored locally
```

## Deploying beyond localhost

Any static host works (nginx, Netlify, Vercel, GitHub Pages, S3). Two
things matter for VR headset use in production:

- **HTTPS is required** for WebXR outside of `localhost`. Most static
  hosts give you this automatically.
- Keep per-image size reasonable (2-5MB) — headset browsers have tighter
  memory/bandwidth budgets than desktop.

## Notes

- The 2D room-list menu (top-right) is for desktop/mobile browsing, same
  as most tour sites — inside the headset, navigate via the glowing floor
  markers using gaze (fuse) or controller click.
- `bedroom1.webp`, `kitchen.webp`, `hallway.webp` are placeholders so you
  can confirm the scaffold runs before dropping in real photos.
