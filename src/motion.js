(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const enabled = () => !document.documentElement.classList.contains('no-motion') && !reduced.matches;
  function animate(element, frames, options = {}) {
    if (!element || !enabled()) return Promise.resolve();
    const animation = element.animate(frames, { duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)', ...options });
    return animation.finished.catch(() => {});
  }
  const closings = new WeakMap();
  function open(dialog) {
    if (dialog.open) return;
    dialog.classList.remove('is-closing');
    dialog.showModal();
    const drawer = dialog.classList.contains('account-drawer');
    animate(dialog, drawer
      ? [{transform:'translateX(100%)',opacity:.6},{transform:'translateX(0)',opacity:1}]
      : [{transform:'translateY(12px) scale(.97)',opacity:0},{transform:'translateY(0) scale(1)',opacity:1}], {duration:drawer?320:220});
  }
  function close(dialog) {
    if (!dialog.open) return Promise.resolve();
    if (closings.has(dialog)) return closings.get(dialog);
    const current = getComputedStyle(dialog);
    const start = {transform:current.transform,opacity:current.opacity};
    dialog.getAnimations().forEach(animation => animation.cancel());
    dialog.classList.add('is-closing');
    const drawer = dialog.classList.contains('account-drawer');
    const finished = animate(dialog, drawer
      ? [start,{transform:'translateX(100%)',opacity:.6}]
      : [start,{transform:'translateY(7px) scale(.98)',opacity:0}], {duration:drawer?230:150})
      .then(() => {
        dialog.close();
        [...document.querySelectorAll('[aria-controls]')].filter(element => element.getAttribute('aria-controls') === dialog.id).forEach(element => element.setAttribute('aria-expanded','false'));
        dialog.classList.remove('is-closing'); closings.delete(dialog);
      });
    closings.set(dialog, finished);
    return finished;
  }
  function reveal(element, direction = 1) {
    element?.getAnimations().forEach(animation => animation.cancel());
    return animate(element, [{opacity:0,transform:`translateY(${direction*10}px)`},{opacity:1,transform:'translateY(0)'}]);
  }
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest('button');
    if (button && !button.disabled) animate(button, [{scale:'1'},{scale:'.96'},{scale:'1'}], {duration:180});
  });
  document.addEventListener('keydown', event => {
    if (event.repeat || !['Enter',' '].includes(event.key)) return;
    const button = event.target.closest('button');
    if (button && !button.disabled) animate(button, [{scale:'1'},{scale:'.96'},{scale:'1'}], {duration:180});
  });
  function stop() { if (!enabled()) document.getAnimations().forEach(animation => animation.cancel()); }
  new MutationObserver(stop).observe(document.documentElement, {attributes:true,attributeFilter:['class']});
  reduced.addEventListener('change', stop);
  window.LilacMotion = { enabled, animate, open, close, reveal };
})();
