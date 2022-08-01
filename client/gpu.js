const EventEmitter = require('events').EventEmitter
class GPU extends EventEmitter {
  constructor() {
    super()
    // 我们最终会把生成的位图保存在GPU内存里
    this.bitMaps = []
  }
}
const gpu = new GPU()
module.exports = gpu