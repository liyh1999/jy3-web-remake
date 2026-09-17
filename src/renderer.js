(() => {
  const LOGICAL_WIDTH = 853;
  const LOGICAL_HEIGHT = 480;
  const stage = createNode('stage');
  let canvas = null;
  let ctx = null;
  let running = false;
  const imageCache = new Map();

  function createNode(type = 'quad') {
    const node = {
      type,
      name: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 255,
      visible: true,
      img: 0,
      text: '',
      color: '#ffffff',
      fontSize: 16,
      anchorX: 0,
      anchorY: 0,
      parent: null,
      children: [],
      addChild(child) {
        return this.addChildAt(child, this.children.length);
      },
      addChildAt(child, index) {
        if (!child || child === this) return child;
        child.removeFromParent?.();
        const slot = Math.max(0, Math.min(this.children.length, Number(index) || 0));
        this.children.splice(slot, 0, child);
        child.parent = this;
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          this.children.splice(index, 1);
          child.parent = null;
        }
        return child;
      },
      removeAllChildren() {
        for (const child of this.children) child.parent = null;
        this.children.length = 0;
      },
      removeFromParent() {
        this.parent?.removeChild(this);
        return this;
      },
      getChildAt(index) {
        return this.children[Number(index) || 0] || null;
      },
      getChildByName(name) {
        return this.children.find(child => child?.name === String(name)) || null;
      },
      sendMsg() {
        return true;
      },
    };
    Object.defineProperty(node, 'childCount', {
      enumerable: true,
      get() { return this.children.length; },
    });
    return node;
  }

  function ensureCanvas() {
    if (typeof document === 'undefined') return null;
    if (canvas?.isConnected) return canvas;
    const scene = document.querySelector('#scene');
    if (!scene) return null;

    canvas = document.createElement('canvas');
    canvas.id = 'gcoreCanvas';
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
    canvas.setAttribute('aria-label', 'JY3 gcore canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    scene.prepend(canvas);
    ctx = canvas.getContext('2d');
    startLoop();
    return canvas;
  }

  function imageFor(resourceId) {
    const id = Number(resourceId) >>> 0;
    if (!id || typeof Image === 'undefined') return null;
    if (imageCache.has(id)) return imageCache.get(id);
    const url = window.JYResources?.url(id);
    if (!url) return null;
    const image = new Image();
    image.src = url;
    imageCache.set(id, image);
    return image;
  }

  function drawNode(node, parentX = 0, parentY = 0, parentAlpha = 1) {
    if (!ctx || !node || node.visible === false) return;
    const x = parentX + (Number(node.x) || 0);
    const y = parentY + (Number(node.y) || 0);
    const alpha = parentAlpha * Math.max(0, Math.min(1, (Number(node.alpha) || 255) / 255));

    if (node !== stage && node.type !== 'container') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      const rotation = Number(node.rotation) || 0;
      if (rotation) ctx.rotate(rotation * Math.PI / 180);
      ctx.scale(Number(node.scaleX) || 1, Number(node.scaleY) || 1);

      if (node.type === 'text') {
        ctx.fillStyle = node.color || '#ffffff';
        ctx.font = `${Number(node.fontSize) || 16}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(String(node.text || ''), 0, 0);
      } else if (node.img) {
        const image = imageFor(node.img);
        if (image?.complete && image.naturalWidth) {
          const width = Number(node.width) || image.naturalWidth;
          const height = Number(node.height) || image.naturalHeight;
          ctx.drawImage(image, -(Number(node.anchorX) || 0) * width, -(Number(node.anchorY) || 0) * height, width, height);
        }
      }
      ctx.restore();
    }

    for (const child of node.children || []) drawNode(child, x, y, alpha);
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    drawNode(stage, 0, 0, 1);
  }

  function startLoop() {
    if (running || typeof requestAnimationFrame === 'undefined') return;
    running = true;
    const frame = () => {
      render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function findNode(path, separator = '|') {
    const parts = String(path || '').split(separator).filter(Boolean);
    let current = stage;
    for (const part of parts) {
      current = current?.getChildByName(part);
      if (!current) return null;
    }
    return current;
  }

  function reset() {
    stage.removeAllChildren();
    imageCache.clear();
    render();
  }

  window.JYRenderer = {
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    stage: () => stage,
    quad: () => createNode('quad'),
    textQuad: () => createNode('text'),
    container: () => createNode('container'),
    spineQuad: () => createNode('spine'),
    particleSystem: () => createNode('particle'),
    findNode,
    ensureCanvas,
    render,
    reset,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCanvas, { once: true });
    else ensureCanvas();
  }
})();
