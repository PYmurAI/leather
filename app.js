const NS = 'http://www.w3.org/2000/svg';
const A4_SIZES = { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } };
const SHEET = { margin: 8, gap: 6 };
const controls = [...document.querySelectorAll('input, select')];
const preview = document.getElementById('preview');
const basicFields = document.getElementById('basicFields');
const tFields = document.getElementById('tFields');
const gussetFields = document.getElementById('gussetFields');
const shapeSummary = document.getElementById('shapeSummary');
const holeSummary = document.getElementById('holeSummary');
const sheetSummary = document.getElementById('sheetSummary');
const saveSummary = document.getElementById('saveSummary');
const previewTitle = document.getElementById('previewTitle');
const previewDetail = document.getElementById('previewDetail');
const partList = document.getElementById('partList');
const downloadSvg = document.getElementById('downloadSvg');
const addPartButton = document.getElementById('addPart');
const clearSheetButton = document.getElementById('clearSheet');
const singleModeButton = document.getElementById('singleMode');
const sheetModeButton = document.getElementById('sheetMode');

let currentSvg = '';
let sheetSvg = '';
let previewMode = 'single';
let sheetParts = [];

const value = (id) => Number(document.getElementById(id).value) || 0;
const selectValue = (id) => document.getElementById(id).value;
const checked = (id) => document.getElementById(id).checked;
const clamp = (number, min, max) => Math.min(Math.max(number, min), max);
const clone = (object) => JSON.parse(JSON.stringify(object));
const createId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const addQuantity = () => clamp(Math.floor(value('partQuantity')), 1, 99);

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
      topWidth: value('gussetTopWidth'),
      bottomWidth: value('gussetBottomWidth'),
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

function partName(settings) {
  if (settings.type === 'rect') return '長方形';
  if (settings.type === 'rounded') return 'R付き長方形';
  if (settings.type === 'tShape') return 'T字パーツ';
  if (settings.gussetType === 'fan') return '扇形マチ';
  return '直線マチ';
}

function sheetSize() {
  return A4_SIZES[selectValue('sheetOrientation')];
}

function shapePath(settings, inset = 0) {
  if (settings.type === 'tShape') return tShapePath(settings, inset);
  if (settings.type === 'gusset') return gussetPath(settings, inset);
  return roundedRectPath(settings, inset);
}

function guidePath(settings, inset = 0) {
  if (settings.type === 'tShape' || settings.type === 'gusset') {
    return pointsToClosedPath(approximatePathPoints(settings, inset));
  }
  return shapePath(settings, inset);
}

function pointsToClosedPath(points) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`), 'Z'].join(' ');
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

function gussetGeometry(settings, inset = 0) {
  const top = Math.max(settings.topWidth - inset * 2, 1);
  const bottom = Math.max(settings.bottomWidth - inset * 2, 1);
  const width = Math.max(top, bottom);
  const height = Math.max(settings.height - inset * 2, 1);
  const topX = inset + (width - top) / 2;
  const bottomX = inset + (width - bottom) / 2;
  return { x: inset, y: inset, topX, bottomX, top, bottom, width, height };
}

function gussetPath(settings, inset) {
  const g = gussetGeometry(settings, inset);
  if (settings.gussetType === 'fan') {
    const curveLift = Math.min(g.height * 0.45, Math.max(Math.abs(g.bottom - g.top) * 0.22, 6));
    return [
      `M ${g.bottomX} ${g.y + g.height}`,
      `L ${g.topX} ${g.y + curveLift}`,
      `Q ${g.bottomX + g.bottom / 2} ${g.y - curveLift} ${g.topX + g.top} ${g.y + curveLift}`,
      `L ${g.bottomX + g.bottom} ${g.y + g.height}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${g.topX} ${g.y}`,
    `H ${g.topX + g.top}`,
    `L ${g.bottomX + g.bottom} ${g.y + g.height}`,
    `H ${g.bottomX}`,
    'Z',
  ].join(' ');
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
    const g = gussetGeometry(settings, inset);
    if (settings.gussetType === 'fan') {
      const curveLift = Math.min(g.height * 0.45, Math.max(Math.abs(g.bottom - g.top) * 0.22, 6));
      const points = [{ x: g.bottomX, y: g.y + g.height }, { x: g.topX, y: g.y + curveLift }];
      for (let i = 1; i <= 32; i += 1) {
        const t = i / 32;
        const px = (1 - t) * (1 - t) * g.topX + 2 * (1 - t) * t * (g.bottomX + g.bottom / 2) + t * t * (g.topX + g.top);
        const py = (1 - t) * (1 - t) * (g.y + curveLift) + 2 * (1 - t) * t * (g.y - curveLift) + t * t * (g.y + curveLift);
        points.push({ x: px, y: py });
      }
      points.push({ x: g.bottomX + g.bottom, y: g.y + g.height });
      return points;
    }
    return [{ x: g.topX, y: g.y }, { x: g.topX + g.top, y: g.y }, { x: g.bottomX + g.bottom, y: g.y + g.height }, { x: g.bottomX, y: g.y + g.height }];
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
  if (settings.type === 'gusset') return { width: Math.max(settings.topWidth, settings.bottomWidth), height: settings.height };
  return { width: settings.width, height: settings.height };
}

function renderPart(settings, offsetX = 0, offsetY = 0, label = '') {
  const pathData = shapePath(settings, 0);
  const seamPath = guidePath(settings, settings.seam);
  const holes = settings.showHoles ? sampleHoles(settings) : [];
  const labelSvg = label ? `<text x="0" y="-2.5" font-size="3.2" fill="#74675a">${escapeXml(label)}</text>` : '';

  return `<g transform="translate(${offsetX} ${offsetY})">
    ${labelSvg}
    <path d="${pathData}" fill="none" stroke="#2b2118" stroke-width="0.4" vector-effect="non-scaling-stroke"/>
    ${settings.showSeam ? `<path d="${seamPath}" fill="none" stroke="#8a4f2a" stroke-width="0.25" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke"/>` : ''}
    ${holes.map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="0.8" fill="#8a4f2a"/>`).join('\n    ')}
  </g>`;
}

function buildSingleSvg(settings) {
  const size = dimensions(settings);
  const margin = 18;
  const svgWidth = size.width + margin * 2;
  const svgHeight = size.height + margin * 2;

  return `<svg xmlns="${NS}" width="${svgWidth}mm" height="${svgHeight}mm" viewBox="${-margin} ${-margin} ${svgWidth} ${svgHeight}">
  <rect x="${-margin}" y="${-margin}" width="${svgWidth}" height="${svgHeight}" fill="#fffdf8"/>
  ${renderPart(settings)}
</svg>`;
}

function layoutSheetParts(parts) {
  const page = sheetSize();
  const printableWidth = page.width - SHEET.margin * 2;
  const printableHeight = page.height - SHEET.margin * 2;
  let x = SHEET.margin;
  let y = SHEET.margin + 8;
  let rowHeight = 0;

  return parts.map((part) => {
    const size = dimensions(part.settings);
    const tooWide = size.width > printableWidth;
    const tooTall = size.height > printableHeight;
    if (x + size.width > page.width - SHEET.margin && x > SHEET.margin) {
      x = SHEET.margin;
      y += rowHeight + SHEET.gap;
      rowHeight = 0;
    }
    const placement = {
      ...part,
      x,
      y,
      width: size.width,
      height: size.height,
      overflow: tooWide || tooTall || y + size.height > page.height - SHEET.margin,
    };
    x += size.width + SHEET.gap;
    rowHeight = Math.max(rowHeight, size.height);
    return placement;
  });
}

function sheetGuideSvg(page) {
  const ticks = [];
  for (let x = 0; x <= page.width; x += 10) {
    const major = x % 50 === 0;
    ticks.push(`<line x1="${x}" y1="0" x2="${x}" y2="${major ? 4 : 2}" stroke="#d8c9b6" stroke-width="0.25"/>`);
    if (major && x > 0) ticks.push(`<text x="${x}" y="7" text-anchor="middle" font-size="2.8" fill="#74675a">${x}</text>`);
  }
  for (let y = 0; y <= page.height; y += 10) {
    const major = y % 50 === 0;
    ticks.push(`<line x1="0" y1="${y}" x2="${major ? 4 : 2}" y2="${y}" stroke="#d8c9b6" stroke-width="0.25"/>`);
    if (major && y > 0) ticks.push(`<text x="6" y="${y + 1}" font-size="2.8" fill="#74675a">${y}</text>`);
  }
  return ticks.join('\n  ');
}

function placementFrameSvg(part, index) {
  const color = part.overflow ? '#b7352d' : '#d8c9b6';
  return `<rect x="${part.x}" y="${part.y}" width="${part.width}" height="${part.height}" fill="none" stroke="${color}" stroke-width="0.25" stroke-dasharray="1.5 1"/>
  <circle cx="${part.x + 2.8}" cy="${part.y + 2.8}" r="2.8" fill="#8a4f2a"/>
  <text x="${part.x + 2.8}" y="${part.y + 3.8}" text-anchor="middle" font-size="3" fill="#fff">${index + 1}</text>`;
}

function buildSheetSvg() {
  const page = sheetSize();
  const placements = layoutSheetParts(sheetParts);
  const overflow = placements.some((part) => part.overflow);
  const framesSvg = placements.map((part, index) => placementFrameSvg(part, index)).join('\n  ');
  const partsSvg = placements.map((part, index) => renderPart(part.settings, part.x, part.y, `${index + 1}. ${part.name}`)).join('\n  ');
  const orientationName = page.width > page.height ? '横' : '縦';
  const warning = overflow ? `<text x="8" y="${page.height - 5}" font-size="4" fill="#b7352d">A4範囲外のパーツがあります</text>` : '';

  return {
    svg: `<svg xmlns="${NS}" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">
  <rect x="0" y="0" width="${page.width}" height="${page.height}" fill="#fffdf8"/>
  <rect x="${SHEET.margin}" y="${SHEET.margin}" width="${page.width - SHEET.margin * 2}" height="${page.height - SHEET.margin * 2}" fill="none" stroke="#8a4f2a" stroke-width="0.35" stroke-dasharray="2 2"/>
  ${sheetGuideSvg(page)}
  <text x="8" y="6" font-size="4" fill="#74675a">A4${orientationName} / ${page.width}mm x ${page.height}mm / dashed line = printable guide</text>
  ${framesSvg}
  ${partsSvg || `<text x="${page.width / 2}" y="${page.height / 2}" text-anchor="middle" font-size="5" fill="#74675a">A4に追加したパーツがここに表示されます</text>`}
  ${warning}
</svg>`,
    placements,
    overflow,
    page,
  };
}

function renderPartList(placements) {
  partList.innerHTML = '';
  placements.forEach((part, index) => {
    const item = document.createElement('li');
    item.innerHTML = `<div class="part-row">
      <div><strong>${index + 1}. ${escapeXml(part.name)}</strong><div class="part-meta">${Math.round(part.width)}mm × ${Math.round(part.height)}mm<br>配置: X ${part.x.toFixed(1)}mm / Y ${part.y.toFixed(1)}mm</div></div>
      <button class="mini-button" type="button" data-remove="${part.id}">削除</button>
    </div>${part.overflow ? '<div class="part-warning">A4範囲外です。サイズか個数を調整してください。</div>' : ''}`;
    partList.appendChild(item);
  });
}

function setPreviewMode(mode) {
  previewMode = mode;
  singleModeButton.classList.toggle('active', mode === 'single');
  sheetModeButton.classList.toggle('active', mode === 'sheet');
  render();
}

function addCurrentPart() {
  const quantity = addQuantity();
  const settings = clone(readSettings());
  const size = dimensions(settings);
  const name = partName(settings);
  for (let index = 0; index < quantity; index += 1) {
    sheetParts.push({
      id: createId(),
      name: quantity > 1 ? `${name} 複製${index + 1}/${quantity}` : name,
      settings: clone(settings),
      width: size.width,
      height: size.height,
    });
  }
  setPreviewMode('sheet');
}

function removePart(id) {
  sheetParts = sheetParts.filter((part) => part.id !== id);
  render();
}

function clearSheet() {
  sheetParts = [];
  render();
}

function render() {
  const settings = readSettings();
  basicFields.classList.toggle('hidden', settings.type === 'tShape' || settings.type === 'gusset');
  tFields.classList.toggle('hidden', settings.type !== 'tShape');
  gussetFields.classList.toggle('hidden', settings.type !== 'gusset');
  document.querySelectorAll('.rounded-only').forEach((el) => el.classList.toggle('hidden', settings.type !== 'rounded'));

  const size = dimensions(settings);
  const holes = settings.showHoles ? sampleHoles(settings) : [];
  const sheet = buildSheetSvg();
  currentSvg = buildSingleSvg(settings);
  sheetSvg = sheet.svg;

  preview.innerHTML = previewMode === 'sheet' ? sheetSvg : currentSvg;
  shapeSummary.textContent = `${Math.round(size.width)}mm × ${Math.round(size.height)}mm`;
  holeSummary.textContent = `${holes.length}個`;
  const saveLabel = previewMode === 'sheet' ? 'A4まとめSVG' : '単体SVG';
  sheetSummary.textContent = `${sheetParts.length}個${sheet.overflow ? ' / 範囲外あり' : ''}`;
  saveSummary.textContent = saveLabel;
  previewTitle.textContent = saveLabel;
  previewDetail.textContent = previewMode === 'sheet'
    ? `${sheet.page.width}mm × ${sheet.page.height}mm / ${sheetParts.length}パーツ / 表示中のA4がそのまま保存されます`
    : `${Math.round(size.width)}mm × ${Math.round(size.height)}mm / 表示中の単体パーツが保存されます`;
  downloadSvg.textContent = `${saveLabel}を保存`;
  renderPartList(sheet.placements);
}

function saveSvg() {
  const svg = previewMode === 'sheet' ? sheetSvg : currentSvg;
  const suffix = previewMode === 'sheet' ? 'a4-sheet' : 'single-part';
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `leather-pattern-${suffix}-${Date.now()}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
}

controls.forEach((control) => control.addEventListener('input', render));
downloadSvg.addEventListener('click', saveSvg);
addPartButton.addEventListener('click', addCurrentPart);
clearSheetButton.addEventListener('click', clearSheet);
singleModeButton.addEventListener('click', () => setPreviewMode('single'));
sheetModeButton.addEventListener('click', () => setPreviewMode('sheet'));
partList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (button) removePart(button.dataset.remove);
});
render();
