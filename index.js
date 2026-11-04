const { readFileSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')
const express = require('express')
const cookieparser = require('cookie-parser')
const PORT = 5110

function pathify(path) {
    return join(__dirname, path)
}

const indexPage = readFileSync(pathify('/static/index.html'))
const indexCss = readFileSync(pathify('/static/common.css'))

if (!existsSync(pathify('/data'))) {
    mkdirSync(pathify('/data/ows'), { recursive: true })
    mkdirSync(pathify('/data/trust/morgue'), { recursive: true })
    mkdirSync(pathify('/data/bbs'), { recursive: true })
}

process.loadEnvFile(pathify('.env'))

const { getColor, getPalette, getGradient } = require('./routes/color')
const { viewOneWordStory, submitOneWordStory } = require('./routes/oneWordStory')
const { indexCirclesOfTrust, createCircleOfTrust, showCircleOfTrust, createCircleOfTrustEntry } = require('./routes/trust')
const { readBbs, submitBbs, adminBbs, adminBbsLogin, adminBbsBan, adminBbsDeleteThreads, bbsGetCaptcha, bbsCheckCaptcha, bbsGetJs } = require('./routes/bbs')

const app = express()

app.use(cookieparser())
app.use((req, res, next) => {
    res.header('Content-Type', 'text/html')
    next()
})

app.get('/', (req, res) => {
    res.header('Content-Type', 'text/html')
    res.send(indexPage)
})

app.get('/common.css', (req, res) => {
    res.header('Content-Type', 'text/css')
    res.send(indexCss)
})

if (process.env['TOYBOX_DISABLE_SOCIAL'] != '1') {
    // One Word Story
    app.get('/story', viewOneWordStory)
    app.post('/story/submit', express.urlencoded(), submitOneWordStory)

    // Circles of Trust
    app.get('/trust', indexCirclesOfTrust)
    app.get('/trust/showcircle', showCircleOfTrust)
    app.post('/trust/newcircle', express.urlencoded(), createCircleOfTrust)
    app.post('/trust/makeentry', express.urlencoded(), createCircleOfTrustEntry)
}

if (process.env['TOYBOX_DISABLE_BBS'] != '1') {
    // Textboard
    app.get('/bbs', readBbs)
    app.post('/bbs/submit', express.urlencoded(), submitBbs)

    app.get('/bbs/captcha/get', bbsGetCaptcha)
    app.post('/bbs/captcha/check', express.urlencoded(), bbsCheckCaptcha)
    app.get('/bbs/bbs.js', bbsGetJs)

    app.get('/bbs/admin', adminBbs)
    app.post('/bbs/admin/login', express.urlencoded(), adminBbsLogin)
    app.post('/bbs/admin/deletethreads', express.urlencoded(), adminBbsDeleteThreads)
}

app.post('/bbs/admin/banip', express.urlencoded(), adminBbsBan)

// Color generators
app.get('/color/:pattern', getColor)
app.get('/palette/:pattern', getPalette)
app.get('/gradient/:pattern', getGradient)

app.get('/headers', (req, res) => {
    let final = ''

    final += `BASICS\n\n`
    final += `req.ip output: ${req.ip}\n`

    final += `\nHEADERS\n\n`
    for (let header in req.headersDistinct) {
        for (let headerItem of req.headersDistinct[header]) {
            final += `${header}: ${headerItem}\n`
        }
    }

    res.type('text/plain')
    res.send(final)
})

app.set('trust proxy', 'loopback')

app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})