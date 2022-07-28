const express = require('express');
let app = express();
app.use(express.static('public'))
app.listen(8080, () => {
  console.log('server started at 8080');
})