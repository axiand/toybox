const { readdirSync, readFileSync, existsSync, writeFileSync, appendFileSync } = require('fs')
const { join } = require('path')

const { ipToHash } = require('../common/hash')
const { checkBannedWord, checkBannedSentence } = require('../common/badWords')
const { kvlSerialize, kvlReadFile } = require('../common/kvline')

const CHAPTER_MARKER_PATH = join(__dirname, '../data/ows/_latestId')
const CHAPTER_PATH = join(__dirname, '../data/ows/')
const UI_TEMPLATE = readFileSync(join(__dirname, '../static/ows-index.html'))
const FORM_TEMPLATE = readFileSync(join(__dirname, '../static/ows-form.html'))

const MAX_CHAPTER_LENGTH = 250

function advanceChapter() {
    let lastId

    if (!existsSync(CHAPTER_MARKER_PATH)) {
        lastId = '0'
    } else {
        lastId = readFileSync(CHAPTER_MARKER_PATH, { encoding: 'utf-8' })
    }

    lastId = parseInt(lastId) + 1

    writeFileSync(join(__dirname, `../data/ows/${lastId}.txt`), "")
    writeFileSync(CHAPTER_MARKER_PATH, `${lastId}`)
}

function repeatIp(ip, story) {
    if (story.length < 1) return false

    let existingIp = story[story.length - 1].ip
    return existingIp == ip && !ip.includes('127.0.0.1')
}

function lastWord(story) {
    if (story.length < 1) return null

    return story[story.length - 1].value
}

function addWord(word, ip) {
    let story = getStory()
    if (repeatIp(ip, story)) return
    if (lastWord(story) == "(new line)" && word == "(new line)") return

    let chap = getLatestChapterPath()

    let entry = {
        ts: Date.now(),
        ip: ip,
        value: word
    }
    appendFileSync(chap, kvlSerialize(entry))

    if (story.length > MAX_CHAPTER_LENGTH - 2) advanceChapter()
}

function getLatestChapterPath(justIndex = false) {
    if (!existsSync(CHAPTER_MARKER_PATH)) advanceChapter()

    let data = readFileSync(CHAPTER_MARKER_PATH, { encoding: 'utf-8' })
    return justIndex ? data : join(__dirname, `../data/ows/${data}.txt`)
}

function getChapters() {
    let files = readdirSync(CHAPTER_PATH)

    return files.filter(c => c != "_latestId").map(c => c.split('.')[0])
}

function getStory(chapter) {
    let where = chapter != null ? join(__dirname, `../data/ows/${chapter}.txt`) : getLatestChapterPath()
    if (!where.startsWith(CHAPTER_PATH) || where.includes('..')) return "path traversal"
    if (!existsSync(where)) return null

    let storyData = readFileSync(where, { encoding: 'utf-8' })
    let storyWords = kvlReadFile(storyData)

    storyWords.sort((a, b) => { return parseInt(a.ts) - parseInt(b.ts) })

    return storyWords
}

function renderSegments(story) {
    let ui = ''

    if (story.length == 0) {
        ui += `<i>This chapter is empty right now. Submit a word below...</i>`
        return ui
    }

    for (let seg of story) {
        let v = seg.value
        let time = new Date(parseInt(seg.ts)).toUTCString()
        let iphash = ipToHash(seg.ip).slice(0, 6)

        if (v != "(new line)") {
            if (v != ".") ui += ` `
            ui += `<span title="${time} [${iphash}]" style="text-decoration: underline #${iphash};">${v}</span>`
        } else {
            ui += "<br><br>"
        }
    }

    return ui
}

function renderForm() {
    let ui = FORM_TEMPLATE + ''

    return ui
}

function renderChapters(current) {
    let chapters = getChapters()
    let ui = ''

    for (let chapter of chapters) {
        let nui = `<a href="?chapter=${chapter}">${chapter}</a>`
        if (chapter == current) nui = `<b>${nui}</b>`
        ui += nui
    }

    return ui
}

function rView(req, res) {
    let chapter = req.query['chapter']
    let latestChapter = getLatestChapterPath(true)
    let story

    story = getStory(chapter)
    if (story == "path traversal") {
        res.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        return // :^)
    }

    if (!story) {
        story = getStory()
        chapter = latestChapter
    }

    let ui = UI_TEMPLATE + ''

    ui = ui.replace('%segments%', renderSegments(story))
    if ((chapter ?? latestChapter) == latestChapter) {
        if (!repeatIp(req.ip, story)) {
            ui = ui.replace('%submitForm%', renderForm())
        } else {
            ui = ui.replace('%submitForm%', `<b>You've already submitted a word, wait for someone else to submit</b>`)
        }
    } else {
        ui = ui.replace('%submitForm%', `<b>This chapter is finished, go back to the latest chapter to submit</b>`)
    }

    ui = ui.replace('%chapters%', renderChapters(chapter ?? latestChapter))
    ui = ui.replace('%wordsLeft%', MAX_CHAPTER_LENGTH - story.length)

    res.header('Content-Type', 'text/html')
    res.send(ui)
}

function rSubmitWord(req, res) {
    let { word, wordSpecial } = req.body

    if (!word && wordSpecial == null) return res.redirect('/story')

    let pass = true
    if (!word.match(/^[a-z]{1,18}[.!?]?$/)) pass = false

    let storyWords = getStory().map(w => w.value).join(' ')
    if (checkBannedSentence(storyWords + ` ${word}`)) pass = false

    if (wordSpecial != null && (wordSpecial == "(new line)")) {
        word = wordSpecial
        pass = true
    }

    if (!pass) return res.redirect('/story')

    addWord(word, req.ip)
    res.redirect('/story')
}

module.exports.viewOneWordStory = rView
module.exports.submitOneWordStory = rSubmitWord