'use strict'

const { finished } = require('stream')

const app = require('express')()

const stream = require('./stream')

app.get('/data', (_req, res, next) => {
    const data = stream()
    data.pipe(res, { end: false })

    finished(data, (err) => {
        if (err) {
            next(err)
            return
        }

        res.end()
    })
})

app.listen(process.env?.PORT ?? 3000)