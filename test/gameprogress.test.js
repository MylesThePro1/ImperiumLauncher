const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs-extra')
const os     = require('os')
const path   = require('path')

const { createTracker, tailGameLog } = require('../app/main/gameprogress')

// Real lines from a 26.3 Fabric client boot (Romanica pack, 2026-10-22), in log order.
const BOOT = [
    '[17:11:16] [main/INFO]: Loading Minecraft 26.3 with Fabric Loader 0.19.5',
    '[17:11:17] [main/INFO]: SpongePowered MIXIN Subsystem Version=0.8.7 Source=file:/C:/x',
    '[17:11:19] [main/INFO]: Searching for graphics cards...',
    '[17:11:22] [Datafixer Bootstrap #0/INFO]: 307 Datafixer optimizations took 534 milliseconds',
    '[17:11:29] [main/INFO]: Completely ignored arguments: [--userType, legacy]',
    '[17:11:32] [Render thread/INFO]: Backend library: LWJGL version 3.4.3-snapshot',
    '[17:11:35] [Render thread/INFO]: Reloading ResourceManager: vanilla, fabric',
    '[17:11:37] [Render thread/INFO]: Sound engine started',
    '[17:11:37] [Render thread/INFO]: Created: 2048x2048x4 minecraft:textures/atlas/blocks.png-atlas'
]
const KEYS = ['gameLoadingMods', 'gamePatchingMods', 'gameCheckingGraphics', 'gamePreparingData',
    'gameStartingRenderer', 'gameOpeningWindow', 'gameLoadingResources', 'gameReady']

test('each boot stage moves the bar forward and the last one finishes', () => {
    const tracker = createTracker()
    const seen = BOOT.map(line => tracker.feed(line)).filter(s => s != null)
    assert.deepStrictEqual(seen.map(s => s.key), KEYS)
    for(let i = 1; i < seen.length; i++){
        assert.ok(seen[i].percent > seen[i - 1].percent)
    }
    assert.strictEqual(seen[seen.length - 1].done, true)
    assert.strictEqual(seen.slice(0, -1).some(s => s.done), false)
})

test('a chunk with several lines reports the furthest stage', () => {
    const tracker = createTracker()
    assert.strictEqual(tracker.feed(BOOT.slice(0, 3).join('\r\n')).key, 'gameCheckingGraphics')
})

test('stages never go backwards or repeat', () => {
    const tracker = createTracker()
    tracker.feed(BOOT[6])
    assert.strictEqual(tracker.feed(BOOT[0]), null, 'an earlier stage after a later one is ignored')
    assert.strictEqual(tracker.feed(BOOT[6]), null, 'the same stage twice is ignored')
})

test('unrelated output is ignored', () => {
    assert.strictEqual(createTracker().feed('[x] [main/WARN]: something unrelated'), null)
})

test('tailGameLog ignores the previous run\'s log, then follows the new one as it grows', async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperium-tail-'))
    t.after(() => fs.remove(dir))
    const log = path.join(dir, 'logs', 'latest.log')
    await fs.ensureDir(path.dirname(log))
    await fs.writeFile(log, 'old run: Sound engine started\n')

    const seen = []
    const stop = tailGameLog(dir, (text) => seen.push(text), 50)
    t.after(stop)
    await new Promise(r => setTimeout(r, 200))
    assert.strictEqual(seen.join(''), '', 'the previous run must not be read')

    // The game rotates the old log away and starts a new one.
    await fs.remove(log)
    await fs.writeFile(log, `${BOOT[0]}\n`)
    await new Promise(r => setTimeout(r, 250))
    await fs.appendFile(log, `${BOOT[7]}\n`)
    await new Promise(r => setTimeout(r, 250))
    const text = seen.join('')
    assert.ok(text.includes('Loading Minecraft') && text.includes('Sound engine started'), text)
    assert.ok(!text.includes('old run'))
})

test('a new run reusing the file identity with content at least the baseline size is still delivered', async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperium-tail-reuse-'))
    t.after(() => fs.remove(dir))
    const log = path.join(dir, 'logs', 'latest.log')
    await fs.ensureDir(path.dirname(log))
    const oldRun = Array.from({ length: 8 }, (_, i) => `old run line ${i}: nothing to see`).join('\n') + '\n'
    await fs.writeFile(log, oldRun)

    const seen = []
    const stop = tailGameLog(dir, (text) => seen.push(text), 50)
    t.after(stop)
    await new Promise(r => setTimeout(r, 200))
    assert.strictEqual(seen.join(''), '', 'the previous run must not be read')

    // In-place overwrite: same file identity (fs.writeFile truncates, it does not
    // delete), new content longer than the baseline — identity and size alone
    // cannot tell this run from the previous one, content must.
    const newRun = BOOT.join('\n') + '\n'
    assert.ok(newRun.length >= oldRun.length)
    await fs.writeFile(log, newRun)
    await new Promise(r => setTimeout(r, 300))
    const text = seen.join('')
    assert.ok(text.includes('Loading Minecraft') && text.includes('Sound engine started'), text)
    assert.ok(!text.includes('old run line'), text)
})

test('the old run still appending to its own log is not mistaken for a new run', async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperium-tail-append-'))
    t.after(() => fs.remove(dir))
    const log = path.join(dir, 'logs', 'latest.log')
    await fs.ensureDir(path.dirname(log))
    await fs.writeFile(log, `${BOOT[0]}\n`)

    const seen = []
    const stop = tailGameLog(dir, (text) => seen.push(text), 50)
    t.after(stop)
    await new Promise(r => setTimeout(r, 200))
    assert.strictEqual(seen.join(''), '', 'the previous run must not be read')

    // The previous game still holds the log open and keeps chatting into it.
    // Delivering that would fast-forward the stage tracker on stale content.
    await fs.appendFile(log, `${BOOT[7]}\n`)
    await new Promise(r => setTimeout(r, 250))
    assert.strictEqual(seen.join(''), '', 'the old run appending is not a new run')
})
