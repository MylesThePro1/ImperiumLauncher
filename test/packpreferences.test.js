const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs-extra')
const os     = require('os')
const path   = require('path')

const PackPreferences = require('../app/assets/js/packpreferences')

const BASE = 'Romanica_TexturePack_v2.0.9_26.2_BASE.zip'
const EFFECTS = 'MINARECRAFTORVM_v2.0.1_26.2_EFFECTS.zip'

async function tempGameDir(t, initialOptions){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'romanica-packs-'))
    t.after(() => fs.remove(dir))
    if(initialOptions != null){
        await fs.writeFile(path.join(dir, 'options.txt'), initialOptions, 'UTF-8')
    }
    return dir
}

function readPacks(dir){
    const text = fs.readFileSync(path.join(dir, 'options.txt'), 'UTF-8')
    return PackPreferences.parseResourcePacks(text).entries
}

test('a fresh instance gets BASE enabled on its first pass', async (t) => {
    const dir = await tempGameDir(t, null)
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: false })
    assert.strictEqual(res.addBase, true)
    assert.strictEqual(res.addEffects, false)
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${BASE}`])
})

test('an untouched options.txt (just "vanilla") gains BASE, preserving other keys', async (t) => {
    const dir = await tempGameDir(t, 'musicVolume:0.5\r\nresourcePacks:["vanilla"]\r\nmouseSensitivity:0.5\n')
    PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: false })
    const text = fs.readFileSync(path.join(dir, 'options.txt'), 'UTF-8')
    assert.match(text, /musicVolume:0\.5/)
    assert.match(text, /mouseSensitivity:0\.5/)
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${BASE}`])
})

test('a player with their own packs is never touched for BASE', async (t) => {
    const dir = await tempGameDir(t, 'resourcePacks:["vanilla","file/my_pack.zip"]')
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: false })
    assert.strictEqual(res.addBase, false, 'BASE must not be added over a player-curated list')
    assert.strictEqual(res.wrote, false)
    assert.deepStrictEqual(readPacks(dir), ['vanilla', 'file/my_pack.zip'])
})

test('a second pass is a no-op (idempotent)', async (t) => {
    const dir = await tempGameDir(t, null)
    PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: null, highDetail: false, effectsManaged: false })
    const first = fs.readFileSync(path.join(dir, 'options.txt'), 'UTF-8')
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: null, highDetail: false, effectsManaged: false })
    assert.strictEqual(res.wrote, false, 'nothing to do on the second pass')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'options.txt'), 'UTF-8'), first)
})

test('toggle on adds EFFECTS directly above BASE', async (t) => {
    const dir = await tempGameDir(t, null)
    PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: false })
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: true, effectsManaged: false })
    assert.strictEqual(res.addEffects, true)
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${EFFECTS}`, `file/${BASE}`])
})

test('toggle on without BASE present still enables EFFECTS above vanilla', async (t) => {
    const dir = await tempGameDir(t, 'resourcePacks:["vanilla","file/mine.zip"]')
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: true, effectsManaged: false })
    assert.strictEqual(res.addEffects, true)
    // BASE is not force-added over a curated list; EFFECTS slots in above vanilla.
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${EFFECTS}`, 'file/mine.zip'])
})

test('toggle off removes the EFFECTS entry the launcher wrote, and only that one', async (t) => {
    const dir = await tempGameDir(t, 'resourcePacks:["vanilla","file/my_pack.zip"]')
    PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: true, effectsManaged: false })
    let packs = readPacks(dir)
    assert.ok(packs.includes(`file/${EFFECTS}`), 'setup: EFFECTS must be enabled by the toggle-on pass')

    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: true })
    assert.strictEqual(res.removeEffects, true)
    packs = readPacks(dir)
    assert.ok(!packs.includes(`file/${EFFECTS}`), 'the managed EFFECTS entry must be removed')
    assert.ok(packs.includes('file/my_pack.zip'), 'player packs survive the removal')
})

test('a player-enabled EFFECTS copy is never removed by toggle-off', async (t) => {
    const dir = await tempGameDir(t, `resourcePacks:["vanilla","file/${EFFECTS}"]`)
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: false, effectsManaged: false })
    assert.strictEqual(res.removeEffects, false, 'the launcher does not own an entry it never wrote')
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${EFFECTS}`])
})

test('an unparseable resourcePacks value is left alone', async (t) => {
    const dir = await tempGameDir(t, 'resourcePacks:["vanilla",')
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: EFFECTS, highDetail: true, effectsManaged: false })
    assert.strictEqual(res.wrote, false, 'do not destroy a value the parser cannot understand')
    assert.match(fs.readFileSync(path.join(dir, 'options.txt'), 'UTF-8'), /resourcePacks:\["vanilla",/)
})

test('a distribution without packs (no effectsFile) manages BASE only', async (t) => {
    const dir = await tempGameDir(t, null)
    const res = PackPreferences.applyPackOptions(dir, { baseFile: BASE, effectsFile: null, highDetail: true, effectsManaged: false })
    assert.strictEqual(res.addBase, true)
    assert.strictEqual(res.addEffects, false)
    assert.deepStrictEqual(readPacks(dir), ['vanilla', `file/${BASE}`])
})
