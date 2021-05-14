'use strict'

const stream = require('../stream')
module.exports = async function (fastify, _opts) {
  fastify.get('/data', async function (_request, reply) {
    return stream()
  })
}
