const express = reqire('express')
const logger = require('morgan')
const app = express()
app.use(logger('dev'))
app.use((req, res, next) => {
  next()
})
app.use(express.static('public'))
app.listen(8081, () => console.log('服务器已经在8081端口上启动了...'))