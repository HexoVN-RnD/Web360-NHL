(function () {
  "use strict";

  // Billboard component: keeps an entity always facing the camera, so the
  // Move button reads correctly (and stays raycast-clickable) no matter
  // which direction the room is viewed from.
  AFRAME.registerComponent("billboard", {
    init: function () {
      // Allocate once, reuse every frame — creating a new THREE.Vector3()
      // inside tick() (every frame, per billboarded entity) generates
      // unnecessary garbage-collection churn, which shows up as small
      // periodic hitches in VR at 72Hz+.
      this.camWorldPos = new THREE.Vector3();
    },
    tick: function () {
      const cameraEl = this.el.sceneEl.camera;
      if (!cameraEl) return;
      cameraEl.getWorldPosition(this.camWorldPos);
      this.el.object3D.lookAt(this.camWorldPos);
    },
  });

  const state = {
    manifest: null,
    currentRoomId: null,
    loadedImages: new Set(),
    moveIconDataUrl: null,
  };

  const els = {
    sky: document.querySelector("#sky"),
    videosphere: document.querySelector("#videosphere"),
    video: document.querySelector("#tour-video"),
    hotspotRoot: document.querySelector("#hotspot-root"),
    assets: document.querySelector("#asset-container"),
    loadingScreen: document.querySelector("#loading-screen"),
    loadingText: document.querySelector("#loading-text"),
    buildingName: document.querySelector("#building-name"),
    currentRoomName: document.querySelector("#current-room-name"),
    roomPanel: document.querySelector("#room-panel"),
    menuBtn: document.querySelector("#menu-btn"),
  };

  // ---------- Move-button icon ----------
  function generateMoveIcon() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = size * 0.06;
    ctx.shadowOffsetY = size * 0.02;

    ctx.strokeStyle = "#2f7a72";
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Lower chevron
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.27, cy + size * 0.22);
    ctx.lineTo(cx, cy + size * 0.02);
    ctx.lineTo(cx + size * 0.27, cy + size * 0.22);
    ctx.stroke();

    // Upper chevron
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.27, cy - size * 0.06);
    ctx.lineTo(cx, cy - size * 0.26);
    ctx.lineTo(cx + size * 0.27, cy - size * 0.06);
    ctx.stroke();

    return canvas.toDataURL("image/png");
  }

  function registerMoveIconAsset() {
    if (state.moveIconDataUrl) return;
    state.moveIconDataUrl = generateMoveIcon();
    const img = document.createElement("img");
    img.setAttribute("id", "move-icon");
    img.setAttribute("src", state.moveIconDataUrl);
    els.assets.appendChild(img);
  }

  // ---------- VR HUD icons (Home + Menu) ----------
  function generateHomeIcon() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2f7a72";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cx = size / 2;
    // Roof
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.28, cx - size * 0.02);
    ctx.lineTo(cx, cx - size * 0.28);
    ctx.lineTo(cx + size * 0.28, cx - size * 0.02);
    ctx.stroke();
    // Walls
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.19, cx - size * 0.05);
    ctx.lineTo(cx - size * 0.19, cx + size * 0.28);
    ctx.lineTo(cx + size * 0.19, cx + size * 0.28);
    ctx.lineTo(cx + size * 0.19, cx - size * 0.05);
    ctx.stroke();
    // Door
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.07, cx + size * 0.28);
    ctx.lineTo(cx - size * 0.07, cx + size * 0.09);
    ctx.lineTo(cx + size * 0.07, cx + size * 0.09);
    ctx.lineTo(cx + size * 0.07, cx + size * 0.28);
    ctx.stroke();

    return canvas.toDataURL("image/png");
  }

  function generateMenuIcon() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2f7a72";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = "round";
    const cx = size / 2;
    [-1, 0, 1].forEach((i) => {
      const y = cx + i * size * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.24, y);
      ctx.lineTo(cx + size * 0.24, y);
      ctx.stroke();
    });

    return canvas.toDataURL("image/png");
  }

  function registerVrHudIconAssets() {
    [
      ["vr-home-icon", generateHomeIcon],
      ["vr-menu-icon", generateMenuIcon],
    ].forEach(([id, gen]) => {
      const img = document.createElement("img");
      img.setAttribute("id", id);
      img.setAttribute("src", gen());
      els.assets.appendChild(img);
    });
  }

  // ---------- VR HUD: Home + Menu buttons, and the room-list panel ----------
  function goHome() {
    goToRoom(state.manifest.homeRoom || state.manifest.startRoom);
  }

  // Show/hide AND toggle the raycastable class together — A-Frame's
  // raycaster selects targets by CSS class only, ignoring the `visible`
  // attribute, so leaving the class on a hidden element makes it silently
  // clickable
  function showInteractive(el) {
    el.setAttribute("visible", "true");
    el.classList.add("ui-button");
  }
  function hideInteractive(el) {
    el.setAttribute("visible", "false");
    el.classList.remove("ui-button");
  }

  function setupVrHud() {
    const homeBtn = document.querySelector("#vr-home-btn");
    const menuBtn = document.querySelector("#vr-menu-btn");
    const panel = document.querySelector("#vr-menu-panel");
    const panelInteractiveEls = []; // closeBtn + all room rows

    homeBtn.addEventListener("click", goHome);
    menuBtn.addEventListener("click", () => {
      panel.setAttribute("visible", "true");
      panelInteractiveEls.forEach(showInteractive);
      hideInteractive(homeBtn);
      hideInteractive(menuBtn);
    });

    function closePanel() {
      panel.setAttribute("visible", "false");
      panelInteractiveEls.forEach(hideInteractive);
      // Only restore the small buttons if still in VR.
      if (document.querySelector("a-scene").is("vr-mode")) {
        showInteractive(homeBtn);
        showInteractive(menuBtn);
      }
    }

    // ---- Build panel contents: background, title, close X, room rows ----
    // Panel height is computed dynamically from the room count so the
    // room list never overflows the background, regardless of how many
    // rooms have showInMenu: true.
    const roomEntries = Object.entries(state.manifest.rooms).filter(
      ([, room]) => room.showInMenu === true
    );
    const rowHeight = 0.14;
    const topPadding = 0.22; // space reserved for title/close row
    const bottomPadding = 0.08;
    const panelWidth = 1.1;
    const panelHeight = Math.max(
      0.4,
      topPadding + roomEntries.length * rowHeight + bottomPadding
    );
    const halfH = panelHeight / 2;

    const bg = document.createElement("a-entity");
    bg.setAttribute("geometry", `primitive: plane; width: ${panelWidth}; height: ${panelHeight}`);
    bg.setAttribute("material", "color: #15161a; opacity: 0.95; shader: flat");
    panel.appendChild(bg);

    const titleY = halfH - 0.11;

    const title = document.createElement("a-entity");
    title.setAttribute("position", `0 ${titleY} 0.01`);
    title.setAttribute("text", {
      value: "Rooms",
      align: "center",
      color: "#eceef1",
      width: 1.6,
    });
    panel.appendChild(title);

    const closeBtn = document.createElement("a-entity");
    closeBtn.setAttribute("position", `${panelWidth / 2 - 0.1} ${titleY} 0.01`);
    closeBtn.setAttribute("geometry", "primitive: plane; width: 0.1; height: 0.1");
    closeBtn.setAttribute("material", "color: #2a2c33; shader: flat");
    closeBtn.addEventListener("click", closePanel);
    panel.appendChild(closeBtn);
    panelInteractiveEls.push(closeBtn);

    const closeX = document.createElement("a-entity");
    closeX.setAttribute("position", `${panelWidth / 2 - 0.1} ${titleY} 0.02`);
    closeX.setAttribute("text", { value: "X", align: "center", color: "#eceef1", width: 1 });
    panel.appendChild(closeX);

    const firstRowY = halfH - topPadding - rowHeight / 2;
    roomEntries.forEach(([id, room], i) => {
      const rowY = firstRowY - i * rowHeight;

      const row = document.createElement("a-entity");
      row.setAttribute("position", `0 ${rowY} 0.01`);
      row.setAttribute("geometry", "primitive: plane; width: 0.94; height: 0.12");
      row.setAttribute("material", "color: #1c1d22; opacity: 0.9; shader: flat");
      row.addEventListener("click", () => {
        goToRoom(id);
        closePanel();
      });
      panel.appendChild(row);
      panelInteractiveEls.push(row);

      const rowLabel = document.createElement("a-entity");
      rowLabel.setAttribute("position", `0 ${rowY} 0.02`);
      rowLabel.setAttribute("text", {
        value: room.label || id,
        align: "center",
        color: "#eceef1",
        width: 1.6,
      });
      panel.appendChild(rowLabel);
    });

    // Show/hide the HUD buttons (not the panel) with VR session state.
    const sceneEl = document.querySelector("a-scene");
    sceneEl.addEventListener("enter-vr", () => {
      showInteractive(homeBtn);
      showInteractive(menuBtn);
    });
    sceneEl.addEventListener("exit-vr", () => {
      hideInteractive(homeBtn);
      hideInteractive(menuBtn);
      panel.setAttribute("visible", "false");
      panelInteractiveEls.forEach(hideInteractive);
    });
  }

  // ---------- Anisotropic filtering ----------
  // Equirectangular textures are viewed at extreme oblique angles on the
  // inside of a sphere (especially near the horizon), which makes them
  // look noticeably blurrier than the same image viewed flat on desktop.
  // Cranking anisotropy to the GPU's max fixes this — it's the single
  // biggest lever for panorama sharpness at glancing angles.
  function applyAnisotropy(el) {
    const mesh = el.getObject3D("mesh");
    const sceneEl = document.querySelector("a-scene");
    if (!mesh || !mesh.material || !mesh.material.map || !sceneEl.renderer) return;
    const maxAniso = sceneEl.renderer.capabilities.getMaxAnisotropy();
    // No `needsUpdate = true` here on purpose: at the point this event
    // fires, the texture hasn't been uploaded to the GPU yet (that
    // happens lazily on the next render call). Setting anisotropy now
    // means it's included in that single upload. Forcing needsUpdate
    // would trigger a SECOND full texture+mipmap upload immediately
    // after — for a 6500px-wide image, that's expensive enough to blow
    // straight through a frame budget (this was the cause of the
    // "requestAnimationFrame handler took 300-400ms" warning on every
    // room switch).
    mesh.material.map.anisotropy = maxAniso;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const sky = document.querySelector("#sky");
    const videosphere = document.querySelector("#videosphere");
    sky.addEventListener("materialtextureloaded", () => applyAnisotropy(sky));
    videosphere.addEventListener("materialtextureloaded", () => applyAnisotropy(videosphere));
  });

  // ---------- VR render sharpness ----------
  // Two things noticeably soften a WebXR scene on Quest by default:
  // 1) foveated rendering — deliberately lowers resolution in your
  //    peripheral vision to save GPU. Fine for games, bad for a photo
  //    you're meant to look around at. Disabling trades some perf for
  //    full-resolution everywhere.
  // 2) framebuffer scale factor — the default (1.0) matches the panel's
  //    native res per eye; bumping it up supersamples for a sharper,
  //    less aliased image, at a GPU cost.
  // IMPORTANT: per three.js docs, BOTH must be set BEFORE the XR session
  // starts — "it is not possible to change the framebuffer scale factor
  // while presenting XR content." Calling these on 'enter-vr' (after the
  // session has already started) is a silent no-op. So this runs once,
  // as early as possible, well before the user ever taps Enter VR.
  document.addEventListener("DOMContentLoaded", () => {
    const sceneEl = document.querySelector("a-scene");
    sceneEl.addEventListener("loaded", () => {
      const xr = sceneEl.renderer && sceneEl.renderer.xr;
      if (!xr) return;
      try {
        xr.setFoveation(0);
        // NOT boosting framebufferScaleFactor above 1.0 here — you've
        // already pushed Quest Link's own render resolution up manually
        // (5408x2752). Stacking our own multiplier on top of that can
        // make the runtime scale the result unevenly (the "stretched"
        // look). Let Quest Link's slider be the single source of truth
        // for resolution; this code only turns off foveation.
      } catch (err) {
        console.warn("Could not apply VR sharpness settings:", err);
      }
      // Diagnostic: log the ACTUAL per-eye render resolution the runtime
      // granted, so we can confirm whether the Quest Link resolution bump
      // is really reaching the browser or being capped somewhere.
      sceneEl.addEventListener(
        "enter-vr",
        () => {
          setTimeout(() => {
            const session = xr.getSession && xr.getSession();
            const rs = session && session.renderState;
            if (rs && rs.baseLayer) {
              console.log(
                `[VR diagnostics] Framebuffer (classic XRWebGLLayer): ${rs.baseLayer.framebufferWidth} x ${rs.baseLayer.framebufferHeight}`
              );
            } else if (rs && rs.layers && rs.layers.length) {
              console.log(
                `[VR diagnostics] Session is using the WebXR Layers API (${rs.layers.length} layer(s)) — this browser doesn't expose a simple framebuffer size for it, but that's normal on newer browsers and not itself a problem.`
              );
            } else {
              console.log("[VR diagnostics] No layer info available on this session.");
            }
          }, 500);
        },
        { once: true }
      );
    });
  });

  // ---------- VR height handoff ----------
  // Desktop: no headset tracking, so the rig itself simulates eye height
  // (0 1.6 0), matching where the sky/hotspots live.
  // VR (local-floor): the headset already reports real height above the
  // real floor, so the rig must drop to 0 0 0 — otherwise the 1.6 gets
  // added TWICE (rig + real tracked height), which is what was causing
  // the floating arrows / warped-looking scale in the headset.
  document.addEventListener("DOMContentLoaded", () => {
    const sceneEl = document.querySelector("a-scene");
    const rigEl = document.querySelector("#rig");
    sceneEl.addEventListener("enter-vr", () => {
      rigEl.setAttribute("position", "0 0 0");
    });
    sceneEl.addEventListener("exit-vr", () => {
      rigEl.setAttribute("position", "0 1.6 0");
    });
  });

  // ---------- Boot ----------
  fetch("rooms/rooms.json")
    .then((r) => {
      if (!r.ok) throw new Error("rooms.json not found (" + r.status + ")");
      return r.json();
    })
    .then((manifest) => {
      state.manifest = manifest;
      registerMoveIconAsset();
      registerVrHudIconAssets();
      els.buildingName.textContent = manifest.buildingName || "Building Tour";
      buildRoomPanel();
      setupVrHud();
      goToRoom(manifest.startRoom, { instant: true });
    })
    .catch((err) => {
      els.loadingText.textContent = "Failed to load tour data: " + err.message;
      console.error(err);
    });

  // ---------- Room panel (2D UI, desktop/mobile browsing) ----------
  function buildRoomPanel() {
    els.roomPanel.innerHTML = "";
    Object.entries(state.manifest.rooms).forEach(([id, room]) => {
      // Rooms default to HIDDEN in the menu unless explicitly shown.
      if (room.showInMenu !== true) return;
      const btn = document.createElement("button");
      btn.className = "room-item";
      btn.dataset.roomId = id;
      btn.textContent = room.label || id;
      btn.addEventListener("click", () => {
        goToRoom(id);
        els.roomPanel.classList.remove("open");
      });
      els.roomPanel.appendChild(btn);
    });
  }

  els.menuBtn.addEventListener("click", () => {
    els.roomPanel.classList.toggle("open");
  });

  const homeBtn = document.querySelector("#home-btn");
  homeBtn.addEventListener("click", goHome);

  function highlightActiveRoomInPanel(roomId) {
    els.roomPanel.querySelectorAll(".room-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.roomId === roomId);
    });
  }

  // ---------- Image preloading ----------
  function ensureAsset(src) {
    return new Promise((resolve, reject) => {
      if (state.loadedImages.has(src)) return resolve();
      const img = document.createElement("img");
      img.setAttribute("id", "img-" + cssSafe(src));
      img.setAttribute("crossorigin", "anonymous");
      img.setAttribute("src", src);
      img.onload = () => {
        state.loadedImages.add(src);
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load image: " + src));
      els.assets.appendChild(img);
    });
  }

  function cssSafe(str) {
    return str.replace(/[^a-zA-Z0-9]/g, "-");
  }

  // ---------- Navigation ----------
  function goToRoom(roomId, opts) {
    opts = opts || {};
    const room = state.manifest.rooms[roomId];
    if (!room) {
      console.error("Unknown room:", roomId);
      return;
    }

    // Leaving any video room: stop playback immediately so it doesn't
    // keep decoding/consuming GPU in the background.
    if (!els.video.paused) els.video.pause();

    showLoading("Loading " + (room.label || roomId) + "…");

    if (room.type === "video") {
      loadVideoRoom(room, roomId);
    } else {
      loadImageRoom(room, roomId);
    }
  }

  function finishRoomSwitch(room, roomId) {
    state.currentRoomId = roomId;
    els.currentRoomName.textContent = room.label || roomId;
    highlightActiveRoomInPanel(roomId);
    buildHotspots(room);
    hideLoading();
  }

  function loadImageRoom(room, roomId) {
    ensureAsset(room.image)
      .then(() => {
        els.videosphere.setAttribute("visible", "false");
        els.sky.setAttribute("visible", "true");
        els.sky.setAttribute("src", room.image);
        els.sky.setAttribute("rotation", `0 ${room.initialYaw || 0} 0`);
        finishRoomSwitch(room, roomId);
        preloadNeighbors(room);
      })
      .catch((err) => {
        els.loadingText.textContent = err.message;
        console.error(err);
      });
  }

  // Video is NOT preloaded for neighboring rooms (unlike images) — files
  // are much larger, so we only fetch one when the user actually walks
  // into that room.
  function loadVideoRoom(room, roomId) {
    const onReady = () => {
      els.video.removeEventListener("canplay", onReady);
      els.video.removeEventListener("error", onError);
      els.video.play().catch((err) => {
        // Autoplay can be blocked until the user interacts with the page
        // at least once — normal in some browsers, not a real failure.
        console.warn("Video autoplay was blocked, will play on next interaction:", err);
      });
      els.sky.setAttribute("visible", "false");
      els.videosphere.setAttribute("visible", "true");
      els.videosphere.setAttribute("rotation", `0 ${room.initialYaw || 0} 0`);
      finishRoomSwitch(room, roomId);
    };
    const onError = () => {
      els.video.removeEventListener("canplay", onReady);
      els.video.removeEventListener("error", onError);
      els.loadingText.textContent = "Failed to load video: " + room.video;
      console.error("Video failed to load:", room.video);
    };

    els.video.addEventListener("canplay", onReady, { once: true });
    els.video.addEventListener("error", onError, { once: true });
    els.video.src = room.video;
    els.video.load();
  }

  function preloadNeighbors(room) {
    (room.hotspots || []).forEach((h) => {
      const target = state.manifest.rooms[h.target];
      if (target && target.type !== "video") {
        ensureAsset(target.image).catch(() => {});
        warmImageTexture(target.image);
      }
    });
  }

  // ---------- Background texture pre-warming ----------
  // Fixes the "requestAnimationFrame handler took 300-400ms" console
  // violation on room switch. The hitch was the GPU texture upload +
  // mipmap generation for large (6500px+) images happening synchronously
  // at the exact moment you switch rooms. This runs that same expensive
  // work early, in the background, on a hidden entity — so by the time
  // you actually navigate there, A-Frame's texture cache just returns the
  // already-uploaded result instantly. Same texture, same quality — just
  // done at a less critical moment.
  const warmedTextures = new Set();
  const warmQueue = [];
  let warming = false;

  function warmImageTexture(src) {
    if (warmedTextures.has(src) || warmQueue.includes(src)) return;
    warmQueue.push(src);
    processWarmQueue();
  }

  function processWarmQueue() {
    if (warming || warmQueue.length === 0) return;
    warming = true;
    const src = warmQueue.shift();
    const warmer = document.querySelector("#texture-warmer");

    const onDone = () => {
      warmer.removeEventListener("materialtextureloaded", onDone);
      applyAnisotropy(warmer); // keep the warmed copy at full quality too
      warmedTextures.add(src);
      warming = false;
      processWarmQueue();
    };
    warmer.addEventListener("materialtextureloaded", onDone, { once: true });
    warmer.setAttribute("material", "src", src);
  }

  // Floor-decal placement tuning — adjust these to match your actual
  // camera capture height and how far ahead the arrow should sit.
  const FLOOR_Y = -1.3; // height of the arrow below the camera (sphere center)
  const FLOOR_DISTANCE = 2.5; // how far ahead, in meters, the arrow sits

  function buildHotspots(room) {
    els.hotspotRoot.innerHTML = "";
    (room.hotspots || []).forEach((h) => {
      const yawRad = (h.yaw * Math.PI) / 180;
      const x = FLOOR_DISTANCE * Math.sin(yawRad);
      const z = -FLOOR_DISTANCE * Math.cos(yawRad);
      const y = FLOOR_Y;

      // Outer entity: Y rotation = position direction (-yaw) PLUS an
      // independent spin offset (pitch) so the arrow can point a
      // different way than where it's physically placed — e.g. for a
      // bent hallway where the button sits at one angle but should
      // guide the user toward another.
      const arrowGroup = document.createElement("a-entity");
      arrowGroup.setAttribute("position", `${x} ${y} ${z}`);
      arrowGroup.setAttribute("rotation", `0 ${-h.yaw + (h.pitch || 0)} 0`);

      // Inner plane: fixed -90° tilt so it lies flat, facing up.
      const marker = document.createElement("a-entity");
      marker.classList.add("hotspot");
      marker.setAttribute("rotation", "-90 0 0");
      marker.setAttribute("geometry", "primitive: plane; width: 0.7; height: 0.7");
      marker.setAttribute(
        "material",
        "src: #move-icon; transparent: true; alphaTest: 0.1; shader: flat; side: double"
      );
      marker.setAttribute(
        "animation__idle",
        "property: scale; dir: alternate; dur: 1000; loop: true; to: 1.1 1.1 1.1"
      );
      marker.addEventListener("mouseenter", () => {
        marker.setAttribute("animation__idle", "enabled", false);
        marker.setAttribute("scale", "1.3 1.3 1.3");
      });
      marker.addEventListener("mouseleave", () => {
        marker.setAttribute("animation__idle", "enabled", true);
        marker.setAttribute("scale", "1 1 1");
      });
      marker.addEventListener("click", () => goToRoom(h.target));

      arrowGroup.appendChild(marker);
      els.hotspotRoot.appendChild(arrowGroup);

      // Label: separate entity so it can billboard (face the viewer) while
      // the arrow itself stays flat on the floor.
      const label = document.createElement("a-entity");
      label.setAttribute("position", `${x} ${y + 0.55} ${z}`);
      label.setAttribute("billboard", "");
      label.setAttribute("text", {
        value: h.label || "",
        align: "center",
        color: "#eceef1",
        width: 2.2,
        baseline: "bottom",
      });
      els.hotspotRoot.appendChild(label);
    });
  }

  // ---------- Loading UI ----------
  function showLoading(text) {
    els.loadingText.textContent = text || "Loading…";
    els.loadingScreen.classList.remove("hidden");
  }
  function hideLoading() {
    els.loadingScreen.classList.add("hidden");
  }
})();