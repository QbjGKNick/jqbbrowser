const EventEmitter = require('events').EventEmitter
class Render extends EventEmitter { }
const render = new Render()
module.exports = render