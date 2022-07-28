const EventEmitter = require('events').EventEmitter
class Network extends EventEmitter { }
const network = new Network()
module.exports = network