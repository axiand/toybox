const { parseColorExpression } = require('../common/parseColorExpression')
const { createCanvas } = require('canvas')

const PALETTE_WIDTH = 40
const PALETTE_HEIGHT = 150
const GRADIENT_WIDTH = 700
const MAX_ITEMS = 20

function rGetColor(req, res) {
    let expr = parseColorExpression(req.params.pattern)
    let col = expr.colors[0]
    if (!col) {
        res.sendStatus(400)
        return
    }

    let canvas = createCanvas(PALETTE_HEIGHT, PALETTE_HEIGHT)
    let ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, PALETTE_HEIGHT, PALETTE_HEIGHT)
    ctx.fillStyle = col.color
    ctx.fillRect(0, 0, PALETTE_HEIGHT, PALETTE_HEIGHT)

    let outBuf = canvas.toBuffer('image/png')
    res.set('Content-Type', 'image/png')
    res.send(outBuf)
    res.end()

    return
}

function rGetPalette(req, res) {
    let expr = parseColorExpression(req.params.pattern, MAX_ITEMS)
    let cols = expr.colors
    //console.log(expr)
    if (!cols[0]) {
        res.sendStatus(400)
        return
    }

    let width = (req.query['width'] && parseInt(req.query['width'])) || PALETTE_WIDTH
    if (width < 1 || width > 250) {
        res.sendStatus(400)
        return
    }

    let canvas = createCanvas(width * cols.length, PALETTE_HEIGHT)
    let ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width * cols.length, PALETTE_HEIGHT)

    for (let col in cols) {
        ctx.fillStyle = cols[col].color
        ctx.fillRect(width * col, 0, width, PALETTE_HEIGHT)
    }

    let outBuf = canvas.toBuffer('image/png')
    res.set('Content-Type', 'image/png')
    res.send(outBuf)
    res.end()

    return
}

function rGetGradient(req, res) {
    let expr = parseColorExpression(req.params.pattern, MAX_ITEMS)
    let cols = expr.colors
    if (!cols[0]) {
        res.sendStatus(400)
        return
    }
    let width = (req.query['width'] && parseInt(req.query['width'])) || GRADIENT_WIDTH
    if (width < 1 || width > 2000) {
        res.sendStatus(400)
        return
    }

    let canvas = createCanvas(width, PALETTE_HEIGHT)
    let ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, PALETTE_HEIGHT)

    let grad = ctx.createLinearGradient(0, PALETTE_HEIGHT / 2, width, PALETTE_HEIGHT / 2)
    let currentStop = 0

    for (let col of cols) {
        grad.addColorStop(col.stop ?? currentStop, col.color)
        currentStop += (1 / (cols.length - 1))
    }

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, PALETTE_HEIGHT)

    let outBuf = canvas.toBuffer('image/png')
    res.set('Content-Type', 'image/png')
    res.send(outBuf)
    res.end()

    return
}

module.exports.getColor = rGetColor
module.exports.getPalette = rGetPalette
module.exports.getGradient = rGetGradient