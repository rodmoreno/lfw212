'use strict'

const { join } = require('path')

const app = require('express')()

app.set('views', join(__dirname, 'views'))
app.set('view engine', 'hbs')

app.get('/me', (_req, res) => {
    res.render('me')
})

app.listen(process.env?.PORT ?? 3000)