const { randomColor } = require('../common/randomColor')

function parseColorExpression(ex, limit = 1) {
    let patterns = ex.split("+")
    let result = []

    for (let pa of patterns) {
        if (result.length >= limit) break

        let src = pa

        let repeatCount = 1
        let repeatInfo = src.match(/^(.+)\{([0-9]{1,3})\}$/)
        if (repeatInfo != null) {
            repeatCount = parseInt(repeatInfo[2])
            src = repeatInfo[1]
        }

        for (i = 0; i < repeatCount; i++) {
            if (result.length >= limit) break

            let stop
            let color

            // gradient stops: e.g. 45:red
            let stopInfo = src.match(/^([0-9]{1,3}):(.+)$/)
            if (stopInfo != null) {
                stop = stopInfo[1] / 100
                src = stopInfo[2]
            }

            if (src.match(/^[0-9a-f]{6}$/)) color = "#" + src

            if (src.match(/^rgb\([0-9]{1,3},\s?[0-9]{1,3},\s?[0-9]{1,3}\)$/)) color = src

            if (src.match(/^[a-z]{1,32}$/)) color = src

            if (src.match(/^\*/)) color = parseRandomExpression(src)

            if (color == null) continue

            result.push({ stop: stop, color: color })
        }
    }
    result = result.filter(i => i != null)

    return {
        colors: result,
        hasAnyStops: result.findIndex(c => c.stop != null) > -1
    }
}

function parseRandomExpression(ex) {
    let [src, options] = ex.match(/^\*(?:\((.+)\))?$/) ?? []
    if (src == null) return null
    if (options == null) options = "*,*,*"

    let [oR, oG, oB, extra] = options.split(",")
    try {
        if (extra) throw new Error("too many params")
        oR = parseColorRange(oR)
        oG = parseColorRange(oG)
        oB = parseColorRange(oB)
    } catch (e) {
        return null
    }

    let [fR, fG, fB] = randomColor(oR ?? undefined, oG ?? undefined, oB ?? undefined)

    return `rgb(${fR},${fG},${fB})`
}

function parseColorRange(ex) {
    if (ex == null) throw new Error("null param")
    if (ex == "*") return null

    let [min, max, extra] = ex.split("-")
    if (min != null) {
        if (extra != null) throw new Error("too many range params")
        if (max == null) max = min

        min = parseInt(min)
        max = parseInt(max)
    }

    if (!isNaN(min) && !isNaN(max)) {
        return [min, max]
    }

    throw new Error("unparseable param")
}

module.exports.parseColorExpression = parseColorExpression