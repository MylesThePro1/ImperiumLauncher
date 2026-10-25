const test   = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')
const fs     = require('fs-extra')
const os     = require('os')
const path   = require('path')
const { getMojangOS } = require('helios-core/common')

const { buildChecklist, verifyFiles } = require('../app/assets/js/fileverifier')

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex')

const NATIVES = { windows: 'natives-windows', linux: 'natives-linux', osx: 'natives-osx' }

// A mojang processor/server pair shaped like buildChecklist consumes them.
function checklistFixture(dir){
    return {
        mojang: {
            commonDir: dir,
            assetPath: path.join(dir, 'assets'),
            assetIndex: { objects: { stone: { hash: 'a'.repeat(40), size: 10 } } },
            versionJson: {
                id: '26.3',
                libraries: [],
                downloads: { client: { sha1: 'c'.repeat(40), size: 20, url: 'https://example.invalid/client.jar' } },
                logging: { client: { file: { id: 'client-1.12.xml', sha1: 'f'.repeat(40), size: 5, url: 'https://example.invalid/log.xml' } } }
            }
        },
        server: {
            modules: [{
                rawModule: { id: 'com.romanica:pack', artifact: { MD5: 'd'.repeat(32), size: 7, url: 'https://example.invalid/pack.jar' } },
                getPath: () => path.join(dir, 'mods', 'pack.jar'),
                hasSubModules: () => false
            }]
        }
    }
}

const artifact = (path_, seed) => ({ sha1: seed.repeat(40), size: 3, url: `https://example.invalid/${path_}`, path: path_ })

test('buildChecklist covers assets, plain and native libraries, the client jar, the log config and modules', async (t) => {
    const { dir } = await fixture(t)
    const { mojang, server } = checklistFixture(dir)
    mojang.versionJson.libraries = [
        { name: 'org.example:plain:1.0', rules: null, natives: null, downloads: { artifact: artifact('org/example/plain-1.0.jar', 'a') } },
        { name: 'org.example:native:1.0', rules: null, natives: NATIVES, downloads: { classifiers: {
            'natives-windows': artifact('org/example/native-1.0-windows.jar', 'b'),
            'natives-linux': artifact('org/example/native-1.0-linux.jar', 'b'),
            'natives-osx': artifact('org/example/native-1.0-osx.jar', 'b')
        } } }
    ]

    const byId = Object.fromEntries(buildChecklist(mojang, server).map(item => [item.id, item]))
    for(const id of ['stone', 'org.example:plain:1.0', 'org.example:native:1.0', '26.3 client', 'client-1.12.xml', 'com.romanica:pack']){
        assert.ok(byId[id] != null, `${id} must be in the checklist`)
    }
    // The native entry must be the classifier for this OS, not another platform's.
    assert.strictEqual(byId['org.example:native:1.0'].url, `https://example.invalid/org/example/native-1.0-${getMojangOS()}.jar`)
})

test('a compatible library with no artifact in the manifest is skipped, not fatal', async (t) => {
    const { dir } = await fixture(t)
    const { mojang, server } = checklistFixture(dir)
    mojang.versionJson.libraries = [
        { name: 'org.example:broken:1.0', rules: null, natives: null, downloads: {} },
        { name: 'org.example:worse:1.0', rules: null, natives: null },
        { name: 'org.example:plain:1.0', rules: null, natives: null, downloads: { artifact: artifact('org/example/plain-1.0.jar', 'a') } }
    ]

    const items = buildChecklist(mojang, server)
    const ids = items.map(item => item.id)
    assert.ok(!ids.includes('org.example:broken:1.0') && !ids.includes('org.example:worse:1.0'), ids.join(', '))
    // The launch must go on: everything else is still checked.
    assert.ok(ids.includes('org.example:plain:1.0') && ids.includes('26.3 client'), ids.join(', '))
})

test('a native library with no classifier for this OS is skipped, not fatal', async (t) => {
    const { dir } = await fixture(t)
    const { mojang, server } = checklistFixture(dir)
    // Classifiers for every OS except the one running the test.
    const otherOs = Object.keys(NATIVES).filter(os => os !== getMojangOS())
    const classifiers = Object.fromEntries(otherOs.map(os => [NATIVES[os], artifact(`org/example/native-1.0-${os}.jar`, 'b')]))
    mojang.versionJson.libraries = [
        { name: 'org.example:no-classifiers:1.0', rules: null, natives: NATIVES, downloads: {} },
        { name: 'org.example:other-os-only:1.0', rules: null, natives: NATIVES, downloads: { classifiers } }
    ]

    const ids = buildChecklist(mojang, server).map(item => item.id)
    assert.ok(!ids.includes('org.example:no-classifiers:1.0') && !ids.includes('org.example:other-os-only:1.0'), ids.join(', '))
    assert.ok(ids.includes('26.3 client'), 'the checklist past the skipped libraries is still built')
})

async function fixture(t){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperium-verify-'))
    t.after(() => fs.remove(dir))
    const write = async (name, content) => {
        const p = path.join(dir, name)
        await fs.writeFile(p, content)
        return { id: name, path: p, hash: sha1(Buffer.from(content)), algo: 'sha1', size: Buffer.byteLength(content), url: `https://example.invalid/${name}` }
    }
    return { dir, write }
}

// Counts real hashes so the tests can tell a cache hit from a re-hash.
function countingHasher(){
    const calls = []
    const hashFile = async (p) => {
        calls.push(p)
        return sha1(await fs.readFile(p))
    }
    return { hashFile, calls }
}

test('valid files pass, and a second run trusts the cache instead of re-hashing', async (t) => {
    const { dir, write } = await fixture(t)
    const items = [await write('a', 'alpha'), await write('b', 'bravo')]
    const first = countingHasher()
    assert.deepStrictEqual(await verifyFiles(items, { cacheDir: dir, hashFile: first.hashFile }), [])
    assert.strictEqual(first.calls.length, 2)

    const second = countingHasher()
    assert.deepStrictEqual(await verifyFiles(items, { cacheDir: dir, hashFile: second.hashFile }), [])
    assert.strictEqual(second.calls.length, 0, 'unchanged files must not be re-hashed')
})

test('a file changed after caching is re-hashed and caught', async (t) => {
    const { dir, write } = await fixture(t)
    const item = await write('a', 'alpha')
    await verifyFiles([item], { cacheDir: dir })
    await fs.writeFile(item.path, 'tampered')
    const hasher = countingHasher()
    const invalid = await verifyFiles([item], { cacheDir: dir, hashFile: hasher.hashFile })
    assert.deepStrictEqual(invalid.map(i => i.id), ['a'])
    assert.strictEqual(hasher.calls.length, 1)
})

test('missing files and wrong hashes are reported, and failures never enter the cache', async (t) => {
    const { dir, write } = await fixture(t)
    const good = await write('good', 'ok')
    const bad = { ...(await write('bad', 'content')), hash: sha1(Buffer.from('something else')) }
    const missing = { id: 'missing', path: path.join(dir, 'nope'), hash: sha1(Buffer.from('x')), algo: 'sha1', size: 1, url: 'u' }
    const invalid = await verifyFiles([good, bad, missing], { cacheDir: dir })
    assert.deepStrictEqual(invalid.map(i => i.id).sort(), ['bad', 'missing'])

    // The bad file must be hashed again next time, not trusted from the cache.
    const hasher = countingHasher()
    await verifyFiles([bad], { cacheDir: dir, hashFile: hasher.hashFile })
    assert.strictEqual(hasher.calls.length, 1)
})

test('progress counts every file and finishes at 100%', async (t) => {
    const { dir, write } = await fixture(t)
    const items = []
    for(let i = 0; i < 20; i++){
        items.push(await write(`f${i}`, `content ${i}`))
    }
    const updates = []
    await verifyFiles(items, { cacheDir: dir, onProgress: (p) => updates.push(p) })
    const last = updates[updates.length - 1]
    assert.deepStrictEqual(last, { checked: 20, total: 20, percent: 100 })
    for(let i = 1; i < updates.length; i++){
        assert.ok(updates[i].checked >= updates[i - 1].checked, 'progress must not go backwards')
    }
})

test('an unreadable cache file is ignored, not fatal', async (t) => {
    const { dir, write } = await fixture(t)
    await fs.writeFile(path.join(dir, '.verified-files.json'), '{not json')
    assert.deepStrictEqual(await verifyFiles([await write('a', 'alpha')], { cacheDir: dir }), [])
})
