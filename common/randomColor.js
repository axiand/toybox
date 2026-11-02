function randrange(min, max) {
    return (Math.random() * (max - min)) + min
}

function randomColor(r = [0, 255], g = [0, 255], b = [0, 255]) {
    r = Math.round(randrange(r[0], r[1]))
    g = Math.round(randrange(g[0], g[1]))
    b = Math.round(randrange(b[0], b[1]))

    return [r, g, b]
}

module.exports.randomColor = randomColor