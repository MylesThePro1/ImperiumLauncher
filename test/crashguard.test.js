const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs')
const path   = require('path')

const crashguard = require('../app/main/crashguard')

/**
 * Field report 2026-10-25: with auto-connect on, a game that crashes ~15 s
 * after joining relaunches into the same server and crashes again. After an
 * early crash the next launch must not auto-connect, once.
 */

function fakeConfig(){
    return {
        skip: false,
        saves: 0,
        getSkipAutoConnectOnce(){ return this.skip },
        setSkipAutoConnectOnce(v){ this.skip = v },
        save(){ this.saves++ }
    }
}

test('a crash shortly after launch suspends auto-connect for the next launch only', () => {
    const cfg = fakeConfig()
    assert.strictEqual(crashguard.recordExit(cfg, 1, 15 * 1000), true)
    assert.strictEqual(crashguard.consumeSkip(cfg), true)
    assert.strictEqual(crashguard.consumeSkip(cfg), false)
    assert.ok(cfg.saves >= 2, 'the flag is persisted across launcher restarts')
})

test('a normal quit or a long session leaves auto-connect alone', () => {
    const cfg = fakeConfig()
    assert.strictEqual(crashguard.recordExit(cfg, 0, 15 * 1000), false)
    assert.strictEqual(crashguard.recordExit(cfg, 1, crashguard.EARLY_CRASH_WINDOW_MS + 1), false)
    assert.strictEqual(crashguard.recordExit(cfg, null, 15 * 1000), false)
    assert.strictEqual(crashguard.consumeSkip(cfg), false)
})

test('the config has a persisted default for the flag', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'configmanager.js'), 'utf8')
    assert.match(src, /skipAutoConnectOnce:\s*false/)
    assert.match(src, /exports\.getSkipAutoConnectOnce\s*=/)
    assert.match(src, /exports\.setSkipAutoConnectOnce\s*=/)
})

test('the launch path wires the guard in', () => {
    const pb = fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'js', 'processbuilder.js'), 'utf8')
    assert.match(pb, /consumeSkip\(ConfigManager\)/, 'processbuilder checks the suspension before adding auto-connect args')
    const ls = fs.readFileSync(path.join(__dirname, '..', 'app', 'main', 'launchservice.js'), 'utf8')
    assert.match(ls, /recordExit\(/, 'launchservice records how the game exited')
})
