(() => {
  const LOGICAL_WIDTH = 640;
  const LOGICAL_HEIGHT = 480;

  // Pinned from JY3/script/02_ui_view/v_battle.lua. Coordinates use the
  // original centered 640x480 battle coordinate system (x right, y up).
  const FLASH_NODES = Object.freeze({
    team1:  Object.freeze({ x:  173, y: -13, width:100, height:100, blend:0 }),
    team2:  Object.freeze({ x:  108, y: -44, width:100, height:100, blend:0 }),
    team3:  Object.freeze({ x:  238, y:  20, width:100, height:100, blend:0 }),
    team4:  Object.freeze({ x:  310, y:  70, width:100, height:100, blend:0 }),
    team5:  Object.freeze({ x:   29, y: -93, width:100, height:100, blend:0 }),
    enemy1: Object.freeze({ x: -111, y: 128, width:100, height:100, blend:0 }),
    enemy2: Object.freeze({ x: -111, y:   8, width:100, height:100, blend:0 }),
    enemy3: Object.freeze({ x:   91, y: 128, width:100, height:100, blend:0 }),
    enemy4: Object.freeze({ x: -206, y:  78, width:100, height:100, blend:0 }),
    enemy5: Object.freeze({ x:   -8, y: 186, width:100, height:100, blend:0 }),
    enemy6: Object.freeze({ x:   -9, y:  78, width:100, height:100, blend:0 }),
    all1:   Object.freeze({ x:  -47, y: 116, width:100, height:100, blend:1 }),
    all2:   Object.freeze({ x:  131, y:   5, width:100, height:100, blend:1 }),
    all3:   Object.freeze({ x: -134, y: 162, width:100, height:100, blend:1 }),
    icon:   Object.freeze({ x:    8, y: 195, width:100, height:100, blend:0 }),
  });

  function node(position) {
    return FLASH_NODES[String(position || '')] || null;
  }

  function sceneScale(width, height) {
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    if (!w || !h) return 1;
    return Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
  }

  function framePlacement(position, frame = {}, options = {}) {
    const target = node(position);
    if (!target) return null;

    const hasMasterOffset = options.master !== false
      && Number.isFinite(Number(frame?.x))
      && Number.isFinite(Number(frame?.y));

    // master action-set frame x/y values are the frame image origin relative
    // to the flash-node center. This preserves large skill images such as
    // DA=061 (-98,-174) instead of squeezing them into a 100x100 placeholder.
    const x = hasMasterOffset ? Number(frame.x) : -target.width / 2;
    const y = hasMasterOffset ? Number(frame.y) : -target.height / 2;

    return Object.freeze({
      position: String(position),
      nodeX: target.x,
      nodeY: target.y,
      left: LOGICAL_WIDTH / 2 + target.x + x,
      bottom: LOGICAL_HEIGHT / 2 + target.y + y,
      width: hasMasterOffset ? null : target.width,
      height: hasMasterOffset ? null : target.height,
      blend: target.blend,
      master: hasMasterOffset,
      frameX: x,
      frameY: y,
    });
  }

  window.JYBattleEffects = Object.freeze({
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    FLASH_NODES,
    node,
    sceneScale,
    framePlacement,
  });
})();
