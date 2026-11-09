import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// happy-dom has no layout engine. The browser suite covers real scrolling.
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
