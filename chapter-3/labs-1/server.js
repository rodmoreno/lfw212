'use strict'

const app = require('express')()
const data = require('./data')

app.get('/', async (_req, res) => {
    res.contentType = 'text/plain'
    res.send(await data())
})

app.use((_req, res) => {
    res.sendStatus(404)
})

app.listen(process.env.PORT ?? '3000')