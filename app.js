const storageKey = "wxyy-4-luogujing-grid";
const instruments = [
  { name: "大锣", token: "仓", freq: 180 },
  { name: "鼓", token: "冬", freq: 120 },
  { name: "钹", token: "才", freq: 360 },
  { name: "小锣", token: "台", freq: 520 }
];
const steps = 16;

const templates = [
  {
    id: "entrance",
    name: "出场",
    scene: "角色登场，慢速庄重",
    bpm: 72,
    pattern: [
      "仓---仓---仓---仓---",
      "冬-冬-冬-冬-冬-冬-冬-冬-",
      "------才-------才-",
      "--台---台---台---台-"
    ]
  },
  {
    id: "reveal",
    name: "亮相",
    scene: "角色亮相，节奏顿挫",
    bpm: 88,
    pattern: [
      "仓-------仓---仓---",
      "冬冬--冬---冬冬--冬---",
      "---------才-----才",
      "----台----------台"
    ]
  },
  {
    id: "transition",
    name: "转场",
    scene: "场景转换，紧凑流畅",
    bpm: 120,
    pattern: [
      "--仓---仓---仓---仓-",
      "冬-冬-冬-冬-冬-冬-冬冬冬冬",
      "才---才---才---才--才",
      "-台-台-台-台-台-台-台--"
    ]
  },
  {
    id: "finale",
    name: "收尾",
    scene: "段落收束，渐缓收势",
    bpm: 64,
    pattern: [
      "仓-------仓---仓---",
      "冬---冬---------冬-",
      "--------------才-",
      "--台------台---台--"
    ]
  }
];

function expandTemplateRow(short) {
  const row = [];
  for (const ch of short) {
    if (ch === "-") row.push("");
    else row.push(ch);
  }
  return row;
}

function getTemplatePattern(template) {
  return template.pattern.map(expandTemplateRow);
}

const defaultState = {
  pieceName: "出场锣鼓-慢起",
  bpm: 96,
  loop: "",
  notes: [],
  pattern: instruments.map((instrument) => Array.from({ length: steps }, (_, index) => index % 4 === 0 ? instrument.token : "")),
  enabledInstruments: [true, true, true, true],
  saved: []
};

const storedState = JSON.parse(localStorage.getItem(storageKey) || "null");
const state = storedState ? { ...defaultState, ...storedState, enabledInstruments: storedState.enabledInstruments || defaultState.enabledInstruments } : defaultState;

let timer = null;
let playhead = 0;
let audioContext = null;

const grid = document.querySelector("#grid");
const savedList = document.querySelector("#savedList");
const structure = document.querySelector("#structure");
const notesList = document.querySelector("#notesList");
const pieceName = document.querySelector("#pieceName");
const bpmInput = document.querySelector("#bpmInput");
const loopSelect = document.querySelector("#loopSelect");
const noteInput = document.querySelector("#noteInput");
const templateList = document.querySelector("#templateList");
const voicePanel = document.querySelector("#voicePanel");

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function syncFields() {
  pieceName.value = state.pieceName;
  bpmInput.value = state.bpm;
  loopSelect.value = state.loop;
}

function beatLabel(index) {
  const measure = Math.floor(index / 4) + 1;
  const beat = (index % 4) + 1;
  return `${measure}-${beat}`;
}

function renderGrid() {
  const header = ['<div class="label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    header.push(`<div class="beat-cell">${beatLabel(i)}</div>`);
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const muted = !state.enabledInstruments[rowIndex];
    const row = [`<div class="label-cell ${muted ? "muted" : ""}">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const value = state.pattern[rowIndex][step];
      row.push(`<button class="cell ${value ? "filled" : ""} ${muted ? "muted" : ""}" type="button" data-row="${rowIndex}" data-step="${step}">${value}</button>`);
    }
    return row;
  });

  grid.innerHTML = [...header, ...rows].join("");
}

function renderVoicePanel() {
  const allEnabled = state.enabledInstruments.every(Boolean);
  const voiceToggles = instruments.map((instrument, index) => {
    const enabled = state.enabledInstruments[index];
    return `
      <label class="voice-toggle ${enabled ? "on" : "off"}">
        <input type="checkbox" data-voice="${index}" ${enabled ? "checked" : ""}>
        <span class="voice-indicator"></span>
        <span class="voice-name">${instrument.name}</span>
        <span class="voice-token">${instrument.token}</span>
      </label>
    `;
  }).join("");
  voicePanel.innerHTML = `
    <div class="voice-header">
      <h2>分声部练习</h2>
      <button type="button" class="voice-all-btn" data-voice-all="${allEnabled ? "off" : "on"}">
        ${allEnabled ? "全部静音" : "全部启用"}
      </button>
    </div>
    <div class="voice-list">${voiceToggles}</div>
  `;
}

function renderSidebars() {
  const filledByMeasure = [0, 1, 2, 3].map((measure) => {
    const start = measure * 4;
    const count = state.pattern.flatMap((row) => row.slice(start, start + 4)).filter(Boolean).length;
    return { measure: measure + 1, count };
  });
  structure.innerHTML = filledByMeasure.map((item) => `
    <div class="structure-row"><span>第${item.measure}小节</span><strong>${item.count}个口令</strong></div>
  `).join("");

  notesList.innerHTML = state.notes.length ? state.notes.map((note) => `
    <article class="note"><p>${note}</p></article>
  `).join("") : "<p>暂无批注。</p>";

  savedList.innerHTML = state.saved.length ? state.saved.map((item) => `
    <button class="saved-item" type="button" data-load="${item.id}">
      <strong>${item.name}</strong><br><span>${item.bpm}BPM · ${item.notes.length}条批注</span>
    </button>
  `).join("") : "<p>还没有保存方案。</p>";
}

function renderTemplates() {
  templateList.innerHTML = templates.map((tpl) => {
    const expandedPattern = getTemplatePattern(tpl);
    const tokenCount = expandedPattern.flat().filter(Boolean).length;
    const previewRows = instruments.map((inst, rowIdx) => {
      const cells = expandedPattern[rowIdx].map((val, stepIdx) =>
        `<span class="tpl-cell ${val ? "filled" : ""}">${val || ""}</span>`
      ).join("");
      return `<div class="tpl-row"><span class="tpl-label">${inst.name}</span>${cells}</div>`;
    }).join("");
    return `
      <div class="tpl-card" data-template="${tpl.id}">
        <div class="tpl-header">
          <strong class="tpl-name">${tpl.name}</strong>
          <span class="tpl-bpm">${tpl.bpm} BPM</span>
        </div>
        <p class="tpl-scene">${tpl.scene}</p>
        <div class="tpl-preview">${previewRows}</div>
        <div class="tpl-footer">${tokenCount}个口令 · 点击载入排练</div>
      </div>
    `;
  }).join("");
}

function render() {
  syncFields();
  renderGrid();
  renderVoicePanel();
  renderSidebars();
  renderTemplates();
}

function playSound(instrument) {
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.frequency.value = instrument.freq;
  osc.type = instrument.name === "鼓" ? "sine" : "square";
  gain.gain.setValueAtTime(0.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.08);
  osc.connect(gain).connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + 0.09);
}

function highlight(step) {
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  document.querySelectorAll(`[data-step="${step}"]`).forEach((cell) => cell.classList.add("playing"));
}

function currentRange() {
  if (state.loop === "") return [0, steps - 1];
  const start = Number(state.loop) * 4;
  return [start, start + 3];
}

function tick() {
  const [start, end] = currentRange();
  if (playhead < start || playhead > end) playhead = start;
  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (state.enabledInstruments[rowIndex] && state.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });
  playhead = playhead >= end ? start : playhead + 1;
}

grid.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const step = Number(cell.dataset.step);
  state.pattern[row][step] = state.pattern[row][step] ? "" : instruments[row].token;
  save();
  render();
});

pieceName.addEventListener("input", () => {
  state.pieceName = pieceName.value;
  save();
});

bpmInput.addEventListener("input", () => {
  state.bpm = Number(bpmInput.value || 96);
  save();
  if (timer) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / state.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  state.loop = loopSelect.value;
  playhead = currentRange()[0];
  save();
});

noteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !noteInput.value.trim()) return;
  state.notes.unshift(noteInput.value.trim());
  noteInput.value = "";
  save();
  renderSidebars();
});

document.querySelector("#playBtn").addEventListener("click", () => {
  if (timer) clearInterval(timer);
  playhead = currentRange()[0];
  tick();
  timer = setInterval(tick, 60000 / state.bpm);
});

document.querySelector("#stopBtn").addEventListener("click", () => {
  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
});

document.querySelector("#saveBtn").addEventListener("click", () => {
  state.saved.unshift({
    id: crypto.randomUUID(),
    name: state.pieceName || "未命名片段",
    bpm: state.bpm,
    loop: state.loop,
    notes: [...state.notes],
    pattern: state.pattern.map((row) => [...row]),
    enabledInstruments: [...state.enabledInstruments],
    createdAt: new Date().toISOString()
  });
  save();
  renderSidebars();
});

savedList.addEventListener("click", (event) => {
  const id = event.target.closest("[data-load]")?.dataset.load;
  const item = state.saved.find((entry) => entry.id === id);
  if (!item) return;
  state.pieceName = item.name;
  state.bpm = item.bpm;
  state.loop = item.loop;
  state.notes = [...item.notes];
  state.pattern = item.pattern.map((row) => [...row]);
  state.enabledInstruments = item.enabledInstruments ? [...item.enabledInstruments] : [true, true, true, true];
  save();
  render();
});

templateList.addEventListener("click", (event) => {
  const tplId = event.target.closest("[data-template]")?.dataset.template;
  const tpl = templates.find((t) => t.id === tplId);
  if (!tpl) return;
  state.pieceName = tpl.name;
  state.bpm = tpl.bpm;
  state.loop = "";
  state.pattern = getTemplatePattern(tpl);
  state.enabledInstruments = [true, true, true, true];
  save();
  render();
});

voicePanel.addEventListener("change", (event) => {
  const voiceIndex = event.target.closest("[data-voice]")?.dataset.voice;
  if (voiceIndex === undefined) return;
  state.enabledInstruments[Number(voiceIndex)] = event.target.checked;
  save();
  render();
});

voicePanel.addEventListener("click", (event) => {
  const allBtn = event.target.closest("[data-voice-all]");
  if (!allBtn) return;
  const action = allBtn.dataset.voiceAll;
  state.enabledInstruments = state.enabledInstruments.map(() => action === "on");
  save();
  render();
});

render();
