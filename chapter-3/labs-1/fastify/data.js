'use strict'
const { promisify } = require('util')
const { randomBytes } = require('crypto')
const timeout = promisify(setTimeout)

async function data() {
    await timeout(50)
    return randomBytes(10).toString('base64')
}

module.exports = data
