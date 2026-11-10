// The script runs before the captured page's own scripts, including hydration.
export function imageReplayScript(images: Record<string, string>) {
  return String.raw`(() => {
  const script = document.currentScript;
  const replayBase = script.src;
  const images = ${JSON.stringify(images)};
  const originalBase = script.dataset.sourceBase;
  const setAttribute = Element.prototype.setAttribute;
  const selector = 'img[src], img[srcset], source[srcset]';

  function localImage(value) {
    if (typeof value !== 'string' || !value.trim()) return value;
    try {
      const url = new URL(value, originalBase);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return value;
      const fragment = url.hash;
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
      const file = images[url.href];
      return file ? new URL(file, replayBase).href + fragment : value;
    } catch {
      return value;
    }
  }

  function localSrcset(value) {
    if (typeof value !== 'string') return value;
    // Rewrite candidate URLs and leave descriptors and commas in place.
    return value.replace(/(^|,)(\s*)(\S+)/g, (_match, separator, gap, token) => {
      const url = token.replace(/,+$/, '');
      return separator + gap + localImage(url) + token.slice(url.length);
    });
  }

  function imageAttribute(element, name, value) {
    if (name === 'src' && element.localName === 'img') return localImage(value);
    if (name === 'srcset' && (element.localName === 'img' || element.localName === 'source')) {
      return localSrcset(value);
    }
    return value;
  }

  Element.prototype.setAttribute = function (name, value) {
    if (typeof name !== 'string' || typeof value !== 'string') {
      return setAttribute.apply(this, arguments);
    }
    return setAttribute.call(this, name, imageAttribute(this, name.toLowerCase(), value));
  };

  for (const [prototype, name, localize] of [
    [HTMLImageElement.prototype, 'src', localImage],
    [HTMLImageElement.prototype, 'srcset', localSrcset],
    [HTMLSourceElement.prototype, 'srcset', localSrcset],
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.set) continue;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      set(value) { descriptor.set.call(this, localize(value)); },
    });
  }

  // DOM produced from HTML strings bypasses the setters above.
  function fixImage(element) {
    for (const name of ['src', 'srcset']) {
      const value = element.getAttribute(name);
      const local = imageAttribute(element, name, value);
      if (local !== value) setAttribute.call(element, name, local);
    }
  }

  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(selector)) fixImage(node);
        node.querySelectorAll(selector).forEach(fixImage);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();`;
}
