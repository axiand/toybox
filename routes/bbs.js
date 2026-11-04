const { readdirSync, readFileSync, existsSync, writeFileSync, appendFileSync, rmSync, statSync } = require('fs')
const { join, resolve } = require('path')
const seedrandom = require('seedrandom')

const { ipToHash } = require('../common/hash')
const { checkBannedSentence } = require('../common/badWords')
const { kvlSerialize, kvlReadFile } = require('../common/kvline')
const { bansCreateIpBan, bansCheckIpBan, bansGetIpBanCount, bansGetIpBans, bansRemoveIpBan } = require('./bans')

const BBS_PATH = join(__dirname, '../data/bbs/')
const BBS_MARKER_PATH = join(__dirname, '../data/bbs/_latestId')
const UI_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-index.html'))
const ERROR_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-error.html'))
const THREAD_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-thread.html'))
const POST_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-post.html'))
const REPLY_FORM_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-form.html'))
const INFO_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-info.html'))
const ADMIN_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-admin.html'))
const CAPTCHA_TEMPLATE = readFileSync(join(__dirname, '../static/bbs-captcha.js'))

const SAFE_STRING_RGX = /^.+$/
const MAX_SUBJECT_LENGTH = 120
const MAX_NAME_LENGTH = 25
const MAX_COMMENT_LENGTH = 1500
const REPLY_TAIL_LENGTH = 5
const POST_RATE_LIMIT = 30 * 1000
const CAPTCHA_DIFFICULTY = 150
const CAPTCHA_MAX_AGE = 30 * 60 * 1000

const ADMIN_HASH = ipToHash(process.env['TOYBOX_ADMIN_PASS'])
var RATE_LIMITS = new Map()

function isSafeString(str, maxLength, allowNewline = false) {
    if (str.length > maxLength) return false
    if (str.trim().length <= 0) return false
    if (!allowNewline && str.includes('\n')) return false

    return true
}

function escape(str) {
    if (str == null) return str
    str = str.replaceAll('<', '&lt;')
    str = str.replaceAll('>', '&gt;')

    return str
}

function checkRateLimit(key, limit) {
    let last = RATE_LIMITS.get(key) ?? 0
    let now = Date.now()

    if (now < last + limit) return false

    RATE_LIMITS.set(key, now)
    return true
}

function rejectRequest(req, reason) {
    let ui = ERROR_TEMPLATE + ''

    ui = ui.replace('%reason%', reason)

    req.status(400)
    req.send(ui)
    return false
}

function createThread(postData, req) {
    let { subject, name, comment } = postData
    if (!subject || !isSafeString(subject, MAX_SUBJECT_LENGTH)) return rejectRequest(req, 'Subject is malformed, empty, or uses invalid characters')
    if (!name || !isSafeString(name, MAX_NAME_LENGTH)) return rejectRequest(req, 'Name is malformed, empty, or uses invalid characters')
    if (
        !comment
        || (!isSafeString(comment, MAX_COMMENT_LENGTH, true) && postData.admin != 'on')
    ) return rejectRequest(req, 'Comment is malformed, empty, or uses invalid characters')

    let threads = showThreads(BBS_PATH)
    if ((threads[0]?.ownerIp ?? '0') == req.req.ip && postData.admin != 'on') return rejectRequest(req, 'Please do not flood the thread index.')

    let lastId

    if (!existsSync(BBS_MARKER_PATH)) {
        lastId = '0'
    } else {
        lastId = readFileSync(BBS_MARKER_PATH, { encoding: 'utf-8' })
    }

    lastId = parseInt(lastId) + 1

    writeFileSync(join(BBS_PATH, `/${lastId}.txt`), "")
    writeFileSync(BBS_MARKER_PATH, `${lastId}`)

    return createPost(lastId, postData, req)
}

function createPost(id, postData, req) {
    let { name, comment } = postData
    if (!name || !isSafeString(name, MAX_NAME_LENGTH)) return rejectRequest(req, 'Name is malformed, empty, or uses invalid characters')
    if (
        !comment
        || (!isSafeString(comment, MAX_COMMENT_LENGTH, true) && postData.admin != 'on')
    ) return rejectRequest(req, 'Comment is malformed, empty, or uses invalid characters')

    let thread = getThread(join(BBS_PATH, `/${id}.txt`))
    if (thread == "path traversal") return thread
    if (!thread) return rejectRequest(req, 'Thread does not exist')

    let tEnts = thread.entries
    if (
        (tEnts[tEnts.length - 1]?.ip ?? '0') == req.req.ip
        && (tEnts[tEnts.length - 2]?.ip ?? '0') == req.req.ip
        && postData.admin != 'on'
    ) return rejectRequest(req, 'Too many consecutive posts.')

    postData['ts'] = Date.now()
    postData['comment'] = comment.replaceAll('\n', '<br>')

    appendFileSync(thread.path, kvlSerialize(postData))

    return thread
}

function deleteThread(id) {
    let where = join(BBS_PATH, `/${id}.txt`)

    if (!existsSync(where)) return
    rmSync(where)
}

function showThreads(where, adminMode) {
    let entries = readdirSync(where, { withFileTypes: true })
    entries = entries.filter(e => !e.isDirectory() && e.name != '_latestId')

    let threads = []

    for (let threadFile of entries) {
        let thr = getThread(join(where, threadFile.name), adminMode)
        if (thr.entries.length > REPLY_TAIL_LENGTH) thr.entries = thr.entries.slice(thr.entries.length - REPLY_TAIL_LENGTH - 1)
        thr.updatedAt = statSync(join(where, threadFile.name)).ctimeMs

        threads.push(thr)
    }

    threads.sort((a, b) => { return parseInt(a.updatedAt) - parseInt(b.updatedAt) }).reverse()

    return threads
}

function getThread(where, adminMode = false) {
    if (!resolve(where).startsWith(BBS_PATH) || where.includes('..')) return "path traversal"
    if (!existsSync(where)) return null

    let threadData = readFileSync(where, { encoding: 'utf-8' })
    let threadEntries = kvlReadFile(threadData)

    threadEntries.sort((a, b) => { return parseInt(a.ts) - parseInt(b.ts) })

    return {
        id: where.match(/([0-9]+)\.txt$/)[1],
        path: resolve(where),
        entries: threadEntries,
        op: threadEntries[0],
        subject: threadEntries.find(e => e.subject != null)?.subject ?? "New Thread",
        len: threadEntries.length,
        ownerIp: threadEntries[0]?.ip,
        admin: adminMode
    }
}

function renderThreadList(threads) {
    let ui = ''

    for (let thread of threads) {
        ui += renderThread(thread)
        ui += '<hr>'
    }

    return ui
}

function renderThread(thread, briefMode = true) {
    let ui = THREAD_TEMPLATE + ''

    ui = ui.replaceAll('%tid%', thread.id)
    ui = ui.replace('%title%', thread.subject)
    ui = ui.replaceAll('%replyCount%', thread.len - 1)

    ui = ui.replace('%opPost%', renderPost(thread.op, thread.id, thread.admin))

    let uiReplies = ''
    for (let rep of thread.entries.slice(1)) {
        uiReplies += `<li>${renderPost(rep, thread.id, thread.admin)}</li>`
    }
    ui = ui.replace('%replies%', uiReplies)
    ui = ui.replace('%offset%', thread.len > REPLY_TAIL_LENGTH && briefMode ? thread.len - REPLY_TAIL_LENGTH : 1)

    let uiReply = REPLY_FORM_TEMPLATE + ''
    uiReply = uiReply.replace('%tid%', thread.id)
    uiReply = uiReply.replace('%postAsAdmin%', !thread.admin ? '' : `
            <input type="checkbox" name="postAsAdmin" id="postAsAdmin.${thread.id}">
            <label for="postAsAdmin.${thread.id}">Admin Post</label>
        `)
    ui = ui.replace('%replyForm%', uiReply)

    return ui
}

function renderPost(post, tid, adminMode) {
    let ui = POST_TEMPLATE + ''

    ui = ui.replaceAll('%tid%', tid)
    ui = ui.replaceAll('%at%', post.ts)

    let publicId = `${post.admin == 'on' ? '# Admin #' : ipToHash(post.ip).slice(0, 6)}`
    let posterIsBanned = bansCheckIpBan(post.ip)

    ui = ui.replace('%userName%',
        !(posterIsBanned && !adminMode)
            ? post.name
            : '<span class="bbs-banned">A Banned User</span>'
    )
    ui = ui.replace('%userId%', `${publicId}${adminMode ? ` ${post.ip}` : ''}`)
    ui = ui.replace('%ts%', `${new Date(parseInt(post.ts)).toUTCString()}`)
    ui = ui.replace('%comment%', !(posterIsBanned && !adminMode) ? post.comment : '')

    if (adminMode) {
        if (!posterIsBanned) {
            ui = ui.replace('%adminBan%', `
                <form method="post" action="/bbs/admin/banip" class="smallform">
                    <input type="hidden" name="ip" value="${post.ip}">
                    <button>ban ip</button>
                </form>
            `)
        } else {
            ui = ui.replace('%adminBan%', `<span class="bbs-admin-banned">[Banned]</span>`)
        }
    } else {
        ui = ui.replace('%adminBan%', '')
    }

    return ui
}

function rRead(req, res) {
    let ui = UI_TEMPLATE + ''
    let threadId = req.query['read']

    if (threadId == null) {
        let threads = showThreads(BBS_PATH, isAdmin(req))

        ui = ui.replace('%articles%', renderThreadList(threads))
        ui = ui.replace('%homeLinkStyle%', `style="display: none;"`)
        ui = ui.replace('%bbsInfo%', INFO_TEMPLATE)
        ui = ui.replace('%threadCount%', `${threads.length} thread(s) - Your ID: ${ipToHash(req.ip).slice(0, 6)}`)
        ui = ui.replace('%title%', 'Asciiboard')
    } else {
        let thread = getThread(join(BBS_PATH, `${threadId}.txt`), isAdmin(req))
        if (thread == 'path traversal') return rejectRequest(res, 'no')
        if (!thread) return rejectRequest(res, `The thread you're looking for no longer exists! Try browsing some fresh threads on the home page.`)

        ui = ui.replace('%articles%', renderThread(thread, false))
        ui = ui.replace('%bbsInfo%', '')
        ui = ui.replace('%threadCount%', `${thread.len - 1} replies - Your ID: ${ipToHash(req.ip).slice(0, 6)}`)
        ui = ui.replace('%title%', `${thread.subject} :: Asciiboard`)
    }

    ui = ui.replace('%postAsAdmin%', !isAdmin(req) ? '' : `
            <input type="checkbox" name="postAsAdmin" id="postAsAdmin">
            <label for="postAsAdmin">Admin Post</label>
        `)

    res.send(ui)
}

function rSubmit(req, res) {
    let { subject, name, comment, tid, postAsAdmin } = req.body

    if (bansCheckIpBan(req.ip)) return rejectRequest(res, 'You are currently banned from posting.')

    let isAdminPost = (postAsAdmin ?? 'off') == 'on'
    if (!isAdmin(req) && isAdminPost) return rejectRequest(res, 'Cannot post as admin.')

    if ((checkBannedSentence(subject ?? '') || checkBannedSentence(name ?? '') || checkBannedSentence(comment ?? '')) && !isAdminPost) {
        return rejectRequest(res, 'The server rejected your post because it seems to be spam or malicious.')
    }
    if (!checkRateLimit(req.ip, POST_RATE_LIMIT) && !isAdminPost) return rejectRequest(res, `You're posting too fast! Please wait 30 seconds.`)
    if (!checkCaptcha(req.cookies.toybox_captcha ?? '')[0] && !isAdminPost) return rejectRequest(res, `Invalid captcha (if you're having trouble, try clearing cookies)`)

    let postData = {
        subject: subject,
        name: name?.length < 1 ? "Anonymous" : name,
        comment: comment,
        ip: req.ip,
        admin: postAsAdmin ?? 'off'
    }

    for (let k in postData) {
        postData[k] = escape(postData[k])
    }

    if (tid == null) {
        let threadRes = createThread(postData, res)
        if (threadRes) res.redirect(`/bbs/?read=${threadRes.id}`)
    } else {
        let postRes = createPost(tid, postData, res)
        if (postRes) res.redirect(`/bbs/?read=${tid}`)
    }
}

function rGetCaptchaJs(req, res) {
    res.type('application/javascript')
    res.send(CAPTCHA_TEMPLATE)
}

function rGetCaptcha(req, res) {
    if (!checkRateLimit(`${req.ip}:captcha.get`, 2500)) return res.sendStatus(429)

    let ts = Date.now()
    let hash = ipToHash(ts)

    let numA = Math.round(seedrandom(ipToHash(ts)).double() * CAPTCHA_DIFFICULTY)
    let numB = Math.round(seedrandom(ipToHash(ts + 255)).double() * CAPTCHA_DIFFICULTY)

    res.type('application/json')
    res.send(JSON.stringify({ ts: ts, h: hash, a: numA, b: numB }))
}

function rCheckCaptcha(req, res) {
    let capStr = req.body?.capStr ?? req.cookies.toybox_captcha
    if (!capStr) return res.sendStatus(400)

    let [result, capTsInt] = checkCaptcha(capStr)
    if (!result) return res.sendStatus(400)

    res.type('application/json')
    res.cookie('toybox_captcha', capStr, {
        expires: new Date(capTsInt + CAPTCHA_MAX_AGE)
    })
    res.send(JSON.stringify({ success: true }))
}

function checkCaptcha(capStr) {
    let [capHash, capTs, capSolution] = capStr.split(":")

    /* Check for expiry */
    let capTsInt = parseInt(capTs)
    if (isNaN(capTsInt)) return [false]
    if (Date.now() > (capTsInt + CAPTCHA_MAX_AGE)) return [false]

    /* Check for hash forgery (hash is derived from ts) */
    let checkHash = ipToHash(capTs)
    if (capHash != checkHash) return [false]

    /* Reconstruct the challenge and see if the solution matches */
    let checkA = Math.round(seedrandom(ipToHash(capTsInt)).double() * CAPTCHA_DIFFICULTY)
    let checkB = Math.round(seedrandom(ipToHash(capTsInt + 255)).double() * CAPTCHA_DIFFICULTY)
    let checkSolution = (checkA + checkB)
    if (capSolution != checkSolution) return [false]

    return [true, capTsInt]
}

function checkAdminHash(str) {
    return str == ADMIN_HASH
}

function isAdmin(req) {
    return (req.cookies.toybox_admin ?? '') == ADMIN_HASH
}

function rAdmin(req, res) {
    let ui = ADMIN_TEMPLATE + ''

    if (isAdmin(req)) {
        ui = ui.replace('%loginForm%', '<p style="font-family: cursive;">Access Granted!!</p>')

        let toolsUi = ''

        let deleteThreadsUi = ''
        for (let thread of showThreads(BBS_PATH)) {
            deleteThreadsUi += `
                <li>
                    <input type="checkbox" name="p.${thread.id}" id="p.${thread.id}">
                    <label for="p.${thread.id}">#${thread.id}: ${thread.subject}</label>
                </li>
            `
        }

        toolsUi += `
            <h2>Delete Threads</h2>
            <form action="/bbs/admin/deletethreads" method="post">
                <ul>${deleteThreadsUi}</ul>
                <input type="checkbox" name="ban" id="ban">
                <label for="ban">Ban OPs</label>
                <button>Delete selected threads</button>
            </form>
        `

        toolsUi += `
            <h2>Banned IPs (${bansGetIpBanCount()})</h2>
            <form action="/bbs/admin/banip" method="post">
                <b>Make IP Ban</b>
                <input type="text" name="ip" value="">
                <input type="checkbox" name="unban" id="unban">
                <label for="unban">Unban</label>
                <button>Submit</button>
            </form>
            <ul>
        `
        for (let ban of bansGetIpBans()) {
            toolsUi += `<li>${ban}</li>`
        }
        toolsUi += `</ul>`

        ui = ui.replace('%adminTools%', toolsUi)
    } else {
        ui = ui.replace('%loginForm%', `
            <form action="/bbs/admin/login" method="post">
                <b>Password</b>
                <input type="password" name="password">
            </form>
        `)
        ui = ui.replace('%adminTools%', 'Login to view Admin Tools')
    }

    res.send(ui)
}

function rAdminLogin(req, res) {
    let { password } = req.body

    if (password == null || !checkAdminHash(ipToHash(password))) return rejectRequest(res, 'Invalid password!')

    res.cookie('toybox_admin', ipToHash(password))
    res.redirect("/bbs/admin")
}

function rAdminBan(req, res) {
    if (!isAdmin(req)) return rejectRequest(res, `<i>You need to be a trained stalemate associate to press that button. You're unqualified.</i>`)

    if (!(req.body.unban ?? false)) {
        bansCreateIpBan(req.body.ip)
    } else {
        bansRemoveIpBan(req.body.ip)
    }

    res.redirect(req.headers['referer'])
}

function rAdminDeleteThreads(req, res) {
    if (!isAdmin(req)) return rejectRequest(res, `<i>You need to be a trained stalemate associate to press that button. You're unqualified.</i>`)

    let postIds = Object.getOwnPropertyNames(req.body)
        .filter(prop => prop.startsWith("p."))
        .map(prop => prop.slice(2))

    for (let id of postIds) {
        let thr = getThread(join(BBS_PATH, `/${id}.txt`), true)

        deleteThread(id)
        if (req.body.ban ?? false) {
            bansCreateIpBan(thr.op.ip)
        }
    }

    res.redirect(req.headers.referer)
}

module.exports.readBbs = rRead
module.exports.submitBbs = rSubmit
module.exports.bbsGetCaptchaJs = rGetCaptchaJs
module.exports.bbsGetCaptcha = rGetCaptcha
module.exports.bbsCheckCaptcha = rCheckCaptcha
module.exports.adminBbs = rAdmin
module.exports.adminBbsLogin = rAdminLogin
module.exports.adminBbsBan = rAdminBan
module.exports.adminBbsDeleteThreads = rAdminDeleteThreads