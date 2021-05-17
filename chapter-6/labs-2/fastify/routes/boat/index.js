'use strict'

const { promisify } = require('util')
const { boat } = require('../../model')

const del = promisify(boat.del)
const read = promisify(boat.read)

module.exports = async function (fastify, _opts) {
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params

    try {
      await del(id)

      reply.code(204)
      reply.send()
    } catch (err) {
      if (err.message === 'not found') {
        throw fastify.httpErrors.notFound()
      }

      throw err
    }
  })

  fastify.get('/:id', async (request, _reply) => {
    const { id } = request.params

    try {
      return await read(id)
    } catch (err) {
      if (err.message === 'not found') {
        throw fastify.httpErrors.notFound()
      }

      throw err
    }
  })
}
