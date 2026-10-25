const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Placeholder index with no modules yet; the real one moves to ImperiumMC hosting in milestone 2.
// See docs/distribution-index.md for what it must contain.
exports.MASTER_DISTRO_URL = 'https://raw.githubusercontent.com/Romanica-MC/RomanicaLauncher/master/distribution/distribution.json'

// The smoke workflow points a smoke run at the index of the commit under test,
// so an index change is proven before it reaches master. Outside a smoke run
// the override is ignored: players always read master.
exports.resolveDistroUrl = function(env){
    if(env.IMPERIUM_SMOKE_LAUNCH === '1' && typeof env.IMPERIUM_SMOKE_DISTRO_URL === 'string' && env.IMPERIUM_SMOKE_DISTRO_URL.startsWith('https://')){
        return env.IMPERIUM_SMOKE_DISTRO_URL
    }
    return exports.MASTER_DISTRO_URL
}

exports.REMOTE_DISTRO_URL = exports.resolveDistroUrl(process.env)

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

exports.DistroAPI = api