'use strict'

const express = require('express')
const app = express()

const { boat } = require('./model')
const { uid } = boat

app.use(express.json())

app.post('/boat', (req, res, next) => {
    boat.create(uid(), req.body.data, (err, id) => {
        if (err) {
            next(err)
            return
        }

        res.status(201).json({ id })
    })
})

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
