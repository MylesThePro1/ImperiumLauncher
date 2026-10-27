const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('fs')
const path   = require('path')
const toml   = require('toml')

const { isAllowedLink } = require('../app/assets/js/newsSanitize')

/**
 * Every link the launcher ships in its language file must pass the external
 * link policy, or clicking it does nothing: the X, Instagram and YouTube
 * icons on the landing screen were silently rejected because their hosts
 * were never on the allowlist.
 */
const custom = toml.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'lang', '_custom.toml'), 'utf8'))

function shippedUrls(node, out = []){
    for(const value of Object.values(node)){
        if(typeof value === 'string' && value.startsWith('https://')){
            out.push(value)
        } else if(value && typeof value === 'object'){
            shippedUrls(value, out)
        }
    }
    return out
}

test('every shipped link is allowed by the external link policy', () => {
    const urls = shippedUrls(custom)
    assert.ok(urls.length >= 5, `expected the social and support links, found ${urls.length}`)
    const blocked = urls.filter(url => !isAllowedLink(url))
    assert.deepStrictEqual(blocked, [])
})

test('landing social links point at the romanicamc accounts', () => {
    const landing = custom.ejs.landing
    assert.strictEqual(landing.mediaXURL, 'https://x.com/romanicamc')
    assert.strictEqual(landing.mediaInstagramURL, 'https://www.instagram.com/romanicamc/')
    assert.strictEqual(landing.mediaYouTubeURL, 'https://www.youtube.com/@romanicamc')
})
