function createTemplate(html, css) {
  const template = document.createElement('template')
  template.innerHTML = html
  if (css) {
    const style = document.createElement('style')
    style.innerHTML = css
    document.querySelector('head').appendChild(style)
  }
  return () => template.cloneNode(true).content.firstElementChild
}

export { createTemplate }