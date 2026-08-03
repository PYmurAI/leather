const NS = 'http://www.w3.org/2000/svg';
const A4_SIZES = { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } };
const SHEET = { margin: 8, gap: 6, pageGap: 12, headerHeight: 8 };
const DRAFT_KEY = 'leather-pattern-generator-draft-v1';
const controls = [...document.querySelectorAll('input, select')];
const preview = document.getElementById('preview');
const basicFields = document.getElementById('basicFields');
const tFields = document.getElementById('tFields');
const gussetFields = document.getElementById('gussetFields');
const shapeSummary = document.getElementById('shapeSummary');
const holeSummary = document.getElementById('holeSummary');
const sheetSummary = document.getElementById('sheetSummary');
const saveSummary = document.getElementById('saveSummary');
const draftSummary = document.getElementById('draftSummary');
const previewTitle = document.getElementById('previewTitle');
const previewDetail = document.getElementById('previewDetail');
const partList = document.getElementById('partList');
const downloadSvg = document.getElementById('downloadSvg');
const addPartButton = document.getElementById('addPart');
const clearSheetButton = document.getElementById('clearSheet');
const saveDraftButton = document.getElementById('saveDraft');
const loadDraftButton = document.getElementById('loadDraft');
const exportDraftButton = document.getElementById('exportDraft');
const importDraftButton = document.getElementById('importDraft');
const importDraftFile = document.getElementById('importDraftFile');
const clearDraftButton = document.getElementById('clearDraft');
const singleModeButton = document.getElementById('singleMode');
const sheetModeButton = document.getElementById('sheetMode');
const assemblyModeButton = document.getElementById('assemblyMode');
const rawThicknessSummary = document.getElementById('rawThicknessSummary');
const compressedThicknessSummary = document.getElementById('compressedThicknessSummary');
const designThicknessSummary = document.getElementById('designThicknessSummary');
const stepPart = document.getElementById('stepPart');
const stepAction = document.getElementById('stepAction');
const stepNote = document.getElementById('stepNote');
const addStepButton = document.getElementById('addStep');
const assemblyStepList = document.getElementById('assemblyStepList');

let currentSvg = '';
let sheetSvg = '';
let assemblySvg = '';
let previewMode = 'single';
let sheetParts = [];
let assemblySteps = [];
let isRestoringDraft = false;
let draftMessage = '';

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

function readControlValues() {
  return controls.reduce((data, control) => {
    data[control.id] = control.type === 'checkbox' ? control.checked : control.value;
    return data;
  }, {});
}

function applyControlValues(data) {
  if (!data || typeof data !== 'object') return;
  controls.forEach((control) => {
    if (!Object.prototype.hasOwnProperty.call(data, control.id)) return;
    if (control.type === 'checkbox') {
      control.checked = Boolean(data[control.id]);
    } else {
      control.value = data[control.id];
    }
  });
}

function draftPayload() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    controls: readControlValues(),
    previewMode,
    sheetParts,
    assemblySteps,
  };
}

function validDraft(draft) {
  return Boolean(
    draft
    && draft.version === 1
    && draft.controls
    && typeof draft.controls === 'object'
    && !Array.isArray(draft.controls)
    && Array.isArray(draft.sheetParts)
    && draft.sheetParts.every((part) => part && typeof part === 'object' && part.settings && typeof part.settings === 'object')
  );
}

function formatSavedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!validDraft(draft)) return null;
    return draft;
  } catch {
    return null;
  }
}

function updateDraftSummary() {
  const draft = readDraft();
  const savedAt = formatSavedAt(draft?.savedAt);
  draftSummary.textContent = draftMessage || (savedAt ? `保存済み ${savedAt}` : '未保存');
}

function saveDraft(message = '') {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload()));
    draftMessage = message;
  } catch {
    draftMessage = '保存できませんでした';
  }
  updateDraftSummary();
}

function restoreDraft(showMessage = true) {
  const draft = readDraft();
  if (!draft) {
    draftMessage = showMessage ? '保存データなし' : '';
    updateDraftSummary();
    return false;
  }

  isRestoringDraft = true;
  applyControlValues(draft.controls);
  previewMode = ['single', 'sheet', 'assembly'].includes(draft.previewMode) ? draft.previewMode : 'single';
  sheetParts = draft.sheetParts
    .filter((part) => part && part.settings)
    .map((part) => ({
      ...part,
      id: part.id || createId(),
      settings: clone(part.settings),
      assembly: normalizeAssembly(part.assembly),
    }));
  assemblySteps = Array.isArray(draft.assemblySteps)
    ? draft.assemblySteps.filter((step) => step && typeof step === 'object').map((step) => ({ ...step, id: step.id || createId() }))
    : [];
  draftMessage = showMessage ? '復元しました' : '';
  setPreviewMode(previewMode, false);
  isRestoringDraft = false;
  updateDraftSummary();
  return true;
}

function clearDraftStorage() {
  localStorage.removeItem(DRAFT_KEY);
  draftMessage = '保存を削除しました';
  updateDraftSummary();
}

function draftFileName() {
  const date = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `leather-pattern-work-${timestamp}.json`;
}

function exportDraft() {
  const json = JSON.stringify(draftPayload(), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = draftFileName();
  anchor.click();
  URL.revokeObjectURL(url);
  draftMessage = 'JSONを書き出しました';
  updateDraftSummary();
}

async function importDraft(file) {
  try {
    const draft = JSON.parse(await file.text());
    if (!validDraft(draft)) throw new Error('Unsupported draft data');
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    restoreDraft(false);
    draftMessage = 'JSONから復元しました';
  } catch {
    draftMessage = 'JSONを読み込めませんでした';
  }
  importDraftFile.value = '';
  updateDraftSummary();
}

function partName(settings) {
  if (settings.type === 'rect') return '長方形';
  if (settings.type === 'rounded') return 'R付き長方形';
  if (settings.type === 'tShape') return 'T字パーツ';
  if (settings.gussetType === 'fan') return '扇形マチ';
  return '直線マチ';
}

function normalizeAssembly(data = {}) {
  const thickness = clamp(Number(data.thickness) || 1.5, 0.1, 20);
  const compressionRate = clamp(Number(data.compressionRate) || 0.85, 0.1, 1);
  const fold = data.fold && typeof data.fold === 'object' ? data.fold : {};
  return {
    thickness,
    materialType: data.materialType || 'vegetable',
    layerType: data.layerType || 'outer',
    face: data.face === 'back' ? 'back' : 'front',
    compressionRate,
    color: /^#[0-9a-f]{6}$/i.test(data.color || '') ? data.color : '#c47b45',
    sewEdge: ['none', 'top', 'right', 'bottom', 'left', 'all'].includes(data.sewEdge) ? data.sewEdge : 'none',
    fold: {
      enabled: Boolean(fold.enabled),
      position: clamp(Number(fold.position) || 50, 0, 100),
      angle: clamp(Number(fold.angle) || 180, 0, 360),
      insideRadius: clamp(Number(fold.insideRadius) || 0, 0, 100),
      direction: fold.direction === 'valley' ? 'valley' : 'mountain',
    },
  };
}

function readAssemblySettings() {
  return normalizeAssembly({
    thickness: value('partThickness'),
    materialType: selectValue('materialType'),
    layerType: selectValue('layerType'),
    face: selectValue('partFace'),
    compressionRate: value('compressionRate'),
    color: selectValue('partColor'),
    sewEdge: selectValue('sewEdge'),
    fold: {
      enabled: checked('foldEnabled'),
      position: value('foldPosition'),
      angle: value('foldAngle'),
      insideRadius: value('foldRadius'),
      direction: selectValue('foldDirection'),
    },
  });
}

function foldAllowance(part) {
  const { fold, thickness } = part.assembly;
  if (!fold.enabled) return 0;
  const neutralAxisRatio = clamp(value('neutralAxisRatio'), 0, 1);
  return fold.angle * Math.PI / 180 * (fold.insideRadius + thickness * neutralAxisRatio);
}

function sectionLayers() {
  if (!sheetParts.length) return [];
  const maxHeight = Math.max(...sheetParts.map((part) => dimensions(part.settings).height));
  const sectionY = maxHeight * clamp(value('sectionPosition'), 0, 100) / 100;
  return sheetParts.filter((part) => {
    const height = dimensions(part.settings).height;
    const top = (maxHeight - height) / 2;
    return sectionY >= top && sectionY <= top + height;
  });
}

function thicknessTotals(layers = sectionLayers()) {
  const raw = layers.reduce((total, part) => total + part.assembly.thickness, 0);
  const compressed = layers.reduce((total, part) => total + part.assembly.thickness * part.assembly.compressionRate, 0);
  return { raw, compressed, design: compressed + Math.max(value('safetyMargin'), 0) };
}

function sewEdgeSvg(part, x, y, width, height) {
  const edge = part.assembly.sewEdge;
  if (edge === 'none') return '';
  const lines = {
    top: [x, y, x + width, y], right: [x + width, y, x + width, y + height],
    bottom: [x, y + height, x + width, y + height], left: [x, y, x, y + height],
  };
  const keys = edge === 'all' ? Object.keys(lines) : [edge];
  return keys.map((key) => {
    const line = lines[key];
    return `<line x1="${line[0]}" y1="${line[1]}" x2="${line[2]}" y2="${line[3]}" stroke="#b7352d" stroke-width="1.2"/>`;
  }).join('');
}

function buildAssemblySvg() {
  const canvasWidth = Math.max(320, ...sheetParts.map((part) => dimensions(part.settings).width + 210));
  const explodedRows = sheetParts.map((part) => dimensions(part.settings).height + 20);
  const explodedHeight = Math.max(90, explodedRows.reduce((sum, height) => sum + height, 20));
  const layers = sectionLayers();
  const totals = thicknessTotals(layers);
  const sectionHeight = Math.max(100, layers.length * 18 + 70);
  const stepsHeight = Math.max(55, assemblySteps.length * 12 + 38);
  const maxPartHeight = sheetParts.length ? Math.max(...sheetParts.map((part) => dimensions(part.settings).height)) : 0;
  const absoluteSectionY = maxPartHeight * clamp(value('sectionPosition'), 0, 100) / 100;
  let rowY = 20;
  const exploded = sheetParts.map((part, index) => {
    const size = dimensions(part.settings);
    const x = 25 + index * 10;
    const y = rowY;
    rowY += size.height + 20;
    const localSectionY = absoluteSectionY - (maxPartHeight - size.height) / 2;
    const sectionLineSvg = localSectionY >= 0 && localSectionY <= size.height
      ? `<line x1="${x - 4}" y1="${y + localSectionY}" x2="${x + size.width + 4}" y2="${y + localSectionY}" stroke="#b7352d" stroke-width="0.7" stroke-dasharray="3 2"/><text x="${x - 8}" y="${y + localSectionY + 1}" font-size="4" fill="#b7352d">A</text><text x="${x + size.width + 6}" y="${y + localSectionY + 1}" font-size="4" fill="#b7352d">A′</text>`
      : '';
    const foldY = y + size.height * part.assembly.fold.position / 100;
    const foldSvg = part.assembly.fold.enabled
      ? `<line x1="${x}" y1="${foldY}" x2="${x + size.width}" y2="${foldY}" stroke="#315c8a" stroke-width="0.7" stroke-dasharray="4 2"/><text x="${x + size.width + 4}" y="${foldY + 1}" font-size="3.5" fill="#315c8a">${part.assembly.fold.direction === 'mountain' ? '山' : '谷'}折り ${part.assembly.fold.angle}° / 必要長 ${foldAllowance(part).toFixed(1)}mm</text>`
      : '';
    const arrow = index < sheetParts.length - 1
      ? `<line x1="12" y1="${y + size.height + 2}" x2="12" y2="${y + size.height + 15}" stroke="#8a4f2a" stroke-width="0.7"/><path d="M 9 ${y + size.height + 12} L 12 ${y + size.height + 16} L 15 ${y + size.height + 12}" fill="none" stroke="#8a4f2a" stroke-width="0.7"/>`
      : '';
    return `<g>
      <path d="${shapePath(part.settings)}" transform="translate(${x} ${y})" fill="${part.assembly.color}" fill-opacity="0.35" stroke="#2b2118" stroke-width="0.5"/>
      ${sewEdgeSvg(part, x, y, size.width, size.height)}${foldSvg}${sectionLineSvg}${arrow}
      <text x="${x}" y="${y - 5}" font-size="4" fill="#2b2118">${index + 1}. ${escapeXml(part.name)} / ${part.assembly.thickness.toFixed(1)}mm / ${part.assembly.face === 'front' ? '表' : '裏'}</text>
    </g>`;
  }).join('\n');
  const sectionY = explodedHeight + 32;
  const sectionBars = layers.map((part, index) => {
    const y = sectionY + index * 18;
    return `<rect x="24" y="${y}" width="130" height="14" rx="2" fill="${part.assembly.color}" fill-opacity="0.55" stroke="#2b2118" stroke-width="0.35"/>
      <text x="28" y="${y + 9}" font-size="4" fill="#2b2118">${index + 1}. ${escapeXml(part.name)}</text>
      <text x="160" y="${y + 9}" font-size="4" fill="#2b2118">${part.assembly.thickness.toFixed(1)}mm → ${(part.assembly.thickness * part.assembly.compressionRate).toFixed(1)}mm</text>`;
  }).join('\n');
  const empty = layers.length ? '' : `<text x="24" y="${sectionY + 12}" font-size="4" fill="#74675a">断面線と交差するパーツはありません</text>`;
  const summaryY = sectionY + Math.max(layers.length, 1) * 18 + 10;
  const stepsY = explodedHeight + sectionHeight;
  const stepsSvg = assemblySteps.map((step, index) => {
    const part = sheetParts.find((item) => item.id === step.partId);
    return `<text x="24" y="${stepsY + 30 + index * 12}" font-size="4" fill="#2b2118">${index + 1}. ${escapeXml(part?.name || '削除済みパーツ')}を${actionLabel(step.action)}${step.note ? ` — ${escapeXml(step.note)}` : ''}</text>`;
  }).join('');
  const totalHeight = explodedHeight + sectionHeight + stepsHeight;
  return `<svg xmlns="${NS}" width="${canvasWidth}mm" height="${totalHeight}mm" viewBox="0 0 ${canvasWidth} ${totalHeight}">
    <rect width="100%" height="100%" fill="#fffdf8"/>
    <text x="12" y="10" font-size="5" font-weight="bold" fill="#2b2118">2D分解図（上から積層順）</text>
    ${exploded || '<text x="24" y="45" font-size="4" fill="#74675a">A4ページにパーツを追加してください</text>'}
    <line x1="12" y1="${explodedHeight + 10}" x2="${canvasWidth - 12}" y2="${explodedHeight + 10}" stroke="#d8c9b6"/>
    <text x="12" y="${explodedHeight + 24}" font-size="5" font-weight="bold" fill="#2b2118">断面 A—A′（高さ ${clamp(value('sectionPosition'), 0, 100)}%）</text>
    ${sectionBars}${empty}
    <text x="24" y="${summaryY}" font-size="4" fill="#2b2118">素材厚 ${totals.raw.toFixed(1)}mm / 圧縮後 ${totals.compressed.toFixed(1)}mm / 安全側 ${totals.design.toFixed(1)}mm</text>
    <text x="24" y="${summaryY + 8}" font-size="3.5" fill="#74675a">※ 計算値は素材や加工方法で変化する参考値です</text>
    <line x1="12" y1="${stepsY + 10}" x2="${canvasWidth - 12}" y2="${stepsY + 10}" stroke="#d8c9b6"/>
    <text x="12" y="${stepsY + 23}" font-size="5" font-weight="bold" fill="#2b2118">組み立て工程</text>
    ${stepsSvg || `<text x="24" y="${stepsY + 38}" font-size="4" fill="#74675a">工程はまだ登録されていません</text>`}
  </svg>`;
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
    return pointsToClosedPath(guidePoints(settings, inset));
  }
  return shapePath(settings, inset);
}

function guidePoints(settings, inset = 0) {
  if (settings.type === 'tShape') return offsetClosedPolyline(tShapePoints(settings), inset);
  if (settings.type === 'gusset') return offsetClosedPolyline(gussetPoints(settings), inset);
  return approximatePathPoints(settings, inset);
}

function pointsToClosedPath(points) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`), 'Z'].join(' ');
}

function polygonArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function lineIntersection(a1, a2, b1, b2) {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = dax * dby - day * dbx;
  if (Math.abs(denominator) < 0.000001) return null;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denominator;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function offsetClosedPolyline(points, distance) {
  if (!distance || points.length < 3) return points.map((point) => ({ ...point }));
  const clockwise = polygonArea(points) > 0;
  const offsetEdges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = clockwise ? -dy / length : dy / length;
    const ny = clockwise ? dx / length : -dx / length;
    return {
      a: { x: point.x + nx * distance, y: point.y + ny * distance },
      b: { x: next.x + nx * distance, y: next.y + ny * distance },
    };
  });

  return points.map((point, index) => {
    const previous = offsetEdges[(index - 1 + offsetEdges.length) % offsetEdges.length];
    const current = offsetEdges[index];
    return lineIntersection(previous.a, previous.b, current.a, current.b) ?? current.a;
  });
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

function tShapePoints(settings) {
  const wingWidth = Math.max(settings.wingWidth, 1);
  const wingHeight = Math.max(settings.wingHeight, 1);
  const bodyWidth = Math.max(settings.bodyWidth, 1);
  const bodyHeight = Math.max(settings.bodyHeight, 1);
  const bodyX = (wingWidth - bodyWidth) / 2;
  return [
    { x: 0, y: 0 },
    { x: wingWidth, y: 0 },
    { x: wingWidth, y: wingHeight },
    { x: bodyX + bodyWidth, y: wingHeight },
    { x: bodyX + bodyWidth, y: wingHeight + bodyHeight },
    { x: bodyX, y: wingHeight + bodyHeight },
    { x: bodyX, y: wingHeight },
    { x: 0, y: wingHeight },
  ];
}

function tShapePath(settings, inset) {
  const points = inset ? offsetClosedPolyline(tShapePoints(settings), inset) : tShapePoints(settings);
  return pointsToClosedPath(points);
}

function gussetGeometry(settings) {
  const top = Math.max(settings.topWidth, 1);
  const bottom = Math.max(settings.bottomWidth, 1);
  const width = Math.max(top, bottom);
  const height = Math.max(settings.height, 1);
  const topX = (width - top) / 2;
  const bottomX = (width - bottom) / 2;
  return { x: 0, y: 0, topX, bottomX, top, bottom, width, height };
}

function gussetPoints(settings) {
  const g = gussetGeometry(settings);
  if (settings.gussetType === 'fan') {
    const curveLift = Math.min(g.height * 0.45, Math.max(Math.abs(g.bottom - g.top) * 0.22, 6));
    const points = [{ x: g.bottomX, y: g.height }, { x: g.topX, y: curveLift }];
    for (let i = 1; i <= 32; i += 1) {
      const t = i / 32;
      const px = (1 - t) * (1 - t) * g.topX + 2 * (1 - t) * t * (g.bottomX + g.bottom / 2) + t * t * (g.topX + g.top);
      const py = (1 - t) * (1 - t) * curveLift + 2 * (1 - t) * t * -curveLift + t * t * curveLift;
      points.push({ x: px, y: py });
    }
    points.push({ x: g.bottomX + g.bottom, y: g.height });
    return points;
  }
  return [
    { x: g.topX, y: 0 },
    { x: g.topX + g.top, y: 0 },
    { x: g.bottomX + g.bottom, y: g.height },
    { x: g.bottomX, y: g.height },
  ];
}

function gussetPath(settings, inset) {
  const points = inset ? offsetClosedPolyline(gussetPoints(settings), inset) : gussetPoints(settings);
  return pointsToClosedPath(points);
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
  if (settings.type === 'tShape' || settings.type === 'gusset') return guidePoints(settings, inset);
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
  const startX = SHEET.margin;
  const startY = SHEET.margin + SHEET.headerHeight;
  const rightLimit = page.width - SHEET.margin;
  const bottomLimit = page.height - SHEET.margin;
  const printableHeight = bottomLimit - startY;
  let pageIndex = 0;
  let x = startX;
  let y = startY;
  let rowHeight = 0;

  const newPage = () => {
    pageIndex += 1;
    x = startX;
    y = startY;
    rowHeight = 0;
  };

  const placements = parts.map((part) => {
    const size = dimensions(part.settings);
    const tooWide = size.width > printableWidth;
    const tooTall = size.height > printableHeight;

    if (!tooWide && x + size.width > rightLimit && x > startX) {
      x = startX;
      y += rowHeight + SHEET.gap;
      rowHeight = 0;
    }

    if (!tooTall && y + size.height > bottomLimit && y > startY) {
      newPage();
    }

    const placement = {
      ...part,
      pageIndex,
      x,
      y,
      width: size.width,
      height: size.height,
      overflow: tooWide || tooTall,
    };

    x += size.width + SHEET.gap;
    rowHeight = Math.max(rowHeight, size.height);
    return placement;
  });

  return {
    placements,
    pageCount: Math.max(1, placements.reduce((max, part) => Math.max(max, part.pageIndex + 1), 0)),
  };
}

function pageOffset(page, pageIndex) {
  return pageIndex * (page.height + SHEET.pageGap);
}

function pageChromeSvg(page, pageIndex, pageCount) {
  const yOffset = pageOffset(page, pageIndex);
  const orientationName = page.width > page.height ? '横' : '縦';
  return `<g transform="translate(0 ${yOffset})">
  <rect x="0" y="0" width="${page.width}" height="${page.height}" fill="#fffdf8"/>
  <rect x="${SHEET.margin}" y="${SHEET.margin}" width="${page.width - SHEET.margin * 2}" height="${page.height - SHEET.margin * 2}" fill="none" stroke="#8a4f2a" stroke-width="0.35" stroke-dasharray="2 2"/>
  ${sheetGuideSvg(page)}
  <text x="8" y="6" font-size="4" fill="#74675a">A4${orientationName} / ${page.width}mm x ${page.height}mm / ${pageIndex + 1} of ${pageCount}</text>
</g>`;
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
  const layout = layoutSheetParts(sheetParts);
  const { placements, pageCount } = layout;
  const overflow = placements.some((part) => part.overflow);
  const docHeight = page.height * pageCount + SHEET.pageGap * (pageCount - 1);
  const pagesSvg = Array.from({ length: pageCount }, (_, pageIndex) => pageChromeSvg(page, pageIndex, pageCount)).join('\n  ');
  const framesSvg = placements.map((part, index) => {
    const yOffset = pageOffset(page, part.pageIndex);
    return `<g transform="translate(0 ${yOffset})">${placementFrameSvg(part, index)}</g>`;
  }).join('\n  ');
  const partsSvg = placements.map((part, index) => {
    const yOffset = pageOffset(page, part.pageIndex);
    return renderPart(part.settings, part.x, part.y + yOffset, `${index + 1}. ${part.name}`);
  }).join('\n  ');
  const emptySvg = `<text x="${page.width / 2}" y="${page.height / 2}" text-anchor="middle" font-size="5" fill="#74675a">A4に追加したパーツがここに表示されます</text>`;
  const warningsSvg = Array.from(new Set(placements.filter((part) => part.overflow).map((part) => part.pageIndex))).map((pageIndex) => {
    const yOffset = pageOffset(page, pageIndex);
    return `<text x="8" y="${yOffset + page.height - 5}" font-size="4" fill="#b7352d">A4範囲外のパーツがあります</text>`;
  }).join('\n  ');

  return {
    svg: `<svg xmlns="${NS}" width="${page.width}mm" height="${docHeight}mm" viewBox="0 0 ${page.width} ${docHeight}">
  ${pagesSvg}
  ${framesSvg}
  ${partsSvg || emptySvg}
  ${warningsSvg}
</svg>`,
    placements,
    overflow,
    page,
    pageCount,
    docHeight,
  };
}

function renderPartList(placements) {
  partList.innerHTML = '';
  placements.forEach((part, index) => {
    const item = document.createElement('li');
    item.innerHTML = `<div class="part-row">
      <div><strong>${index + 1}. ${escapeXml(part.name)}</strong><div class="part-meta">${Math.round(part.width)}mm × ${Math.round(part.height)}mm / ${part.assembly.thickness.toFixed(1)}mm厚<br>${part.pageIndex + 1}ページ目 / 配置: X ${part.x.toFixed(1)}mm / Y ${part.y.toFixed(1)}mm</div></div>
    </div>
    <div class="part-controls">
      <label>名前<input type="text" value="${escapeXml(part.name)}" data-part="${part.id}" data-field="name" /></label>
      <label>革厚(mm)<input type="number" min="0.1" max="20" step="0.1" value="${part.assembly.thickness}" data-part="${part.id}" data-field="thickness" /></label>
      <label>圧縮率<input type="number" min="0.1" max="1" step="0.05" value="${part.assembly.compressionRate}" data-part="${part.id}" data-field="compressionRate" /></label>
      <label>折り<select data-part="${part.id}" data-field="foldEnabled"><option value="false"${part.assembly.fold.enabled ? '' : ' selected'}>なし</option><option value="true"${part.assembly.fold.enabled ? ' selected' : ''}>あり</option></select></label>
      <label>角度(°)<input type="number" min="0" max="360" step="1" value="${part.assembly.fold.angle}" data-part="${part.id}" data-field="foldAngle" /></label>
      <label>内R(mm)<input type="number" min="0" max="100" step="0.1" value="${part.assembly.fold.insideRadius}" data-part="${part.id}" data-field="foldRadius" /></label>
    </div>
    <div class="part-meta">${part.assembly.fold.enabled ? `折り必要長: ${foldAllowance(part).toFixed(1)}mm（推奨 ${ (foldAllowance(part) * 1.1).toFixed(1)}mm）` : '折り線なし'} / 縫製辺: ${sewEdgeLabel(part.assembly.sewEdge)}</div>
    <div class="part-buttons">
      <button class="mini-button" type="button" data-move-up="${part.id}"${index === 0 ? ' disabled' : ''}>上へ</button>
      <button class="mini-button" type="button" data-move-down="${part.id}"${index === placements.length - 1 ? ' disabled' : ''}>下へ</button>
      <button class="mini-button" type="button" data-remove="${part.id}">削除</button>
    </div>${part.overflow ? '<div class="part-warning">A4範囲外です。サイズか個数を調整してください。</div>' : ''}`;
    partList.appendChild(item);
  });
}

function sewEdgeLabel(edge) {
  return ({ none: 'なし', top: '上辺', right: '右辺', bottom: '下辺', left: '左辺', all: '外周' })[edge] || 'なし';
}

function renderStepOptions() {
  const selected = stepPart.value;
  stepPart.innerHTML = sheetParts.length
    ? sheetParts.map((part) => `<option value="${part.id}">${escapeXml(part.name)}</option>`).join('')
    : '<option value="">パーツなし</option>';
  if (sheetParts.some((part) => part.id === selected)) stepPart.value = selected;
  addStepButton.disabled = !sheetParts.length;
}

function actionLabel(action) {
  return ({ glue: '接着', fold: '折る', sew: '縫製', overlap: '重ねる', insert: '差し込む' })[action] || action;
}

function renderAssemblySteps() {
  assemblyStepList.innerHTML = '';
  assemblySteps.forEach((step, index) => {
    const part = sheetParts.find((item) => item.id === step.partId);
    const item = document.createElement('li');
    item.innerHTML = `<div class="step-row"><span><strong>${index + 1}. ${actionLabel(step.action)}</strong> — ${escapeXml(part?.name || '削除済みパーツ')}${step.note ? `<br><span class="part-meta">${escapeXml(step.note)}</span>` : ''}</span><button class="mini-button" type="button" data-remove-step="${step.id}">削除</button></div>`;
    assemblyStepList.appendChild(item);
  });
}

function updatePartAssembly(id, field, inputValue) {
  const part = sheetParts.find((item) => item.id === id);
  if (!part) return;
  if (field === 'name') part.name = String(inputValue).trim() || partName(part.settings);
  if (field === 'thickness') part.assembly.thickness = clamp(Number(inputValue) || 0.1, 0.1, 20);
  if (field === 'compressionRate') part.assembly.compressionRate = clamp(Number(inputValue) || 0.1, 0.1, 1);
  if (field === 'foldEnabled') part.assembly.fold.enabled = inputValue === 'true';
  if (field === 'foldAngle') part.assembly.fold.angle = clamp(Number(inputValue) || 0, 0, 360);
  if (field === 'foldRadius') part.assembly.fold.insideRadius = clamp(Number(inputValue) || 0, 0, 100);
  markDraftDirty();
  render();
}

function movePart(id, offset) {
  const index = sheetParts.findIndex((part) => part.id === id);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= sheetParts.length) return;
  [sheetParts[index], sheetParts[nextIndex]] = [sheetParts[nextIndex], sheetParts[index]];
  markDraftDirty();
  render();
}

function addAssemblyStep() {
  if (!stepPart.value) return;
  assemblySteps.push({ id: createId(), partId: stepPart.value, action: stepAction.value, note: stepNote.value.trim() });
  stepNote.value = '';
  markDraftDirty();
  render();
}

function markDraftDirty() {
  draftMessage = '未保存の変更あり';
}

function setPreviewMode(mode, markDirty = true) {
  if (markDirty && mode !== previewMode) markDraftDirty();
  previewMode = mode;
  singleModeButton.classList.toggle('active', mode === 'single');
  sheetModeButton.classList.toggle('active', mode === 'sheet');
  assemblyModeButton.classList.toggle('active', mode === 'assembly');
  render();
}

function addCurrentPart() {
  markDraftDirty();
  const quantity = addQuantity();
  const settings = clone(readSettings());
  const assembly = readAssemblySettings();
  const size = dimensions(settings);
  const customName = document.getElementById('partName').value.trim();
  const name = customName || partName(settings);
  for (let index = 0; index < quantity; index += 1) {
    sheetParts.push({
      id: createId(),
      name: quantity > 1 ? `${name} 複製${index + 1}/${quantity}` : name,
      settings: clone(settings),
      assembly: clone(assembly),
      width: size.width,
      height: size.height,
    });
  }
  setPreviewMode('sheet');
}

function removePart(id) {
  markDraftDirty();
  sheetParts = sheetParts.filter((part) => part.id !== id);
  assemblySteps = assemblySteps.filter((step) => step.partId !== id);
  render();
}

function clearSheet() {
  markDraftDirty();
  sheetParts = [];
  assemblySteps = [];
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
  const assembly = buildAssemblySvg();
  const totals = thicknessTotals();
  currentSvg = buildSingleSvg(settings);
  sheetSvg = sheet.svg;
  assemblySvg = assembly;

  preview.innerHTML = previewMode === 'sheet' ? sheetSvg : previewMode === 'assembly' ? assemblySvg : currentSvg;
  shapeSummary.textContent = `${Math.round(size.width)}mm × ${Math.round(size.height)}mm`;
  holeSummary.textContent = `${holes.length}個`;
  const saveLabel = previewMode === 'sheet' ? 'A4ページSVG' : previewMode === 'assembly' ? '組み立て図SVG' : '単体SVG';
  sheetSummary.textContent = `${sheetParts.length}個 / ${sheet.pageCount}ページ${sheet.overflow ? ' / 範囲外あり' : ''}`;
  saveSummary.textContent = saveLabel;
  previewTitle.textContent = saveLabel;
  previewDetail.textContent = previewMode === 'sheet'
    ? `${sheet.page.width}mm × ${sheet.page.height}mm / ${sheet.pageCount}ページ / ${sheetParts.length}パーツ / 表示中のページSVGが保存されます`
    : previewMode === 'assembly'
      ? `${sheetParts.length}層 / 2D分解図と選択断面が保存されます`
      : `${Math.round(size.width)}mm × ${Math.round(size.height)}mm / 表示中の単体パーツが保存されます`;
  downloadSvg.textContent = `${saveLabel}を保存`;
  rawThicknessSummary.textContent = `${totals.raw.toFixed(1)}mm`;
  compressedThicknessSummary.textContent = `${totals.compressed.toFixed(1)}mm`;
  designThicknessSummary.textContent = `${totals.design.toFixed(1)}mm`;
  renderPartList(sheet.placements);
  renderStepOptions();
  renderAssemblySteps();
  updateDraftSummary();
}

function saveSvg() {
  const svg = previewMode === 'sheet' ? sheetSvg : previewMode === 'assembly' ? assemblySvg : currentSvg;
  const suffix = previewMode === 'sheet' ? 'a4-sheet' : previewMode === 'assembly' ? 'assembly' : 'single-part';
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

controls.forEach((control) => control.addEventListener('input', () => {
  markDraftDirty();
  render();
}));
downloadSvg.addEventListener('click', saveSvg);
addPartButton.addEventListener('click', addCurrentPart);
clearSheetButton.addEventListener('click', clearSheet);
saveDraftButton.addEventListener('click', () => saveDraft('保存しました'));
loadDraftButton.addEventListener('click', () => restoreDraft(true));
exportDraftButton.addEventListener('click', exportDraft);
importDraftButton.addEventListener('click', () => importDraftFile.click());
importDraftFile.addEventListener('change', () => {
  const [file] = importDraftFile.files;
  if (file) importDraft(file);
});
clearDraftButton.addEventListener('click', clearDraftStorage);
singleModeButton.addEventListener('click', () => setPreviewMode('single'));
sheetModeButton.addEventListener('click', () => setPreviewMode('sheet'));
assemblyModeButton.addEventListener('click', () => setPreviewMode('assembly'));
addStepButton.addEventListener('click', addAssemblyStep);
partList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (button) removePart(button.dataset.remove);
  const moveUp = event.target.closest('[data-move-up]');
  if (moveUp) movePart(moveUp.dataset.moveUp, -1);
  const moveDown = event.target.closest('[data-move-down]');
  if (moveDown) movePart(moveDown.dataset.moveDown, 1);
});
partList.addEventListener('change', (event) => {
  const input = event.target.closest('[data-part][data-field]');
  if (input) updatePartAssembly(input.dataset.part, input.dataset.field, input.value);
});
assemblyStepList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-step]');
  if (!button) return;
  assemblySteps = assemblySteps.filter((step) => step.id !== button.dataset.removeStep);
  markDraftDirty();
  render();
});
if (!restoreDraft(false)) render();
