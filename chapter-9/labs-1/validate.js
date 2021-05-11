'use strict'
const http = require('http')
const { promisify } = require('util')
const { spawn } = require('child_process')
const net = require('net')
const assert = require('assert').strict
const { AssertionError } = require('assert')
const { rng } = require('crypto')

const timeout = promisify(setTimeout)
const get = promisify((url, cb) => {
  const req = http.get(url, (res) => {
    cb(null, res)
  }).once('error', (err) => {
    cb(err)
  }).once('timeout', () => {
    const err = Error('timeout')
    err.code = 'EREQTIMEOUT'
    err.url = url
    err.method = 'GET'
    cb(err)
  })
  req.setTimeout(1500)
})

const body = async (res) => {
  const chunks = []
  for await (const chunk of res) chunks.push(chunk)
  return Buffer.concat(chunks).toString()
}

const getPort = promisify(function retry (port, cb) {
  const server = net.createServer()
  server.listen(port, () => {
    server.once('close', () => cb(null, port))
    server.close()
  })
  server.on('error', () => retry(port + 1, cb))
})

const up = promisify(function retry (port, cb) {
  if (!up.timeout) {
    up.timeout = setTimeout(() => {
      cb(new AssertionError({message: 'server did not start in time'}))
    }, 1500).unref()
  }
  const socket = net.connect(port).unref()
    .once('error', () => (setTimeout(retry, 300, port, cb).unref()))
    .once('connect', () => {
      clearTimeout(up.timeout)
      socket.end()
      cb()
    })
})

async function system (p1 = 3000) {
  const PORT = await getPort(p1)
  const app = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT }
  })
  function close () {
    app.kill()
  }
  try {
    await up(PORT)
    return { port: PORT, app, close }
  } catch (err) {
    close()
    throw err
  }
}

async function start () {
  try {
    var sys = await system()
    await validate(sys)
  } catch (err) {
    if (err.code === 'ERR_ASSERTION') {
      console.log('⛔️ ' + err.message)
    } else throw err
  } finally {
    if (sys) sys.close()
  }
}

async function validate ({ port, app }, retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 3) {
      assert.fail(`Unable to connect to server on port: ${port}`)
    }
    await t(ok(port))
    await t(attack(port, app))
    await t(withoutParam(port, app))
    done = true
    passed = true
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      await timeout(500)
      return await validate({ port }, retries + 1)
    }
    done = true
    throw err
  } finally {
    if (done && passed) console.log('\nPASSED\n')
  }
}

async function t (validator) {
  try {
    await validator
  } catch (err) {
    const { code, method, url } = err
    if (code === 'EREQTIMEOUT') {
      assert.fail(`${method} ${url} failed to respond`)
    }
    throw err
  }
}

async function ok (port) {
  const input = 'xx' + rng(3).toString('hex').toLowerCase()
  const expect = input.toUpperCase()
  const url = `http://localhost:${port}/?un=${input}`
  const before = Date.now()
  const res = await get(url)
  const delta = Date.now() - before
  assert.equal(
    res.statusCode,
    200,
    `GET ${url} must respond 200`
  )
  console.log(`☑️  GET ${url} responded with 200 response`)
  assert.ok(
    delta > 1000 && delta < 1200,
    `GET ${url} must respond after approx. 1s`
  )
  console.log(`☑️  GET ${url} responded after approx. 1s`)

  const content = await body(res)
  try {
    assert.equal(content, expect)
    console.log(`☑️  GET ${url} responded with correct data`)
  } catch (err) {
    if (err instanceof SyntaxError) assert.fail(`GET ${url} response not parsable JSON`)
    else throw err
  }
}

async function attack (port, app) {
  const fail = () => {
    assert.fail(`GET ${url} caused service to crash`)
  }
  app.once('exit', fail)
  const input = 'xx' + rng(3).toString('hex').toLowerCase()
  const extra = 'xx' + rng(3).toString('hex').toLowerCase()
  const url = `http://localhost:${port}/?un=${input}&un=${extra}`
  await get(url)
  console.log(`☑️  GET ${url} responded without service crashing`)
  app.removeListener('exit', fail)
}

async function withoutParam (port, app) {
  const fail = () => {
    assert.fail(`GET ${url} caused service to crash`)
  }
  app.once('exit', fail)
  const url = `http://localhost:${port}`
  await get(url)
  console.log(`☑️  GET ${url} responded without service crashing`)
  app.removeListener('exit', fail)

}

start().catch(console.error)

