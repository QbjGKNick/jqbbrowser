const { createCanvas } = require('canvas');
const fs = require('fs');
const canvas = createCanvas(150, 150)
const ctx = canvas.getContext('2d');

ctx.font = '20px Impact'
ctx.strokeStyle = 'red'
ctx.strokeText('hello world', 0, 20)
fs.writeFileSync('result.png', canvas.toBuffer('image/png'))