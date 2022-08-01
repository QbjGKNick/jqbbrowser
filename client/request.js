const Parser = require('htmlparser2').Parser
const http = require('http')
const css = require('css')
const { createCanvas } = require('canvas')
const fs = require('fs')

const main = require('./main')
const network = require('./network')
const render = require('./render')
const gpu = require('./gpu')
const host = 'localhost'
const port = 8080
const loadingLinks = {}
const loadingScripts = {}

// 浏览器主进程接收请求
main.on('request', function (options) {
  // 会把请求转发给网络进程
  network.emit('request', options)
})
// 主进程接收到消息后要通知渲染进程进行开始渲染
main.on('prepareRender', function (response) {
  // 主进程发送提交导航的消息给渲染进程
  render.emit('commitNavigation', response)
})
main.on('drawQuad', () => {
  let drawSteps = gpu.bitMaps.flat()
  const canvas = createCanvas(150, 250)
  const ctx = canvas.getContext('2d')
  eval(drawSteps.join('\r\n'))
  fs.writeFileSync('result.png', canvs.toBuffer('image/png'))
})

//******************* 网络进程 ********************/
network.on('request', (options) => {
  // 调用http模块发送请求给服务
  let request = http.request(options, (response) => {
    let headers = response.headers
    // 告诉 主进程请开始渲染页面
    main.emit('prepareRender')
  })
})

//******************** 渲染进程 ******************/
render.on('commitNavigation', (response) => {
  const headers = response.headers
  // 获取 响应体类型 渲染进程
  const contentType = headers['Content-Type']
  // 说明这是一个HTML响应
  if (contentType.indexOf('text/html') !== -1) {
    const document = { type: 'document', attirbutes: {}, children: [] }
    const tokenStack = [document]
    const cssRules = []
    // 1. 通过渲染进程把HTML字符串转成DOM树
    const parser = new Parser({
      onopentag(tagName, attributes) {
        // 遇到开始标签
        // 栈顶是父节点
        const parent = tokenStack[tokenStack.length - 1]
        const child = {
          type: 'element',
          tagName,
          children: [],
          attirbutes,
        }
        parent.children.push(child)
      },
      ontext(text) {
        if (!/^[\r\n\s]*&/) {
          const parent = tokenStack[tokenStack.length - 1]
          const child = {
            type: 'text',
            text,
          }
          parent.children.push(child)
        }
      },
      onclosetag(tagName) {
        switch (tagName) {
          case 'style':
            const styleToken = tokenStack[tokenStack.length - 1]
            const cssAST = css.parse(styleToken.children[0].text)
            const rules = cssAST.stylesheet.rules
            cssRules.push(rules)
            break;
          case 'link':
            const linkToken = tokenStack[tokenStack.length - 1]
            const href = linkToken.attributes.href
            const options = { host, port, path: href }
            const promise = network.fetchResource(options).then(({ body }) => {
              const cssAst = css.parse(body)
              cssRules.push(...cssAst.stylesheet.rules)
            })
            loadingLinks[href] = promise
            break;
          case 'script':
            const scriptToken = tokenStack[tokenStack.length - 1]
            const src = scriptToken.attirbutes.src
            const promises = [
              ...Object.values(loadingLinks),
              ...Object.values(loadingScripts)
            ]
            if (src) {
              const options = { host, port, path: src }
              const promise = network.fetchResource(options).then(({ }) => {
                delete loadingScripts[rc]
                // eval(body)
                return Promise.all(promises).then(() => eval(body))
              })
              loadingLinks[src] = promise
            } else {
              const script = scriptToken.children[0].text
              // eval(script)
              const ts = Date.now()
              const promise = Promise.all([
                ...Object.values(loadingLinks),
                ...Object.values(loadingScripts)
              ]).then(() => {
                delete loadingScripts[ts]
                eval(script)
              })
              loadingScripts[ts] = promise
            }
            break;
          default:
            break;
        }
        // 栈顶元素出栈
        tokenStack.pop()
      },
    })
    // 一旦接收到部分响应体，直接传递给htmlparser
    response.on('data', (buffer) => {
      parser.write(buffer.toString())
    })
    response.on('end', () => {
      // 需要等待所有的JS都加载执行完毕了，才会进行后续的渲染流程
      Promise.all(Object.values(loadingScripts).then(() => {

        // console.dir(document, { depth: null })
        // 计算每个 DOM 节点的具体的样式 继承 层叠
        recalculateStyle(cssRules, document)
        // 创建一个只包含可见元素的布局树
        const html = document.children[0]
        const body = html.chilren[1]
        const layoutTree = createLayoutTree(body)
        // console.dir(layoutTree, { depth: null })
        // 更新布局树，计算每个元素布局信息
        updateLayoutTree(layoutTree)
        // console.dir(layoutTree, { depth: null })
        // 根据布局树生成分层树
        const layers = [layoutTree]
        createLayerTree(layoutTree, layers)
        // console.dir(layers, { depth: null })
        // 根据分层树生成绘制步骤，并复合图层
        const paintSteps = compositeLayers(layers)
        // console.log(paintSteps.flat().join('\r\n'))
        // 先切成一个个小图块
        const tiles = splitTiles(paintSteps)
        raster(tiles)
        raster(paintSteps)
        // DOM 解析完毕
        main.emit('DOMContentLoaded')
        // CSS和图片加载完成后
        main.emit('Load')

      }))
    })

  }

  // const buffers = []
  // // 持续接收响应体
  // response.on('data', (buffer) => {
  //   buffers.push(buffer)
  // })
  // response.on('end', () => {
  //   const resultBuffer = Buffer.concat(buffers); // 二进制缓冲区
  //   const html = resultBuffer.toString() // 转成HTML字符串
  //   console.log('html', html);
  //   // DOM 解析完毕
  //   main.emit('DOMContentLoaded')
  //   // CSS和图片加载完成后
  //   main.emit('Load')
  // })
})

function splitTiles(paintSteps) {
  // 切分一个一个小图块
  return paintSteps
}

// 光栅化线程
// 1光栅化线程 1秒 1张
// 10个图片
// 10个线程 1秒就可以画10张
function rasterThread() {
  // 光栅化线程，而是把光栅化的工作交给GPU进程来完成呢过，这个叫快速光栅化，或者说GPU光栅化
  gpu.emit('raster', tile)
}

// 把切好的图片进行光栅化处理，就是类型与马赛克
function raster(tiles) {
  tiles.forEach(tile => rasterThread(tile))
  // 到此位图就生成完毕，通知主线程可以显示了
  main.emit('drawQuad')
}

function compositeLayers(layers) {
  return layers.map(layer => paint(layer))
}

function paint(element, paintSteps = []) {
  const  { top = 0, left = 0, color = 'black', background = 'white', width = 100, height = 0 } = element.layout
  if (element.type === 'text') {
    paintSteps.push(`ctx.font = '20px Impact'`)
    paintSteps.push(`ctx.strokeStyle = '${color}'`)
    paintSteps.push(`ctx.strokeText("${element.text}", ${parseFloat(left)}, ${parseFloat(top) + 20})`)
  } else {
    paintSteps.push(`ctx.fillStyle = '${background}'`)
    paintSteps.push(`ctx.fillRect(${parseFloat(left)}, ${parseFloat(top)}, ${parseFloat(width)}, ${parseFloat(height)}`)
  }
  element.children.forEach(child => paint(child, paintSteps))
  return paintSteps
}

function createLayerTree(element, layers) {
  // 遍历子节点，判断是否要生成新的图层，如果生成，则从当前图层中删除
  element.children = element.children.filter(child => !createNewLayer(child, layers))
  element.children.forEach(createLayerTree)
  return layers
}

function createNewLayer(element, layers) {
  let createNewLayer = false
  const attributes = element.attributes
  Object.keys(attributes).forEach(([key, value]) => {
    if (key === 'style') {
      const attributes = value.split(/;\s*/)
      attributes.forEach(attribute => {
        const [property, value] = attribute.split(/:\s*/)
        if (property === 'position' && (value === 'absolute' || value === 'fixed')) {
          // 因为这是一个新的层，所以里面的元素需要重新计算一下自己的布局位置
          updateLayoutTree(element)
          layers.push(element)
          createNewLayer = true
        }
      })
    }
  })
  return createNewLayer
}

/**
 * 计算布局树上每个元素的布局信息
 * @param {*} element 
 * @param {*} top 自己距离自己父节点的顶部的距离
 * @param {*} parentTop 
 */
function updateLayoutTree(element, top = 0, parentTop = 0) {
  const computedStyle = element.computedStyle
  element.layout = {
    top: top + parentTop,
    left: 0,
    width: computedStyle.width,
    height: computedStyle.height,
    color: computedStyle.color,
    background: computedStyle.background
  }
  let childTop = 0
  element.children.forEach(child => {
    updateLayoutTree(child, childTop, element.layout.top)
    childTop += parseFloat(child.computedStyle.height || 0)
  })
}

function createLayoutTree(element) {
  element.children = element.children.filter(isShow)
  element.children.forEach(createLayoutTree)
  return element
}

function isShow(element) {
  let show = true // 默认都显示
  if (element.tagName === 'head' || element.tagName === 'body') {
    show = false
  }
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'style') {
      const attributes = value.split(/;\s*/) //[background: green;]
      attributes.forEach(attribute => {
        const [property, value] = attribute.split(/:\s*/) // ['background', green]
        if (property === 'display' && value === 'none') {
          show = false
        }
      })
    }
  })
  return show
}

function recalculateStyle(cssRules, element, parentStyle = {}) {
  const attributes = element.attributes
  element.computedStyle = { color: parentStyle.color || 'black' } // 样式继承
  Object.entries(attributes).forEach(([key, value]) => {
    // 应用样式表
    cssRules.forEach(rule => {
      let selector = rule.selectors[0]
      if (key === 'id' && selector === ('#' + value) || key === 'class' && selector === ('.' + value)) {
        rule.declarations.forEach(({ property, value }) => {
          property && (element.computedStyle[property] = value)
        })
      }
    })
    // 行内样式
    if (key === 'style') {
      const attributes = value.split(/;\s*/)
      attributes.forEach(attribute => {
        const [property, value] = attribute.split(/:\s*/)
        property && (element.computedStyle[property] = value)
      })
    }
  })
  element.children.forEach(child => recalculateStyle(cssRules, child, element.computedStyle))
}

// GPU进程负责把图片光栅化，生成位图并保存到GPU内存里
gpu.on('raster', tile => {
  let bitMap = tile
  gpu.bitMaps.push(bitMap)
})

// 1. 由主进程接收用户输入的URL地址
main.emit('request', {
  host,
  port,
  path: '/index.html',
})
