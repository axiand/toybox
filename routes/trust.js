const { readdirSync, readFileSync, existsSync, writeFileSync, appendFileSync, renameSync, mkdirSync } = require('fs')
const { join, resolve } = require('path')
const { kvlReadFile, kvlSerialize } = require('../common/kvline')
const { ipToHash } = require('../common/hash')
const { checkBannedSentence } = require('../common/badWords')

const CIRCLES_PATH = join(__dirname, '../data/trust')
const INDEX_MARKER_PATH = join(CIRCLES_PATH, '/_latestId')
const UI_TEMPLATE = readFileSync(join(__dirname, '../static/trust-index.html'))
const CIRCLE_UI_TEMPLATE = readFileSync(join(__dirname, '../static/trust-circle.html'))
const ENTRY_UI_TEMPLATE = readFileSync(join(__dirname, '../static/trust-entry.html'))
const FORM_TEMPLATE = readFileSync(join(__dirname, '../static/trust-form.html'))
const ENTRY_FORM_TEMPLATE = readFileSync(join(__dirname, '../static/trust-form-entry.html'))

const CIRCLES_LIMIT = 20

function getCircle(where) {
    if (!resolve(where).startsWith(CIRCLES_PATH) || where.includes('..')) return "path traversal"
    if (!existsSync(where)) return null

    let circleData = readFileSync(where, { encoding: 'utf-8' })
    let circleEntries = kvlReadFile(circleData)

    circleEntries.sort((a, b) => { return parseInt(a.ts) - parseInt(b.ts) })

    return {
        id: where.match(/([0-9]+)\.txt$/)[1],
        path: resolve(where),
        entries: circleEntries,
        subject: circleEntries.find(e => e.subject != null)?.subject ?? "Circle",
        len: circleEntries.length,
        ownerIp: circleEntries[0]?.ip
    }
}

function createCircle(postData) {
    let lastId

    if (!existsSync(INDEX_MARKER_PATH)) {
        lastId = '0'
    } else {
        lastId = readFileSync(INDEX_MARKER_PATH, { encoding: 'utf-8' })
    }

    lastId = parseInt(lastId) + 1

    writeFileSync(join(CIRCLES_PATH, `/${lastId}.txt`), "")
    writeFileSync(INDEX_MARKER_PATH, `${lastId}`)

    return createCirclePost(lastId, postData)
}

function createCirclePost(id, data) {
    let circ = getCircle(join(CIRCLES_PATH, `/${id}.txt`))
    if (circ == "path traversal") return circ

    appendFileSync(circ.path, kvlSerialize(data))

    return circ
}

function destroyCircle(cid) {
    if (!existsSync(join(CIRCLES_PATH, '/morgue'))) mkdirSync(join(CIRCLES_PATH, '/morgue'))

    renameSync(join(CIRCLES_PATH, `/${cid}.txt`), join(CIRCLES_PATH, `/morgue/${cid}.txt`))
}

function getCircleDestroyer(circle) {
    return circle.entries.find(e => e.action == 'destroy')
}

function getCircles(where) {
    let entries = readdirSync(where, { withFileTypes: true })
    entries = entries.filter(e => !e.isDirectory() && e.name != '_latestId')

    let circles = []

    for (let circleFile of entries) {
        let cir = getCircle(join(where, circleFile.name))
        circles.push(cir)
    }

    //console.log(circles)
    return circles
}

function userHasActiveCircles(circles, ip) {
    return circles.find(c => c.ownerIp == ip) != null
}

function userPostedInCircle(circle, ip) {
    return circle.entries.find(e => e.ip == ip) != null
}

function renderCirclesTable(circles, section, ip) {
    let ui = ''

    for (let cir of circles) {
        let finalId = section == 'destroyed' ? `morgue/${cir.id}` : cir.id
        let joined = cir.entries.find(e => e.ip == ip) != null ? `(Joined)` : ``

        ui += `
            <tr>
                <td><a href="/trust/showcircle?id=${finalId}">#${cir.id}: ${cir.subject}</a> ${joined}</td>
                <td>${cir.len}</td>
            </tr>
        `
    }

    return ui
}

function renderCircleEntries(circle, ip) {
    let ui = ''

    for (let entry of circle.entries) {
        let entUi = ENTRY_UI_TEMPLATE + ''

        let you = entry.ip == ip ? `(You)` : ``
        entUi = entUi.replace('%userName%', `${entry.name} [${ipToHash(entry.ip).slice(0, 6)}] ${you}`)
        entUi = entUi.replace('%ts%', `${new Date(parseInt(entry.ts)).toUTCString()}`)
        entUi = entUi.replace('%comment%', entry.comment?.replaceAll('\n', '<br>') ?? ``)

        ui += entUi
    }

    return ui
}

function renderSubmitForm(circles, ip, section) {
    if (section == 'destroyed') return `<b>Return to the index to create a circle.</b>`
    if (circles.length > CIRCLES_LIMIT) return `<b>Too many active circles (${CIRCLES_LIMIT}). Time to go on a rampage?</b>`
    if (userHasActiveCircles(circles, ip)) return `<b>You already own an active circle!</b>`

    return FORM_TEMPLATE
}

function renderEntryForm(circle, ip) {
    if (getCircleDestroyer(circle) != null) return `<b>This circle is no longer open.</b>`
    if (userPostedInCircle(circle, ip)) return `<b>You've already joined this circle.</b>`

    let ui = ENTRY_FORM_TEMPLATE + ''

    ui = ui.replace('%cid%', circle.id)

    return ui
}

function rViewCircles(req, res) {
    let ui = UI_TEMPLATE + ''
    let section = req.query['view'] ?? ''
    let circles = getCircles(section == 'destroyed' ? join(CIRCLES_PATH, '/morgue') : CIRCLES_PATH)

    ui = ui.replace('%destroyedBlurb%', section != 'destroyed'
        ? `<b><a href="?view=destroyed">View destroyed circles</a></b>`
        : `<b>Viewing destroyed circles. <a href="?">Click here to view active circles</a>.</b>`
    )
    ui = ui.replace('%circlesTable%', renderCirclesTable(circles, section, req.ip))
    ui = ui.replace('%submitForm%', renderSubmitForm(circles, req.ip, section))

    res.send(ui)
}

function rShowCircle(req, res) {
    let ui = CIRCLE_UI_TEMPLATE + ''

    let { id } = req.query
    if (id == null) return res.redirect('/trust')

    let cir = getCircle(join(CIRCLES_PATH, `/${id}.txt`))
    if (cir == "path traversal" || cir == null) return res.redirect('/trust')

    ui = ui.replaceAll('%cid%', cir.id)
    ui = ui.replaceAll('%csubject%', cir.subject)
    ui = ui.replace('%clen%', cir.len)

    ui = ui.replace('%circleEntries%', renderCircleEntries(cir, req.ip))
    ui = ui.replace('%submitForm%', renderEntryForm(cir, req.ip))

    let destroyer = getCircleDestroyer(cir)

    ui = ui.replace('%destroyedBlurb%', destroyer != null
        ? `<b>This circle is dead! It was betrayed by ${destroyer.name}.</b>`
        : ``
    )

    res.send(ui)
}

function rCreateCircle(req, res) {
    let pass = true
    let { subject, userName } = req.body
    userName = userName?.length < 1 ? "Anonymous" : userName

    if (!subject || !userName) pass = false

    subject = subject.trim()
    userName = userName.trim()
    if (!subject.match(/^[a-zA-Z0-9\s]{1,20}$/) || checkBannedSentence(subject)) pass = false
    if (!userName.match(/^[a-zA-Z0-9\s]{1,20}$/) || checkBannedSentence(userName)) pass = false

    let circles = getCircles(CIRCLES_PATH)
    if (circles.length > CIRCLES_LIMIT) pass = false
    if (userHasActiveCircles(circles, req.ip)) pass = false

    if (!pass) return res.redirect('/trust')

    let created = createCircle({
        ts: Date.now(),
        subject: subject,
        name: userName,
        ip: req.ip,
        action: "keep"
    })
    if (created == "path traversal") return res.redirect('/trust')

    res.redirect(`/trust/showcircle?id=${created.id}`)
}

function rCreateCircleEntry(req, res) {
    let pass = true
    let { cid, action, userName, comment } = req.body
    userName = userName?.length < 1 ? "Anonymous" : userName

    if (!action || !cid) pass = false
    if (!(['keep', 'destroy'].includes(action))) pass = false

    userName = userName.trim()
    if (!userName.match(/^[a-zA-Z0-9\s]{1,20}$/) || checkBannedSentence(userName)) pass = false

    comment = comment.trim()
    if (!comment.match(/^[a-zA-Z0-9\s]{0,300}$/) || checkBannedSentence(comment)) pass = false

    let cir = getCircle(join(CIRCLES_PATH, `/${cid}.txt`))
    if (cir == "path traversal" || cir == null || getCircleDestroyer(cir) != null) return res.redirect('/trust')

    if (cir.entries.find(e => e.ip == req.ip) && !req.ip.includes('127.0.0.1')) pass = false

    if (!pass) return res.redirect(req.header('referer'))

    createCirclePost(cir.id, {
        ts: Date.now(),
        subject: "",
        name: userName,
        ip: req.ip,
        action: action,
        comment: comment
    })

    if (action == 'destroy') destroyCircle(cir.id)
    let finalId = action == 'destroy' ? `morgue/${cir.id}` : cir.id

    res.redirect(`/trust/showcircle?id=${finalId}`)
}

module.exports.indexCirclesOfTrust = rViewCircles
module.exports.createCircleOfTrust = rCreateCircle
module.exports.showCircleOfTrust = rShowCircle
module.exports.createCircleOfTrustEntry = rCreateCircleEntry