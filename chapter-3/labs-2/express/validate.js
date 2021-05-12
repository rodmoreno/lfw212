'use strict'
const assert = require('assert').strict
const { spawn } = require('child_process')
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
const post = promisify((url, cb) => {
  http.request(url, { method: 'POST' }, (res) => {
    cb(null, res)
  }).once('error', (err) => {
    cb(err)
  }).end()
})
const HOST = 'http://localhost:3000'


const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'])

server.stderr.pipe(process.stderr)

async function okCheck () {
  const res = await get(HOST)

  assert.equal(
    res.statusCode,
    200,
    `GET ${HOST}/ must respond with a 200 OK status`
  )

  console.log(`☑️  GET ${HOST}/ responded with a 200 OK status`)
}

async function methodNotAllowedCheck () {
  const res = await post(`${HOST}/`)

  assert.equal(
    res.statusCode,
    405,
    `POST ${HOST}/ must respond with 405 Method Not Allowed status`
  )

  console.log(`☑️  POST ${HOST}/ responded with 405 Method Not Allowed status`)
}

async function validate (retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 10) {
      assert.fail(`Unable to connect to server at ${HOST}`)
    }
    await okCheck()
    await methodNotAllowedCheck()
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
      server.kill()
    }
  }
}

validate().catch((err) => {
  if (err.code === 'ERR_ASSERTION') {
    console.log('⛔️ ' + err.message)
    process.exit(1)
  }
})

