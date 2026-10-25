const test   = require('node:test')
const assert = require('node:assert')
const os     = require('os')

const { sandboxElectron } = require('./helpers/stubs')
sandboxElectron()
const ConfigManager = require('../app/assets/js/configmanager')

const GB = 1073741824
const RAM = { recommended: 4096, minimum: 2048 }

function withTotalMem(bytes, fn){
    const real = os.totalmem
    os.totalmem = () => bytes
    try { return fn() } finally { os.totalmem = real }
}

test('the default heap never exceeds what a small PC can spare', () => {
    assert.strictEqual(withTotalMem(4 * GB, () => ConfigManager._resolveSelectedRAM(RAM)), '3072M')
})

test('the default heap never drops below the server minimum', () => {
    assert.strictEqual(withTotalMem(2 * GB, () => ConfigManager._resolveSelectedRAM(RAM)), '2048M')
})

test('PCs with room get the server recommendation', () => {
    assert.strictEqual(withTotalMem(8 * GB, () => ConfigManager._resolveSelectedRAM(RAM)), '4096M')
    assert.strictEqual(withTotalMem(32 * GB, () => ConfigManager._resolveSelectedRAM(RAM)), '4096M')
})
