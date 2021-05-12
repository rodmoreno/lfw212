'use strict'

module.exports = async function (fastify, _opts) {
  fastify.get('/', async function (_request, _reply) {
    return { root: true }
  })

  fastify.post('/', async function(_request, reply) {
    reply.methodNotAllowed()
  })
}
