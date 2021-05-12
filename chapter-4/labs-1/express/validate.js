'use strict'

const assert = require('assert').strict
const http = require('http')
const { promisify } = require('util')

const timeout = promisify(setTimeout)
const get = promisify((url, cb) => {
    http.get(url, (res) => {
        cb(null, res)
    }).once('error', (err) => {
        cb(err)
    })
})
const URL = 'http://localhost:3000/me'

async function routeExists() {
    const res = await get(URL)

    assert.equal(
        res.statusCode,
        200,
        `${URL} must respond with 200 response`
    )

    console.log(`☑️  GET ${URL} responded with 200 response`)
}

async function layoutCheck() {
    const res = await get(URL)
    const data = []

    for await (const chunk of res) data.push(chunk)

    const html = Buffer.concat(data).toString('utf-8')

    const markers = RegExp('<style>\\s+body\\s+{\\s+background:\\s+#333;\\s+margin:\\s+1\\.25rem\\s+}' +
        '\\s+h1\\s+{\\s+color:\\s+#EEE;\\s+font-family:\\s+sans-serif\\s+}\\s+a\\s+{\\s+' +
        'color:\\s+yellow;\\s+font-size:\\s+2rem;\\s+font-family:\\s+sans-serif\\s+}\\s+' +
        '<\\/style>')

    assert.match(
        html,
        markers,
        `${URL} must use the layout.hbs view to render`
    )

    console.log(`☑️  GET ${URL} reuses the layout.hbs view to render`)
}

async function validate(retries = 0) {
    let done = false
    let passed = false
    try {
        if (retries > 10) {
            assert.fail(`Unable to connect to server at ${URL}`)
        }
        await routeExists()
        await layoutCheck()
        done = true
        passed = true
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            await timeout(500)
            return await validate(retries + 1)
        }
        done = true
        throw err
    } finally {
        if (done) {
            if (passed) console.log('\nPASSED\n')
        }
    }
}

validate().catch((err) => {
    if (err.code === 'ERR_ASSERTION') {
        console.log('⛔️ ' + err.message)
        process.exit(1)
    }
})
