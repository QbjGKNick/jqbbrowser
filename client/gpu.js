const EventEmitter = require('events').EventEmitter
class GPU extends EventEmitter { }
const gpu = new GPU()
module.exports = gpu