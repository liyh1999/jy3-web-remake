(() => {
  const LOGICAL_WIDTH = 853;
  const LOGICAL_HEIGHT = 480;
  const HALF_WIDTH = LOGICAL_WIDTH / 2;
  const HALF_HEIGHT = LOGICAL_HEIGHT / 2;

  let nextHandle = 1;
  const nodes = new Map();
  const imageCache = new Map();
  const imageGrid = new Map();
  const fontNames = new Map([
    [0, 'Microsoft YaHei, "Noto Sans CJK SC", sans-serif'],
    [1, '"FZ XingKai", "STKaiti", KaiTi, serif'],
    [2, '"FZ ShouYuan", "Microsoft YaHei", sans-serif'],
    [3, 'FangSong, "Noto Serif CJK SC", serif'],
  ]);
  const defaultStyleColors = [
    0xffffff, 0x000000, 0x7226f9, 0xefd966, 0x74dbe6, 0x2ae2a6,
    0xff81ae, 0x1f97fd, 0x7f7f7f, 0x783314, 0x500aae,
  ];
  const fontStyles = new Map(defaultStyleColors.map((color, index) => [index + 1, {
    color,
    shadowColor: 0,
    outlineColor: 0,
    outlineThick: 0,
  }]));
  let fontStyleInsert = 1;

  let canvas = null;
  let ctx = null;
  let host = null;
  let running = false;
  let resizeObserver = null;
  let dpr = 1;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function u32(value) {
    return Number(value) >>> 0;
  }

  function colorToCss(value, fallback = '#ffffff') {
    if (typeof value === 'string') return value || fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return `#${(number >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
  }

  function computeViewportFit(width, height) {
    const w = Math.max(0, finite(width));
    const h = Math.max(0, finite(height));
    if (!w || !h) return { scale: 0, width: 0, height: 0, left: 0, top: 0 };
    const scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
    const fittedWidth = LOGICAL_WIDTH * scale;
    const fittedHeight = LOGICAL_HEIGHT * scale;
    return {
      scale,
      width: fittedWidth,
      height: fittedHeight,
      left: (w - fittedWidth) / 2,
      top: (h - fittedHeight) / 2,
    };
  }

  function syncHorizontal(node) {
    if (Number.isFinite(node._left) && Number.isFinite(node._right)) {
      node._x = (node._left + node._right) / 2;
      node._width = Math.max(0, node._right - node._left);
    }
  }

  function syncVertical(node) {
    if (Number.isFinite(node._bottom) && Number.isFinite(node._top)) {
      node._y = (node._bottom + node._top) / 2;
      node._height = Math.max(0, node._top - node._bottom);
    }
  }

  function createNode(type = 'quad') {
    const node = {
      handle: nextHandle++,
      type,
      name: '',
      _x: 0,
      _y: 0,
      _width: 0,
      _height: 0,
      _left: null,
      _right: null,
      _bottom: null,
      _top: null,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 255,
      visible: true,
      img: 0,
      _animationFrameImg: 0,
      _frameEndEvents: [],
      text: '',
      color: null,
      font: 0,
      fontSize: 0,
      style: 1,
      align: 1,
      alignOffset: 0,
      wrap: false,
      autosize: 0,
      wordSpace: 0,
      lineSpace: 0,
      pivotX: 0.5,
      pivotY: 0.5,
      clipChildren: false,
      mouseEnabled: false,
      parent: null,
      children: [],
      addChild(child) {
        return this.addChildAt(child, this.children.length);
      },
      addChildAt(child, index) {
        if (!child || child === this) return child || null;
        child.removeFromParent?.();
        const slot = clamp(Math.trunc(finite(index)), 0, this.children.length);
        this.children.splice(slot, 0, child);
        child.parent = this;
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          stopNodeTreeAnimations(child, 'detach');
          this.children.splice(index, 1);
          child.parent = null;
        }
        return child || null;
      },
      removeAllChildren() {
        for (const child of this.children) {
          stopNodeTreeAnimations(child, 'detach');
          child.parent = null;
        }
        this.children.length = 0;
      },
      removeFromParent() {
        this.parent?.removeChild(this);
        return this;
      },
      getChildAt(index) {
        return this.children[Math.trunc(finite(index))] || null;
      },
      getChildByName(name) {
        return this.children.find(child => child?.name === String(name)) || null;
      },
      real_width() {
        if (this.width) return this.width;
        const id = this._animationFrameImg || this.img;
        return window.JYResources?.imageWidth?.(id) || imageFor(id)?.naturalWidth || 0;
      },
      real_height() {
        if (this.height) return this.height;
        const id = this._animationFrameImg || this.img;
        return window.JYResources?.imageHeight?.(id) || imageFor(id)?.naturalHeight || 0;
      },
      sendMsg() { return true; },
    };

    Object.defineProperties(node, {
      childCount: { enumerable: true, get() { return this.children.length; } },
      x: {
        enumerable: true,
        get() { return this._x; },
        set(value) {
          const next = finite(value);
          const delta = next - this._x;
          this._x = next;
          if (Number.isFinite(this._left)) this._left += delta;
          if (Number.isFinite(this._right)) this._right += delta;
        },
      },
      y: {
        enumerable: true,
        get() { return this._y; },
        set(value) {
          const next = finite(value);
          const delta = next - this._y;
          this._y = next;
          if (Number.isFinite(this._bottom)) this._bottom += delta;
          if (Number.isFinite(this._top)) this._top += delta;
        },
      },
      width: {
        enumerable: true,
        get() { return this._width; },
        set(value) {
          this._width = Math.max(0, finite(value));
          if (Number.isFinite(this._left) && Number.isFinite(this._right)) {
            this._left = this._x - this._width / 2;
            this._right = this._x + this._width / 2;
          }
        },
      },
      height: {
        enumerable: true,
        get() { return this._height; },
        set(value) {
          this._height = Math.max(0, finite(value));
          if (Number.isFinite(this._bottom) && Number.isFinite(this._top)) {
            this._bottom = this._y - this._height / 2;
            this._top = this._y + this._height / 2;
          }
        },
      },
      left: {
        enumerable: true,
        get() { return Number.isFinite(this._left) ? this._left : this._x - this._width / 2; },
        set(value) { this._left = finite(value); syncHorizontal(this); },
      },
      right: {
        enumerable: true,
        get() { return Number.isFinite(this._right) ? this._right : this._x + this._width / 2; },
        set(value) { this._right = finite(value); syncHorizontal(this); },
      },
      bottom: {
        enumerable: true,
        get() { return Number.isFinite(this._bottom) ? this._bottom : this._y - this._height / 2; },
        set(value) { this._bottom = finite(value); syncVertical(this); },
      },
      top: {
        enumerable: true,
        get() { return Number.isFinite(this._top) ? this._top : this._y + this._height / 2; },
        set(value) { this._top = finite(value); syncVertical(this); },
      },
      anchorX: {
        enumerable: true,
        get() { return this.pivotX; },
        set(value) { this.pivotX = finite(value, 0.5); },
      },
      anchorY: {
        enumerable: true,
        get() { return this.pivotY; },
        set(value) { this.pivotY = finite(value, 0.5); },
      },
    });

    nodes.set(node.handle, node);
    return node;
  }

  const stage = createNode('stage');
  stage.name = '__stage';
  stage.width = LOGICAL_WIDTH;
  stage.height = LOGICAL_HEIGHT;

  function imageFor(resourceId) {
    const id = u32(resourceId);
    if (!id || typeof Image === 'undefined') return null;
    if (imageCache.has(id)) return imageCache.get(id);
    const url = window.JYResources?.url?.(id);
    if (!url) return null;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    imageCache.set(id, image);
    return image;
  }

  function preloadImage(resourceId) {
    return imageFor(resourceId);
  }

  function animationKey(node) {
    return `renderer:${node.handle}`;
  }

  function stopNodeAnimation(node, reason = 'manual') {
    if (!node) return false;
    const stopped = window.JYFramePlayer?.stop?.(animationKey(node), reason) || false;
    node._animationFrameImg = 0;
    return stopped;
  }

  function stopNodeTreeAnimations(node, reason = 'manual') {
    if (!node) return false;
    stopNodeAnimation(node, reason);
    for (const child of node.children || []) stopNodeTreeAnimations(child, reason);
    return true;
  }

  function defaultActionLoop(baseResourceId, actionId) {
    const directoryBase = u32(baseResourceId) & 0x0fff0000;
    const actorFamily = directoryBase === 0x03030000 || directoryBase === 0x03060000 || directoryBase === 0x03070000;
    return actorFamily && (Number(actionId) || 0) < 1000;
  }

  function playNodeAction(node, actionId, options = {}) {
    if (!node || !window.JYFramePlayer?.play) return false;
    const baseResourceId = u32(node.img);
    const base = window.JYResources?.resolve?.(baseResourceId);
    if (!base || base.kind !== 'framelist') return false;

    node._frameEndEvents.length = 0;
    window.JYFramePlayer.play(animationKey(node), {
      baseResourceId,
      actionId: Number(actionId) || 0,
      rate: Number(options.rate) > 0 ? Number(options.rate) : undefined,
      loop: options.loop === undefined ? defaultActionLoop(baseResourceId, actionId) : options.loop,
      onFrame(frame) {
        node._animationFrameImg = u32(frame.id);
      },
      onFrameEnd(meta) {
        node._frameEndEvents.push(Number(meta.actionId) || 0);
        if (node._frameEndEvents.length > 16) node._frameEndEvents.shift();
      },
      onError() {
        node._animationFrameImg = 0;
      },
      onStop() {
        if (!window.JYFramePlayer?.state?.(animationKey(node))) {
          node._animationFrameImg = 0;
        }
      },
    });
    return true;
  }

  function setImageGrid(resourceId, left, top, right, bottom) {
    imageGrid.set(u32(resourceId), {
      left: Math.max(0, finite(left)),
      top: Math.max(0, finite(top)),
      right: Math.max(0, finite(right)),
      bottom: Math.max(0, finite(bottom)),
    });
    return true;
  }

  function gridSlices(sourceWidth, sourceHeight, targetWidth, targetHeight, grid) {
    const sw = Math.max(0, finite(sourceWidth));
    const sh = Math.max(0, finite(sourceHeight));
    const tw = Math.max(0, finite(targetWidth));
    const th = Math.max(0, finite(targetHeight));
    if (!sw || !sh || !tw || !th) return [];

    let sl = clamp(finite(grid?.left), 0, sw);
    let sr = clamp(finite(grid?.right), 0, sw - sl);
    let st = clamp(finite(grid?.top), 0, sh);
    let sb = clamp(finite(grid?.bottom), 0, sh - st);

    const horizontalScale = sl + sr > tw && sl + sr > 0 ? tw / (sl + sr) : 1;
    const verticalScale = st + sb > th && st + sb > 0 ? th / (st + sb) : 1;
    const dl = sl * horizontalScale;
    const dr = sr * horizontalScale;
    const dt = st * verticalScale;
    const db = sb * verticalScale;

    const sx = [0, sl, sw - sr, sw];
    const sy = [0, st, sh - sb, sh];
    const dx = [0, dl, tw - dr, tw];
    const dy = [0, dt, th - db, th];
    const slices = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const srcW = sx[col + 1] - sx[col];
        const srcH = sy[row + 1] - sy[row];
        const dstW = dx[col + 1] - dx[col];
        const dstH = dy[row + 1] - dy[row];
        if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) continue;
        slices.push({ sx: sx[col], sy: sy[row], sw: srcW, sh: srcH, dx: dx[col], dy: dy[row], dw: dstW, dh: dstH });
      }
    }
    return slices;
  }

  function localRect(node, width, height) {
    return {
      x: -finite(node.pivotX, 0.5) * width,
      y: -(1 - finite(node.pivotY, 0.5)) * height,
      width,
      height,
    };
  }

  function drawImageNode(node) {
    const resourceId = node._animationFrameImg || node.img;
    if (!resourceId) return;
    const image = imageFor(resourceId);
    if (!image?.complete || !(image.naturalWidth || image.width)) return;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const width = finite(node.width) || sourceWidth;
    const height = finite(node.height) || sourceHeight;
    const rect = localRect(node, width, height);
    const grid = imageGrid.get(u32(resourceId));

    if (!grid || (width === sourceWidth && height === sourceHeight)) {
      ctx.drawImage(image, rect.x, rect.y, width, height);
      return;
    }

    for (const slice of gridSlices(sourceWidth, sourceHeight, width, height, grid)) {
      ctx.drawImage(
        image,
        slice.sx, slice.sy, slice.sw, slice.sh,
        rect.x + slice.dx, rect.y + slice.dy, slice.dw, slice.dh,
      );
    }
  }

  function decodeFont(fontValue, explicitSize = 0) {
    const font = u32(fontValue);
    const slot = (font >>> 24) & 0x0f;
    const encodedSize = (font >>> 16) & 0xff;
    const size = Math.max(1, finite(explicitSize) || encodedSize || 16);
    return {
      slot,
      size,
      family: fontNames.get(slot) || fontNames.get(0) || 'sans-serif',
    };
  }

  function styleFor(index, explicitColor) {
    const style = fontStyles.get(Math.max(1, Math.trunc(finite(index, 1)))) || fontStyles.get(1) || {};
    return {
      color: explicitColor || colorToCss(style.color, '#ffffff'),
      shadowColor: colorToCss(style.shadowColor, '#000000'),
      outlineColor: colorToCss(style.outlineColor, '#000000'),
      outlineThick: Math.max(0, finite(style.outlineThick)),
    };
  }

  function normalizedText(value) {
    return String(value ?? '')
      .replace(/\[br\]/gi, '\n')
      .replace(/\[[0-9a-fA-F]{2}\]/g, '');
  }

  function measureWithSpacing(text, spacing) {
    if (!text) return 0;
    const base = ctx.measureText(text).width;
    return base + Math.max(0, text.length - 1) * spacing;
  }

  function splitWrappedLine(text, maxWidth, spacing) {
    if (!text) return [''];
    if (!(maxWidth > 0)) return [text];
    const lines = [];
    let current = '';
    for (const char of [...text]) {
      const candidate = current + char;
      if (current && measureWithSpacing(candidate, spacing) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
    return lines;
  }

  function drawSpacedText(text, x, y, spacing, align) {
    if (!spacing) {
      ctx.textAlign = align;
      ctx.fillText(text, x, y);
      return;
    }
    const chars = [...text];
    const width = measureWithSpacing(text, spacing);
    let cursor = x;
    if (align === 'center') cursor -= width / 2;
    else if (align === 'right') cursor -= width;
    ctx.textAlign = 'left';
    for (const char of chars) {
      ctx.fillText(char, cursor, y);
      cursor += ctx.measureText(char).width + spacing;
    }
  }

  function drawTextNode(node) {
    const text = normalizedText(node.text);
    if (!text) return;
    const font = decodeFont(node.font, node.fontSize);
    const style = styleFor(node.style, node.color);
    const width = Math.max(0, finite(node.width));
    const height = Math.max(0, finite(node.height));
    const rect = localRect(node, width, height);
    const spacing = finite(node.wordSpace);
    const lineHeight = font.size + finite(node.lineSpace);
    const alignCode = Math.trunc(finite(node.align, 1));
    const align = alignCode === 2 ? 'center' : alignCode === 3 ? 'right' : 'left';
    const alignX = align === 'center' ? rect.x + width / 2 : align === 'right' ? rect.x + width : rect.x;

    ctx.font = `${font.size}px ${font.family}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = style.color;
    ctx.lineJoin = 'round';

    const logicalLines = text.split('\n');
    const lines = [];
    for (const line of logicalLines) {
      if (node.wrap && width > 0) lines.push(...splitWrappedLine(line, width, spacing));
      else lines.push(line);
    }

    let y = height > 0 ? rect.y : 0;
    for (const line of lines) {
      if (height > 0 && y + lineHeight > rect.y + height + 0.01) break;
      if (style.outlineThick > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = style.outlineThick * 2;
        ctx.textAlign = align;
        ctx.strokeText(line, alignX, y);
      }
      if (style.shadowColor !== '#000000' || (fontStyles.get(Math.max(1, Math.trunc(finite(node.style, 1))))?.shadowColor || 0) !== 0) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.shadowBlur = 0;
      }
      drawSpacedText(line, alignX + finite(node.alignOffset), y, spacing, align);
      ctx.shadowColor = 'transparent';
      y += lineHeight;
    }
  }

  function applyClip(node) {
    if (!node.clipChildren || !node.width || !node.height) return;
    const rect = localRect(node, node.width, node.height);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
  }

  function drawNode(node) {
    if (!ctx || !node || node.visible === false) return;
    ctx.save();

    if (node !== stage) {
      ctx.translate(finite(node.x), -finite(node.y));
      const rotation = finite(node.rotation);
      if (rotation) ctx.rotate(-rotation * Math.PI / 180);
      ctx.scale(finite(node.scaleX, 1), finite(node.scaleY, 1));
      ctx.globalAlpha *= clamp(finite(node.alpha, 255) / 255, 0, 1);
    }

    applyClip(node);
    if (node.type === 'text') drawTextNode(node);
    else if (node.type !== 'container' && node.type !== 'stage') drawImageNode(node);

    for (const child of node.children || []) drawNode(child);
    ctx.restore();
  }

  function resizeCanvas() {
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect?.() || { width: host.clientWidth || 0, height: host.clientHeight || 0 };
    const fit = computeViewportFit(rect.width || host.clientWidth, rect.height || host.clientHeight);
    canvas.style.width = `${fit.width}px`;
    canvas.style.height = `${fit.height}px`;
    canvas.style.left = `${fit.left}px`;
    canvas.style.top = `${fit.top}px`;

    const nextDpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 4);
    if (nextDpr !== dpr || canvas.width !== Math.round(LOGICAL_WIDTH * nextDpr) || canvas.height !== Math.round(LOGICAL_HEIGHT * nextDpr)) {
      dpr = nextDpr;
      canvas.width = Math.round(LOGICAL_WIDTH * dpr);
      canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
      ctx = canvas.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = true;
    }
  }

  function ensureCanvas() {
    if (typeof document === 'undefined') return null;
    if (canvas?.isConnected) return canvas;
    host = document.querySelector('#gcoreHost') || document.querySelector('#scene');
    if (!host) return null;

    if (globalThis.getComputedStyle?.(host).position === 'static') host.style.position = 'relative';
    canvas = document.createElement('canvas');
    canvas.id = 'gcoreCanvas';
    canvas.setAttribute('aria-label', 'JY3 gcore canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '1',
      display: 'block',
    });
    host.prepend(canvas);
    ctx = canvas.getContext('2d');
    resizeCanvas();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver?.disconnect?.();
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(host);
    } else if (typeof window !== 'undefined') {
      window.addEventListener?.('resize', resizeCanvas);
    }
    startLoop();
    return canvas;
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.save();
    ctx.translate(HALF_WIDTH, HALF_HEIGHT);
    drawNode(stage);
    ctx.restore();
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

  function findNodeHandle(path, separator = '|') {
    return findNode(path, separator)?.handle || 0;
  }

  function nodeByHandle(handle) {
    return nodes.get(Math.trunc(finite(handle))) || null;
  }

  function createNodeHandle(type) {
    return createNode(String(type || 'quad')).handle;
  }

  function getNodeProperty(handle, key) {
    const node = nodeByHandle(handle);
    if (!node) return null;
    const name = String(key);
    if (name === 'parent') return node.parent?.handle || 0;
    const value = node[name];
    if (typeof value === 'function' || Array.isArray(value) || value === undefined) return null;
    return value;
  }

  function setNodeProperty(handle, key, value) {
    const node = nodeByHandle(handle);
    if (!node) return false;
    const name = String(key);
    if (name === 'parent' || name === 'childCount' || name === 'handle' || name === 'children') return false;
    if (name === 'img' && u32(node.img) !== u32(value)) stopNodeAnimation(node, 'image-change');
    node[name] = value;
    return true;
  }

  function nodeCall(handle, method, ...args) {
    const node = nodeByHandle(handle);
    if (!node) return 0;
    const name = String(method);
    if (name === 'addChild' || name === 'removeChild') {
      const result = node[name](nodeByHandle(args[0]));
      return result?.handle || 0;
    }
    if (name === 'addChildAt') {
      const result = node.addChildAt(nodeByHandle(args[0]), args[1]);
      return result?.handle || 0;
    }
    if (name === 'getChildAt') return node.getChildAt(args[0])?.handle || 0;
    if (name === 'getChildByName') return node.getChildByName(args[0])?.handle || 0;
    if (name === 'removeFromParent') return node.removeFromParent()?.handle || 0;
    if (name === 'removeAllChildren') { node.removeAllChildren(); return true; }
    if (name === 'real_width') return node.real_width();
    if (name === 'real_height') return node.real_height();
    if (name === 'frameActionID') return playNodeAction(node, args[0]);
    if (name === 'stopFrameAction') return stopNodeAnimation(node, 'lua-stop');
    if (name === 'popFrameEnd') return node._frameEndEvents.shift() ?? -1;
    if (name === 'sendMsg') return true;
    return 0;
  }

  function setFontName(index, name) {
    const slot = Math.max(0, Math.trunc(finite(index)));
    const family = String(name || '').trim();
    if (!family) return false;
    fontNames.set(slot, `"${family.replaceAll('"', '')}", ${fontNames.get(0) || 'sans-serif'}`);
    return true;
  }

  function addFontStyle(color, outlineColor, shadowColor, _unused, outlineThick) {
    const index = fontStyleInsert++;
    fontStyles.set(index, {
      color: u32(color) & 0xffffff,
      outlineColor: u32(outlineColor) & 0xffffff,
      shadowColor: u32(shadowColor) & 0xffffff,
      outlineThick: Math.max(0, finite(outlineThick)),
    });
    return index;
  }

  function resetFontStyleInsert() {
    fontStyleInsert = 1;
  }

  function setBackground(resourceId) {
    stage.removeAllChildren();
    const id = u32(resourceId);
    if (!id) { render(); return null; }
    const background = createNode('quad');
    background.name = '__background';
    background.img = id;
    background.width = LOGICAL_WIDTH;
    background.height = LOGICAL_HEIGHT;
    stage.addChild(background);
    render();
    return background;
  }

  function snapshotNode(node) {
    return {
      handle: node.handle,
      type: node.type,
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      rotation: node.rotation,
      alpha: node.alpha,
      visible: node.visible,
      img: node.img,
      text: node.text,
      children: node.children.map(snapshotNode),
    };
  }

  function reset() {
    stopNodeTreeAnimations(stage, 'reset');
    stage.removeAllChildren();
    window.JYFramePlayer?.stopAll?.('renderer-reset');
    imageCache.clear();
    for (const [handle, node] of [...nodes]) {
      if (node !== stage) nodes.delete(handle);
    }
    render();
  }

  window.JYRenderer = {
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    HALF_WIDTH,
    HALF_HEIGHT,
    stage: () => stage,
    stageHandle: () => stage.handle,
    quad: () => createNode('quad'),
    textQuad: () => createNode('text'),
    container: () => createNode('container'),
    spineQuad: () => createNode('spine'),
    particleSystem: () => createNode('particle'),
    createNodeHandle,
    getNodeProperty,
    setNodeProperty,
    nodeCall,
    findNode,
    findNodeHandle,
    setImageGrid,
    gridSlices,
    preloadImage,
    playNodeAction,
    stopNodeAnimation,
    setFontName,
    addFontStyle,
    resetFontStyleInsert,
    decodeFont,
    styleFor,
    colorToCss,
    computeViewportFit,
    setBackground,
    ensureCanvas,
    resizeCanvas,
    render,
    snapshot: () => snapshotNode(stage),
    reset,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCanvas, { once: true });
    else ensureCanvas();
  }
})();
