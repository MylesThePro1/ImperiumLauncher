const test   = require('node:test')
const assert = require('node:assert')
const path   = require('path')

/**
 * The distribution index's half of issue #15: the BASE pack is a required
 * managed file, the EFFECTS pack is the opt-in high-detail layer, and the
 * feature-mod set behind the launcher's "High-detail textures" toggle is
 * exactly what app/assets/js/highdetail.js names. Catches drift between
 * the index, the toggle's exclusion list and the pack wiring.
 */
const distro = require('../distribution/distribution.json')
const HighDetail = require('../app/assets/js/highdetail')

const server = distro.servers[0]
const modules = server.modules
const byVersionless = new Map(modules.map(m => [m.id.split(':').slice(0, 2).join(':'), m]))

test('the BASE pack ships as a required managed file in resourcepacks/', () => {
    const base = modules.find(m => m.id.startsWith(HighDetail.BASE_PACK_MODULE_PREFIX))
    assert.ok(base != null, 'the distribution must carry the BASE pack module')
    assert.strictEqual(base.type, 'File', 'the pack rides the File module type into the instance folder')
    assert.deepStrictEqual(base.required, { value: true, def: true }, 'BASE is required: it is the pack the server pushes')
    assert.match(base.artifact.path, /^resourcepacks\/[^/\\]+\.zip$/, 'artifact.path must land in the instance resourcepacks folder')
    assert.ok(typeof base.artifact.size === 'number' && base.artifact.size > 0)
    assert.match(base.artifact.MD5, /^[0-9a-f]{32}$/)
    assert.match(base.artifact.sha256, /^[0-9a-f]{64}$/)
})

test('the EFFECTS pack ships as the opt-in high-detail layer', () => {
    const effects = modules.find(m => m.id.startsWith(HighDetail.EFFECTS_PACK_MODULE_PREFIX))
    assert.ok(effects != null, 'the distribution must carry the EFFECTS pack module')
    assert.strictEqual(effects.type, 'File')
    assert.deepStrictEqual(effects.required, { value: false, def: false },
        'EFFECTS must default to off: it is gated by the High-detail textures toggle')
    assert.match(effects.artifact.path, /^resourcepacks\/[^/\\]+\.zip$/)
    assert.ok(typeof effects.artifact.size === 'number' && effects.artifact.size > 0)
    assert.match(effects.artifact.MD5, /^[0-9a-f]{32}$/)
})

test('the high-detail toggle set and the distribution index agree exactly', () => {
    for(const id of HighDetail.HIGH_DETAIL_MOD_IDS){
        const module_ = byVersionless.get(id)
        assert.ok(module_ != null, `${id} must be present in the distribution index`)
        assert.deepStrictEqual(module_.required, { value: false, def: false },
            `${id} must be optional and default OFF (the toggle owns its default)`)
    }
    // No drift in the other direction: a def:false FabricMod that reads
    // EFFECTS features must be named in the toggle set.
    const toggled = new Set(HighDetail.HIGH_DETAIL_MOD_IDS)
    for(const module_ of modules){
        if(module_.type !== 'FabricMod' || module_.required == null || module_.required.def !== false){
            continue
        }
        const versionless = module_.id.split(':').slice(0, 2).join(':')
        if(path.basename(module_.artifact.url).match(/entitytexturefeatures|entity_model_features|polytone|skyboxify|yet_another_config_lib/)){
            assert.ok(toggled.has(versionless),
                `${versionless} ships def:false but is missing from highdetail.js HIGH_DETAIL_MOD_IDS`)
        }
    }
})

test('EMF follows ETF (hard loader dependency) and Iris keeps its default', () => {
    const emf = byVersionless.get('com.modrinth:entity-model-features')
    const iris = byVersionless.get('com.modrinth:iris')
    // Smoke run 40662809626: EMF 3.3.12 hard-depends on ETF >=7.2, so
    // EMF must be excluded together with ETF when the toggle is off,
    // else Fabric mod resolution fails and the game never starts.
    assert.ok(emf != null && emf.required.def === false, 'EMF ships with the high-detail layer (default off)')
    assert.ok(HighDetail.HIGH_DETAIL_MOD_IDS.includes('com.modrinth:entity-model-features'))
    assert.ok(iris != null && iris.required.def === true, 'Iris keeps its current default')
})

test('the distro is honest about the launcher version it was generated at', () => {
    const pkg = require('../package.json')
    assert.strictEqual(server.version, pkg.version,
        'server.version is emitted from package.json by generate-distro.cjs; hand-edits must keep them in step')
})

test('no shipped URL references the retired ImperiumClient repo path', () => {
    for(const module_ of modules){
        assert.ok(!module_.artifact.url.includes('/ImperiumClient/'),
            `${module_.id} still points at the renamed ImperiumClient repo`)
    }
})
