const NS = 'http://www.w3.org/2000/svg';
const controls = [...document.querySelectorAll('input, select')];
const preview = document.getElementById('preview');
const partType = document.getElementById('partType');
const basicFields = document.getElementById('basicFields');
const tFields = document.getElementById('tFields');
const gussetFields = document.getElementById('gussetFields');
const shapeSummary = document.getElementById('shapeSummary');
const holeSummary = document.getElementById('holeSummary');
const downloadSvg = document.getElementById('downloadSvg');

let currentSvg = '';

const value = (id) => Number(document.getElementById(id).value) || 0;
const selectValue = (id) => document.getElementById(id).value;
const checked = (id) => document.getElementById(id).checked;
const clamp = (number, min, max) => Math.min(Math.max(number, min), max);

function readSettings() {
  const type = selectValue('partType');
  const common = {
    type,
    pitch: Math.max(value('pitch'), 1),
    seam: Math.max(value('seam'), 0),
    showSeam: checked('showSeam'),
    showHoles: checked('showHoles'),
  };

  if (type === 'tShape') {
    return {
      ...common,
      bodyWidth: value('bodyWidth'),
      bodyHeight: value('bodyHeight'),
      wingWidth: value('wingWidth'),
      wingHeight: value('wingHeight'),
    };
  }

  if (type === 'gusset') {
    return {
      ...common,
      width: value('gussetWidth'),
      height: value('gussetHeight'),
      gussetType: selectValue('gussetType'),
    };
  }

  return {
    ...common,
    width: value('width'),
    height: value('height'),
    radius: type === 'rounded' ? value('radius') : 0,
    radiusMode: selectValue('radiusMode'),
  };
}

function shapePath(settings, inset = 0) {
  if (settings.type === 'tShape') return tShapePath(settings, inset);
  if (settings.type === 'gusset') return gussetPath(settings, inset);
  return roundedRectPath(settings, inset);
}

function roundedRectPath(settings, inset) {
  const w = Math.max(settings.width - inset * 2, 1);
  const h = Math.max(settings.height - inset * 2, 1);
  const x = inset;
  const y = inset;
  const r = clamp(settings.radius - inset, 0, Math.min(w, h) / 2);
  const top = settings.type === 'rounded' && (settings.radiusMode === 'top' || settings.radiusMode === 'all');
  const bottom = settings.type === 'rounded' && (settings.radiusMode === 'bottom' || settings.radiusMode === 'all');
  const tl = top ? r : 0;
  const tr = top ? r : 0;
  const br = bottom ? r : 0;
  const bl = bottom ? r : 0;

  return [
    `M ${x + tl} ${y}`,
    `H ${x + w - tr}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : `L ${x + w} ${y}`,
    `V ${y + h - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : `L ${x + w} ${y + h}`,
    `H ${x + bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : `L ${x} ${y + h}`,
    `V ${y + tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : `L ${x} ${y}`,
    'Z',
  ].join(' ');
}

function tShapePath(settings, inset) {
  const wingWidth = Math.max(settings.wingWidth - inset * 2, 1);
  const wingHeight = Math.max(settings.wingHeight - inset * 2, 1);
  const bodyWidth = Math.max(settings.bodyWidth - inset * 2, 1);
  const bodyHeight = Math.max(settings.bodyHeight - inset * 2, 1);
  const bodyX = inset + (wingWidth - bodyWidth) / 2;
  const left = inset;
  const top = inset;
  const right = inset + wingWidth;
  const bottom = inset + wingHeight + bodyHeight;

  return [
    `M ${left} ${top}`,
    `H ${right}`,
    `V ${top + wingHeight}`,
    `H ${bodyX + bodyWidth}`,
    `V ${bottom}`,
    `H ${bodyX}`,
    `V ${top + wingHeight}`,
    `H ${left}`,
    'Z',
  ].join(' ');
}

function gussetPath(settings, inset) {
  const w = Math.max(settings.width - inset * 2, 1);
  const h = Math.max(settings.height - inset * 2, 1);
  const x = inset;
  const y = inset;
  if (settings.gussetType === 'fan') {
    return [`M ${x} ${y + h}`, `Q ${x + w / 2} ${y} ${x + w} ${y + h}`, 'Z'].join(' ');
  }
  const taper = Math.min(w * 0.16, h * 0.6);
  return [`M ${x + taper} ${y}`, `H ${x + w - taper}`, `L ${x + w} ${y + h}`, `H ${x}`, 'Z'].join(' ');
}

function sampleHoles(settings) {
  const points = approximatePathPoints(settings, settings.seam);
  if (points.length < 2) return [];
  const holes = [];
  let carry = 0;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    let distance = settings.pitch - carry;
    while (distance < length) {
      const t = distance / length;
      holes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      distance += settings.pitch;
    }
    carry = length - (distance - settings.pitch);
  }

  return holes;
}

function approximatePathPoints(settings, inset) {
  if (settings.type === 'tShape') {
    const wingWidth = Math.max(settings.wingWidth - inset * 2, 1);
    const wingHeight = Math.max(settings.wingHeight - inset * 2, 1);
    const bodyWidth = Math.max(settings.bodyWidth - inset * 2, 1);
    const bodyHeight = Math.max(settings.bodyHeight - inset * 2, 1);
    const bodyX = inset + (wingWidth - bodyWidth) / 2;
    const x = inset;
    const y = inset;
    return [{x, y}, {x: x + wingWidth, y}, {x: x + wingWidth, y: y + wingHeight}, {x: bodyX + bodyWidth, y: y + wingHeight}, {x: bodyX + bodyWidth, y: y + wingHeight + bodyHeight}, {x: bodyX, y: y + wingHeight + bodyHeight}, {x: bodyX, y: y + wingHeight}, {x, y: y + wingHeight}];
  }

  if (settings.type === 'gusset') {
    const w = Math.max(settings.width - inset * 2, 1);
    const h = Math.max(settings.height - inset * 2, 1);
    const x = inset;
    const y = inset;
    if (settings.gussetType === 'fan') {
      const points = [];
      for (let i = 0; i <= 32; i += 1) {
        const t = i / 32;
        const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + w / 2) + t * t * (x + w);
        const py = (1 - t) * (1 - t) * (y + h) + 2 * (1 - t) * t * y + t * t * (y + h);
        points.push({ x: px, y: py });
      }
      return points;
    }
    const taper = Math.min(w * 0.16, h * 0.6);
    return [{x: x + taper, y}, {x: x + w - taper, y}, {x: x + w, y: y + h}, {x, y: y + h}];
  }

  return roundedRectPoints(settings, inset);
}

function roundedRectPoints(settings, inset) {
  const w = Math.max(settings.width - inset * 2, 1);
  const h = Math.max(settings.height - inset * 2, 1);
  const x = inset;
  const y = inset;
  const r = clamp(settings.radius - inset, 0, Math.min(w, h) / 2);
  const top = settings.type === 'rounded' && (settings.radiusMode === 'top' || settings.radiusMode === 'all');
  const bottom = settings.type === 'rounded' && (settings.radiusMode === 'bottom' || settings.radiusMode === 'all');
  const points = [];
  const addLine = (px, py) => points.push({ x: px, y: py });
  const addArc = (cx, cy, radius, start, end) => {
    for (let i = 1; i <= 10; i += 1) {
      const angle = start + (end - start) * (i / 10);
      points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
  };

  addLine(x + (top ? r : 0), y);
  addLine(x + w - (top ? r : 0), y);
  top ? addArc(x + w - r, y + r, r, -Math.PI / 2, 0) : addLine(x + w, y);
  addLine(x + w, y + h - (bottom ? r : 0));
  bottom ? addArc(x + w - r, y + h - r, r, 0, Math.PI / 2) : addLine(x + w, y + h);
  addLine(x + (bottom ? r : 0), y + h);
  bottom ? addArc(x + r, y + h - r, r, Math.PI / 2, Math.PI) : addLine(x, y + h);
  addLine(x, y + (top ? r : 0));
  top ? addArc(x + r, y + r, r, Math.PI, Math.PI * 1.5) : addLine(x, y);
  return points;
}

function dimensions(settings) {
  if (settings.type === 'tShape') return { width: settings.wingWidth, height: settings.bodyHeight + settings.wingHeight };
  return { width: settings.width, height: settings.height };
}

function render() {
  const settings = readSettings();
  basicFields.classList.toggle('hidden', settings.type === 'tShape' || settings.type === 'gusset');
  tFields.classList.toggle('hidden', settings.type !== 'tShape');
  gussetFields.classList.toggle('hidden', settings.type !== 'gusset');
  document.querySelectorAll('.rounded-only').forEach((el) => el.classList.toggle('hidden', settings.type !== 'rounded'));

  const size = dimensions(settings);
  const margin = 18;
  const svgWidth = size.width + margin * 2;
  const svgHeight = size.height + margin * 2;
  const pathData = shapePath(settings, 0);
  const seamPath = shapePath(settings, settings.seam);
  const holes = settings.showHoles ? sampleHoles(settings) : [];

  currentSvg = `<svg xmlns="${NS}" width="${svgWidth}mm" height="${svgHeight}mm" viewBox="${-margin} ${-margin} ${svgWidth} ${svgHeight}">
  <rect x="${-margin}" y="${-margin}" width="${svgWidth}" height="${svgHeight}" fill="#fffdf8"/>
  <path d="${pathData}" fill="none" stroke="#2b2118" stroke-width="0.4" vector-effect="non-scaling-stroke"/>
  ${settings.showSeam ? `<path d="${seamPath}" fill="none" stroke="#8a4f2a" stroke-width="0.25" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke"/>` : ''}
  ${holes.map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="0.8" fill="#8a4f2a"/>`).join('\n  ')}
</svg>`;

  preview.innerHTML = currentSvg;
  shapeSummary.textContent = `${Math.round(size.width)}mm × ${Math.round(size.height)}mm`;
  holeSummary.textContent = `${holes.length}個`;
}

function saveSvg() {
  const blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `leather-pattern-${Date.now()}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

controls.forEach((control) => control.addEventListener('input', render));
downloadSvg.addEventListener('click', saveSvg);
render();
