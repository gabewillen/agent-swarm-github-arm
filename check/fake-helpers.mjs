// Copies of acceptance-test helpers so local checks don't import tests/.
export function fakeCtx() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'fillText', 'strokeRect', 'clearRect', 'stroke', 'moveTo', 'lineTo', 'save', 'restore']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, font: ctx.font });
  }
  return ctx;
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
