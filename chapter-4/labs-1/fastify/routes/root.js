'use strict'

module.exports = async function (fastify, _opts) {
  fastify.get('/me', async function (_request, reply) {
    return reply.view('me.hbs')
  })
}
