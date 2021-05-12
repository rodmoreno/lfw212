'use strict'
  const http = require('http')
  const url = require('url')
  const brands = [ 'Boston Whaler','Chaparral','Grady-White','Lund','MasterCraft','Sea Ray' ]

  const MISSING = 234

  const server = http.createServer((req, res) => {
    const { pathname } = url.parse(req.url)
    let id = pathname.match(/^\/(\d+)$/)

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
