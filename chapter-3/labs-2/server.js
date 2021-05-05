'use strict'

const app = require('express')()

app.get('/', (_req, res) => {
  res.sendStatus(200)
})

app.post('/', (_req, res) => {
  res.sendStatus(405)
})

app.listen(process.env.PORT ?? 3000)
