'use strict'

const fp = require('fastify-plugin')

// the use of fastify-plugin is required to be able
// to export the decorators to the outer scope

module.exports = fp(async function (fastify, opts) {
    fastify.addHook('onRequest', async (request) => {
        if (request.ip === '211.133.33.113') {
            const forbidden = new Error('Forbidden')
            forbidden.status = 403

            throw forbidden
        }
    })
})
