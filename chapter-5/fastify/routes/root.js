'use strict'

const { promisify } = require('util')
const { boat } = require('../model')

const read = promisify(boat.read)

module.exports = async function (fastify, _opts) {
  fastify.get('/boat/:id', async function (request, _reply) {
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
