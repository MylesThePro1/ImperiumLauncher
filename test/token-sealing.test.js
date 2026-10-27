const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs-extra')
const path   = require('path')

const { sandboxElectron } = require('./helpers/stubs')

/**
 * config.json held the Minecraft and Microsoft sign-in tokens in plain text.
 * They must be sealed with safeStorage on disk and open again in memory.
 * The fake safeStorage reverses and tags the bytes; the real one is DPAPI.
 */
let available = true
const safeStorage = {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from('SEALED|' + s.split('').reverse().join('')),
    decryptString: (b) => {
        const s = b.toString()
        if(!s.startsWith('SEALED|')) throw new Error('not ours')
        return s.substring(7).split('').reverse().join('')
    }
}
const { userData } = sandboxElectron({ safeStorage })
const ConfigManager = require('../app/assets/js/configmanager')
const configPath = path.join(userData, 'config.json')

const UUID = '0123456789abcdef0123456789abcdef'

function seed(){
    ConfigManager.load()
    ConfigManager.openSealedTokens()
    ConfigManager.addMicrosoftAuthAccount(UUID, 'mc-access-token-xyz', 'Marcus', 1, 'ms-access-token-xyz', 'ms-refresh-token-xyz', 1)
    ConfigManager.save()
}

test('sign-in tokens are not readable in config.json', () => {
    seed()
    const disk = fs.readFileSync(configPath, 'utf8')
    for(const token of ['mc-access-token-xyz', 'ms-access-token-xyz', 'ms-refresh-token-xyz']){
        assert.ok(!disk.includes(token), `${token} must not be stored readable`)
    }
    assert.match(disk, /safe:v1:/)
    // Still usable in memory.
    assert.strictEqual(ConfigManager.getAuthAccount(UUID).microsoft.refresh_token, 'ms-refresh-token-xyz')
})

test('sealed tokens open again after a restart, once the app is ready', () => {
    seed()
    ConfigManager.load()
    assert.match(ConfigManager.getAuthAccount(UUID).accessToken, /^safe:v1:/, 'still sealed before ready')
    assert.strictEqual(ConfigManager.openSealedTokens(), 0)
    const account = ConfigManager.getAuthAccount(UUID)
    assert.strictEqual(account.accessToken, 'mc-access-token-xyz')
    assert.strictEqual(account.microsoft.access_token, 'ms-access-token-xyz')
    assert.strictEqual(account.microsoft.refresh_token, 'ms-refresh-token-xyz')
})

test('tokens saved by an older launcher are sealed on the next start', () => {
    seed()
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    cfg.authenticationDatabase[UUID].microsoft.refresh_token = 'legacy-plain-refresh'
    fs.writeFileSync(configPath, JSON.stringify(cfg))
    ConfigManager.load()
    ConfigManager.openSealedTokens()
    assert.ok(!fs.readFileSync(configPath, 'utf8').includes('legacy-plain-refresh'))
    assert.strictEqual(ConfigManager.getAuthAccount(UUID).microsoft.refresh_token, 'legacy-plain-refresh')
})

test('an account sealed on another PC is removed, not sent as garbage', () => {
    seed()
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    cfg.authenticationDatabase[UUID].microsoft.refresh_token = 'safe:v1:' + Buffer.from('someone else').toString('base64')
    fs.writeFileSync(configPath, JSON.stringify(cfg))
    ConfigManager.load()
    assert.strictEqual(ConfigManager.openSealedTokens(), 1)
    assert.strictEqual(ConfigManager.getAuthAccount(UUID), undefined)
})

test('without safeStorage the launcher keeps working', () => {
    available = false
    try {
        ConfigManager.load()
        ConfigManager.openSealedTokens()
        ConfigManager.addMicrosoftAuthAccount(UUID, 'plain-mc', 'Marcus', 1, 'plain-ms', 'plain-refresh', 1)
        ConfigManager.save()
        assert.strictEqual(ConfigManager.getAuthAccount(UUID).microsoft.refresh_token, 'plain-refresh')
    } finally {
        available = true
    }
})
