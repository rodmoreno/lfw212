'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    const { url } = request.query

    if (!url) {
      throw fastify.httpErrors.badRequest()
    }
    
    reply.from(url)
  })
}
