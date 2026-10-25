/**
 * gameprogress.js - turns the game's own log into launch progress.
 *
 * The launcher used to declare success at "Loading Minecraft ... with Fabric Loader",
 * about two seconds after spawning, and hide the progress area while the game still had
 * ~20 seconds of loading ahead. These are the lines a 26.x Fabric client logs on its way
 * to the title screen, in order, with percents spaced by where they land in a real boot
 * (Romanica pack, 2026-10-22: 1.5 s ... 22 s). The last one means the game is up.
 */
const fs = require('fs')
const path = require('path')

const STAGES = [
    { re: /Loading Minecraft .+ with Fabric Loader/, percent: 63, key: 'gameLoadingMods' },
    { re: /SpongePowered MIXIN Subsystem/, percent: 65, key: 'gamePatchingMods' },
    { re: /Searching for graphics cards/, percent: 68, key: 'gameCheckingGraphics' },
    { re: /Datafixer optimizations|DataFixer/, percent: 73, key: 'gamePreparingData' },
    { re: /Completely ignored arguments|Different rendering plugin detected|Setting user:/, percent: 86, key: 'gameStartingRenderer' },
    { re: /Backend library: LWJGL|Using graphics backend/, percent: 91, key: 'gameOpeningWindow' },
    { re: /Reloading ResourceManager/, percent: 96, key: 'gameLoadingResources' },
    { re: /Sound engine started/, percent: 100, key: 'gameReady', done: true }
]

/**
 * A tracker that only ever moves forward, so log lines arriving out of order or twice
 * never send the bar backwards.
 *
 * @returns {{feed: function(string): (Object|null)}} feed() takes a chunk of game output
 * and returns the newest stage it reached ({percent, key, done}), or null if none.
 */
exports.createTracker = function(){
    let reached = -1
    return {
        feed(chunk){
            let newest = null
            for(const line of String(chunk).split(/\r?\n/)){
                for(let i = reached + 1; i < STAGES.length; i++){
                    if(STAGES[i].re.test(line)){
                        reached = i
                        newest = STAGES[i]
                    }
                }
            }
            return newest == null ? null : { percent: newest.percent, key: newest.key, done: newest.done === true }
        }
    }
}

// How much of a log's start to compare when telling two runs' files apart. A boot's
// first lines carry fresh timestamps, so a few lines are enough to tell them apart.
const HEAD_BYTES = 256

function readHead(file, size){
    try {
        const fd = fs.openSync(file, 'r')
        try {
            const buf = Buffer.alloc(Math.min(HEAD_BYTES, size))
            const { bytesRead } = fs.readSync(fd, buf, 0, buf.length, 0)
            return buf.subarray(0, bytesRead)
        } finally {
            fs.closeSync(fd)
        }
    } catch {
        return null
    }
}

/**
 * Whether the file's start still looks like the baseline run's. An unreadable head
 * cannot disprove it, so it counts as a match and the wait continues on identity and
 * size alone; content where the baseline was empty is always new.
 */
function headsMatch(head, baselineHead){
    if(head == null || baselineHead == null){
        return true
    }
    if(baselineHead.length === 0){
        return head.length === 0
    }
    const n = Math.min(head.length, baselineHead.length)
    return head.compare(baselineHead, 0, n, 0, n) === 0
}

/**
 * Tail the game's logs/latest.log written by this launch, handing new text to onText.
 *
 * Reading the file instead of the process's stdout works for detached launches too, and
 * the game's piped stdout is not delivered to the launcher on every setup. The previous
 * run's latest.log is skipped: the new run's file is told apart by a different identity
 * (inode), a smaller size, or a different head. Content must carry the decision because
 * NTFS reuses a deleted file's id when the log is recreated under the same name, and
 * Windows "file tunnelling" gives the recreated file the old one's creation time.
 *
 * @param {string} gameDir The instance directory.
 * @param {function(string): void} onText Receives each newly written chunk.
 * @param {number} [intervalMs=400] Poll interval.
 * @returns {function(): void} Stops tailing.
 */
exports.tailGameLog = function(gameDir, onText, intervalMs = 400){
    const file = path.join(gameDir, 'logs', 'latest.log')
    let baseline = null
    try {
        const stat = fs.statSync(file)
        baseline = { ino: stat.ino, size: stat.size, head: readHead(file, stat.size) }
    } catch {
        baseline = null
    }
    let offset = 0
    let started = baseline == null
    let reading = false
    const poll = () => {
        if(reading){
            return
        }
        reading = true
        fs.stat(file, (err, stat) => {
            if(err != null){
                reading = false
                return
            }
            if(!started){
                if(stat.ino === baseline.ino && stat.size >= baseline.size && headsMatch(readHead(file, stat.size), baseline.head)){
                    reading = false
                    return
                }
                started = true
            }
            if(stat.size < offset){
                offset = 0
            }
            if(stat.size === offset){
                reading = false
                return
            }
            const stream = fs.createReadStream(file, { start: offset, end: stat.size - 1, encoding: 'utf8' })
            let text = ''
            stream.on('data', (chunk) => { text += chunk })
            stream.on('error', () => { reading = false })
            stream.on('end', () => {
                offset = stat.size
                reading = false
                if(text.length > 0){
                    onText(text)
                }
            })
        })
    }
    const timer = setInterval(poll, intervalMs)
    poll()
    return () => clearInterval(timer)
}

exports.STAGES = STAGES
