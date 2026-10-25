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
   Microsoft; everything else runs on Romanica's own backend (api.romanica.net).
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
| `common/.../api/Constants.kt` | Friends, chat, status API at `api.axolotlclient.com/v1/` | api.romanica.net, signed in with the player's Microsoft account |
| `common/.../auth/MSApi.kt` | In-client Microsoft sign-in uses **upstream's Azure app ID `938592fc-...`** | Romanica's Azure app `8b0c9e33-b6ce-40ec-ac30-c85a35dd8163` (needs the in-client sign-in flow, e.g. device code, enabled on that app) |
| `common/.../api/Constants.kt` | Terms link `axolotlclient.com/terms` | romanica.net/legal/terms |
| `common/src/main/resources/fabric.mod.json`, `TitleScreenMixin.kt` | Upstream homepage + update link to their Modrinth page | romanica.net/client |

"Only Microsoft" in practice: Microsoft provides **who you are** (Xbox sign-in,
already approved) and probably **who your friends are** (Xbox social API, spike
below). Microsoft does not offer a chat, party or presence service for third-party
Minecraft clients, so in-client chat and parties run on Romanica's backend, keyed
by the Microsoft account. That's still no third party.

Order: swap the Azure ID first (smallest, it's identity), then stand up the
friends/chat endpoints on api.romanica.net and point the client at them, then
remove the upstream code paths. Keep the existing screens; only the backend moves.

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
2. **Own friends/chat backend.** See 0c: the screens exist, the backend is
   upstream's. Move it to api.romanica.net, then add Xbox friends (below).
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

Custom capes (owner direction 2026-10-25: player uploads, maybe paid capes):

- **Service on api.romanica.net**: upload a PNG (size + dimension limits,
  standard and HD layouts), stored by UUID, served to RomanicaClient, which
  renders it on players who have one.
- **Moderation is required, not optional.** The audience includes minors and
  uploads will include offensive and copyrighted images. A new cape is visible
  only to its owner until approved; a report button; staff can remove it and ban
  uploaders; takedowns go through the existing /legal/copyright process.
- **Business model** (owner decision 2026-10-25, recorded in RomanicaClient
  `PRODUCT.md`): the client and launcher stay free with every feature, no ads, no
  upsells. Custom cape uploads are a free feature. Paid cosmetics exist only when
  they belong to the server (rank capes, event capes) and are sold through the
  existing Romanica store, never pushed inside the client. Check Mojang's
  commercial usage guidelines before selling, and never imitate official Mojang
  capes.
- **Who sees them**: only RomanicaClient users (and players of mods that read
  our API). Vanilla clients only ever show Mojang capes; a server can't change
  that.

Compatibility with other cape systems:

- **Seeing their capes in our client**: OptiFine, MinecraftCapes, Cosmetica and
  similar services serve capes from public endpoints by player name or UUID, and
  open-source mods already show several of them together. RomanicaClient can
  read the same endpoints at runtime. Each one is a per-provider setting, off
  until the player turns it on: every lookup tells that provider which players
  you're seeing, and it's a dependency on someone else's service (it degrades to
  "no cape", never breaks anything). Check each provider's terms; display only,
  never copy their images into our repos.
- **Our capes in their clients**: only where they choose to read us. Publish a
  simple, documented public endpoint (`/capes/<uuid>.png`) and offer it to
  open-source cape mods as a provider. Closed clients won't show ours.

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
- **Hard lines** (same principle as 6e): no anticheat evasion, no
  auto-mining/auto-clicking for economy gain, no spam, no PvP/griefing
  automation, no account sharing or selling. Romanica runs its own anticheat;
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
- **Store screen**: the plugin sends the catalogue (products, prices, images, the
  player's rank) over the existing Romanica plugin channel; RomanicaClient renders
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
4. **Guard**: a check that fails CI if a new `.java` file appears outside the
   mixin-shell allow-list, or if a shell grows beyond declarations plus one-line
   calls, so the codebase stays Kotlin.

### Found while counting

- `ClientBrandRetrieverMixin` still reports the client brand **"ImperiumClient"**
  to every server, and the client/server channels are still named
  `imperiumclient:*` (`ImperiumClientDataChannels.kt` in the plugin). Renaming the
  brand is a one-liner; renaming the channels must change client and plugin in
  the same release (accept both names for one release, then drop the old). Track
  with the rebrand clean-up, not with the Kotlin work.

## 7. Suggested order

1. Launcher stable: Fabric manifest fix, release, real launch on the owner's PC.
2. Off AxolotlClient (0c): Azure ID swap, then friends/chat on api.romanica.net.
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
9. **Privacy policy and minors.** Friends, chat, cape uploads and the store all
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

### Suggested order for this section

A1, then A2-A6, then B7 (small and urgent), then B8/B9 before friends/chat/store
ship, then C and D alongside the phases they belong to; E as soon as the client
is released widely.
