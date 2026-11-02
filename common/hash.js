const { hash } = require('crypto')
const SECRET = process.env.TOYBOX_HASH_SECRET

function ipToHash(ip) {
    return hash('sha1', `${ip}:${SECRET}`)
}

module.exports.ipToHash = ipToHash