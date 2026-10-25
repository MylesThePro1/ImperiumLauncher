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
2. **Own friends/chat backend.** Today the friends and chat screens talk to
   **AxolotlClient upstream's service (`api.axolotlclient.com`)**, not ours. Same
   class of risk as the borrowed Azure ID: their outage, policy or shutdown is our
   outage, and players' social graph lives on a third party. Move it to
   api.romanica.net, then add Xbox friends (below).
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

## 7. Suggested order

1. Launcher stable: Fabric manifest fix, release, smoke with real game log.
2. Friends backend off upstream (risk reduction, no new features).
3. Xbox friends spike (one real sign-in, no UI).
4. Instance model + phase A versions + performance preset.
5. Host-a-world (Java first, then Geyser).
6. Replay clips.
7. Phase B loaders/versions, then phase C.
