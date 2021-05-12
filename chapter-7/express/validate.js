'use strict'
const http = require('http')
const { promisify } = require('util')
const { spawn } = require('child_process')
const net = require('net')
const assert = require('assert').strict
const { join } = require('path')
const { AssertionError } = require('assert')
const { writeFile } = require('fs').promises

const BOAT_SERVICE = join(__dirname, 'boat-service.js')
const BRAND_SERVICE = join(__dirname, 'brand-service.js')

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

async function system ([p1 = 3000, p2 = 4000, p3 = 5000] = []) {
  const PORT = await getPort(p1)
  const BOAT_SERVICE_PORT = await getPort(p2)
  const service = (file, PORT) => {
    const srv = spawn(process.argv[0], [file], {
      env: { PORT }
    })
    srv.respawn = async () => {
      try { srv.kill() } catch (e) {}
      const s2 = service(file, PORT)
      srv.kill = () => s2.kill()
      await up(PORT)
      return s2
    }
    return srv
  }
  const boatSrv = service(BOAT_SERVICE, BOAT_SERVICE_PORT)
  const BRAND_SERVICE_PORT = await getPort(p3)
  const brandSrv = service(BRAND_SERVICE, BRAND_SERVICE_PORT)
  const app = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT, BOAT_SERVICE_PORT, BRAND_SERVICE_PORT }
  })
  function close () {
    app.kill()
    boatSrv.kill()
    brandSrv.kill()
  }
  try {
    await up(PORT)
    await up(BOAT_SERVICE_PORT)
    await up(BRAND_SERVICE_PORT)
    return { port: PORT, close, boatSrv, brandSrv }
  } catch (err) {
    close()
    throw err
  }
}

async function start () {
  await writeFile(BOAT_SERVICE, boatService())
  await writeFile(BRAND_SERVICE, brandService())
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

async function validate ({ port, boatSrv, brandSrv }, retries = 0) {
  let done = false
  let passed = false
  try {
    if (retries > 3) {
      assert.fail(`Unable to connect to server on port: ${port}`)
    }
    await t(ok(port))
    await t(notFound(port, 2)) // boat missing
    await t(notFound(port, 3)) // brand missing
    await t(badRequest(port))
    brandSrv.kill()
    await t(serverError(port, 'brand service is down'))
    await brandSrv.respawn()
    await t(ok(port))
    boatSrv.kill()
    await t(serverError(port, 'boat service is down'))
    await boatSrv.respawn()
    await t(ok(port))
    boatSrv.kill()
    brandSrv.kill()
    await t(serverError(port, 'both services are down'))
    await boatSrv.respawn()
    await brandSrv.respawn()
    await t(ok(port))
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
  const url = `http://localhost:${port}/1`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    200,
    `GET ${url} must respond 200 when both services are up, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} responded with 200 response`)

  assert.match(
    res.headers['content-type'],
    /application\/json/,
    `GET ${url} must respond with correct mime-type, got ${res.headers['content-type']}`
  )

  console.log(`☑️  GET ${url} responded with correct Content-Type header`)

  const content = await body(res)
  try {
    const result = JSON.parse(content)
    assert.deepEqual(result, { id: 1, brand: 'Chaparral', color: 'Red' }, `GET ${url} must respond with correct data\n   got -  ${content})`)
    console.log(`☑️  GET ${url} responded with correct data`)
  } catch (err) {
    if (err instanceof SyntaxError) assert.fail(`GET ${url} response not parsable JSON`)
    else throw err
  }
}

async function notFound (port, id) {
  const url = `http://localhost:${port}/${id}`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    404,
    `GET ${url} must respond with 404 response`
  )
  console.log(`☑️  GET ${url} responded with 404 response`)
}

async function badRequest (port) {
  const url = `http://localhost:${port}/boat`
  const res = await get(url)

  assert.equal(
    res.statusCode,
    400,
    `GET ${url} must respond with 400, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} responded with 400`)
}

async function serverError (port, msg) {
  const url = `http://localhost:${port}/1`
  const res = await get(url)
  assert.equal(
    res.statusCode,
    500,
    `GET ${url} must respond 500 when ${msg}, got ${res.statusCode}`
  )
  console.log(`☑️  GET ${url} responded with 500 response (${msg})`)
}

start().catch(console.error)

function boatService () {
  return `'use strict'
  const http = require('http')
  const url = require('url')
  const colors = ['Yellow', 'Red', 'Orange', 'Green', 'Blue', 'Indigo']
  const brandIds = [231, 232, 233, 234, 235, 236]
  const MISSING = 2

  const server = http.createServer((req, res) => {
    const { pathname } = url.parse(req.url)
    let id = pathname.match(/^\\/(\\d+)$/)

    if (!id) {
      res.statusCode = 400
      return void res.end()
    }

    id = Number(id[1])

    if (id === MISSING) {
      res.statusCode = 404
      return void res.end()
    }

    res.setHeader('Content-Type', 'application/json')

    res.end(JSON.stringify({
      id: id,
      color: colors[id % colors.length],
      brand: brandIds[id % brandIds.length]
    }))
  })

  server.listen(process.env.PORT || 0, () => {
    const { port } = server.address()
    console.log('Boat service listening on localhost on port: ' + port)
  })
`
}
function brandService () {
  return `'use strict'
  const http = require('http')
  const url = require('url')
  const brands = [ 'Boston Whaler','Chaparral','Grady-White','Lund','MasterCraft','Sea Ray' ]

  const MISSING = 234

  const server = http.createServer((req, res) => {
    const { pathname } = url.parse(req.url)
    let id = pathname.match(/^\\/(\\d+)$/)

    if (!id) {
      res.statusCode = 400
      return void res.end()
    }

    id = Number(id[1])

    if (id === MISSING) {
      res.statusCode = 404
      return void res.end()
    }

    res.setHeader('Content-Type', 'application/json')

    res.end(JSON.stringify({
      id: id,
      name: brands[(id - 231) % brands.length]
    }))
  })

  server.listen(process.env.PORT || 0, () => {
    const { port } = server.address()
    console.log('Brand service listening on localhost on port: ' + port)
  })
`
}

