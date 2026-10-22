/* Колесо: отрисовка на canvas, взвешенный выбор и анимация. */
window.Wheel = (() => {
  const COLORS = [
    '#c9603c', '#d99a3e', '#7e9b54', '#4f8e8c', '#b95c77', '#8e6bb5',
    '#c97b4e', '#6e8fa8', '#a8674f', '#8b8b4f', '#a55c8e', '#5f7f5a'
  ];

  let canvas = null;
  let stage = null;
  let ctx = null;
  let slices = [];
  let rotation = -Math.PI / 2;
  let spinning = false;
  let dpr = 1;
  let boxW = 0;
  let boxH = 0;

  const reduceMotion = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function init(canvasEl, stageEl) {
    canvas = canvasEl;
    stage = stageEl;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => refresh()).observe(stage);
    } else {
      window.addEventListener('resize', refresh);
    }
    refresh();
  }

  function refresh() {
    if (!canvas || !stage || !ctx) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    boxW = rect.width;
    boxH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(boxW * dpr);
    canvas.height = Math.round(boxH * dpr);
    canvas.style.width = boxW + 'px';
    canvas.style.height = boxH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function setSlices(list) {
    const items = (list || []).filter((s) => s && s.weight > 0);
    const total = items.reduce((sum, s) => sum + s.weight, 0);
    slices = items.map((s, i) => ({
      ...s,
      color: s.color || COLORS[i % COLORS.length],
      angle: total > 0 ? (s.weight / total) * Math.PI * 2 : 0
    }));
    draw();
  }

  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = String(text);
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  function wrapLabel(text, maxWidth, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let i = 0;
    while (i < words.length && lines.length < maxLines) {
      let line = words[i++];
      while (i < words.length && ctx.measureText(line + ' ' + words[i]).width <= maxWidth) {
        line += ' ' + words[i++];
      }
      lines.push(line);
    }
    if (i < words.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last + '…';
    }
    return lines.map((line) => fitText(line, maxWidth));
  }

  function draw() {
    if (!ctx || !canvas) return;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    if (!slices.length || w < 20 || h < 20) return;

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - Math.max(6, Math.min(w, h) * 0.018);
    const fs = Math.max(10, Math.min(15, R * 0.04));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    let a0 = -Math.PI / 2;
    for (const s of slices) {
      const a1 = a0 + s.angle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(12, 9, 7, 0.35)';
      ctx.stroke();

      if (s.angle > 0.17) {
        const mid = a0 + s.angle / 2;
        const canWrap = s.angle > 0.3;
        const labelSize = canWrap ? fs * 0.92 : fs;
        const labelWidth = R * (canWrap ? 0.56 : 0.54);
        ctx.save();
        ctx.rotate(mid);
        ctx.font = '600 ' + labelSize.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        const lines = wrapLabel(String(s.label || ''), labelWidth, canWrap ? 2 : 1);
        const lineHeight = labelSize * 1.12;
        const top = -((lines.length - 1) * lineHeight) / 2;
        const screenMid = mid + rotation;
        const norm = ((screenMid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (norm > Math.PI / 2 && norm < Math.PI * 1.5) {
          ctx.rotate(Math.PI);
          ctx.textAlign = 'left';
          lines.forEach((line, i) => ctx.fillText(line, -R * 0.9, top + i * lineHeight));
        } else {
          ctx.textAlign = 'right';
          lines.forEach((line, i) => ctx.fillText(line, R * 0.9, top + i * lineHeight));
        }
        ctx.restore();
      }

      a0 = a1;
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 7;
    ctx.stroke();
  }

  function spin(excludeId) {
    if (spinning || !slices.length) return Promise.resolve(null);
    spinning = true;

    let pool = slices.map((slice, index) => ({ slice, index }));
    if (excludeId && pool.length > 1) {
      const withoutCurrent = pool.filter((item) => item.slice.id !== excludeId);
      if (withoutCurrent.length) pool = withoutCurrent;
    }
    const total = pool.reduce((sum, item) => sum + item.slice.weight, 0);
    let r = Math.random() * total;
    let idx = pool[0].index;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      acc += pool[i].slice.weight;
      if (r <= acc) { idx = pool[i].index; break; }
      idx = pool[i].index;
    }

    let cum = 0;
    for (let i = 0; i < idx; i++) cum += slices[i].angle;
    const winner = slices[idx];
    const point = cum + winner.angle * (0.18 + Math.random() * 0.64);
    const base = -point;
    const turns = reduceMotion() ? 0.2 : 5 + Math.random() * 2;
    const target = base + Math.ceil((rotation + turns * Math.PI * 2 - base) / (Math.PI * 2)) * Math.PI * 2;
    const start = rotation;
    const duration = reduceMotion() ? 450 : 4300 + Math.random() * 900;
    const t0 = performance.now();

    return new Promise((resolve) => {
      function frame(now) {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 5);
        rotation = start + (target - start) * eased;
        draw();
        if (p < 1) {
          requestAnimationFrame(frame);
        } else {
          rotation = ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          draw();
          spinning = false;
          resolve(winner);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  return {
    init,
    refresh,
    setSlices,
    spin,
    colors: COLORS,
    get spinning() { return spinning; }
  };
})();
