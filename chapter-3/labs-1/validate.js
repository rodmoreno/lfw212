'use strict'
const assert = require('assert').strict
const { once } = require('events')
const { spawn } = require('child_process')
const http = require('http')
const { tmpdir } = require('os')
const { join } = require('path')
const { writeFileSync } = require('fs')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

const timeout = promisify(setTimeout)
const get = promisify((url, cb) => {
  http.get(url, (res) => {
    cb(null, res)
  }).once('error', (err) => {
    cb(err)
  })
})
const HOST = 'http://localhost:3000'
const injectPath = join(tmpdir(), 'inject.js')
const data = randomBytes(10).toString('base64')
const inject = `require('crypto').randomBytes = () => '${data}'`

writeFileSync(injectPath, inject)

const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
  env: { ...process.env, NODE_OPTIONS: `-r ${injectPath}` }
})

server.stderr.pipe(process.stderr)

async function dataCheck () {
  const res = await get(HOST)

  const [content] = await once(res, 'data')

  assert.equal(
    content.toString(),
    data,
    `${HOST} must respond with result calling data lib function`
  )

  console.log(`☑️  GET ${HOST}/ responded with data output`)
}

async function notFoundCheck () {
  const res = await get(`${HOST}/example`)

  assert.equal(
    res.statusCode,
    404,
    `${HOST}/example must respond with 404 Not Found status`
  )

  console.log(`☑️  GET ${HOST}/example responded with 404 Not Found status`)
}

async function validate (retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 10) {
      assert.fail(`Unable to connect to server at ${HOST}`)
    }
    await dataCheck()
    await notFoundCheck()
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

