# MSC-025 — Steam Binding Audit and Modern Transport Candidate

**Task:** [MSC-025](../04-phased-agent-task-plan.md#msc-025--audit-native-binding-and-choose-modern-candidate) · **Date:** 2026-10-31 · **Phase:** 3 — Co-op authority and native feasibility · **Depends on:** MSC-024

Source inspection of the candidate Steamworks bindings for Electron, to choose a modern transport (`ISteamNetworkingMessages` or `ISteamNetworkingSockets`) instead of the deprecated `ISteamNetworking` P2P API. This is **source and package inspection only**: nothing was installed, built or run, and no Steam client, App ID or SDK download was used. Native proof belongs to MSC-026–027 (gate T1).

## Context used

- [Co-op guide](../../references/online-coop.txt) §1 (main/preload/renderer split), §2.4 (lobby + legacy P2P transport), §3 (steamworks.js fork, win64-only binary, packaging, `steam_api64.dll` placement), open networking risks (legacy P2P deprecation, 30 Hz pump).
- [Architecture](../03-technical-stack-architecture.md) §5 (bounded Rust/N-API extension around NetworkingMessages proposed), §11 (V0/V1 voice gates).
- [MSC-003](MSC-003-session-privacy-spending.md) (friends-only invite lobbies, no public browser or join codes, host lock, removal) and [MSC-004](MSC-004-personal-progression-test-access.md) (blockers A1 App ID, A2 second account/network, A3 Deck).
- Voice: **V0 deferred (MSC-003)**, so the voice audit subunit (capture/codec/stop-state exports) is skipped explicitly; nothing here claims voice capability.

## Inspected revisions

| Candidate | Revision inspected | License | Maintenance signal |
|---|---|---|---|
| `steamworks.js` (ceifa) | npm 0.4.0 (published 2024-08-06); repo `main` at `80c5fd7` (2025-09-07); pins steamworks-rs `fbb7963` (SDK 1.60) | MIT | 637 stars, 66 open issues, no npm release since 2024-08 |
| `@pipelab/steamworks.js` (CynToolkit fork) | npm 0.12.2; repo `main` at `05eaed2` (2026-06-02); pins steamworks-rs `40a457a` | MIT | 3 stars, single maintainer |
| `steamworks-ffi-node` (ArtyProf) | npm 0.11.3; repo `HEAD` at `656d89d` (2026-09-24); koffi FFI over the flat C API, built against SDK 1.64 | MIT | 87 stars, 19 open issues, active |
| `steamworks-rs` (Noxime), used directly | tag v0.13.1 at `bfc8210` (SDK 1.64); `main` at `d811418` (2026-10-19, SDK 1.65) | MIT / Apache-2.0 | 493 stars, active |

The npm tarball of `steamworks.js` 0.4.0 contains prebuilt `win32-x64-msvc`, `linux-x64-gnu` and macOS `.node` files plus `steam_api64.dll`, `libsteam_api.so` and `libsteam_api.dylib`. `steamworks-ffi-node` does **not** ship Valve redistributables; it requires the SDK from the Steamworks partner site (A1).

## Support matrix

✅ exposed in the inspected source · ⚠️ exposed with a defect or limitation · ❌ not exposed · — not applicable

| Capability needed (MSC-021–024 protocol, MSC-003 policy) | steamworks.js 0.4.0 | @pipelab 0.12.2 | steamworks-ffi-node 0.11.3 | steamworks-rs 0.13.1 (own addon) |
|---|---|---|---|---|
| Init with explicit App ID, run callbacks, shutdown | ✅ | ✅ | ✅ | ✅ |
| Local Steam identity (transport-authenticated peer id) | ✅ | ✅ | ✅ | ✅ |
| Friends-only lobby create / join / leave / members / owner | ✅ | ✅ | ✅ (matchmaking manager) | ✅ |
| Lobby joinable flag (host lock) and lobby data (protocol/build) | ✅ | ✅ | ✅ | ✅ |
| Overlay invite dialog for a lobby | ✅ | ✅ | ✅ | ✅ |
| `GameLobbyJoinRequested` (invite accepted while running) | ✅ | ✅ | not verified | ✅ |
| `LobbyChatUpdate` (member left / kicked) | ✅ | ✅ | not verified | ✅ |
| Rich presence `connect` (join from friends list) | ✅ | ✅ | ✅ | ✅ |
| `+connect_lobby` on launch (game closed) | — reads `process.argv` | — | — | — |
| **NetworkingMessages** send with chosen reliability and channel | ❌ legacy P2P only | ⚠️ fixed channel 0; flags `RELIABLE_NO_NAGLE & AUTO_RESTART_BROKEN_SESSION` evaluate to 0 = **unreliable** for every message | ❌ not found | ✅ `send_message_to_user(identity, flags, data, channel)` |
| NetworkingMessages receive | ❌ | ⚠️ channel 0, at most 10 per call | ❌ | ✅ any channel, caller-chosen batch |
| Session request filter (accept only lobby members) | ❌ (accepts legacy P2P sessions) | ❌ | — | ✅ `session_request_callback` + `accept`/`reject` |
| Session failure callback | ❌ | ❌ | — | ✅ `session_failed_callback` |
| **NetworkingSockets** P2P (`ConnectP2P`, listen socket, poll group) | ❌ | ❌ | ✅ | ✅ |
| Deprecated `ISteamNetworking` P2P | ✅ (only transport) | ✅ | ❌ | ✅ (marked deprecated) |
| Prebuilt win64 binary without a local toolchain | ✅ | ✅ | ✅ (koffi prebuilds) | ❌ needs Rust + MSVC |
| Install scripts | none | none | `postinstall` + `koffi` with a caret range | — (build step in this repo) |
| Exposed surface beyond what MSC-021–024 need | large (stats, workshop, cloud, input, …) | larger | very large (overlay injection, input, UGC, …) | only what the addon exports |

**Unsupported or unverified capabilities, recorded:** none of the published JavaScript bindings exposes a correct NetworkingMessages transport; `@pipelab` combines two send flags with `&` instead of `|`, so its "reliable" sends are unreliable (Steamworks values: Unreliable 0, NoNagle 1, Reliable 8, ReliableNoNagle 9, AutoRestartBrokenSession 32; 9 & 32 = 0). `steamworks-ffi-node` exposes NetworkingSockets but no NetworkingMessages and was not verified for the lobby callbacks above. Voice capture/decode is out of scope (V0 deferred).

## Decision proposal

**Proposed candidate: a bounded Rust/N-API addon in `native/steam/` built on `steamworks-rs` v0.13.1 (SDK 1.64), using `ISteamNetworkingMessages`.** This is a proposal awaiting the owner's approval, not an adoption.

Why Messages rather than Sockets: the protocol already addresses players by transport identity (`PeerId`), has its own ordering, idempotency and snapshot recovery (MSC-021–024), and a session has at most four players. Messages give connectionless, identity-addressed sends with per-message reliability and channels, and a session-request callback that can refuse anyone outside the lobby. Sockets would add connection-handle and poll-group lifecycle the protocol does not need. Sockets remains the fallback if Messages fails at T1.

Why not reuse a published binding:

- `steamworks.js` 0.4.0 offers only the deprecated transport and has not shipped a release since 2024-08.
- `@pipelab/steamworks.js` would need code changes anyway (reliability flag bug, fixed channel, no session filter) and is a single-maintainer fork.
- `steamworks-ffi-node` brings a very large surface (overlay injection, input, UGC), a `postinstall` script and a caret-ranged native FFI dependency into the main process, and still lacks Messages.
- Two native Steam bindings in one process would initialize the same `steam_api64.dll` twice; one small addon owning the whole Steam lifecycle avoids that.

### Minimal addon design

One Steam lifecycle in the Electron **main process**; the renderer never touches Steam (co-op guide §1, MSC-006 IPC policy).

| Export | Purpose |
|---|---|
| `init(appId)` / `shutdown()` | One initializer; failure returns a typed reason and the game runs without Steam. |
| `pump(maxMessages)` | Runs callbacks and drains received messages in one bounded call per frame, returning events and messages together. |
| `localIdentity()` | Own SteamID (the transport `PeerId`). |
| `createLobby(maxMembers)` (friends-only), `joinLobby(id)`, `leaveLobby()` | MSC-003 P1: invite-only, at most four. |
| `lobbyMembers()`, `lobbyOwner()`, `setLobbyJoinable(bool)`, `setLobbyData(key, value)` | Membership checks, host lock, protocol/build advertisement. |
| `openInviteDialog()`, `setRichPresenceConnect(lobby \| null)` | Invites and join-from-friends. |
| `send(steamId, channel, bytes, reliable)` | NetworkingMessages with explicit `Reliable`/`Unreliable` flags plus `AutoRestartBrokenSession`; payload length checked against the protocol limits before the native call. |
| Events in `pump`: `joinRequested(lobby)`, `memberLeft(steamId)`, `sessionRequest(steamId)` (accepted only for current lobby members, otherwise rejected), `sessionFailed(steamId, reason)` | Feed the `HostTransport`/`ClientTransport` ports (MSC-021) without changing the protocol. |

Not exported: stats, achievements, cloud, workshop, input, leaderboards, legacy P2P, voice. Each later need gets its own reviewed export. `+connect_lobby` is read from `process.argv` in main. The preload exposes only typed, validated channels as already required by the MSC-006 IPC policy. Packaging follows MSC-007: the `.node` file and `steam_api64.dll` unpacked from the asar and placed next to the executable.

### Cost and prerequisites (zero extra spending)

- **Toolchain:** Rust via `rustup` (free) and the MSVC build tools; Visual Studio 2022 is present on the reference PC, Rust is **not installed**. Installing it needs the owner's approval (AGENT.md work rules).
- **SDK and App ID:** `steamworks-rs` vendors SDK headers and the win64 redistributable for building, but distributing the game requires the Steamworks SDK terms through the partner account and this game's own App ID — **blocker A1** (MSC-004). Valve's public test App ID 480 could let a local MSC-026 smoke start before A1, but using it is an owner decision, not assumed here; no private ID from the co-op guide is used.
- **Maintenance:** a few hundred lines of Rust plus CI-less local builds; each `steamworks-rs`/SDK update needs a rebuild and the native smoke test. Pin the crate by version and record it in the dependency register when MSC-026 adopts it.

## Owner decisions needed before MSC-026

1. Approve (or replace) the proposed candidate: own addon on `steamworks-rs` 0.13.1 with NetworkingMessages.
2. Approve installing the Rust toolchain (free) on the reference PC.
3. Resolve A1 (App ID), or decide whether MSC-026's local smoke may use Valve's public test App ID 480 until A1 exists.
