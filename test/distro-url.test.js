const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs')
const path   = require('path')

/**
 * The smoke override for the distribution URL only ever applies to a smoke
 * run, so players always read master's index.
 */

// distromanager pulls in helios-core at require time; load only the pure
// resolver by evaluating the module with stubbed dependencies.
function loadResolver(){
    const Module = require('module')
    const file = path.join(__dirname, '..', 'app', 'assets', 'js', 'distromanager.js')
    const m = new Module(file, module)
    m.filename = file
    m.paths = Module._nodeModulePaths(path.dirname(file))
    const realRequire = m.require.bind(m)
    m.require = (id) => {
        if(id === 'helios-core/common') return { DistributionAPI: class {} }
        if(id === './configmanager') return { getLauncherDirectory: () => '' }
        return realRequire(id)
    }
    m._compile(fs.readFileSync(file, 'utf8'), file)
    return m.exports
}

const distro = loadResolver()
const BRANCH = 'https://raw.githubusercontent.com/Romanica-MC/RomanicaLauncher/abc123/distribution/distribution.json'

test('players read the master index', () => {
    assert.strictEqual(distro.resolveDistroUrl({}), distro.MASTER_DISTRO_URL)
})

test('the override is ignored outside a smoke run', () => {
    assert.strictEqual(distro.resolveDistroUrl({ IMPERIUM_SMOKE_DISTRO_URL: BRANCH }), distro.MASTER_DISTRO_URL)
})

test('a smoke run reads the index of the commit under test', () => {
    assert.strictEqual(distro.resolveDistroUrl({ IMPERIUM_SMOKE_LAUNCH: '1', IMPERIUM_SMOKE_DISTRO_URL: BRANCH }), BRANCH)
})

test('a non-https override is refused', () => {
    assert.strictEqual(distro.resolveDistroUrl({ IMPERIUM_SMOKE_LAUNCH: '1', IMPERIUM_SMOKE_DISTRO_URL: 'http://evil.invalid/d.json' }), distro.MASTER_DISTRO_URL)
})

