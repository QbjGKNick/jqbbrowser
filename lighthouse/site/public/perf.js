(function (ready) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ready()
  } else {
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'complete') {
        ready()
      }
    })
  }
})(function perf () {
  const data = {
    FP: 0, // 首次绘制
    FCP: 0, // 首次内容绘制
  }
  // 如果观察者观察到了指定类型的性能条目，就执行回调
  const oberser = new PerformanceObserver(function (entryList) {
    let entries = entryList.getEntries()
    entries.forEach(entry => {
      if (entry.name === 'first-paint') {
        // 首次绘制的开始时间
        data.FP = entry.startTime
        console.log('记录FP', data.FP);
      } else if (entry.name === 'first-contentful-paint') {
        data.FCP = entry.startTime
        console.log('记录FCP', data.FCP);
      }
    })
  }).observe({ type: 'paint', buffered: true })
})