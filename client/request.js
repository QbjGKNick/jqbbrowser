const Parser = require('htmlparser2').Parser
const http = require('http')
const css = require('css')

const main = require('./main')
const network = require('./network')
const render = require('./render')
const host = 'localhost'
const port = 8080

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
            break
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
      // console.dir(document, { depth: null })
      // 计算每个 DOM 节点的具体的样式 继承 层叠
      recalculateStyle(cssRules, document)
      // 创建一个只包含可见元素的布局树
      const html = document.children[0]
      const body = html.chilren[1]
      const layoutTree = createLayoutTree(body)
      console.dir(layoutTree, { depth: null })
      // DOM 解析完毕
      main.emit('DOMContentLoaded')
      // CSS和图片加载完成后
      main.emit('Load')
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

// 1. 由主进程接收用户输入的URL地址
main.emit('request', {
  host,
  port,
  path: '/index.html',
})
