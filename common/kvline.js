function deserialize(line) {
    if (line.trim().length == 0) return null
    let props = line.split(';')
    let data = {}

    for (let prop of props) {
        if (prop.trim().length == 0) continue
        let [key, value] = prop.split('=')

        if (value == null) { data.value = decodeURIComponent(key).replaceAll('\\n', '\n') }
        else { data[key] = decodeURIComponent(value).replaceAll('\\n', '\n') }
    }

    return data
}

function serialize(thing) {
    let out = ''

    for (let prop of Object.getOwnPropertyNames(thing)) {
        let srcVal = thing[prop] + ''
        srcVal = srcVal.replaceAll(/\r?\n/g, '\\n')

        if (prop == "value") {
            out += `${encodeURIComponent(srcVal)};`
        } else if (srcVal != null) {
            out += `${prop}=${encodeURIComponent(srcVal)};`
        }
    }
    out += "\n"

    return out
}

function fromLines(data) {
    let lines = data.split(/\r?\n/)
    let entries = []

    for (let line of lines) {
        let deser = deserialize(line)
        if (deser == null) continue

        entries.push(deser)
    }

    return entries
}

module.exports.kvlDeserialize = deserialize
module.exports.kvlSerialize = serialize
module.exports.kvlReadFile = fromLines