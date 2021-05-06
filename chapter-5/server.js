'use strict'

const app = require('express')()

const { boat } = require('./model')

app.get('/boat/:id', (req, res, next) => {
    boat.read(req.params.id, (err, data) => {
        if (err) {
            if (err.message === 'not found') {
                next()
                return
            }

            next(err)
            return
        }

        res.json(data)
    })
})

app.use((_req, res) => {
    res.status(404).json({ message: 'not found' })
})

app.use((err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ message: 'internal server error' })
})

app.listen(process.env?.PORT ?? 3000)