const { readFileSync, existsSync, appendFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const { kvlReadFile } = require('../common/kvline')

const IP_BANS_PATH = join(__dirname, '../data/ip_bans.txt')

let BANS_SET = new Set()
let BANS = new Map()

function loadIpBanList() {
    console.log('Loading IP bans')
    if (!existsSync(IP_BANS_PATH)) appendFileSync(IP_BANS_PATH, ``)

    let data = kvlReadFile(readFileSync(IP_BANS_PATH, { encoding: 'utf8' }))
    for (let ban of data) {
        loadIpBan(ban)
    }

    console.log(`IP bans loaded (${data.length})`)
}

function saveIpBans() {
    writeFileSync(IP_BANS_PATH, [...BANS_SET].join("\n"))
}

function loadIpBan(ip) {
    BANS.set(ip.value, ip)
    BANS_SET.add(ip.value)
}

function unloadIpBan(ip) {
    BANS.delete(ip)
    BANS_SET.delete(ip)

    saveIpBans()
}

function createIpBan(ip) {
    if (checkIpBan(ip)) return

    appendFileSync(IP_BANS_PATH, `${ip}\n`)
    loadIpBan({ value: ip })
}

function removeIpBan(ip) {
    unloadIpBan(ip)
}

function checkIpBan(ip) {
    return BANS_SET.has(ip)
}

function getIpBanCount() {
    return BANS_SET.size
}

function getIpBans() {
    return [...BANS_SET]
}

loadIpBanList()

module.exports.bansCreateIpBan = createIpBan
module.exports.bansRemoveIpBan = removeIpBan
module.exports.bansCheckIpBan = checkIpBan
module.exports.bansGetIpBanCount = getIpBanCount
module.exports.bansGetIpBans = getIpBans