# Plan: multi-version launcher, loader support, presets, client feature gaps

Status: **planning only, nothing scheduled.** Owner research (2026-10-25) plus a
check against what the launcher and RomanicaClient actually do today. Ship order
comes after the launcher is stable (Fabric manifest fix + a release that passes
`smoke.yml` with a real `latest.log`).

Ground rules carried into every phase:

- **Hacked clients are the player's choice, never Romanica's product**
  (owner decision 2026-10-25, see 6e). Players may install Meteor, Wurst and the
  like themselves (anarchy servers such as 2b2t allow them). RomanicaClient stays
  compatible and can theme them, but Romanica never bundles them in presets,
  never builds cheat modules, and never builds anticheat bypasses for any server.
  On Romanica they don't work.
- **No redistributing other clients or closed mods.** OptiFine's licence forbids
  re-hosting: the launcher can only open optifine.net for the player to download
  it, then detect the jar. Lunar/Badlion ship their own launchers; offering them
  as "installs" just sends players away. Learn from their features instead
  (section 5).
- Mods come from Modrinth (API + CDN) so authors keep their download counts and
  licences are respected. Every artifact still gets a size + sha256 in the index.
- Market numbers below (server counts, MAU shares, Hypixel version floors,
  company acquisitions) come from the owner's research and were **not
  re-verified** here. Re-check them before committing to a phase.

## 0. Owner direction (2026-10-25)

1. **Meet players on the versions they already play.** Someone switching to
   RomanicaClient should keep their version, worlds, settings and packs, not be
   forced onto 26.3.
2. **Updates never cost players their stuff.** Worlds, screenshots, options,
   keybinds, resource/shader packs, server lists and their own mods survive every
   launcher and client update.
3. **Depend on nobody but Microsoft.** Identity, friends and sign-in come from
   Microsoft (Xbox friends, presence and, if available, messaging). The only
   Romanica-hosted client service is the store catalogue API (section 11).
   No AxolotlClient services, no other client's infrastructure.

### 0a. Keeping players' stuff

What already holds: the launcher's mod cleanup (`managedmodcleanup.js`) only
deletes files it can prove it installed and leaves everything else alone; worlds
and configs are never touched.

To add with the instance model:

- **Split every instance into managed and player-owned files.** The launcher may
  replace only what it manages (loader, managed mods, libraries, assets).
  `saves/`, `screenshots/`, `options.txt`, `servers.dat`, `resourcepacks/`,
  `shaderpacks/`, `config/` and user-added mods are never deleted or overwritten.
- **Version upgrades copy, never move.** "Upgrade this instance to 26.3" makes a
  new instance and copies worlds/settings forward; the old one stays playable.
  Minecraft can't load a world back into an older version once it's been opened in
  a newer one, so upgrading a world in place without a copy is how players lose it.
- **Automatic backup before any migration** (config schema changes, version
  upgrades): a dated zip of the player-owned files, last 3 kept.
- **Tests** for each rule against a temp directory (never real `%APPDATA%`; see the
  AGENTS.md lesson where `npm test` deleted the owner's config).

### 0b. Importing players' existing versions

- **Vanilla launcher**: read `.minecraft/versions`, `saves`, `options.txt`,
  `servers.dat`, `resourcepacks`. Offer "use as-is" (point at the folder) or
  "copy into a Romanica instance". Never modify the vanilla folder.
- **Other launchers' instance folders** (MultiMC/Prism-style, CurseForge,
  Modrinth App): detect, show version + loader + mod count, import by copy.
- After import, RomanicaClient is added to the instance only if a build exists for
  that version and loader; otherwise the instance still launches, without the
  client (clearly labelled).
- This makes phase A/B/C (below) about **which versions get RomanicaClient
  features**, not which versions players are allowed to play. The launcher can
  launch any vanilla or Fabric version much earlier than the client supports it.

### 0c. Independence from AxolotlClient

RomanicaClient still uses four upstream services or identifiers:

| Where | What | Replace with |
|---|---|---|
| `common/.../api/Constants.kt` | Friends, chat, status API at `api.axolotlclient.com/v1/` | Microsoft's own services (Xbox friends and presence); upstream API removed (section 11 decisions) |
| `common/.../auth/MSApi.kt` | In-client Microsoft sign-in uses **upstream's Azure app ID `938592fc-...`** | Romanica's Azure app `8b0c9e33-b6ce-40ec-ac30-c85a35dd8163` (needs the in-client sign-in flow, e.g. device code, enabled on that app) |
| `common/.../api/Constants.kt` | Terms link `axolotlclient.com/terms` | romanica.net/legal/terms |
| `common/src/main/resources/fabric.mod.json`, `TitleScreenMixin.kt` | Upstream homepage + update link to their Modrinth page | romanica.net/client |

"Only Microsoft" in practice (owner decision, section 11): Microsoft provides
**who you are** (Xbox sign-in, already approved) and **who your friends are and
whether they're online** (Xbox social/presence APIs, to be confirmed by the spike
below). Xbox messaging and parties are not, as far as we know, open to third-party
apps, so there is **no in-client chat service**: players use in-game chat on a
shared server. No Romanica backend for social features.

Order: swap the Azure ID first (done on a branch), then back the existing
friends screen with Xbox friends/presence, then remove the upstream chat/status
code paths.

## 1. Where the launcher is today

- One server, one Minecraft version (26.3), one loader (Fabric), defined by
  `distribution/distribution.json`. It's a Helios fork: the whole model is
  "a server publishes a modpack, the launcher mirrors it".
- No instances, no version picker, no loader installers, no mod browser.

Multi-version support is therefore a **new instance model**, not a setting.
That's the single biggest piece of work in this plan.

## 2. Version targets (phased, not all 17 at once)

| Phase | Versions | Why first |
|---|---|---|
| A | 26.3, 26.2, 1.21.11, 1.21.1 | Same Fabric/NeoForge toolchain we already run; covers Romanica, cross-play, SkyBlock and the biggest pinned modded version |
| B | 1.20.1, 1.19.2, 1.18.2, 1.16.5 | The modpack heartland; needs Forge (installer processors, see 3) |
| C | 1.8.9, 1.12.2 | PvP and legacy modding. Forge-only (Legacy Fabric optional); old LWJGL2 natives path, Java 8 runtime |
| Later / on request | 1.20.2, 1.20.4, 1.21.4-1.21.9, 1.15.2, 1.14.4, 1.10.2, 1.7.10, Beta 1.7.3 | Each adds test burden; add when players ask, driven by data from phase A-C usage |

Each version added needs: its Java runtime (8 / 17 / 21 / 25), natives handling,
and a `smoke.yml` matrix entry that boots it to the title screen. No version ships
without its own green smoke run.

## 3. Loaders (install paths)

| Loader | Range | Effort | Notes |
|---|---|---|---|
| Vanilla | all | Low | Mojang manifest only |
| Fabric | 1.14+ | Low | meta.fabricmc.net profiles. **Lesson from 2026-10-25:** meta re-stamps profile `releaseTime`, so never pin a hash against the live URL; cache or commit the profile |
| Quilt | 1.14+ | Low | Same shape as Fabric; optional, low demand |
| NeoForge | 1.20.2+ | Medium-high | Installer jar with processors that must run locally |
| Forge | all, primary <=1.20.1 | High | Same processor model; legacy (<=1.12.2) uses a different, older install format |
| OptiFine | standalone | Medium | Player downloads from optifine.net; launcher detects + installs into the instance. Needed for CIT on <=1.16.5 |
| Legacy Fabric / Babric | 1.8.9 / 1.12.2 / b1.7.3 | Medium | Niche; only if phase C shows demand |

## 4. Presets (one-click instances)

Built from Modrinth, version-matched, hashes recorded at build time:

- **Performance** (default for every instance): Fabric/NeoForge 1.16.5+ =
  Sodium, Lithium, ModernFix, Entity Culling, FerriteCore, ImmediatelyFast,
  Dynamic FPS (+ C2ME, Krypton on 1.21+). Forge <=1.20.1 = Embeddium, Canary,
  ModernFix, Entity Culling, FerriteCore. Legacy <=1.12.2 = OptiFine (player
  download), FoamFix, VanillaFix.
- **SkyBlock**: 1.21.11 + Fabric + Skyblocker, SkyHanni, Firmament + performance.
- **PvP**: 1.8.9 + Forge + OptiFine + Patcher-style fixes + performance; plus
  RomanicaClient's PvP HUDs on the versions it supports.
- **Building**: latest + Fabric + Litematica, Axiom, Effortless Building, Iris.
- **Textures/CIT**: CIT Resewn (1.17-1.21.1), CIT Resewn: Continued (1.21.10+),
  OptiFine (<=1.16.5).
- **Romanica**: what ships today, always the default selection.

## 5. Client feature gaps vs Lunar / Badlion

RomanicaClient (AxolotlClient-based) **already has**: keystrokes, CPS, reach, combo,
toggle sprint, zoom, freelook, motion blur, hitboxes, capes, emotes + emote wheel,
skin manager, minimap + fullscreen map, waypoints, coordinates/ping/TPS/FPS/potion/
armor HUDs, HUD editor, screenshot sharing, inventory search/tweaks, TNT timer,
Hypixel module, e4mc world sharing, friends/chat screens.

Gaps worth planning, highest value first:

1. **Replay / "rewind" clips** (save the last 30-60 s on a key). Biggest gap, and
   directly feeds TikTok/Shorts growth. Large: record packets, re-render offline.
2. **Friends from Microsoft.** See 0c: the screens exist; back them with Xbox
   friends and presence instead of upstream's API. No in-client chat service.
3. **Xbox friends list.** The Azure app (`8b0c9e33-...`) is already approved for
   XboxLive.signin. Friends should need only a second XSTS token for relying party
   `http://xboxlive.com` and a call to the Xbox social/people API. **Not verified:**
   whether that token is granted to our app. First step is one real sign-in on the
   owner's PC that lists friends, before any UI work.
4. **1.7 animations / old combat visuals** (block-hit, rod, bow animations) as a
   cosmetic PvP option.
5. **Server-approved feature profiles**: a server tells the client which modules
   it allows (ServerGating/FeatureDisabler already exist for Romanica; make it a
   documented protocol other servers can use).
6. **Auto GG / auto-tip / level head** style minigame QoL (check the existing
   `hypixel` module first; may only need porting).
7. **Cosmetics store tied to Romanica accounts** (capes/emotes exist; purchase +
   sync does not).

## 6. Joining friends' worlds

- Java: e4mc is already in the client. Add a launcher "Host a world" button that
  runs a local Paper server (efficient, plugin-capable) with ViaVersion/
  ViaBackwards for mixed versions and Geyser + Floodgate for Bedrock friends.
  NAT traversal is the hard part; reuse e4mc's tunnel for Java. Bedrock (and so
  Geyser) speaks UDP: check whether e4mc can carry it before relying on it, and
  plan a relay if it can't.
- Bedrock: the launcher can open Bedrock and add a server through a
  `minecraft://` link. Light Bedrock modding = resource/behavior packs (already
  served by the server through Geyser). No code injection: breaks Microsoft's
  terms and every Bedrock update.

## 6a. Joining Bedrock servers from RomanicaClient (ViaBedrock)

Three projects, all GPL-3.0:

| Project | Role |
|---|---|
| [ViaFabricPlus](https://github.com/ViaVersion/ViaFabricPlus) | Join servers from 1.0 to 26.3 on a 26.3 client. In the pack since PR #24. **No Bedrock on its own.** |
| [viafabricplus-bedrock](https://github.com/ViaVersionAddons/viafabricplus-bedrock) | Add-on that adds Bedrock servers and Realms to ViaFabricPlus. Active (pushed 2026-10-18), on Modrinth. **Not in the pack yet.** |
| [ViaBedrock](https://github.com/ViaVersionAddons/ViaBedrock) | The translation engine under the add-on. Its README: "very early stages of development and NOT intended for regular use yet." |

- **Owner-tested 2026-10-25: latest ViaFabricPlus + the viafabricplus-bedrock
  add-on joined CubeCraft's Bedrock server.** One server, one session; other
  servers, Realms and friends' worlds not yet tried.
- To ship: add the add-on to the pack from Modrinth (pinned version, sha256),
  version-matched to the ViaFabricPlus jar already there. Label Bedrock joining
  experimental until it has held up on a few more servers.
- GPL-3.0: keep all three as separate jars in the pack, never copied into
  RomanicaClient (LGPL). Fix bugs upstream; pin and vendor jars rather than
  maintaining forks.
- Source mirrors: fork the three repos into Romanica-MC (owner does this on
  GitHub) so the code stays available if upstream changes or disappears. A
  mirror is a safety copy, not a maintained fork.
- A "launch Bedrock" button (Windows `minecraft://` link) stays a later, small
  convenience; it adds no new capability.

## 6b. Skins and custom capes

Already in RomanicaClient: the skin screen uploads and switches skins and the
player's official Mojang capes through api.minecraftservices.com, so they show
for everyone. No custom cape system exists yet.

**Custom capes: dropped** (owner decision, section 11). No upload service, no
moderation queue, no cape hosting. Players keep official Mojang capes through
the skin screen. Server-linked cosmetics, if ever sold, go through the existing
Romanica store and the in-game store screen (6f).

## 6c. Performance on weak and strong PCs

Owner direction (2026-10-25): plan the multithreading work and every other
performance item below.

### What already runs in parallel

Folia (regionised multithreaded server ticking) has no client equivalent.
Game logic and frame submission stay on one main thread, and no mod can split
that Folia-style. Already parallel: chunk mesh building on worker threads (much
faster with Sodium), integrated-server chunk generation and saving, networking,
sound. Already in the pack: Sodium, Lithium, FerriteCore, ModernFix,
ImmediatelyFast, Entity Culling, More Culling, Dynamic FPS, Better Block Entities.

### Planned items

| # | Item | Gains | Default | Notes |
|---|---|---|---|---|
| P1 | Hardware-aware RAM + GC defaults (launcher) | Weak PCs stop swapping; fewer GC stutters on strong PCs | On | First launch reads total RAM + CPU cores. RAM: ~2 GB on 4 GB machines, 3-4 GB on 8 GB, 4-6 GB on 16 GB+ (more than ~6-8 GB doesn't help this pack). GC: G1 default, generational ZGC on 16 GB+/6+ cores. Player override in settings stays. Today: fixed 4 GB + one G1 flag set (`configmanager.js`) |
| P2 | First-launch graphics preset (launcher writes `options.txt` once) | Playable first session on integrated graphics | On, first launch only | Detect GPU class; iGPU = lower render distance, fancy off, shaders off. Never overwrite an existing `options.txt` (0a: player-owned file) |
| P3 | C2ME (parallel chunk generation/loading/saving) | Faster world loading, singleplayer and host-a-world | On | Biggest win offline/hosting, small on multiplayer. Check compatibility with ModernFix, Lithium, ViaFabricPlus |
| P4 | ScalableLux (parallel lighting) | Smoother chunk loading, including multiplayer | On | Lighting engine replacement: check against Iris shaders and BBE |
| P5 | Particle culling | Fewer FPS drops in explosions/enchant effects | On | Directly relevant to OP prison (Nuke, VeinMiner, crates) |
| P6 | Nvidium (Sodium add-on, mesh shaders) | Large FPS gain on supported NVIDIA GPUs | On only when detected NVIDIA GPU supports it | Often trails Sodium updates; ship only when a build matches the pack's Sodium |
| P7 | Distant Horizons (low-detail far terrain) | Very long view distance on strong PCs | Off, opt-in | Heavy on weak PCs and on disk; offer as a toggle in the launcher's performance settings |
| P8 | Profile RomanicaClient's own HUD/menus on a weak PC | Removes the client's own overhead | n/a | HudFrameCache already exists; profile with a sampling profiler (e.g. spark) in a busy mine with the default HUD, fix the top offenders |
| P9 | Performance settings page in the launcher | Players can see and change P1/P2/P6/P7 | n/a | One screen: RAM, GC, preset, Nvidium, Distant Horizons, plus "reset to recommended" |

### Rules for every item

- Availability first: confirm a build exists for the pack's exact Minecraft and
  Sodium versions before adding a mod (not checked yet for 26.3).
- Mods go in from Modrinth with pinned versions and sha256, like the rest of the
  pack; no closed or re-hosted jars.
- Each item lands alone (one change per release where practical), so a
  regression points at one cause.
- **Evidence:** CI FPS is meaningless (software rendering). Each change ships with
  a test plan: fixed scene (spawn, a busy mine during Nuke procs, a fresh
  singleplayer world fly-through), fixed settings, before vs after (average FPS,
  1% lows, chunk-load time, RAM). Run on the owner's PC, ideally on one weak
  machine (integrated graphics, 8 GB) and one strong one.
- Anything that fails on the weak PC is either off by default or dropped.

### Order

1. P1 hardware-aware RAM/GC (largest gain for weak PCs, launcher-only change).
2. P3 C2ME + P4 ScalableLux (small, contained; test together, ship separately).
3. P5 particle culling.
4. P8 client HUD profiling.
5. P2 first-launch graphics preset, then P9 settings page.
6. P6 Nvidium, P7 Distant Horizons (opt-in extras).

## 6d. Headless accounts ("Romanica Console"): AFK/console bots, local only

Owner direction (2026-10-25): features like the AFK/console bot tools players
use (OQMineBot was the owner's favourite; also AFK Console Client, StayAFK,
Minecraft Console Client, MinecraftAFK), but **running locally** on the
player's PC, for **Java and Bedrock**, with all of a player's accounts in one
place. Learn what those tools do; copy no code or assets from them.

### Policy first (decide before building)

- **Romanica allows AFK and player-run bots** (owner decision 2026-10-25). The
  10-minute AFK kick was unintended; the plugin default is now 0 (never kick).
  Romanica builds the tool and runs the server; what players do with their own
  accounts is their choice, within the server rules.
- **Economy check (owner call):** Romanica pays AFK income (100 Denarius/min,
  donor-scaled, capped at 30 min per AFK session; `AfkService.kt`). The cap resets
  every new AFK session, so a bot that briefly moves can earn indefinitely, and
  alts can pool money with /pay. Decide whether that's fine or whether income
  should cap per day per account.
- **Server lists:** many server-list sites forbid inflated player counts. Bots
  joining is the players' doing, but don't advertise counts that are mostly bots.
- **Other servers** ban bots in their rules more often than not. The tool shows
  a clear "check this server's rules" notice and stays opt-in per server.
- **Hard lines** (same principle as 6e): no anticheat evasion, no spam, no
  PvP/griefing automation, no account sharing or selling, no alt-account
  services. Offline accounts only behind the ownership gate (Accounts policy).
  Farming, mining and other macros (14.5) are the player's choice per server,
  under that server's rules. Romanica runs its own anticheat;
  shipping evasion would be shipping bypass tools against ourselves.

### Features (v1)

- **Account manager**: add many Microsoft accounts (device-code sign-in with
  Romanica's Azure app, same flow as the client), Java and Bedrock profiles per
  account. Tokens encrypted on disk with the OS keychain (Electron
  `safeStorage`), never sent to Romanica's servers: local only.
- **Run headless**: connect any number of accounts to a server with no game
  window, so it runs fine on weak PCs; start/stop each one or all at once.
- **Console per account**: live chat, send chat and commands, health/hunger,
  position, who is nearby.
- **No account limit per server** (owner decision, section 11). Instead,
  **join-rate limiting and a join queue**: accounts connect one after another with
  a minimum gap (default a few seconds, adjustable but never zero), and a
  reconnect storm after a server restart is spread out with jitter. This keeps
  players under servers' connection throttles (Paper kicks clients that
  reconnect too fast) and stops the tool behaving like a join flood.
- **Stay connected**: auto-reconnect with backoff, reconnect on server restart,
  scheduled join/leave times. Anti-AFK movement only where the server's rules
  allow it (see policy).
- **Basic survival**: auto-eat, auto-respawn, leave on low health.
- **Alerts**: notify (desktop, optional Discord webhook the player sets up)
  on mentions, keywords, disconnects, deaths.
- **Logs**: per-account chat log saved locally.

### Pricing

**Completely free, all features, local only** (owner decision 2026-10-25). It's
an incentive to use RomanicaClient, and RomanicaClient is how players find the
Romanica server. No paid tier, no hosted bots, no account data on our servers.

**Zero running cost to Romanica is a hard requirement.** Every part runs on the
player's PC. Nothing in this section may need a Romanica server, relay or
hosted service; if a feature would, it's out.

**Player-supplied proxy/VPN**: each account can optionally connect through a
SOCKS5/HTTP proxy the player provides (or just their own VPN). Romanica provides
none. Some servers limit accounts per IP or ban proxies/VPNs; that's the
player's call against that server's rules, shown in the same "check this
server's rules" notice.

### Play as this account (v1, with rejoin)

The simple version ships first: **"Play"** on a running account stops its
headless bot, opens RomanicaClient signed in as that account and joins the same
server (a normal rejoin). Closing the game restarts the bot. No proxy, no state
caching, works on every server, Java and Bedrock (via the client's existing
Bedrock support).

### Low resources when minimised (client)

Dynamic FPS is already in the pack. Tune its defaults for RomanicaClient: near
0 FPS when minimised, a few FPS when unfocused, sound muted or lowered, and stop
non-essential client work (HUD redraws, minimap updates, particles) while
hidden. The game still has to process the server's packets, so it can't be
literally zero, but it should idle near a background app. Evidence: CPU/GPU
usage minimised vs focused, measured on the owner's PC.

### Hop in / hop out without a rejoin (later: session handover)

Owner idea: an account runs in the background on few resources; the player can
open it and play normally within seconds, **without the server seeing a
rejoin**, then close the game and the account keeps running.

How it works (the "local proxy" design, used by existing open-source 2b2t
queue/AFK proxies):

1. Each running account is a small local proxy process that holds the real
   connection to the server and keeps the account alive (tens of MB, no game).
2. The proxy caches the state the game needs to draw the world: chunks around
   the player, entities, inventory, health, position, tab list, scoreboard, boss
   bars, resource-pack state.
3. "Hop in": RomanicaClient connects to the local proxy instead of the server.
   The proxy replays the cached state to the game, then forwards packets both
   ways. To the server it is the same uninterrupted session.
4. "Hop out": the game disconnects from the proxy only; the proxy resumes
   keeping the account online.

Two speeds, player's choice per account:

- **Light (default)**: proxy only. Hopping in needs the game to start (cold start
  of a modded client is tens of seconds), but there's no rejoin and almost no
  resource use while backgrounded.
- **Instant**: the game stays running, minimised and throttled (Dynamic FPS
  already drops it to near zero when unfocused). Hop-in is a couple of seconds,
  but it holds the game's RAM (GBs) the whole time. Sensible for one main
  account, not for ten.

Hard parts to plan for:

- **State completeness**: anything the proxy didn't cache (a container left
  open, a pending teleport, map data) shows wrong until the server resends it.
  The handover must end with the client and server agreeing on position, or
  anticheats (Romanica's included) see a teleport and flag it. For Romanica,
  RomanicaClient can tell the server a handover is happening over the existing
  plugin channel; on other servers the handover must be seamless on its own.
- **Protocol version**: the proxy and game must speak the server's protocol, or
  the proxy translates (ViaVersion family). Bedrock servers via ViaBedrock in the
  proxy are possible in principle, much later. Handing a session to the real
  Bedrock game is not realistic.
- **Licences**: study the existing proxies' designs; check their licences
  before reusing anything, and copy nothing by default.

Evidence: CI against a local Paper server: bot joins, game hops in, server log
shows one continuous session (no quit/join), player position matches after
handover, hop out, bot still online. Real servers and anticheats: owner's PC.

### Later (v2+)

- Simple scripting (on-join commands, timed messages, reply rules), sandboxed.
- Pathfinding / walk-to-coordinates.
- Run from a home server or always-on PC with a local web dashboard (still the
  player's own machine, no Romanica hosting).

### Building blocks

- The launcher is Electron/Node, so Node libraries fit directly: **mineflayer**
  (headless Java client with plugins for pathfinding and auto-eat) and
  **bedrock-protocol** (headless Bedrock client), both MIT-licensed PrismarineJS
  projects, plus **prismarine-auth** for Microsoft sign-in. Check each supports
  Minecraft 26.3 and current Bedrock before committing; they often lag new
  releases.
- Alternative for Bedrock: a Java headless client through **ViaBedrock /
  ViaProxy** (GPL-3.0; separate process, not linked into our code).
- Home: a "Console" tab in the launcher, not a separate app.

### Evidence

Headless clients can be tested in CI against a throwaway local Paper server
(Java) and a local Bedrock Dedicated Server: join, chat round-trip, reconnect
after a server restart, clean disconnect. Microsoft sign-in and real servers:
"Not verified" until run on the owner's PC.

## 6e. Hacked clients: compatible everywhere, disabled on Romanica

Owner direction (2026-10-25): players can use hacked clients (Meteor, Wurst and
others) where that's allowed, such as anarchy servers; RomanicaClient should
work alongside them, help where it can and re-theme their GUIs. The one
requirement: **nobody can cheat on Romanica.**

### What actually stops cheating on Romanica

**The server, not the client.** A cheater can join with a hacked client and no
RomanicaClient at all, and RomanicaClient is open source, so any client-side
check can be removed. Every rule that matters is enforced by the plugin's
server-side anticheat (`admin/`, AlertQueue pipeline), which already exists.
Client-side measures below are a convenience for honest players, not security.

### RomanicaClient on Romanica ("Romanica mode")

The client's existing enforcement layer (`imperium/enforcement/`) already turns
on only when connected to a Romanica address. Extend it:

- On joining Romanica, switch off every module of a known hacked client the
  player has installed (both offer ways to toggle modules programmatically), and
  switch them back to the player's own state on leaving. Players don't get banned
  by accident because they forgot a module was on.
- Tell the player once, in plain words: "Meteor's modules are off on Romanica."
- Report installed hacked clients to the server over the existing plugin channel
  so staff and the anticheat have context. Informational only: a modified client
  can lie, so it never replaces the server's checks.

### Compatibility and help elsewhere

- **No conflicts**: keybinds, HUD overlap, mixin conflicts and menu clashes are
  bugs to fix. Test the client with each popular hacked client installed.
- **Theming**: register a Romanica theme in their GUI systems where they offer a
  theme API, so their menus match ours. Optional, off by default.
- **Very wide coverage** (owner direction): support as many hacked clients as
  possible through a **data-driven registry**, not hard-coded checks. Each entry:
  mod id / jar signature, Minecraft versions, open or closed source, and what
  RomanicaClient can do with it: *detect* (all), *toggle modules* (only where the
  client exposes a way), *theme* (only where it has a theme API).
  - Tier A, open source with module/theme APIs (Meteor, Wurst, LiquidBounce and
    similar Fabric clients): detect + toggle + theme.
  - Tier B, open source without usable APIs: detect + toggle by config file where
    possible.
  - Tier C, closed or paid clients: detect only. Romanica's server-side anticheat
    is the only real defence for these.
  - Legacy versions (1.8.9/1.12.2 Forge clients) join the registry with the
    multi-version work (phase C).
  - The registry is a JSON file in a Romanica GitHub repo, fetched the same way
    as the launcher's distribution index (free hosting), so new clients are added
    without a client release. Licence and API status verified per client when it's
    added; nothing here is assumed.
- **Shared tools**: account manager, waypoints, HUD layout, profiles per server
  (e.g. a "2b2t" profile and a "Romanica" profile switched automatically by
  server address).
- **Not built**: no new cheat modules, no "improved" bypasses, no anticheat
  evasion for any server, Romanica or not. Players bring their own hacked client;
  Romanica just stays out of the way.

### Licences

Meteor and Wurst are GPL-3.0; RomanicaClient is LGPL-3.0. Keep integration code
in small separate compatibility add-ons (GPL-3.0, own jar, loaded only when the
hacked client is present) rather than linking their code into the client.
Ship those add-ons as optional downloads, never bundled with the hacked client.

### Evidence

CI gametest with Meteor installed (once the gametest job boots): join a local
server whose address is on the Romanica allowlist, assert modules are off;
leave, assert they're restored. Server-side: the plugin's anticheat tests stay
the real proof.

## 6f. In-game store and checkout in RomanicaClient

Owner direction (2026-10-25): what the third-party
[paynow-gui](https://hangar.papermc.io/Kyllian/paynow-gui) plugin does on Lunar
Client only (an in-game store menu with in-game checkout), but in RomanicaClient,
so players can buy from the Romanica store without leaving the game.

- **Fits the business model** (PRODUCT.md): the player opens it (`/store`, a menu
  button). Never a pop-up, banner or prompt that interrupts play.
- **Card details never touch Romanica code.** Payment happens only on PayNow's own
  hosted checkout page. Keeps Romanica out of card-data rules and keeps trust.
- **Store screen**: the catalogue (products, prices, images) comes from a small
  **store catalogue API on Cloudflare Workers** (api.romanica.net), the only
  Romanica-hosted service the client uses (owner decision, section 11), cached so
  it stays within the free/paid quota (G1). The player's rank and what they own
  come over the existing plugin channel when on Romanica. RomanicaClient renders
  it as a native, themed store screen. Vanilla/other clients keep a chest-GUI
  version from the plugin, with a checkout link.
- **Checkout**, in order of preference:
  1. An in-game web view of PayNow's checkout. Needs an embedded-browser mod
     (MCEF, Chromium-based, large); download it only the first time a player
     checks out, never bundled by default. Check its licence and 26.3 support.
  2. A QR code on screen to pay on a phone.
  3. The system browser (today's behaviour).
- **Fulfilment must work first.** The 2026-10-25 review found the production
  PayNow webhook subscription lists only the three subscription events, not
  OnOrderCompleted / OnRefund / OnChargeback, so one-off purchases may not be
  delivered. Fix that in the PayNow dashboard before building any of this.
- Evidence: a PayNow sandbox order completed from the in-game screen and delivered
  in game, on the owner's PC.

## 6g. Our own optimisation of Minecraft and the launcher

Owner direction (2026-10-25): go through Minecraft's code ourselves, cut what
players don't need and optimise, instead of relying only on other people's mods.

### Ground rules

- **Runtime only.** Mojang's EULA forbids distributing a modified game, and
  AGENTS.md forbids committing Mojang assets. The launcher keeps downloading the
  official game from Mojang; RomanicaClient changes behaviour at runtime with
  Mixin. Mixin can reach any method, so this is not a limit on what we can change.
- **Since 26.x the game ships unobfuscated**, so reading it is far easier than on
  older versions. Read and profile it locally; never commit decompiled game code.
- **Measure first, change second.** No optimisation without a profile showing the
  cost and a before/after on real hardware (CI has no GPU).
- **Don't fight the performance mods in the pack.** Sodium, Lithium, ModernFix and
  co. already patch the hottest paths; a second patch to the same method conflicts.
  Work where they don't, and contribute general fixes to them upstream.

### Our edge over general mods

We know our players' workload: OP prison mining (Nuke/VeinMiner breaking hundreds
of blocks a second, enchant particles, block-break sounds), crowded spawn and
crates, Romanica's HUD, legions, the map. General mods optimise the average case;
we optimise this one.

### Client work items

| # | Item | How it's found / proven |
|---|---|---|
| O1 | Profile the Romanica workload: busy mine during Nuke procs, crowded spawn, crate openings, long sessions (memory growth) | spark / Java Flight Recorder on the owner's PC; publish flame graphs in docs/ |
| O2 | Mass block-break path: chunk section rebuilds, particle and sound bursts, light updates when a mine regenerates | O1 profile; target: no frame spike during a full-mine Nuke |
| O3 | Startup time: defer or skip work players don't need at launch (unused languages, narrator setup, Realms/news fetches, data that loads lazily fine) | Startup timing log, before vs after |
| O4 | Memory: duplicate data, caches that never shrink, RomanicaClient's own leaks over a multi-hour session | Heap dumps after 3 h; RAM vs time chart |
| O5 | Networking: the high entity/particle/sound packet rates prison servers send | Packet stats from the client; pairs with plugin-side batching |
| O6 | Turn off what players don't use, as settings, not deletions (e.g. features unused on servers, optional Mojang telemetry where the game allows it) | Settings page; each switch measured |
| O7 | RomanicaClient's own code: HUD, menus, minimap, enforcement layer | Same profiles; it's the code we fully own |

Server-side counterpart: many client costs come from what the server sends
(particles, block updates). The plugin can batch and trim those too; pair O2/O5
with plugin changes.

### Launcher work items

- L1: remove dead code inherited from Helios (e.g. the old Mojang
  username/password login: Mojang accounts were retired in favour of Microsoft
  accounts), unused UI and dependencies.
- L2: installer size (0.2.7 installer is ~105 MB): audit what's packed.
- L3: launcher startup and idle use: it should use almost nothing while the game
  runs.
- Each removal: tests + lint green, and a `smoke.yml` run that writes a real game
  log (see the 0.2.8 note: CI runs so far start the game but never get a
  `latest.log`).

### Order

1. O1 profiling (everything else depends on it).
2. O2 mass block-break, the most Romanica-specific win.
3. L1 launcher cleanup (low risk, makes later work easier).
4. O3 startup, O4 memory.
5. O5, O6, O7, L2, L3 as profiles justify.

## 6h. Java to Kotlin, everywhere it's ours

Owner direction (2026-10-25): convert all Java code to Kotlin. Scope today
(counted 2026-10-25): the launcher, website and backend are JS/TS, so this is the
client and the plugin only; Minecraft's own code is Mojang's and isn't ours to
convert (6g).

| Repo | Kotlin | Java left |
|---|---|---|
| RomanicaPlugin | 1,382 files | 1 test file (`src/test/net/imperiummc/`) |
| RomanicaClient | 583 files | 34 gametest classes + 17 mixins |

### Plan

1. **Plugin test** (1 file): convert. Trivial; the governance test ratchets stay
   green.
2. **Client gametests** (34 files, `versions/latest/src/test/java/`): convert to
   Kotlin. Fabric's client gametest API works from Kotlin via
   fabric-language-kotlin. Proof: the gametest job must report the same test
   count before and after (and it must actually boot first, see the CI note).
3. **The 17 mixins: Kotlin wherever possible, a thin Java shell only where
   required** (owner direction 2026-10-25). Every one touches *static* members of
   Minecraft classes: `@Shadow static` fields, static `@Accessor`/`@Invoker`
   methods on interfaces, or `@WrapMethod` on static methods. Kotlin has no real
   statics (it uses companion objects), and Mixin either rejects the companion or
   merges the wrong members; AGENTS.md records a Kotlin mixin that replaced
   `Minecraft.setLevel` and crashed every world join. A `.kt` file can't contain
   Java, so the split is per role:
   - **Kotlin** (`.kt`): all the behaviour, meaning what the patch decides and
     does, its checks and helpers, as plain Kotlin functions.
   - **Java shell** (`.java`): only the declarations Mixin needs as true statics
     (the `@Shadow static` field, the static accessor, the static method
     signature), each a one-line call into the Kotlin code. Comment: "Java only for
     static members; logic in <File>.kt".
   - A mixin with no static members converts to Kotlin fully.
   - Proof per mixin: export the merged classes (`-Dmixin.debug.export=true`),
     compare with `javap` before and after, then the gametest that covers it.
**Inventory (measured 2026-10-25, client branch):** 9,139 Java lines in 51 files.
34 gametest classes (~7,000 lines; largest `PerformanceBenchmarkGameTest` 714,
`ClientAuthGameTest` 438, `ImperiumMenuGameTest` 431) plus `AxolotlClientTest`
and `ImperiumGametestSubsets`; 17 mixins (~1,900 lines; `ChatHudMixin` 583 is the
only large one, most are 36-98). Gametests are registered by class name in
`src/test/resources/fabric.mod.json`, so Kotlin classes with the same names keep
working. Order: small gametests first, one batch per CI build (the build job
compiles test sources even though the gametest job can't boot yet), then the
large ones, then mixins smallest-first with `ChatHudMixin` last. Pitfall to check
per file: Kotlin code must use Kotlin property names where Java called getters
(`getInstance()` vs `instance`). Conversion is behaviour-preserving only;
optimisations (6g) are separate commits with their own profiles.

4. **Guard**: a check that fails CI if a new `.java` file appears outside the
   mixin-shell allow-list, or if a shell grows beyond declarations plus one-line
   calls, so the codebase stays Kotlin.

### Found while counting

- `ClientBrandRetrieverMixin` still reports the client brand **"ImperiumClient"**
  to every server (decision: report standard `fabric`, see section 11), and the client/server channels are still named
  `imperiumclient:*` (`ImperiumClientDataChannels.kt` in the plugin). Renaming the
  brand is a one-liner; renaming the channels must change client and plugin in
  the same release (accept both names for one release, then drop the old). Track
  with the rebrand clean-up, not with the Kotlin work.

## 7. Suggested order

1. Launcher stable: Fabric manifest fix, release, real launch on the owner's PC.
2. Off AxolotlClient (0c): Azure ID swap, then friends from Xbox; drop upstream chat.
3. Xbox friends spike (one real sign-in, no UI).
4. Instance model with the managed/player-owned split and backups (0a).
5. Import existing installs (0b); any vanilla/Fabric version launches.
5a. Performance items P1-P9 (6c), in their own order, alongside 4-5.
5b. Romanica Console (6d): v1 after the instance model (Romanica bot policy decided: allowed).
6. RomanicaClient builds for phase A versions + performance preset.
7. Host-a-world (Java first, then Geyser).
8. Replay clips.
9. Phase B loaders/versions, then phase C.

## 8. Gaps: what's still missing (review 2026-10-25)

### A. Unfinished now (blocks everything else)

1. **No proof the game actually runs from CI.** The launcher smoke test starts the
   game but no `latest.log` ever appears; the client gametest job never boots
   (GLX visual error). Nearly every "evidence" rule in AGENTS.md depends on one of
   these working. Fix both before building features on top.
2. Launcher 0.2.8: waiting on a real launch on the owner's PC (`latest.log` head).
3. Client Azure ID swap: on a branch, not merged or released.
4. PayNow webhook missing OnOrderCompleted / OnRefund / OnChargeback (dashboard).
5. Production `afk.yml`: set `afk-kick-timeout: 0` and restart; plugin default fix
   on a branch.
6. Client brand still "ImperiumClient"; `imperiumclient:*` channel names (6h).

### B. Security and privacy (not planned anywhere yet)

7. **Sign-in tokens stored in plain text.** RomanicaClient writes Microsoft refresh
   tokens to `accounts.json` (and keeps `accounts.json.old`) unencrypted. Token
   stealers target exactly these files. Encrypt with the OS keychain (Windows
   DPAPI, macOS Keychain, Linux secret service), migrate existing files, delete
   the `.old` copy. Same standard as the Console plan (6d).
8. **Windows code signing** for the launcher installer and auto-updates. Unsigned,
   every new player sees a SmartScreen "unknown publisher" warning (an adoption
   killer) and updates rely on HTTPS plus the update file's hash alone.
   Already an open owner item; needs a certificate (costs money: owner decision).
9. **Privacy policy and minors.** Friends, chat and the store all
   handle player data, and many players are children. Before those ship: privacy
   page covering the client and launcher, block/report/mute in chat and friends,
   moderation for uploads, and a check of children's-privacy rules (e.g. COPPA in
   the US, GDPR-K in the EU) for anything storing data on api.romanica.net.

### C. Launcher features not yet planned

10. **Release channels**: a beta channel for testers alongside stable, and a way
    to roll back a bad update.
11. **Mod, resource-pack and shader browser** (Modrinth) so players can add their
    own content to an instance; 0b covers importing, not browsing.
12. **Offline launch**: play singleplayer when the internet or our index is down
    (last verified files, no re-download).
13. **macOS and Linux**: installers inherited from Helios, never tested.
14. **Launcher crash reports** players can send in one click (redacted like the
    existing `redact.js`), instead of digging through log folders.

### D. Client features not yet planned

15. **Controller support** (listed in the Bedrock comparison, never planned).
16. **Settings and profile export/import** between PCs (local file, zero hosting
    cost).
17. **Translations for new features**: the client has de/es/pt; every new screen
    in this plan needs strings in all of them (the locale test enforces parity).
18. **First-run onboarding**: a short "here's what's different" screen so players
    find Romanica mode, Console, Bedrock servers and the store.

### E. Measuring whether it works

19. **Success metrics**, privacy-friendly: how many RomanicaClient users join
    Romanica (the server already sees the client channel), how many stay a week,
    crash rate per release. The client exists to grow the server; without these
    numbers there's no way to tell whether it does.

Each item is planned in section 9; "Switch to Romanica" (moving everything in
from other clients and launchers) is section 10.

## 9. Plans for the gaps (section 8)

### A. Unfinished now

**A1. Prove the game runs in CI.**
- Launcher smoke: the game starts but no `latest.log` appears in 20 min. Steps:
  capture the game process's own stdout/stderr and exit code into the job log;
  check whether the game writes its log somewhere other than
  `instances/Romanica/logs` (e.g. a different game dir argument); if it crashes
  before logging, the JVM output shows why. Smoke must fail when there's no game
  log (fix the driver's fallback "PASS").
- Client gametest: "Couldn't find matching GLX visual" under xvfb, and forcing
  EGL didn't help. Steps: list the visuals Xvfb offers (`glxinfo`, `xdpyinfo`),
  compare with what the 26.3 renderer requests (depth/stencil/alpha), try Xvfb
  `-screen 0 1280x1024x24+32` and Mesa's `LIBGL_ALWAYS_SOFTWARE` with explicit
  visual overrides, or a Windows runner with Mesa as the launcher smoke uses.
- Done when: a run shows `latest.log` reaching the title screen, and a gametest
  run reports a non-zero count with `joined the game`.

**A2-A6** are owner actions or merges, tracked in section 8: real launch for
0.2.8, merge + release the Azure swap, PayNow webhook events, production
`afk.yml`, brand rename (6h).

### B. Security and privacy

**B7. Encrypt stored sign-in tokens (client).**
- Store `accounts.json` tokens through the OS: Windows DPAPI, macOS Keychain,
  Linux Secret Service (libsecret); a Java library that wraps all three, or small
  per-OS code. If no keychain is available, fall back to asking the player to sign
  in each session rather than writing plain text.
- Migration on first start: read the old file, re-save encrypted, securely delete
  `accounts.json` and `accounts.json.old`. Account list survives (0a).
- Tests: round-trip on each OS in CI (Windows/macOS/Linux runners), plus a test
  that no token string appears in any file under the config dir after migration.
- Same rule for the launcher's own account store (check `configmanager.js`) and
  the Console (6d).

**B8. Windows code signing (owner decision: certificate cost).**
- Options: a standard OV code-signing certificate (yearly cost, needs a hardware
  key or cloud signing), or a cloud signing service. Signing removes the
  "unknown publisher" warning over time and lets auto-update verify the publisher.
- Wire into `release.yml` only (secrets never in the repo); smoke still gates.

**B9. Privacy and minors.**
- Privacy page on romanica.net covering client, launcher, Console (local only),
  friends/chat (Microsoft-provided), store, and the metrics in E19.
- Friends/chat: block, mute, report; staff moderation queue; chat filter on by
  default for younger players.
- Uploads (capes): moderation queue (6b).
- Children's-privacy check (COPPA in the US, GDPR-K in the EU, UK Children's Code)
  before anything stores player data on Romanica's services: what's collected, age
  handling, deletion on request. Get proper legal advice for this; it's not a
  code question.

### C. Launcher

**C10. Release channels and rollback.** Stable and beta channels (electron-
updater supports channels); beta opt-in in settings. Keep the previous version's
installer; "roll back to previous version" in settings. A bad stable release is
pulled by re-pointing `latest.yml`.

**C11. Content browser.** Search Modrinth (mods, resource packs, shaders,
data packs) filtered by the instance's version and loader; install with
dependencies; update and remove. Player-added content is player-owned (0a) and
never touched by the managed-mod cleanup.

**C12. Offline launch.** If the index or the network is unreachable, launch from
the last fully verified file set (the verifier cache already records it) for
singleplayer and LAN; clear message that online play needs a connection.

**C13. macOS and Linux.** Add both to the smoke matrix (macOS and Linux runners
with software GL), fix what breaks, then publish their installers.

**C14. One-click crash reports.** On a game or launcher crash: show what
happened, offer "Copy report" / "Open report folder", redacted with the existing
`redact.js` rules. Optional upload only if the player chooses (to a GitHub issue
template or Discord, no new hosting).

### D. Client

**D15. Controller support.** Evaluate shipping an existing controller mod in the
pack (Controlify is the main one; check licence and 26.3 build) versus building
our own; Romanica menus must be fully navigable with a controller either way.

**D16. Settings export/import.** One file containing client settings, HUD
layout, keybinds, profiles and waypoints; export/import from the menu. Local
only.

**D17. Translations.** Every new screen ships with de/es/pt strings; the existing
locale-completeness test enforces it. English-only strings fail CI.

**D18. First-run onboarding.** Three short screens on first start: Romanica mode,
what's included (Console, Bedrock servers, store), and "Switch to Romanica"
(section 10). Skippable, never shown again.

### E. Measuring

**E19. Success metrics.**
- From the server (no client tracking): count players whose client announces the
  Romanica channel; first-join date; 7-day and 30-day return.
- Crash rate per release from opt-in crash reports (C14).
- Downloads from GitHub release stats and the website.
- Shown on the admin dashboard; reviewed after each release.

## 10. "Switch to Romanica": bring everything in from other clients and launchers

Owner direction (2026-10-25): make it easy to move all of a player's stuff into
RomanicaClient from other launchers and clients. Extends 0b (version import).

### Sources

| Source | Where it keeps data | What we can import |
|---|---|---|
| Vanilla launcher | `.minecraft` | Versions, worlds, screenshots, resource/shader packs, `options.txt`, `servers.dat` |
| MultiMC / Prism-style launchers | instance folders + instance config | All of the above per instance, plus mods and loader/version |
| CurseForge app | its instances folder + manifest | Same; modpack manifest maps to Modrinth/CF ids |
| Modrinth App | its profiles folder | Same; mods already identified by Modrinth ids |
| ATLauncher, GDLauncher and similar | instance folders | Same, best effort per launcher |
| Lunar / Badlion / Feather and other clients | their own folders, partly their own formats | Worlds, packs, servers, `options.txt` where present; keybinds and HUD layout where the file is readable (best effort) |
| Map mods (Xaero's, JourneyMap) | per-mod waypoint files | Waypoints into RomanicaClient's waypoints |

Exact paths and formats are confirmed per source when its importer is built;
none are assumed here.

### What moves

- **Always**: worlds, screenshots, resource packs, shader packs, server list,
  video/audio settings, keybinds (vanilla format).
- **When versions match**: mods (re-downloaded from Modrinth by id and hash where
  possible rather than copied blindly, so the files are verified).
- **Best effort, clearly labelled**: other clients' HUD layouts and module
  settings mapped onto RomanicaClient's equivalents (keystrokes, CPS, coordinates,
  armour, potions...). Unmapped settings are listed so the player knows what to
  set up again.
- **Never**: accounts and sign-in tokens from other launchers (the player signs in
  again with Microsoft; reading another app's tokens would be token theft by
  another name), other clients' cosmetics, capes or paid content, their assets.

### How it works

- Launcher "Switch to Romanica" wizard (also offered in D18 onboarding):
  scan → show what was found per source → player ticks what to bring → **copy**
  into a Romanica instance → summary of what moved and what didn't.
- **Copy, never move or modify** the source; the old launcher keeps working.
  Backup rules from 0a apply.
- Big worlds copy in the background with progress; free disk space checked
  first.

### Evidence

Unit tests per importer against fixture folders built in temp directories (never
real user data, per AGENTS.md). One manual run per real source launcher on the
owner's PC before that importer is advertised.

### Order

1. Vanilla launcher (largest audience, simplest format).
2. Modrinth App and Prism-style launchers (open formats).
3. CurseForge.
4. Other clients' settings/HUD mapping, one client at a time, most-used first.
5. Waypoints from map mods.

## 11. Further gaps (review 2026-10-25, round 2)

**G1. Hosting cost vs "zero cost".** Console and the launcher are free to run,
but (before the section 11 decisions) friends/chat, capes, store catalogue and metrics were planned for api.romanica.net
(Cloudflare Workers). The site already went dark once when the free Workers
quota ran out (robots.ts note, 2026-10-11). Before each backend feature ships:
estimate requests per active player, compare with the plan limits, and decide
(free tier with hard limits, or Workers Paid). Cache everything cacheable (capes
as static files, catalogue per minute).

**G2. Abuse of the free Console.** A free multi-account bot tool can be pointed at
other servers as a join/spam flood. That would get RomanicaClient blocked
everywhere and hurt the brand. Built-in limits that aren't settings: a cap on
accounts per server, a minimum delay between joins, no chat-spam features, and
the hard lines in 6d.

**G3. RomanicaClient's reputation on other servers.** Because it's compatible
with hacked clients (6e), some anticheats or server owners may treat "Romanica
Client" as a cheat. Keep the client itself clean: no cheat behaviour of its own,
an honest brand string, and check it against big servers' allowed-mods rules
(e.g. Hypixel's). Publish a short "is Romanica Client allowed?" page.

**G4. Minecraft update process.** Every Minecraft release breaks mixins and the
pack's mods. Plan an update routine: watch for releases (the
`dependency-watch` workflows exist), update the client and pack on a branch, wait
for Sodium/Fabric API builds, smoke + gametest, then release. Also a version
support policy: which versions get feature updates, which only fixes, when one is
dropped.

**G5. Licence compliance for the whole pack.** The launcher distributes many
third-party mods (MIT, LGPL, GPL). Add an in-launcher and in-client "Credits &
licences" screen listing every bundled component, its licence and source link,
generated from the distribution index so it can't drift.

**G6. Security disclosure.** Both repos are public; add a `SECURITY.md` with a
private way to report vulnerabilities (GitHub private advisories), and a rule
that security reports never go into public issues.

**G7. Distribution beyond our launcher.** Publish RomanicaClient on Modrinth (and
optionally CurseForge) so players of other launchers can install it, and so it
shows up in their search. Big discovery channel, free. Needs the brand rename
(6h) and the Azure swap first.

**G8. Website support for the client.** romanica.net/client exists for downloads;
add the client's features page (Bedrock servers, Console, no ads, open source),
a help/FAQ section, and a changelog per client release. SEO-targeted pages for
"Bedrock servers on Java", "free AFK client", "Minecraft client no ads".

**G9. Plugin roadmap for client features.** Several plans need server work that
isn't scheduled: store catalogue over the plugin channel (6f), handover notice
(6d), hacked-client report (6e), metrics (E19), batching block-break effects
(6g). Collect them into a plugin-side section so they ship with the client side.

**G10. Backups for new backend data.** (After section 11: only the store catalogue remains.) Friends lists, cape uploads and moderation
records become player data we must not lose: daily backups and a tested restore
before those features launch.

### Owner decisions on section 11 (2026-10-25)

These supersede earlier text where they conflict; the affected sections are
updated in place.

- **Social and chat → Microsoft.** Friends, presence and chat use Xbox services;
  no Romanica social backend. Friends and presence are expected to work with the
  approved Azure app. **Xbox messaging may not be open to third-party apps**: the
  spike (one real sign-in on the owner's PC) checks friends, presence *and*
  messaging. If messaging isn't available, in-client chat is in-game chat on a
  shared server only; Romanica still hosts nothing for it. Removes most of G1's
  backend load and much of B9's data handling.
- **Clean client, no cheat features.** RomanicaClient ships no cheat
  functionality of its own (6e). Players who misbehave on a server are that
  server's to ban; the client framework itself presents as plain Fabric.
- **Capes dropped; Workers only for the store catalogue.** No custom capes (6b).
  The one Romanica-hosted client service is the store catalogue API on Cloudflare
  Workers (6f). G1 now applies to that API alone; G10 backups apply only to what it
  stores.
- **Console: no account limit per server; join-rate limiting and queueing**
  instead (6d). Replaces G2's per-server cap; the minimum join gap and the hard
  lines stay. **Messaging features stay intact**: per-account chat console,
  sending chat and commands, alerts on mentions (6d v1).
- **Client identity: standard Fabric.** RomanicaClient reports `fabric` as its
  `minecraft:brand`, the same as any Fabric install (drop the brand override in
  `ClientBrandRetrieverMixin`). Replaces G3's "honest brand string". To be fully
  standard on other servers, the client also **registers its Romanica plugin
  channels only when connected to a Romanica address** (the enforcement layer's
  allowlist already scopes this), because servers can see registered channel
  names. On Romanica, the server identifies the client by its channels, not its
  brand. Do this together with the `imperiumclient:*` channel rename (6h).
- **Approved:** the automated credits and licences screen (G5), the companion
  plugin roadmap (G9), and hosting docs/guides on romanica.net (G8).

### Round 3 gaps

**G11. Microsoft and Mojang rate limits for many accounts.** With no account cap,
signing in and refreshing many accounts hits Microsoft/Xbox/Minecraft services
rate limits (and looks like abuse to them). Spread sign-ins and token refreshes
out (same queue as joins), back off on 429 responses, and cache tokens until near
expiry. Test with a realistic account count on the owner's PC.

**G12. GitHub as the download host.** The launcher reads its index and vendored
jars from `raw.githubusercontent.com`. Raw URLs are rate-limited and not meant as
a CDN; vendored jars in the repo also bloat it. Move large artifacts to GitHub
Releases (built for downloads), keep raw only for small JSON, and add a fallback
mirror path (e.g. the Workers API serving the index from cache) if raw is
throttled. Watch launch failures for 403/429 from GitHub.

**G13. Antivirus false positives.** An unsigned launcher that ships a multi-account
bot tool and hacked-client compatibility is a classic false-positive target for
Windows Defender and other AV. Code signing (B8) helps most; also submit each
release to Microsoft's false-positive portal and keep Console as a clearly
labelled, open-source part of the launcher.

**G14. Upstream AxolotlClient after the break.** Dropping their services doesn't
end the code relationship: the client is still largely their LGPL code. Decide
whether to keep merging upstream fixes (security and Minecraft-update fixes are
valuable) or freeze; either way keep the LGPL notices and credits (G5) and track
their security fixes.

**G15. Support load.** Free client, Console, Bedrock servers, imports and
hacked-client compatibility will bring many support questions. Bug-report and
crash templates (C14), a pinned Discord support channel, the FAQ (G8), and an
in-client "Report a problem" that attaches the redacted log. Plan who answers.

**G16. Microsoft/Mojang brand and usage rules.** Client name, website copy and
store pages must follow Minecraft's usage guidelines: no implying official
status, no Mojang marks in the client's name or icon, the "not an official
Minecraft product" line everywhere it's distributed (README already has it;
add to the website, Modrinth page and installer).

**G17. Feature flags for everything unfinished.** AGENTS.md's lesson: a Microsoft
sign-in button went live before it worked. Every feature in this plan ships behind
a flag that is off until its evidence exists (Bedrock joining, Console, store
checkout, imports), so partial work can merge without reaching players.

### Owner decisions on round 3 (2026-10-25)

- **Chat and communities on Discord; friendship on Xbox.** No chat service in or
  behind the client. Friends list and presence come from Xbox (spike in 0c).
  Discord is where players chat; RomanicaClient already has a Discord Rich
  Presence module (`DiscordRPC.kt`) with Discord's join / ask-to-join handlers,
  so "join my server" from a Discord profile works with nothing hosted. Make it
  show the server and offer Join on Romanica and other servers (player's choice
  per server).
- **G11, unlimited accounts, spaced sign-ins.** Players may keep any number of
  accounts signed in, but sign-ins and token refreshes go through one queue:
  one Microsoft sign-in at a time, a minimum gap between them, back-off on
  "too many requests" (HTTP 429), tokens reused until near expiry so refreshes
  don't cluster. Logging 50 accounts in at once becomes 50 spaced sign-ins, never
  a burst; the gap is not configurable to zero. Goal: Romanica's Azure app never
  looks abusive to Microsoft. Measure real limits once on the owner's PC.
- **G12, GitHub Releases for downloads.** Large artifacts (vendored jars, client
  jars) move to GitHub Releases; `raw.githubusercontent.com` keeps only small
  JSON (the index, the hacked-client registry).
- **G13, no antivirus false positives (goal).** No single step guarantees it;
  together these get close:
  1. Code-sign every exe/dll and the installer (B8): the biggest single factor.
  2. Standard installer (electron-builder NSIS), no packers, no obfuscation, no
     self-extracting downloads of executables into temp folders, no process
     injection; the Console runs in-process or as a normal signed child process.
  3. Scan each release build in CI (e.g. VirusTotal's free API) before
     publishing; a detection blocks the release until resolved.
  4. Submit every release to Microsoft's malware-analysis portal and to any
     vendor that flags it, as a false positive.
  5. Consistent publisher name and signing identity across releases so reputation
     accumulates.
- **G14, AxolotlClient: keep, credit, use selectively.** Not dropping upstream:
  RomanicaClient stays built on AxolotlClient, keeps crediting moehreag and
  contributors (README, LGPL notice, credits screen G5), keeps merging upstream
  fixes where useful (security and Minecraft-update fixes especially), and simply
  doesn't use the upstream online services (0c).
- **G16, not official.** Confirmed: nothing implies official Mojang/Microsoft
  status; the "not an official Minecraft product" line goes on the website,
  Modrinth page and installer.

## 12. Feature research: what the big clients and launchers have

Owner request (2026-10-25): look across Alpine, Badlion, Feather/Dawn, Lunar,
LabyMod, Cosmic, NoRisk, Salwyrr, Tecknix, Melon, PvPLounge, Ares, Batmod,
Meteor/Wurst/LiquidBounce/Aristois (legal features only), Sodium, AxolotlClient,
Fabulously Optimized, Simply Optimized, SkyClient, Prism, GDLauncher, ATLauncher,
SKLauncher and the vanilla launcher, and find what RomanicaClient should add.
Sources: public feature pages and listings (2026-10-25); several smaller clients'
claims come from download-site descriptions and are unverified. "Melon" and
"Aires" returned nothing definite (closest match: Ares Client).

### Already in RomanicaClient (no work needed)

Keystrokes, CPS, reach, combo, armour, arrows, potions, coordinates, compass,
ping, TPS, FPS, memory, speed, playtime, stopwatch, real time, XP, inventory HUD,
pack display, player count, server IP, tab-list and scoreboard/boss-bar/title
HUDs, custom crosshair, HUD editor with history, toggle sprint, zoom, freelook,
snap-look, motion blur, hitboxes, chunk borders, light-level overlay, clear water,
low-HP tint, minimap + full-screen map, waypoints, emotes + emote wheel, skin
manager, official capes, screenshot tools and sharing, inventory search and
tweaks, scrollable tooltips, chat peek and chat extras, now-playing (media) HUD,
WorldEdit CUI, Discord Rich Presence, Hypixel and MCC Island modules, e4mc world
sharing, profiles, server-gated features, performance hides.

### Already planned elsewhere in this doc

Replay clips, 1.7 animations, auto-GG/minigame QoL, host-a-world (NoRisk, Dawn and
Feather all have it), Bedrock servers + Bedrock launch (Dawn launches Java and
Bedrock), multi-version instances, import from other launchers, presets
(Fabulously/Simply Optimized-style), performance stack, Console, hacked-client
compatibility, in-game store, Xbox friends, controller support, content browser.

### New candidates

Priority: **H** high value, broad appeal; **M** worth it; **L** nice-to-have.

**Client: PvP and HUD** (Lunar, Badlion, Dawn, Cosmic, Tecknix, Salwyrr, Batmod)

| Feature | Seen in | Pri | Note |
|---|---|---|---|
| Block outline/overlay customiser (colour, width, fill) | most PvP clients | H | Small, very visible |
| Hit colour / damage tint customiser | Lunar, Badlion | M | Cosmetic only, no gameplay effect |
| Nametag options (own nametag in F5, background, text shadow) | Lunar, LabyMod | M | |
| Item physics (dropped items lie flat) | LabyMod, Badlion | L | Visual only |
| Totem/item counter, armour durability warning | PvP packs, Dawn packs | H | Fits OP-prison PvP |
| Hunger saturation + food preview | AppleSkin-style, many packs | H | |
| Chat macros / text hotkeys | Wurst-style macros, Lunar | M | Rate-limited, no spam (6d hard lines) |
| Chat timestamps, copy message, mention highlight, compact duplicates | LabyMod, Lunar | M | Check chat extras first; some may exist |
| Client-side time/weather changer | LabyMod, Badlion | L | Visual only; off on servers that gate it |
| Particle multiplier / per-type particle toggles | Badlion, Lunar | M | Pairs with performance item P5 |
| Death waypoint + share waypoint in chat | many clients | M | Builds on existing waypoints |
| Hypixel/Bedwars overlays (level, stats) | Lunar, Badlion | L | Only if players ask; Hypixel module exists |

**Client: social and platform** (LabyMod, NoRisk, Alpine, Lunar, Badlion)

| Feature | Seen in | Pri | Note |
|---|---|---|---|
| **Voice chat** | LabyMod, NoRisk | H | Support the open-source Simple Voice Chat mod (client) + its server plugin on Romanica; no Romanica hosting (voice runs through the game server) |
| **Server API plugin for other servers** (block modules, detect the client) | Alpine (Spigot plugin), Lunar (Apollo), Badlion | H | Publish a free "Romanica Client server API" plugin so any server can turn modules off. Fixes G3 reputation; the client only talks to servers that use it, so it still looks like plain Fabric elsewhere |
| **Addon/plugin API for third-party developers** | Alpine plugin-api, LabyMod addons | M | Lets others add HUD modules; grows the ecosystem for free. Needs a stable API and docs |
| Minigames inside the client | NoRisk | L | Out of scope |

**Launcher** (Prism, GDLauncher, ATLauncher, SKLauncher, vanilla, NoRisk, Dawn)

| Feature | Seen in | Pri | Note |
|---|---|---|---|
| Modpack install and **export** (`.mrpack`, CurseForge zip) | Prism, GDLauncher, ATLauncher | H | Import is planned; export lets players share setups |
| Per-instance log viewer with error highlighting + crash analysis | Prism | H | Pairs with C14 crash reports |
| **Quick Play**: join a server or world straight from the launcher | vanilla launcher, Prism | H | Minecraft's own quick-play launch arguments; "Play Romanica" button |
| Server list with live ping/player count in the launcher | NoRisk, several | M | Romanica first, player's own list after |
| Playtime per instance, screenshots gallery per instance | Prism, GDLauncher | M | |
| World backups per instance | Prism (via mods), ATLauncher | M | Fits 0a "never lose stuff" |
| Mod update checker with changelogs | Prism, GDLauncher | M | For player-added mods (C11) |
| Desktop shortcut per instance | Prism, GDLauncher | L | |
| Pre-launch / post-exit commands, JVM wrapper | Prism | L | Advanced settings |
| Offline/cracked accounts | SKLauncher | **No** | Piracy; not supported |

**Pack additions** (Fabulously Optimized, Simply Optimized, SkyClient)

| Mod | Pri | Note |
|---|---|---|
| Dynamic lights (held torches light the area) | M | Popular; check performance on weak PCs (6c) |
| Bug-fix collection (Debugify-style) | M | Fixes vanilla bugs; low risk |
| AppleSkin-style hunger info | H | Or build it in (above) |
| Animation tweaks (Not Enough Animations-style) | L | |
| SkyBlock preset (SkyClient's niche, now 1.21.x) | M | Already in section 4 presets |

**Legal features from hacked clients** (Meteor, Wurst, LiquidBounce, Aristois):
the useful, non-cheat parts are auto-reconnect, better chat, macros, waypoints,
notifications, auto-respawn and HUD tools. Most exist or are planned above
(Console covers auto-reconnect/respawn). Freecam and anything that reveals hidden
information or automates play stays out of RomanicaClient (6e); players who want
those bring their own hacked client.

### 12a. The Cosmic model: features built for our own server

Owner note (2026-10-25): Cosmic (CosmicPvP / Cosmic Prisons) is the closest
match to Romanica: a big prison/factions network with its own client. Its
client's reported features (community posts, not official docs): item skins,
armour glint, custom crate visuals, emotes, custom mob textures, and registering
with the server as a clean client. The lesson is the pattern: **features only our
server can offer, because client and server are built together.** RomanicaClient
already does this (legion, boosts and cooldowns HUDs over `imperiumclient:*`
channels, server-gated modules). Candidates, all driven by the plugin over the
Romanica channel and only active on Romanica:

| Feature | Romanica hook | Pri |
|---|---|---|
| Mine HUD: current mine, reset countdown, % mined, next rank cost | MineManager / RankService | H |
| Enchant tooltips: what each custom enchant does, level, proc chance | EnchantRegistry | H |
| Pickaxe skin preview and item-skin rendering (server-defined skins, our own art) | PickaxeSkinService | H |
| Crate opening animation in the client instead of a chest GUI (server still decides the prize) | crate services | M |
| Event alerts with countdown: KOTH, bosses, colosseum, vote party, lottery draw | Koth/Boss/Colosseum/Lottery services | H |
| Prestige and battle-pass progress HUD | PrestigeManager, BattlePassService | M |
| Backpack/sell summary HUD (what you'd earn selling now, boosters active) | economy services | M |
| Legion war map overlays (territory, outposts) on the minimap | LegionManager, territory/outpost | M |
| Clean-client registration: the client tells Romanica it's unmodified-official, server treats it as context only (6e) | enforcement layer | M |

Rules: the server stays authoritative (the client only displays what the server
sends); every feature also degrades sensibly for players without the client (the
chest-GUI and chat versions keep working); art is Romanica's own (AGENTS.md: no
copying other clients' assets).

### 12b. What players switching from big clients expect on day one

Owner note: features from Lunar, Badlion, Feather/Dawn and Alpine are what get
people to switch. A switcher checks for these in the first five minutes; missing
any of them reads as "worse than what I had":

- FPS at least as good as their old client (performance stack + P1 defaults).
- Their HUD layout back (import, section 10) or a fast HUD editor (exists).
- Keystrokes, CPS, armour, potions, coordinates, FPS/ping (exist).
- Zoom, freelook, toggle sprint (exist).
- Custom crosshair and block outline (crosshair exists; outline in section 12).
- Emotes and cosmetics they can see on friends (emotes exist; capes dropped, so
  official capes only: say so clearly on the features page).
- Friends online and join (Xbox friends + Discord join, section 11).
- Replay/clips (planned): the biggest Lunar draw after FPS.
- Works on the servers they play (Hypixel and co.): standard Fabric identity,
  allowed-mods check (G3), server API plugin (section 12).

Ship order should make this list complete before advertising the client to
players of other clients.

### Suggested order

1. H items that are small and visible: block outline, totem/armour counters,
   hunger info, Quick Play "Play Romanica" button.
2. Server API plugin for other servers (also fixes G3).
3. Voice chat support.
4. Launcher: log viewer + crash analysis, modpack export.
5. Romanica-only H items from 12a (mine HUD, enchant tooltips, event alerts,
   pickaxe skins) alongside the day-one list (12b).
6. M items as the phases they belong to come up; L items only on player demand.

## 13. Switching gaps: seamless and worth it (review 2026-10-25)

Owner goal: switching to RomanicaClient should be seamless and clearly
beneficial. Walking the switch step by step, these are the gaps not covered by
sections 10 (import), 12 (features) and 12b (day-one list).

### Getting it installed

**S1. First launch is slow.** The installer is ~105 MB and the first launch then
downloads the whole game (assets and libraries, hundreds of MB) even though the
player already has them. Reuse what's on disk: read assets and libraries from
the vanilla `.minecraft` (and other launchers found by section 10), verify their
hashes, and copy or hard-link instead of downloading. A switcher's first launch
should take about as long as a normal game start.

**S2. Two ways in, not one.** Some players won't change launcher. Publish
RomanicaClient on Modrinth (G7) so it installs into the Modrinth App, Prism and
CurseForge as a normal mod, and keep the launcher as the full experience. Both
paths get the same features.

### Signing in

**S3. One sign-in, not two.** Today the launcher and the client each have their
own Microsoft account store, so a player can end up signing in twice. Share one
encrypted account store (B7) between launcher and client: sign in once in the
launcher, the client already knows the account. Still never import other
launchers' tokens (section 10).

### What they'd lose by switching

**S4. Bought cosmetics.** Players who paid for cosmetics in another client lose
them in ours, and that's a real reason not to switch. They can't be transferred.
Be upfront on the features page, and offer what we can at no hosting cost:
show capes from public cape providers (OptiFine, MinecraftCapes and similar,
display only, opt-in per provider, as planned in 6b before custom capes were
dropped). Their own client's closed cosmetics stay theirs.

**S5. 1.8.9 PvP players.** The biggest PvP audiences (and much of Lunar's and
Badlion's) play 1.8.9. Until multi-version phase C, they can still join 1.8
servers from 26.3 through ViaFabricPlus, with old-combat visuals as close as it
allows, plus 1.7 animations (section 5). Say so clearly; don't claim 1.8.9 support
until phase C ships.

**S6. Their friends.** Friends lists in other clients don't come with them. Xbox
friends (section 11) cover most of it; Discord join covers the rest. The first-run
screen (D18) should point to both.

### Proving it's better

**S7. Benchmarks.** "Better than your old client" needs numbers. On the owner's
PC (and one weak PC), measure RomanicaClient against the most common clients
switchers come from, same scene and settings (6c test plan), and publish the
method and results on the features page. If we're not ahead somewhere, fix it
before claiming it.

**S8. A comparison page.** One honest page on romanica.net: what you keep, what
you gain (free, no ads, open source, Bedrock servers, Console, Romanica features),
what you lose (S4, S5), and how to switch in three steps. Doubles as SEO (G8).

### Safety net

**S9. Easy way back.** Switching feels safe when undoing it is easy. Imports only
copy (section 10), so the old launcher keeps working; add "Open your old
launcher" and "Export my settings and worlds" (D16) so nobody feels locked in.

**S10. Allowed on their servers.** A switcher's first worry is "will this get me
banned on Hypixel?". Check RomanicaClient's default module set against the big
servers' allowed-mods rules, ship server-specific safe defaults (profiles switched
by server address, 6e), and publish a short allowed-mods page per major server
(G3).

**S11. Help during the switch.** A pinned "Switching from another client?" guide
and a Discord channel for it (G15), plus an in-client "Report a problem" that
attaches the redacted log.

### Order

1. S3 one sign-in and S1 fast first launch (they shape the first five minutes).
2. S10 allowed-on-their-servers defaults and page.
3. Section 10 importers (vanilla first) with S9 safety net.
4. S7 benchmarks, then S8 comparison page.
5. S2 Modrinth listing (after the brand rename and Azure swap, G7).
6. S4 public cape display, S5 messaging, S6 first-run pointers, S11 guide.

## 14. Win over everyone: launcher+client as one, Bedrock players, other clients' users, AFK users, every version

Owner direction (2026-10-25): make the launcher and client tightly integrated;
show capes from other cape plugins/providers; give Bedrock players everything so
they lose nothing; find every reason people love other clients and AFK tools and
cover it; support all the versions people love. Research sources at the end;
most are guides and community posts, so treat popularity claims as opinion.

### 14.1 Launcher and client as one product

Today they're two programs that happen to share a brand. Make them one:

- **One account store** (S3, encrypted B7): sign in once, both know you.
- **One settings and profile store**: HUD layout, keybinds, per-server profiles
  live in one place the launcher can show and edit, and back up (0a).
- **Live link while playing**: a loopback-only local connection (random port,
  per-session secret) between launcher and client:
  - client shows Console accounts and lets you "play as" one (6d);
  - launcher shows what you're playing, server, playtime;
  - in-game menu opens launcher features: content browser (C11), instances,
    imports (10), performance settings (P9), crash reports (C14).
- **One updater**: the launcher updates itself, the client and the pack together,
  with the same channels (C10) and the same evidence gates.
- **One look**: shared design tokens (`docs/design/`), so launcher and in-game
  menus feel like the same app.
- **Quick Play** from the launcher straight into Romanica or any saved server (12).

### 14.2 Capes from other providers: approved

Owner decision: show capes and cosmetics from other cape plugins/providers
(OptiFine, MinecraftCapes and similar public sources), display only, as in 6b's
"seeing their capes" plan: per-provider setting, cached, no Romanica hosting,
never copying their images into our repos. Check each provider's terms first.

### 14.3 Bedrock players: everything they'd miss

Why players pick Bedrock today, and RomanicaClient's answer:

| Bedrock reason | Our answer | Status |
|---|---|---|
| Play with friends on console/phone | Join Bedrock servers (ViaBedrock add-on, tested on CubeCraft); Bedrock friends join Romanica (Geyser); host a world that Bedrock friends can join (host-a-world + Geyser, 6) | Partly working; friend-hosted Bedrock worlds untested |
| Runs well on weak PCs | Performance stack, hardware-aware defaults (6c), benchmark vs Bedrock on a weak PC (S7) | Planned; must be proven |
| Easy, no setup | One installer, one sign-in, Quick Play | Planned |
| Controller (and touch) | Controller support (D15); touch is limited on Java, say so | Planned |
| Featured servers (The Hive, CubeCraft…) | Joinable via ViaBedrock | Experimental |
| Realms (Bedrock) | Add-on claims Realms support | Untested |
| Ray tracing (RTX) | Iris shaders incl. path-traced packs | Partial (different look) |
| Bedrock-style controls (e.g. bridging by placing against the block you stand on) | Optional client setting on servers that allow it; never on by default | To evaluate |
| Bedrock-style UI | Optional "Bedrock-style" theme for menus/inventory | Candidate |
| Marketplace skins, worlds, add-ons | Free instead: upload any skin you want (Mojang's skin upload, through the skin screen), any cape through cape mods/providers (14.2, e.g. MinecraftCapes), and any mods, resource packs, shaders and worlds through the content browser (C11). Marketplace purchases themselves can't move over | Free alternative |
| Persona/character-creator skins | Regular Java skins (standard and slim, any design, uploaded free through the skin screen) | Java skins |
| Xbox achievements / gamerscore | Minecraft's own Java achievements (advancements), plus a RomanicaClient achievements view and Romanica server achievements (the plugin already has them) | Java achievements |

"Lose nothing" covers playing with friends, servers, performance, ease, skins,
capes, content and achievements (Java's own, free). What can't move over is
anything bought on the Marketplace; the comparison page (S8) says that plainly.

### 14.4 Why people love other clients, and our cover

From the research and section 12: (1) better FPS than vanilla, especially on weak
PCs; (2) everything built in, no mod setup; (3) free; (4) cosmetics; (5) friends
and chat; (6) approved on big servers (Hypixel); (7) PvP features; (8) a clean
look. Our cover: (1) 6c + S7 proof, (2) the pack + presets, (3) free forever,
(4) official capes + other providers' capes (14.2) + emotes, (5) Xbox friends +
Discord, (6) allowed-mods work (S10, G3) and the server API plugin (12),
(7) section 12 PvP list, (8) PRODUCT.md design rules. Plus what they don't have:
open source, no ads, Bedrock servers, Console, Romanica features (12a).

### 14.5 AFK and console tools: the full feature set

Collected from OQMineBot (the owner's favourite; its official site and listing,
2026-10-25: cloud-hosted browser dashboard, free plugins for SkyBlock AFK alts,
macros, auto-farming, mob grinding, auto-fishing and cobblestone-generator
farms, Baritone-style pathfinding, a macro builder, a plugin API, 1.8 to 26.2,
paid plans for 10-75 bots), Minecraft Console Client (MCC) and common open-source
AFK bots. Ours is local and free, with no bot cap (join queue instead).
**Accounts** (owner request 2026-10-25, see "Accounts policy" below): any number
of the player's own Microsoft accounts, plus offline ("cracked") accounts once an
owned copy is verified. Alt-account services such as TheAltening are not
integrated. everything below goes into Console (6d),
Java and Bedrock (mineflayer / bedrock-protocol, or ViaBedrock), within each
server's rules and the hard lines (no anticheat evasion, no spam, no PvP or
griefing automation):

- Anti-AFK movement modes: jump, sneak, small circle, random walk, look around.
- Auto-relog/reconnect with backoff (done: 6d), join queue (section 11).
- Move to a block/coordinates after joining; chunk loading in place.
- Script scheduler (timed actions), auto-respond rules, periodic messages
  (rate-limited, owner hard line against spam).
- Auto-eat, auto-respawn, leave on low health (done: 6d).
- Auto-fish, auto-drop/auto-craft, basic inventory management: player's choice
  per server; on Romanica governed by the server's rules (server-gated like the
  client's existing auto-fish).
- Mob-only auto-attack for AFK farms where the server allows it; never players.
- Chat log, keyword alerts, mail/message relay, desktop + optional Discord
  webhook alerts (done: 6d).
- Local remote control: a loopback/LAN web dashboard and a documented local API
  (WebSocket) for players who script their own tools. Off by default.
- Session recording (replay) of a bot session.
- **From OQMineBot**: pathfinding (walk to places, around obstacles), a visual
  macro builder (sequence of steps: walk, mine selected blocks, deposit, wait,
  repeat), farm presets (crops, mob grinders, cobblestone generators, fishing),
  SkyBlock presets, and a plugin system so players can share their own macros
  and presets. All of it is the player's choice per server and follows that
  server's rules; on Romanica the plugin decides what's allowed (AFK and bots are
  allowed, section 6d).
- Play-as with rejoin (done: 6d); seamless handover later.

### 14.6 Every version people love

Data: an undated bStats (test site) snapshot of ~155k servers showed 1.21.4
~22%, 1.21.1 ~18%, 1.21.3 ~10%, 1.20.1 ~9%, 1.20.4 ~8%, 1.8.8 ~4%; plus the
owner's research list (26.3, 26.2, 26.1.2, 1.21.11, 1.21.9, 1.21.5, 1.21.1,
1.20.2, 1.20.1, 1.19.2, 1.18.2, 1.16.5, 1.15.2, 1.14.4, 1.12.2, 1.10.2, 1.8.9,
1.7.10, b1.7.3). Re-check live bStats before committing.

"All versions supported" splits into three layers, done in this order:

1. **Join any server version** from the latest client: ViaFabricPlus (already
   in the pack). Covers server compatibility for every version now.
2. **Launch any version** in the launcher (vanilla, Fabric, Forge, NeoForge,
   Quilt, OptiFine: sections 2-3). Every version on the list becomes playable,
   with the performance preset where one exists.
3. **RomanicaClient features on a version**: full features on the top tier
   (26.x, 1.21.11, 1.21.1), then 1.20.1 and 1.8.9; a lighter "core" build (HUD,
   keystrokes, zoom, freelook, profiles) for the rest, built from the shared
   `common` module so one feature change reaches every version.

## Sources for section 14

- [Briggo: Bedrock vs Java 2026](https://briggo.com/en/guides/minecraft-bedrock-vs-java)
- [Sportskeeda: reasons Bedrock is better](https://sportskeeda.com/minecraft/5-reasons-minecraft-bedrock-better-java)
- [GGServers: why some refuse Bedrock](https://ggservers.com/blog/why-some-players-refuse-to-play-minecraft-bedrock-edition/)
- [Lunar: what is Lunar Client](https://www.lunarclient.com/news/what-is-lunar-client)
- [BisectHosting: what makes a good client](https://www.bisecthosting.com/zh-cn/blog/what-makes-a-good-minecraft-client)
- [MCC on 9minecraft](https://www.9minecraft.net/minecraft-console-client), [wiki.vg client list](https://wiki.vg/Client_List)
- [Afk-Bot (GitHub)](https://github.com/hackerthatknow/Afk-Bot), [Minecraft-bot (GitHub)](https://github.com/KTGAMER/Minecraft-bot)
- [bStats Bukkit global (test site)](https://test.bstats.org/global/bukkit)
- [Game Server Kings: 2026 version numbering](https://www.gameserverkings.com/knowledge-base/minecraft/updating-your-server-version/)

## 15. Local server hosting and world joining

Owner direction (2026-10-25): good local hosting features so players can host
and join worlds easily. Everything runs on the player's PC; **zero cost to
Romanica** (6d rule). Builds on host-a-world (section 6).

### Hosting

- **One click from any world**: "Host this world" on a singleplayer world (or a
  new one). The launcher converts it into a local server world (copy, original
  kept, 0a) and starts it. "Back to singleplayer" copies it back.
- **Server software chosen for them**: Paper for vanilla/plugin worlds (fast,
  plugin-capable; not Folia, 6c); a Fabric/NeoForge server for modded
  instances, with the instance's mods. Java runtime managed like the game's.
- **Everyone can join**:
  - Bedrock friends: Geyser + Floodgate installed and configured automatically.
  - Other Java versions: ViaVersion/ViaBackwards (and ViaRewind for 1.8).
- **Settings without config files**: game mode, difficulty, slots, MOTD, world
  seed, game rules, PvP, whitelist, view and simulation distance, hardware-aware
  RAM (P1).
- **Plugins, mods and data packs** for the hosted server from Modrinth/Hangar,
  filtered by version.
- **Admin panel**: live console, player list, kick/ban/op, chat, TPS and memory.
- **Runs in the background** while the host plays; optional auto-stop when
  everyone has left for N minutes; pre-generate chunks (Chunky) for smooth
  exploring.
- **Backups**: automatic scheduled world backups, restore, and a backup before
  every server or version update.

### Letting friends in (no Romanica relay)

In order of ease:

1. **LAN**: automatic on the same network.
2. **e4mc** (already in the client): a free tunnel for Java, no setup. Third-party
   service, no cost to us; check its limits and terms.
3. **Automatic port opening (UPnP)** on routers that allow it, with a clear
   warning about exposing the PC, and a test that the port is reachable.
4. **Player's own tunnel** (playit.gg, ngrok and similar): the player signs up
   and pastes their tunnel; needed for Bedrock friends behind strict routers
   because Bedrock uses UDP.
5. Manual port-forwarding guide on romanica.net (hosting docs, G8).

### Joining

- **Invite**: a copy-paste address or join code, a Discord "Join" button through
  Rich Presence (14.4 / section 11), and a "Join friend" entry for Xbox friends
  who are hosting through RomanicaClient.
- **Modded worlds in one click**: friends with RomanicaClient get the host's mod
  list offered as an instance (shared like a `.mrpack`), install it and join;
  no manual mod matching.
- **Bedrock friends** just add the address in Bedrock (Geyser handles them).

### Security defaults

- Online mode on (real Microsoft accounts only; Floodgate verifies Bedrock).
- Invite-only (whitelist) by default for internet hosting; open only if chosen.
- Console and admin panel local only; never exposed to the network.
- Warn before UPnP/port-forwarding; show what's exposed.

### 24/7 servers

Local hosting runs only while the PC is on. For 24/7, the hosting guides on
romanica.net (G8, approved) explain moving the world to a host; RomanicaClient
can export the server folder ready to upload.

### Evidence

CI: start Paper + Geyser + ViaVersion from the launcher's hosting code on a
runner, join with a headless Java bot and a headless Bedrock bot (Console's
libraries), check both appear in the player list, stop cleanly, backup created.
Tunnels, UPnP and real friends: owner's PC.

### Order

1. Host this world (Paper) + LAN + e4mc + admin panel + backups.
2. Geyser/Floodgate and ViaVersion for mixed friends.
3. Invites (code, Discord join), modded-world one-click join.
4. UPnP and player-tunnel support, hosting guides.
5. Plugin/mod browser for the hosted server, auto-stop, pre-generation.

### Sources (OQMineBot)

- [OQMineBot](https://minecraftbot.com/), [Console Client page](https://minecraftbot.com/console-client/), [plugin base](https://github.com/OnlyQubes/OQ.MineBot.PluginBase)

## 16. Accounts policy (owner request 2026-10-25)

**Microsoft accounts**: any number, all the player's own, signed in through the
spaced queue (G11).

**Offline ("cracked") accounts: allowed, gated on an owned copy.** Same rule
Prism Launcher uses: offline accounts can only be added while a Microsoft account
that owns Minecraft is signed in, verified with the Minecraft services
entitlement check the client already has (`checkOwnership` in `MSApi.kt`).
Re-check periodically; if no owning account remains, offline accounts stop
working. Used only for servers running in offline mode (many cracked servers,
LAN, the host's own offline test server). Microsoft's terms don't name this case
explicitly; it's common practice, not a guarantee, and worth a lawyer's check
before it's advertised. Offline names can impersonate others on offline-mode
servers; that's the server's responsibility, and the UI says so.

**Alt-account services (TheAltening and similar): not integrated.** Reasons:
- Microsoft's terms forbid buying, selling or sharing accounts, which is what
  these services do, and many such accounts are stolen from real players.
- They work by routing the session through the service's own login servers
  instead of Microsoft's, i.e. the client would send player sessions to a third
  party.
- Building it in risks Romanica's approved Azure app, invites antivirus flags
  (G13) and contradicts the clean, open-source client (sections 11, 6e).
