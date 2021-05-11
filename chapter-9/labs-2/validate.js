'use strict'
const http = require('http')
const { promisify } = require('util')
const { once } = require('events')
const { spawn } = require('child_process')
const { randomBytes } = require('crypto')
const net = require('net')
const assert = require('assert').strict
const { join } = require('path')
const { writeFile } = require('fs').promises

const DATA_500 = randomBytes(2).toString('hex')

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
const send = (url, { method = 'post' } = {}) => {
  const req = http.request(url, { method, headers: { 'content-type': 'application/json' } })
  req.setTimeout(1500)
  return (data) => (promisify((data, cb) => {
    req
      .once('error', cb)
      .once('response', (res) => { cb(null, res) })
      .once('timeout', () => {
        const err = Error('timeout')
        err.code = 'EREQTIMEOUT'
        err.url = url
        err.method = method.toUpperCase()
        cb(err)
      })
      .end(JSON.stringify(data))
  })(data))
}
const body = async (res) => {
  const chunks = []
  for await (const chunk of res) chunks.push(chunk)
  return Buffer.concat(chunks).toString()
}

async function start () {
  const server = net.createServer().listen()
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  await writeFile(join(__dirname, 'model.js'), testingModel())
  const sp = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'ignore', 'inherit'] })

  try {
    await validate({ port })
  } catch (err) {
    if (err.code === 'ERR_ASSERTION') {
      console.log('⛔️ ' + err.message)
      process.exit(1)
    }
    throw err
  } finally {
    await writeFile(join(__dirname, 'model.js'), model())
    sp.kill()
  }
}

async function validate ({ port }, retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 3) {
      assert.fail(`Unable to connect to server on port: ${port}`)
    }
    await t(ok(port))
    await t(created(port))
    await t(badRequest(port, { dat: { brand: 'test', color: 'test' } }))
    await t(badRequest(port, { data: { brnd: 'test', color: 'test' } }))
    await t(serverError(port))
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

async function ok (port, id = 1, expect = { brand: 'Chaparral', color: 'red' }) {
  const url = `http://localhost:${port}/boat/${id}`
  const res = await get(url)

  assert.equal(
    res.statusCode,
    200,
    `GET ${url} must respond with 200 response`
  )
  console.log(`☑️  GET ${url} responded with 200 response`)

  assert.match(
    res.headers['content-type'],
    /application\/json/,
    `GET ${url} must respond with correct mime-type`
  )

  console.log(`☑️  GET ${url} responded with correct Content-Type header`)

  const content = await body(res)
  try {
    const result = JSON.parse(content)
    assert.deepEqual(result, expect, `GET ${url} must respond with correct data\n   got -  ${content})`)
    console.log(`☑️  GET ${url} responded with correct data`)
  } catch (err) {
    if (err instanceof SyntaxError) assert.fail(`GET ${url} response not parsable JSON`)
    else throw err
  }
}

async function created (port) {
  const url = `http://localhost:${port}/boat`
  const tx = send(url)
  const payload = { data: { brand: 'test', color: 'test', extra: 'should be stripped' } }
  const res = await tx(payload)

  assert.equal(
    res.statusCode,
    201,
    `POST ${url} must respond with 201 response, got ${res.statusCode}`
  )
  console.log(`☑️  POST ${url} responded with a 201 response`)

  assert.match(
    res.headers['content-type'],
    /application\/json/,
    `POST ${url} must respond with correct mime-type`
  )

  console.log(`☑️  POST ${url} responded with correct Content-Type header`)

  const content = await body(res)
  try {
    const result = JSON.parse(content)
    assert.deepEqual(result, { id: '3' }, `POST ${url} must respond with correct data\n   got -  ${content})`)
    console.log(`☑️  POST ${url} responded with correct data`)
  } catch (err) {
    if (err instanceof SyntaxError) assert.fail(`POST ${url} response not parsable JSON`)
    else throw err
  }

  await ok(port, 3, { brand: 'test', color: 'test' })
}

async function badRequest (port, payload) {
  const url = `http://localhost:${port}/boat`
  const tx = send(url)
  const res = await tx(payload)

  assert.equal(
    res.statusCode,
    400,
    `POST ${url} must respond with 400 response, got ${res.statusCode}`
  )
  console.log(`☑️  POST ${url} responded with a 400 response`)
}

async function serverError (port) {
  const url = `http://localhost:${port}/boat`
  const tx = send(url)
  const payload = { data: { brand: DATA_500, color: 'test' } }
  const res = await tx(payload)

  assert.equal(
    res.statusCode,
    500,
    `POST ${url} with poison data to generate unknown error must respond with 500 response`
  )
  console.log(`☑️  POST ${url} with poison data responded with 500 response`)
}

start().catch(console.error)

function model () {
  return `'use strict'

  module.exports = {
    boat: boatModel()
  }
  
  function boatModel () {
    const db = {
      1: { brand: 'Chaparral', color: 'red' },
      2: { brand: 'Chaparral', color: 'blue' }
    }
  
    return {
      uid,
      create,
      read,
      update,
      del
    }
  
    function uid () {
      return Object.keys(db)
        .sort((a, b) => a - b)
        .map(Number)
        .filter((n) => !isNaN(n))
        .pop() + 1 + ''
    }
  
    function create (id, data, cb) {
      if (db.hasOwnProperty(id)) {
        const err = Error('resource exists')
        err.code = 'E_RESOURCE_EXISTS'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb(null, id))
    }
  
    function read (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      setImmediate(() => cb(null, db[id]))
    }
  
    function update (id, data, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb())
    }
  
    function del (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      delete db[id]
      setImmediate(() => cb())
    }
  }
    
`
}
function testingModel () {
  return `'use strict'

  module.exports = {
    boat: boatModel()
  }
  
  function boatModel () {
    const db = {
      1: { brand: 'Chaparral', color: 'red' },
      2: { brand: 'Chaparral', color: 'blue' }
    }
  
    return {
      uid,
      create,
      read,
      update,
      del
    }
  
    function uid () {
      return Object.keys(db)
        .sort((a, b) => a - b)
        .map(Number)
        .filter((n) => !isNaN(n))
        .pop() + 1 + ''
    }
  
    function create (id, data, cb) {
      if (data.brand === '${DATA_500}') {
        setImmediate(() => cb(Error('unknown')))
        return
      }
      if (db.hasOwnProperty(id)) {
        const err = Error('resource exists')
        err.code = 'E_RESOURCE_EXISTS'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb(null, id))
    }
  
    function read (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      setImmediate(() => cb(null, db[id]))
    }
  
    function update (id, data, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb())
    }
  
    function del (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      delete db[id]
      setImmediate(() => cb())
    }
  }
    
`
}
