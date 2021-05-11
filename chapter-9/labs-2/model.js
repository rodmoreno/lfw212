'use strict'

  module.exports = {
    boat: boatModel()
  }
  
  function boatModel () {
    const db = {
      1: { brand: 'Chaparral', color: 'red' },
      2: { brand: 'Chaparral', color: 'blue' }
    }
  
    return {
      uid,
      create,
      read,
      update,
      del
    }
  
    function uid () {
      return Object.keys(db)
        .sort((a, b) => a - b)
        .map(Number)
        .filter((n) => !isNaN(n))
        .pop() + 1 + ''
    }
  
    function create (id, data, cb) {
      if (db.hasOwnProperty(id)) {
        const err = Error('resource exists')
        err.code = 'E_RESOURCE_EXISTS'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb(null, id))
    }
  
    function read (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      setImmediate(() => cb(null, db[id]))
    }
  
    function update (id, data, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      db[id] = data
      setImmediate(() => cb())
    }
  
    function del (id, cb) {
      if (!(db.hasOwnProperty(id))) {
        const err = Error('not found')
        err.code = 'E_NOT_FOUND'
        setImmediate(() => cb(err))
        return
      }
      delete db[id]
      setImmediate(() => cb())
    }
  }
    
