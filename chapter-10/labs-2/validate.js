'use strict'
const http = require('http')
const { promisify } = require('util')
const { spawn, execSync } = require('child_process')
const net = require('net')
const assert = require('assert').strict
const { AssertionError } = require('assert')
const { mkdtempSync, writeFileSync } = require('fs')
const { tmpdir }  = require('os')
const { join } = require('path')
const tmp = mkdtempSync(join(tmpdir(), 'ch-10-labs-2'))
const preload = join(tmp, 'preload.js')
const ip = join(tmp, 'ip')
writeFileSync(ip, '')
writeFileSync(
  preload, `
    const fs = require('fs')
    const net = require('net')
    const proto = net.Socket.prototype
    net.Socket.prototype = Object.create(proto, {
        remoteFamily: { get() {
          const ip = fs.readFileSync('${ip}', {encoding: 'utf8'})
          if (ip) return 'IPV4'
          return Object.getOwnPropertyDescriptors(proto).remoteFamily.get.call(this)
        }},
        remoteAddress: { get() {
          const ip = fs.readFileSync('${ip}', {encoding: 'utf8'})
          if (ip) return ip
          return Object.getOwnPropertyDescriptors(proto).remoteAddress.get.call(this)
        }}
      }
    )
  `
)

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
  const app = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT, NODE_OPTIONS: `-r ${preload}` },
    detached: true
  })
  function close () {
    if( process.platform == "win32"){
      try { 
        execSync(`taskkill /PID ${app.pid} /T /F`)
      } catch (err) {
        try { 
          app.kill()
        } catch (err) {}
      }
    } else {
      process.kill(-app.pid) 
    }
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
  const url = `http://localhost:${port}/`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    200,
    `GET ${url} must respond 200`
  )
  console.log(`☑️  GET ${url} responded with 200 response`)
}

async function attack (port) {
  writeFileSync(ip, '211.133.33.113')
  try { 
    const url = `http://localhost:${port}/`
    const res = await get(url)
    assert.equal(
      res.statusCode,
      403,
      `GET ${url} must respond 403 when requested from attacker IP`
    )
    console.log(`☑️  GET ${url} responded with 403 when requested from attacker IP`)
  } finally {
    writeFileSync(ip, '')
  }
}

start().catch(console.error)
