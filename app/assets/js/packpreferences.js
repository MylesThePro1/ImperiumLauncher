/**
 * packpreferences.js — manages the `resourcePacks` entries of an
 * instance's options.txt (issue #15).
 *
 * Two rules the issue sets, both encoded here:
 *
 *   1. BASE is enabled on FIRST INSTALL ONLY. "First install" is read
 *      from the file itself: options.txt missing, or a resourcePacks key
 *      that is absent/empty/just ["vanilla"] — the untouched state the
 *      game itself writes. The moment the player has any other pack
 *      configured, the launcher never touches their list for BASE's sake.
 *   2. EFFECTS is enabled ABOVE BASE while the High-detail textures
 *      setting is on, and removed when the setting is off — but only if
 *      the launcher was the one who added it (the `effectsManaged` flag).
 *      A copy the player enabled by hand inside the game is never touched.
 *
 * Only the resourcePacks line is ever rewritten; every other line of
 * options.txt is preserved byte-for-byte. The pack files themselves are
 * downloaded by the distribution sync (File modules land in the
 * instance's resourcepacks/ folder) — this module only edits preferences.
 */
const fs   = require('fs-extra')
const path = require('path')

const OPTIONS_FILE = 'options.txt'
const RESOURCE_PACKS_KEY = 'resourcePacks'

/**
 * Parse the resourcePacks value out of an options.txt body.
 *
 * @param {string} text The full options.txt content.
 * @returns {{entries: string[], hasKey: boolean}|null} The parsed list,
 * or null when the key exists but cannot be parsed safely — in that case
 * the caller must leave the file alone rather than destroy a value it
 * does not understand.
 */
function parseResourcePacks(text){
    const lines = String(text).split(/\r?\n/)
    for(const line of lines){
        if(line.startsWith(`${RESOURCE_PACKS_KEY}:`)){
            try {
                const parsed = JSON.parse(line.substring(RESOURCE_PACKS_KEY.length + 1))
                if(!Array.isArray(parsed) || parsed.some(e => typeof e !== 'string')){
                    return null
                }
                return { entries: parsed, hasKey: true }
            } catch(_err){
                return null
            }
        }
    }
    return { entries: [], hasKey: false }
}

/**
 * Serialize a resourcePacks list the way the game writes it.
 *
 * @param {string[]} entries The pack entries.
 * @returns {string} The options.txt line.
 */
function serializeResourcePacks(entries){
    return `${RESOURCE_PACKS_KEY}:${JSON.stringify(entries)}`
}

/**
 * Compute the next resourcePacks list. Pure; unit-tested directly.
 *
 * @param {Object} current The parsed current state ({entries, hasKey}), or
 * null for "unparseable — do not touch".
 * @param {Object} opts
 * @param {string} opts.baseFile File name of the BASE pack zip.
 * @param {string|null} opts.effectsFile File name of the EFFECTS pack zip,
 * or null when the distribution ships none.
 * @param {boolean} opts.highDetail The High-detail textures setting.
 * @param {boolean} opts.effectsManaged Whether the launcher currently owns
 * an EFFECTS entry it wrote earlier.
 * @returns {{entries: string[], addBase: boolean, addEffects: boolean,
 * removeEffects: boolean, untouched: boolean}} The next list plus what
 * changed; untouched is true when the caller must not write the file.
 */
function computePackEntries(current, opts){
    const result = {
        entries: current != null ? current.entries.slice() : [],
        addBase: false,
        addEffects: false,
        removeEffects: false,
        untouched: true
    }
    if(current == null || opts == null || typeof opts.baseFile !== 'string' || opts.baseFile.length === 0){
        return result
    }
    // No resourcePacks key at all means the game has never written one: its
    // default list is exactly ["vanilla"], so seed that instead of starting
    // from an empty list.
    if(!current.hasKey && result.entries.length === 0){
        result.entries.push('vanilla')
    }

    const baseEntry = `file/${opts.baseFile}`
    const effectsEntry = opts.effectsFile != null && opts.effectsFile.length > 0 ? `file/${opts.effectsFile}` : null

    // Rule 1: BASE on first install only.
    const isUntouched = !current.hasKey
        || current.entries.length === 0
        || (current.entries.length === 1 && current.entries[0] === 'vanilla')
    if(isUntouched && !result.entries.includes(baseEntry)){
        result.entries.push(baseEntry)
        result.addBase = true
    }

    // Rule 2: EFFECTS above BASE, managed only by the launcher's own writes.
    if(effectsEntry != null){
        const hasEffects = result.entries.includes(effectsEntry)
        if(opts.highDetail && !hasEffects){
            const baseIndex = result.entries.indexOf(baseEntry)
            if(baseIndex >= 0){
                result.entries.splice(baseIndex, 0, effectsEntry)
            } else {
                const vanillaIndex = result.entries.indexOf('vanilla')
                if(vanillaIndex >= 0){
                    result.entries.splice(vanillaIndex + 1, 0, effectsEntry)
                } else {
                    result.entries.unshift(effectsEntry)
                }
            }
            result.addEffects = true
        } else if(!opts.highDetail && opts.effectsManaged === true && hasEffects){
            result.entries = result.entries.filter(e => e !== effectsEntry)
            result.removeEffects = true
        }
    }

    result.untouched = !result.addBase && !result.addEffects && !result.removeEffects
    return result
}

/**
 * Apply the pack preferences to an instance directory. Never throws for
 * an absent options.txt (creates one), and never writes when nothing
 * changed. A resourcePacks value that cannot be parsed is left alone.
 *
 * @param {string} gameDir The instance directory (the game's working dir).
 * @param {Object} opts See computePackEntries.
 * @returns {Object} The computePackEntries result, plus `wrote`.
 */
function applyPackOptions(gameDir, opts){
    const optionsPath = path.join(gameDir, OPTIONS_FILE)
    let text = null
    if(fs.existsSync(optionsPath)){
        text = fs.readFileSync(optionsPath, 'UTF-8')
    }
    const current = text == null ? { entries: [], hasKey: false } : parseResourcePacks(text)
    const result = computePackEntries(current, opts)
    if(result.untouched){
        return Object.assign(result, { wrote: false })
    }

    const newLine = serializeResourcePacks(result.entries)
    if(text == null){
        fs.writeFileSync(optionsPath, `${newLine}\n`, 'UTF-8')
    } else {
        const lines = text.split(/\r?\n/)
        let replaced = false
        for(let i = 0; i < lines.length; i++){
            if(lines[i].startsWith(`${RESOURCE_PACKS_KEY}:`)){
                lines[i] = newLine
                replaced = true
                break
            }
        }
        if(!replaced){
            if(lines.length > 0 && lines[lines.length - 1] === ''){
                lines[lines.length - 1] = newLine
            } else {
                lines.push(newLine)
            }
        }
        const body = lines.join('\n')
        fs.writeFileSync(optionsPath, body.endsWith('\n') ? body : `${body}\n`, 'UTF-8')
    }
    return Object.assign(result, { wrote: true })
}

exports.parseResourcePacks = parseResourcePacks
exports.serializeResourcePacks = serializeResourcePacks
exports.computePackEntries = computePackEntries
exports.applyPackOptions = applyPackOptions
exports.OPTIONS_FILE = OPTIONS_FILE
