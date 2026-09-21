(() => {
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  ROOT.JYRuntimeVersion = Object.freeze({
    runtimeVersion: '0.1.0',
    protocolVersion: 1,
  });
})();
