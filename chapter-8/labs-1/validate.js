'use strict'
const { rng } = require('crypto')
const http = require('http')
const { promisify } = require('util')
const { spawn } = require('child_process')
const net = require('net')
const assert = require('assert').strict
const { AssertionError } = require('assert')
const { once } = require('events')

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

async function system () {
  const PORT = await getPort(3000)
  const body = {data: rng(5).toString('hex')}
  const server = async () => {
    const srv = http.createServer((req, res) => {
      res.statusCode = 404
      const { pathname } = new URL(`${base}${req.url}`)
      if (pathname === '/ok') {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cookie', 'test')
        res.statusCode = 200
        res.end(JSON.stringify(body))
        return
      }
      if (pathname === '/redir') res.statusCode = 301
      res.end()
    })
    srv.listen(0)
    await once(srv, 'listening')
    const base = 'http://localhost:' + srv.address().port
    return { base, close: srv.close.bind(srv) }
  }
  const app = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
    cwd: __dirname,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT }
  })
  const srv = await server()
  function close () {
    srv.close()
    app.kill()
  }
  try {
    await up(PORT)
    return { port: PORT, close, base: srv.base, expected: body }
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

async function validate ({ port, base, expected }, retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 3) {
      assert.fail(`Unable to connect to server on port: ${port}`)
    }

    await t(notFound(port, '/bad-route'))
    await t(badRequest(port))
    await t(notFound(port, `/?url=${base}/bad-route`), {past: 'forwarded', present: 'forward'})
    await t(redirect(port, base))
    await t(ok(port, base, expected))
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

async function ok (port, base, expected) {
  const url = `http://localhost:${port}/?url=${base}/ok`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    200,
    `GET ${url} must forward 200 response code from upstream server, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} forwarded 200 response`)

  assert.match(
    res.headers['content-type'],
    /application\/json/,
    `GET ${url} must forward correct mime-type, got ${res.headers['content-type']}`
  )

  console.log(`☑️  GET ${url} forwarded correct Content-Type header`)

  assert.match(
    res.headers['cookie'],
    /test/,
    `GET ${url} must forward correct cookie header, got ${res.headers['cookie']}`
  )
  console.log(`☑️  GET ${url} forwarded correct Cookie header`)

  const content = await body(res)
  try {
    const result = JSON.parse(content)
    assert.equal(result.data, expected.data, `GET ${url} must forward correct data\n   got -  ${content})`)
    console.log(`☑️  GET ${url} forwarded correct data`)
  } catch (err) {
    if (err instanceof SyntaxError) assert.fail(`GET ${url} response not parsable JSON`)
    else throw err
  }
}

async function redirect (port, base) {
  const url = `http://localhost:${port}/?url=${base}/redir`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    301,
    `GET ${url} must forward 301 response from upstream server, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} forwarded 301 response`)
}

async function notFound (port, route, msg = {past: 'responded with', present: 'respond with'}) {
  const url = `http://localhost:${port}${route}`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    404,
    `GET ${url} must ${msg.present} 404 response`
  )
  console.log(`☑️  GET ${url} ${msg.past} 404 response`)
}

async function badRequest (port) {
  const url = `http://localhost:${port}/`
  const res = await get(url)

  assert.equal(
    res.statusCode,
    400,
    `GET ${url} must respond with 400, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} responded with 400`)
}


start().catch(console.error)

