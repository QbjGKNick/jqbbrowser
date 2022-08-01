const express = require('express');
let app = express();
app.use(function (req, res, next) {
  if (req.url === '/hello.css') {
    setTimeout(next, 1000)
  } else if (req.url === '/hello.js') {
    setTimeout(next, 2000)
  } else {
    next()
  }
})
app.use(express.static('public'))
app.listen(8080, () => {
  console.log('server started at 8080');
})