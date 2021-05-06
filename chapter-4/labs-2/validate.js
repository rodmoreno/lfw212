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
const URL = 'http://localhost:3000/data'

async function routeExists () {
  const res = await get(URL)

  assert.equal(
    res.statusCode,
    200,
    `${URL} must respond with 200 response`
  )

  console.log(`☑️  GET ${URL} responded with 200 response`)
}

async function layoutCheck () {
  const res = await get(URL)
  const data = []
  const timings = []

  for await (const chunk of res) {
    timings.push(Date.now())
    data.push(chunk)
  }

  const output = Buffer.concat(data).toString('utf-8')

  const deltas = timings.map((t, i) => {
    if (i === 0) return 0
    return t - timings[i - 1]
  }).slice(1)

  assert.equal(
    output,
    'this<br>is<br>a<br>stream<br>of<br>data<br>',
    'response data should be "this<br>is<br>a<br>stream<br>of<br>data<br>"'
  )
  assert.ok(
    deltas.every((t) => Math.abs(t - 500) <= 20),
    'expected ~500ms delay between items in response'
  )

  console.log(`☑️  GET ${URL} has expected delay between items in repsonse stream`)
}

async function validate (retries = 0) {
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

