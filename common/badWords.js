const { readFileSync } = require("fs")
const { join } = require("path")

var BAD_WORDS = new Set()
const BW_FALSE_POSITIVES =
    [
        "abo", "abraham", "apeshit", "ape", "shit", "ass", "fuck", "jew", "nuggets",
        "monkey", "spook", "bitch", "cock", "arse", "bum", "butt", "gay", "dick", "hag",
        "queer", ""
    ]

function includesAny(what, src) {
    let hit = false

    for (let item of src) {
        if (what.includes(item)) {
            hit = true
            break
        }
    }

    return hit
}

function checkBannedWord(word) {
    return includesAny(word, [...BAD_WORDS])
}

function checkBannedSentence(str) {
    let hit = false

    if (checkBannedWord(str.replaceAll(/\s/g, ''))) return true

    for (let word of str.split(/\s/)) {
        hit = checkBannedWord(word)
        if (hit) break
    }

    return hit
}

function loadBannedWordsDictionary() {
    console.log("Loading banned words dictionary")
    // https://huggingface.co/datasets/mmathys/profanity/raw/main/profanity_en.csv
    let data = readFileSync(join(__dirname, '../static/profanity_en.csv'), { encoding: 'utf-8' })
    let lines = data.split(/\r?\n/)

    for (let term of lines) {
        let [word, alt1, alt2, alt3, cat1, cat2, cat3, _, sev] = term.split(",")
        if (!(
            [cat1, cat2, cat3].includes('racial / ethnic slurs') ||
            ([cat1, cat2, cat3].includes('sexual orientation / gender') && sev == "Severe")
        )) continue

        BAD_WORDS.add(word)
        BAD_WORDS.add(alt1)
        BAD_WORDS.add(alt2)
        BAD_WORDS.add(alt3)
    }

    for (let fp of BW_FALSE_POSITIVES) {
        BAD_WORDS.delete(fp)
    }

    console.log("Dictionary loaded")
    //console.log([...BAD_WORDS].join(", "))
}

loadBannedWordsDictionary()

module.exports.badWords = BAD_WORDS
module.exports.checkBannedWord = checkBannedWord
module.exports.checkBannedSentence = checkBannedSentence