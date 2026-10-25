/**
 * crashguard.js - stops the auto-join crash loop.
 *
 * With auto-connect on, a game that crashes shortly after joining relaunches
 * straight back into the same server and crashes again, and the player never
 * reaches the menus to change anything (field report 2026-10-25: an old 8 GB
 * PC crashing ~15 s after joining). After an early crash, the next launch skips
 * auto-connect once. The player's auto-connect setting itself is left alone.
 */

// A crash this soon after launch counts as "early": long enough to cover
// startup, the join and the first minutes of loading on a slow PC.
const EARLY_CRASH_WINDOW_MS = 10 * 60 * 1000

/**
 * Whether a game exit should suspend auto-connect for the next launch.
 *
 * @param {number|null} code The game's exit code (null when killed by a signal).
 * @param {number} runtimeMs How long the game ran.
 * @returns {boolean} True for a non-zero exit within the early-crash window.
 */
exports.isEarlyCrash = function(code, runtimeMs){
    if(code == null || code === 0){
        return false
    }
    return runtimeMs >= 0 && runtimeMs < EARLY_CRASH_WINDOW_MS
}

/**
 * Record a game exit: after an early crash, skip auto-connect on the next launch.
 *
 * @param {Object} configManager The launcher ConfigManager.
 * @param {number|null} code The game's exit code.
 * @param {number} runtimeMs How long the game ran.
 * @returns {boolean} True when auto-connect was suspended.
 */
exports.recordExit = function(configManager, code, runtimeMs){
    if(!exports.isEarlyCrash(code, runtimeMs)){
        return false
    }
    configManager.setSkipAutoConnectOnce(true)
    configManager.save()
    return true
}

/**
 * Consume the one-launch suspension. Returns true when this launch must not
 * auto-connect, and clears the flag so the launch after it behaves normally.
 *
 * @param {Object} configManager The launcher ConfigManager.
 * @returns {boolean} True when auto-connect is suspended for this launch.
 */
exports.consumeSkip = function(configManager){
    if(!configManager.getSkipAutoConnectOnce()){
        return false
    }
    configManager.setSkipAutoConnectOnce(false)
    configManager.save()
    return true
}

exports.EARLY_CRASH_WINDOW_MS = EARLY_CRASH_WINDOW_MS
