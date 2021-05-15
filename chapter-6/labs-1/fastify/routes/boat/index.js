'use strict'

const { promisify } = require('util')
const { boat } = require('../../model')


const create = promisify(boat.create)
const read = promisify(boat.read)

module.exports = async function (fastify, _opts) {
    fastify.post('/', async (request, reply) => {
        const { data } = request.body

        reply.code(201)
        return { id: await create(boat.uid(), data) }
    })

    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params

        try {
            return await read(id)
        } catch (err) {
            if (err.message === 'not found') {
                throw fastify.httpErros.notFound()
            }

            throw err
        }
    })
}
