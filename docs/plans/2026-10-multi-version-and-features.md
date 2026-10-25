# Plan: multi-version launcher, loader support, presets, client feature gaps

Status: **planning only, nothing scheduled.** Owner research (2026-10-25) plus a
check against what the launcher and RomanicaClient actually do today. Ship order
comes after the launcher is stable (Fabric manifest fix + a release that passes
`smoke.yml` with a real `latest.log`).

Ground rules carried into every phase:

- **No hacked clients**, in presets or as installable options (Wurst, Meteor,
  LiquidBounce, Baritone, x-ray). Romanica runs its own anticheat; shipping these
  would be shipping bypass tools for our own server.
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
- **Selling vs free uploads**: if anyone can upload any cape for free, paid
  capes have little value. Options: free moderated uploads plus paid
  animated/limited Romanica capes, or paid upload slots. Sell through the
  existing PayNow store. Check Mojang's commercial usage guidelines before
  selling, and never make capes that imitate official Mojang capes.
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

## 6c. Performance on weak and strong PCs (owner question: Folia-style threading)

Folia (regionised multithreaded ticking) is server software and has no client
equivalent. Singleplayer runs an integrated server that ticks on one main thread
like vanilla; making that Folia-style isn't feasible as a mod (Folia breaks most
mods and vanilla redstone/behaviour assumptions). What already runs in parallel:
chunk meshing on worker threads (much better with Sodium, in the pack), chunk
generation/IO on worker threads in the integrated server, networking, sound.

The levers that work, in order of value:

1. **Hardware-aware launcher defaults.** Today every PC gets the distro's
   recommended 4 GB and the same G1 flags (`configmanager.js`). Instead, pick at
   first launch from total RAM and CPU cores, still overridable in settings:
   - RAM: about 2 GB on 4 GB machines (4 GB there makes Windows swap), 3-4 GB on
     8 GB, 4-6 GB on 16 GB+. More than ~6-8 GB doesn't help this pack.
   - GC: keep G1 by default; try generational ZGC on 16 GB+/6+ core PCs for fewer
     GC stutters.
2. **First-launch graphics preset** from the detected GPU: integrated graphics get
   lower render distance and shaders off; strong GPUs get more. Iris shaders stay
   opt-in.
3. **Parallel chunk mods for singleplayer and hosting**: C2ME (parallel chunk
   generation/IO/lighting) and ScalableLux (parallel lighting) are the closest
   thing to Folia's gains on the client side; they matter most for singleplayer
   and the host-a-world feature (6), less on multiplayer. Add after compatibility
   testing with the current pack.
4. For host-a-world, plain Paper, not Folia: Folia needs many cores and breaks
   most plugins, and friend groups are small.

All of this is performance work, so per AGENTS.md: CI FPS numbers mean nothing
(software rendering). Each change ships with a test plan (scene, settings, before
vs after) run on the owner's PC, ideally on one weak and one strong machine.

## 7. Suggested order

1. Launcher stable: Fabric manifest fix, release, real launch on the owner's PC.
2. Off AxolotlClient (0c): Azure ID swap, then friends/chat on api.romanica.net.
3. Xbox friends spike (one real sign-in, no UI).
4. Instance model with the managed/player-owned split and backups (0a).
5. Import existing installs (0b); any vanilla/Fabric version launches.
6. RomanicaClient builds for phase A versions + performance preset.
7. Host-a-world (Java first, then Geyser).
8. Replay clips.
9. Phase B loaders/versions, then phase C.
