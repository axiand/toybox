var isSolved = false

async function doCaptcha(e, btn) {
    e.preventDefault()

    let res
    let resJ
    try {
        btn.disabled = true
        res = await fetch('/bbs/captcha/get')
        if (res.status == 200) {
            resJ = await res.json()
        }
    } catch (e) {
        console.log(e)
        alert(`${e}. Check the browser console for more details`)
        return
    }

    console.log(resJ)
    if (res.status == 429) return alert(`You're attempting the captcha too fast, try again in a moment`)
    if (res.status != 200) return alert(`Failed to get captcha: ${res.status}`)

    let solution = prompt(`Captcha: ${resJ.a} + ${resJ.b} = ?`)
    console.log(solution)
    if (solution == null) return

    let capStr = `${resJ.h}:${resJ.ts}:${solution}`
    checkCaptcha(capStr)
}

async function checkCaptcha(str = null) {
    markButtonsDisabled(true)

    let res
    let resJ
    let usp = new URLSearchParams()
    if (str != null) usp.set('capStr', str)
    try {
        res = await fetch('/bbs/captcha/check', {
            method: 'post',
            body: usp
        })

        if (res.status != 200) {
            console.log(res)
            alert(`Wrong solution or invalid captcha (${res.status})`)
            markButtonsDisabled(false)
            return
        }

        resJ = await res.json()
    } catch (e) {
        console.log(e)
        alert(`${e}. Check the browser console for more details`)
        markButtonsDisabled(false)
        return
    }

    console.log(resJ)
    let { success } = resJ

    markButtonsDisabled(false)
    if (success) markCaptchaSolved()
}

function injectCaptchaButtons() {
    for (let form of document.querySelectorAll('.bbs-post-form')) {
        /* 
            the class bbs-post-form-nam is a misnomer, it can also refer to the subject field,
            but i'm too lazy to change it right now
        */
        let field = form.querySelector('.bbs-post-form-name')

        let nameField = form.querySelector('input[name="name"]')

        nameField.addEventListener('change', () => {
            localStorage.setItem('toybox_bbs_name', nameField.value)
        })
        nameField.value = localStorage.getItem('toybox_bbs_name')

        let btn = document.createElement('button')
        btn.innerHTML = 'Get Captcha'
        btn.classList.add('bbs-captcha-button')
        btn.addEventListener('click', (e) => {
            doCaptcha(e, btn)
            markButtonsDisabled(false)
        })

        field.appendChild(btn)

        let submitBtn = form.querySelector('.bbs-submit-btn')
        submitBtn.addEventListener('click', (e) => {
            if (!isSolved) {
                e.preventDefault()
                alert('Please solve the captcha first.')
            }
        })
    }
}

function markButtonsDisabled(bool) {
    for (let btn of document.querySelectorAll('.bbs-captcha-button')) {
        btn.disabled = !!bool
    }
}

function markCaptchaSolved() {
    isSolved = true
    for (let btn of document.querySelectorAll('.bbs-captcha-button')) {
        btn.innerHTML = 'Solved!'
    }
    markButtonsDisabled(true)
}

async function init() {
    injectCaptchaButtons()
    if (await cookieStore.get('toybox_captcha') != null) checkCaptcha()
}

init()