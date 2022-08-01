const EventEmitter = require('events').EventEmitter
const http = require('http')
class Network extends EventEmitter {
  fetchResource(options) {
    return new Promise(resolve => {
      let request = http.request(response => {
        const buffers = []
        response.on('data', buffer => {
          buffers.push(buffer)
        })
        response.on('end', () => {
          resolve({
            headers,
            body: Buffer.concat(buffers).toString()
          })
        })
      })
    })
  }
}
const network = new Network()
module.exports = network