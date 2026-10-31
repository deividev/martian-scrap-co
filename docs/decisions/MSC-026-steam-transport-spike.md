# MSC-026 — Steam Transport Spike (steamworks.js)

**Task:** [MSC-026](../04-phased-agent-task-plan.md#msc-026--build-bounded-native-steam-transport-spike) · **Date:** 2026-10-31 · **Phase:** 3 — Co-op authority and native feasibility · **Depends on:** MSC-025

## Owner decision (2026-10-31)

After reviewing the [MSC-025 binding audit](MSC-025-steam-binding-audit.md), the owner chose the widely used published binding over the proposed custom Rust addon: **`steamworks.js` 0.4.0 (MIT) with Steam's legacy `ISteamNetworking` P2P transport**, following the approach in the [co-op guide](../../references/online-coop.txt) §§1–3. Reasons: a proven binding used by shipped Electron games, prebuilt win64 binary, no Rust toolchain or native code to maintain. Accepted trade-off: Valve marks legacy P2P deprecated (it works today, but receives no new features). The transport ports from MSC-021 keep the protocol independent of it, so a later move to NetworkingMessages/Sockets changes only `electron/steam/` and `src/net/steamTransport.ts`.

Legacy P2P is adopted as a **working transport, not presented as modern transport**. The custom Rust/N-API addon proposed by MSC-025 is not adopted and stays recorded there as the fallback if T1 shows legacy P2P is inadequate.

## Context used

- Co-op guide §1 (renderer never talks to Steam; every bridge optional), §2.4 (lobby/P2P responsibilities, reliable vs unreliable, session acceptance only inside a lobby, owner departure ends the guest session), §2.5–2.6 (`GameLobbyJoinRequested`, `+connect_lobby`, rich presence `connect` and `steam_player_group`), §3 (binding, init failure keeps the game running, packaging with unpacked binding and `steam_api64.dll` next to the exe), §7 (overlay switches), open risks (legacy P2P, 30 Hz pump).
- MSC-003 P1 (friends-only invite lobbies, at most four, host lock), MSC-006 IPC policy, MSC-007 packaging, MSC-021–024 protocol and ports.

## What was built

| Piece | File | Notes |
|---|---|---|
| Pure policy | [steamPolicy.ts](../../electron/steam/steamPolicy.ts) | Config (`MSC_NO_STEAM`, `MSC_STEAM_APP_ID`; **no built-in App ID**), `+connect_lobby` parsing, SteamID validation, one-byte channel framing with protocol limits (16 KiB reliable, 1 KiB disposable; never truncated), bounded queue. |
| Steam service (main) | [steamService.ts](../../electron/steam/steamService.ts) | Single Steam lifecycle loaded with `createRequire` before `ready`. Friends-only lobby (max 4), join/leave, host lock (`setJoinable`, owner only), invite overlay, rich presence set on enter and cleared on leave. P2P sessions accepted **only from current lobby members**; packets from non-members dropped. 60 Hz pump reads at most 256 packets per tick into a 1,024-packet queue (overflow counted). Owner departure ends a guest's lobby (no host migration). |
| Main wiring | [main.ts](../../electron/main.ts) | Overlay switches `in-process-gpu` and the three background-throttling switches plus `backgroundThrottling: false` **only when Steam initialized**; `disable-direct-composition` is deliberately not used (guide §7.2; steamworks.js `electronEnableSteamOverlay` adds it, so it is not called). Shutdown on `will-quit`. `--steam-smoke` check. |
| IPC | [ipcPolicy.ts](../../electron/ipcPolicy.ts), [preload.cts](../../electron/preload.cts) | Eight `steam:*` invoke channels with arity checks; `steam:send` has its own payload bound for a full 16 KiB message; main validates SteamIDs, channels and types. The page polls (`steam:poll`) instead of listening, so the preload still exposes no `ipcRenderer.on`. |
| Renderer adapters | [steamTransport.ts](../../src/net/steamTransport.ts) | `SteamHostTransport` / `SteamClientTransport` implement the MSC-021 ports; `PeerId` is the Steam-authenticated SteamID. Host ignores a removed guest until it leaves and rejoins the lobby; a guest listens only to the lobby owner and closes with `host-left` when the owner leaves. |
| Platform adapter | [platformAdapter.ts](../../src/platform/platformAdapter.ts) | `getSteam()` returns the bridge only when Steam actually initialized. |
| Packaging | [electron-builder.yml](../../electron-builder.yml) | Binding and DLL unpacked from the asar; `steam_api64.dll` also next to the exe; Linux/macOS binaries, `.lib`, typings and `@types` excluded. |

Not wired yet (later tasks): menus/invite button and session start in the game UI, rich presence status text, lobby data for protocol/build advertisement.

## Evidence (observed 2026-10-31)

- `pnpm run check`: 7/7 passed, including new unit tests for the policy, IPC channels, platform adapter and a full host/guest join → snapshot → committed intent over the Steam adapters with a fake lobby.
- Unpackaged `electron . --steam-smoke` and packaged `release/win-unpacked/Martian Scrap Co.exe --steam-smoke`: both report `{"status":{"available":false,"reason":"init-failed"},"shutdown":true}` and exit 0. This proves the native binding and `steam_api64.dll` **load** from their unpacked location (otherwise the reason is `not-installed`) and that the game keeps running without Steam. Steam was not running and no App ID was set.
- Packaged asar contains only `steamworks.js` `index.js`, `package.json`, `LICENSE` and the win64 `.node` + DLL from `node_modules`.
- Environment note: the local `node_modules/electron/dist/electron.exe` had been left truncated (last 4 KiB zero) by the 13:24 blue screen; it was reinstalled from Electron's checksum-verified cache (same 44.10.0) before the smoke.

- **Real Steam smoke with test App ID 480** (owner approval 2026-10-31, local only via `MSC_STEAM_APP_ID=480`; nothing committed): with the Steam client signed in, unpackaged `electron . --steam-smoke` and packaged `Martian Scrap Co.exe --steam-smoke` both report `{"status":{"available":true,"self":"present"},"lobbyCreated":true,"ownerIsSelf":true,"members":1,"joinableToggle":true,"leftLobby":true,"shutdown":true}` and exit 0. This proves real init, identity, friends-only lobby creation and ownership, the host lock, leaving and shutdown in the packaged layout. The Steamworks SDK itself prints the local SteamID to stderr; it is not recorded here.

**Not yet proven:** P2P send/receive on the reliable and disposable channels, overlay invite, `+connect_lobby`/`GameLobbyJoinRequested` and rich presence as seen by a friend. These need a second Steam account on another device (**blocker A2**, shared with MSC-027). The real App ID remains **blocker A1**; App ID 480 is used only for local tests and never shipped.

## Deviations from the guide

- No source fork, vendored binary, `postinstall` copy script, App ID, leaderboards, Discord, public or code lobbies, relay server or Proton flags: only friends-only invite lobbies (MSC-003).
- No `__hello` re-send loop, `__lobby` envelope or 32 K chunking: the MSC-021–024 protocol already has versioned `hello`, session/generation binding, and 12,000-character snapshot chunks within both P2P limits.
- Packet pump at 60 Hz instead of 30 Hz (the guide lists the 33 ms latency as an open risk). steamworks.js still runs its own 30 Hz `runCallbacks`.
- Voice subwork skipped explicitly (V0 deferred at MSC-003).
