const storageKey = "wxyy-4-luogujing-grid";
const instruments = [
  { name: "大锣", token: "仓", freq: 180 },
  { name: "鼓", token: "冬", freq: 120 },
  { name: "钹", token: "才", freq: 360 },
  { name: "小锣", token: "台", freq: 520 }
];
const steps = 16;

function createEmptySection(name = "新段落", bpm = 96) {
  return {
    id: crypto.randomUUID(),
    name: name,
    bpm: bpm,
    loop: "",
    notes: [],
    pattern: instruments.map((instrument) => Array.from({ length: steps }, () => "")),
    enabledInstruments: [true, true, true, true]
  };
}

function createDefaultSection() {
  const section = createEmptySection("出场锣鼓-慢起", 96);
  section.pattern = instruments.map((instrument) =>
    Array.from({ length: steps }, (_, index) => index % 4 === 0 ? instrument.token : "")
  );
  return section;
}

const defaultState = {
  schemaVersion: 2,
  sections: [createDefaultSection()],
  currentSectionId: null,
  continuousPlay: false,
  continuousPlayIndex: 0,
  saved: [],
  playCount: 0,
  lastPlayedAt: null,
  recentPlayedSection: ""
};

function migrateOldData(oldData) {
  if (oldData.schemaVersion === 2 && Array.isArray(oldData.sections)) {
    return oldData;
  }

  const migratedSection = {
    id: crypto.randomUUID(),
    name: oldData.pieceName || "未命名段落",
    bpm: oldData.bpm || 96,
    loop: oldData.loop || "",
    notes: oldData.notes || [],
    pattern: oldData.pattern || instruments.map(() => Array(steps).fill("")),
    enabledInstruments: oldData.enabledInstruments || [true, true, true, true]
  };

  const migratedSaved = (oldData.saved || []).map((savedItem) => ({
    id: savedItem.id || crypto.randomUUID(),
    name: savedItem.name || "已存方案",
    schemaVersion: 2,
    sections: [{
      id: crypto.randomUUID(),
      name: savedItem.name || "段落 1",
      bpm: savedItem.bpm || 96,
      loop: savedItem.loop || "",
      notes: savedItem.notes || [],
      pattern: savedItem.pattern || instruments.map(() => Array(steps).fill("")),
      enabledInstruments: savedItem.enabledInstruments || [true, true, true, true]
    }],
    currentSectionId: null,
    continuousPlay: false,
    createdAt: savedItem.createdAt || new Date().toISOString()
  }));

  return {
    schemaVersion: 2,
    sections: [migratedSection],
    currentSectionId: migratedSection.id,
    continuousPlay: false,
    continuousPlayIndex: 0,
    saved: migratedSaved,
    playCount: oldData.playCount || 0,
    lastPlayedAt: oldData.lastPlayedAt || null,
    recentPlayedSection: oldData.recentPlayedSection || ""
  };
}

const storedState = JSON.parse(localStorage.getItem(storageKey) || "null");
let state;

if (storedState) {
  const migrated = migrateOldData(storedState);
  state = { ...defaultState, ...migrated };
  if (!state.currentSectionId && state.sections.length > 0) {
    state.currentSectionId = state.sections[0].id;
  }
} else {
  state = { ...defaultState };
  state.currentSectionId = state.sections[0].id;
}

function getCurrentSection() {
  return state.sections.find((s) => s.id === state.currentSectionId) || state.sections[0];
}

function getCurrentSectionIndex() {
  return state.sections.findIndex((s) => s.id === state.currentSectionId);
}

let timer = null;
let playhead = 0;
let audioContext = null;
let editingSectionId = null;

const grid = document.querySelector("#grid");
const savedList = document.querySelector("#savedList");
const structure = document.querySelector("#structure");
const notesList = document.querySelector("#notesList");
const pieceName = document.querySelector("#pieceName");
const bpmInput = document.querySelector("#bpmInput");
const loopSelect = document.querySelector("#loopSelect");
const noteInput = document.querySelector("#noteInput");
const voicePanel = document.querySelector("#voicePanel");
const dashboardTime = document.querySelector("#dashboardTime");
const completionBar = document.querySelector("#completionBar");
const completionPercent = document.querySelector("#completionPercent");
const completionDetail = document.querySelector("#completionDetail");
const difficultyCount = document.querySelector("#difficultyCount");
const savedCount = document.querySelector("#savedCount");
const playCount = document.querySelector("#playCount");
const focusList = document.querySelector("#focusList");
const suggestList = document.querySelector("#suggestList");
const lastPlay = document.querySelector("#lastPlay");
const commandInput = document.querySelector("#commandInput");
const parseBtn = document.querySelector("#parseBtn");
const confirmBtn = document.querySelector("#confirmBtn");
const cancelBtn = document.querySelector("#cancelBtn");
const importError = document.querySelector("#importError");
const importPreview = document.querySelector("#importPreview");
const previewGrid = document.querySelector("#previewGrid");
const importSummary = document.querySelector("#importSummary");
const sectionList = document.querySelector("#sectionList");
const addSectionBtn = document.querySelector("#addSectionBtn");
const duplicateSectionBtn = document.querySelector("#duplicateSectionBtn");
const deleteSectionBtn = document.querySelector("#deleteSectionBtn");
const prevSectionBtn = document.querySelector("#prevSectionBtn");
const nextSectionBtn = document.querySelector("#nextSectionBtn");
const sectionIndicator = document.querySelector("#sectionIndicator");
const currentSectionName = document.querySelector("#currentSectionName");
const currentSectionBPM = document.querySelector("#currentSectionBPM");
const continuousPlayBtn = document.querySelector("#continuousPlayBtn");

let parsedPattern = null;
let draggedSectionId = null;

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function syncFields() {
  const section = getCurrentSection();
  pieceName.value = section.name;
  bpmInput.value = section.bpm;
  loopSelect.value = section.loop;
}

function renderSectionList() {
  const currentIndex = getCurrentSectionIndex();
  sectionList.innerHTML = state.sections.map((section, index) => {
    const isActive = section.id === state.currentSectionId;
    const isPlaying = state.continuousPlay && index === state.continuousPlayIndex && timer;
    const filledCount = section.pattern.flat().filter(Boolean).length;
    const loopText = section.loop !== "" ? `第${Number(section.loop) + 1}小节循环` : "全段";
    
    return `
      <div class="section-item ${isActive ? "active" : ""} ${isPlaying ? "section-playing" : ""}" 
           data-section-id="${section.id}" 
           draggable="true">
        <span class="section-drag-handle" data-drag-handle>⋮⋮</span>
        <div class="section-order">${index + 1}</div>
        <div class="section-info">
          ${editingSectionId === section.id ? `
            <input type="text" class="section-name-input" value="${section.name}" 
                   data-section-name-input="${section.id}" autofocus>
          ` : `
            <div class="section-name">${section.name}</div>
          `}
          <div class="section-meta">
            <span>${section.bpm} BPM</span>
            <span class="dot"></span>
            <span class="section-badge loop">${loopText}</span>
            ${section.notes.length > 0 ? `<span class="dot"></span><span class="section-badge notes">${section.notes.length}条批注</span>` : ""}
            <span class="dot"></span>
            <span>${filledCount}/${instruments.length * steps} 口令</span>
          </div>
        </div>
        <div class="section-item-actions">
          <button type="button" class="section-icon-btn" data-rename-section="${section.id}" title="重命名">✎</button>
          <button type="button" class="section-icon-btn" data-duplicate-section="${section.id}" title="复制">⧉</button>
          <button type="button" class="section-icon-btn" data-delete-section="${section.id}" title="删除" ${state.sections.length <= 1 ? "disabled" : ""}>🗑</button>
        </div>
      </div>
    `;
  }).join("");

  deleteSectionBtn.disabled = state.sections.length <= 1;
}

function renderScoreHeader() {
  const section = getCurrentSection();
  const currentIndex = getCurrentSectionIndex();
  currentSectionName.textContent = section.name;
  currentSectionBPM.textContent = `${section.bpm} BPM`;
  sectionIndicator.textContent = `${currentIndex + 1} / ${state.sections.length}`;
  prevSectionBtn.disabled = currentIndex <= 0;
  nextSectionBtn.disabled = currentIndex >= state.sections.length - 1;
  
  continuousPlayBtn.classList.toggle("active", state.continuousPlay);
  if (state.continuousPlay) {
    continuousPlayBtn.innerHTML = `
      <span class="continuous-play-indicator">
        <span class="play-dot"></span>
        连续播放中
      </span>
    `;
  } else {
    continuousPlayBtn.textContent = "连续播放";
  }
}

function addSection() {
  const currentSection = getCurrentSection();
  const newSection = createEmptySection(`段落 ${state.sections.length + 1}`, currentSection.bpm);
  state.sections.push(newSection);
  state.currentSectionId = newSection.id;
  save();
  render();
}

function duplicateSection(sectionId) {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return;
  
  const newSection = {
    ...section,
    id: crypto.randomUUID(),
    name: `${section.name} (副本)`,
    notes: [...section.notes],
    pattern: section.pattern.map((row) => [...row]),
    enabledInstruments: [...section.enabledInstruments]
  };
  
  const index = state.sections.findIndex((s) => s.id === sectionId);
  state.sections.splice(index + 1, 0, newSection);
  state.currentSectionId = newSection.id;
  save();
  render();
}

function deleteSection(sectionId) {
  if (state.sections.length <= 1) return;
  
  const index = state.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return;
  
  if (!confirm(`确定要删除段落「${state.sections[index].name}」吗？此操作不可撤销。`)) {
    return;
  }
  
  state.sections.splice(index, 1);
  
  if (state.currentSectionId === sectionId) {
    state.currentSectionId = state.sections[Math.min(index, state.sections.length - 1)].id;
  }
  
  if (state.continuousPlayIndex >= state.sections.length) {
    state.continuousPlayIndex = state.sections.length - 1;
  }
  
  save();
  render();
}

function renameSection(sectionId, newName) {
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return;
  section.name = newName.trim() || "未命名段落";
  save();
  render();
}

function switchSection(sectionId) {
  if (timer) {
    clearInterval(timer);
    timer = null;
    document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  }
  state.currentSectionId = sectionId;
  playhead = 0;
  save();
  render();
}

function moveSection(dragId, dropId) {
  if (dragId === dropId) return;
  
  const dragIndex = state.sections.findIndex((s) => s.id === dragId);
  const dropIndex = state.sections.findIndex((s) => s.id === dropId);
  
  if (dragIndex === -1 || dropIndex === -1) return;
  
  const [removed] = state.sections.splice(dragIndex, 1);
  state.sections.splice(dropIndex, 0, removed);
  
  save();
  render();
}

function prevSection() {
  const index = getCurrentSectionIndex();
  if (index > 0) {
    switchSection(state.sections[index - 1].id);
  }
}

function nextSection() {
  const index = getCurrentSectionIndex();
  if (index < state.sections.length - 1) {
    switchSection(state.sections[index + 1].id);
  }
}

function toggleContinuousPlay() {
  state.continuousPlay = !state.continuousPlay;
  state.continuousPlayIndex = getCurrentSectionIndex();
  save();
  renderScoreHeader();
  renderSectionList();
  renderDashboard();
}

function beatLabel(index) {
  const measure = Math.floor(index / 4) + 1;
  const beat = (index % 4) + 1;
  return `${measure}-${beat}`;
}

function renderGrid() {
  const section = getCurrentSection();
  const header = ['<div class="label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    header.push(`<div class="beat-cell">${beatLabel(i)}</div>`);
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const muted = !section.enabledInstruments[rowIndex];
    const row = [`<div class="label-cell ${muted ? "muted" : ""}">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const value = section.pattern[rowIndex][step];
      row.push(`<button class="cell ${value ? "filled" : ""} ${muted ? "muted" : ""}" type="button" data-row="${rowIndex}" data-step="${step}">${value}</button>`);
    }
    return row;
  });

  grid.innerHTML = [...header, ...rows].join("");
}

function renderVoicePanel() {
  const section = getCurrentSection();
  const allEnabled = section.enabledInstruments.every(Boolean);
  const voiceToggles = instruments.map((instrument, index) => {
    const enabled = section.enabledInstruments[index];
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
  const section = getCurrentSection();
  const filledByMeasure = [0, 1, 2, 3].map((measure) => {
    const start = measure * 4;
    const count = section.pattern.flatMap((row) => row.slice(start, start + 4)).filter(Boolean).length;
    return { measure: measure + 1, count };
  });
  structure.innerHTML = filledByMeasure.map((item) => `
    <div class="structure-row"><span>第${item.measure}小节</span><strong>${item.count}个口令</strong></div>
  `).join("");

  notesList.innerHTML = section.notes.length ? section.notes.map((note) => `
    <article class="note"><p>${note}</p></article>
  `).join("") : "<p>暂无批注。</p>";

  savedList.innerHTML = state.saved.length ? state.saved.map((item) => {
    const sectionCount = item.sections ? item.sections.length : 1;
    const firstBpm = item.sections ? item.sections[0].bpm : item.bpm;
    const totalNotes = item.sections 
      ? item.sections.reduce((sum, s) => sum + s.notes.length, 0)
      : (item.notes ? item.notes.length : 0);
    return `
      <button class="saved-item" type="button" data-load="${item.id}">
        <strong>${item.name}</strong><br><span>${sectionCount}个段落 · ${firstBpm}BPM起 · ${totalNotes}条批注</span>
      </button>
    `;
  }).join("") : "<p>还没有保存方案。</p>";
}

function getMeasureData() {
  const section = getCurrentSection();
  return [0, 1, 2, 3].map((measure) => {
    const start = measure * 4;
    const cells = section.pattern.flatMap((row) => row.slice(start, start + 4));
    const filled = cells.filter(Boolean).length;
    const total = cells.length;
    const notesForMeasure = section.notes.filter((n) =>
      /第\s*([一二三四\d]+)\s*小节/.test(n) &&
      (parseInt(RegExp.$1) === measure + 1 ||
       ["一", "二", "三", "四"][measure] === RegExp.$1)
    );
    const instrumentCoverage = section.pattern.filter((row, idx) =>
      section.enabledInstruments[idx] && row.slice(start, start + 4).some(Boolean)
    ).length;
    return {
      measure: measure + 1,
      filled,
      total,
      ratio: total ? filled / total : 0,
      noteCount: notesForMeasure.length,
      instrumentCoverage,
      hasNotes: notesForMeasure.length > 0
    };
  });
}

function getFocusMeasures() {
  const measures = getMeasureData();
  const difficultyKeywords = /难|易错|注意|重点|慢|加速|易错点|节奏|配合/;
  return measures
    .map((m) => ({
      ...m,
      score: (m.noteCount * 3) + (1 - m.ratio) * 2 + (m.instrumentCoverage >= 3 ? 1 : 0)
    }))
    .filter((m) => m.score > 0.3 || m.hasNotes)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function getSuggestions() {
  const section = getCurrentSection();
  const suggestions = [];
  const measures = getMeasureData();
  const focus = getFocusMeasures();
  const incomplete = measures.filter((m) => m.ratio < 1);
  const totalFilled = measures.reduce((s, m) => s + m.filled, 0);
  const totalCells = measures.reduce((s, m) => s + m.total, 0);
  const totalRatio = totalCells ? totalFilled / totalCells : 0;

  if (state.sections.length === 1) {
    suggestions.push({ icon: "📋", html: `点击<strong>"+ 新增"</strong>添加更多段落，构建完整排练流程。` });
  } else if (!state.continuousPlay) {
    suggestions.push({ icon: "▶▶", html: `当前有 <strong>${state.sections.length}</strong> 个段落，可开启<strong>连续播放</strong>按顺序演练。` });
  }

  if (totalRatio < 0.3) {
    suggestions.push({ icon: "1", html: `建议先<strong>完善谱面</strong>，当前完成度不足三成。可从<strong>第1小节</strong>开始逐拍填入口令。` });
  } else if (focus.length > 0) {
    const topFocus = focus[0];
    const focusNames = focus.map((f) => `第${f.measure}小节`).join("、");
    suggestions.push({ icon: "2", html: `优先练<strong>${focusNames}</strong>，这${focus.length > 1 ? "几" : ""}处${topFocus.hasNotes ? "有批注标注且" : ""}密度/复杂度较高。` });
  }

  if (section.loop) {
    const loopNum = Number(section.loop) + 1;
    suggestions.push({ icon: "3", html: `当前循环设置为<strong>第${loopNum}小节</strong>，可使用"停止"切换范围后对比练习。` });
  } else if (section.notes.length > 0) {
    const matchedMeasures = [];
    section.notes.forEach((n) => {
      const m = n.match(/第\s*([一二三四\d]+)\s*小节/);
      if (m) {
        const num = ["一", "二", "三", "四"].indexOf(m[1]) >= 0
          ? ["一", "二", "三", "四"].indexOf(m[1]) + 1
          : parseInt(m[1]);
        if (num && !matchedMeasures.includes(num)) matchedMeasures.push(num);
      }
    });
    if (matchedMeasures.length > 0) {
      const mNames = matchedMeasures.sort().map((n) => `第${n}小节`).join("、");
      suggestions.push({ icon: "3", html: `批注中提到了<strong>${mNames}</strong>，建议循环对应小节逐句突破。` });
    }
  }

  if (incomplete.length > 0 && totalRatio >= 0.3) {
    const names = incomplete.map((m) => `第${m.measure}小节`).join("、");
    suggestions.push({ icon: suggestions.length + 1 < 4 ? String(suggestions.length + 1) : "★", html: `${names}尚有空格，可继续<strong>填充剩余口令</strong>以形成完整乐句。` });
  }

  if (section.enabledInstruments.filter(Boolean).length < instruments.length) {
    const muted = instruments.filter((_, i) => !section.enabledInstruments[i]).map((i) => i.name).join("、");
    suggestions.push({ icon: "★", html: `${muted}已静音，分声部练习完成后记得<strong>恢复全声部合奏</strong>。` });
  }

  if (state.playCount === 0 && totalRatio >= 0.3) {
    suggestions.push({ icon: "▶", html: `谱面已有一定内容，建议<strong>点击播放</strong>试听整体效果并调整细节。` });
  }

  if (state.saved.length === 0 && totalRatio >= 0.5) {
    suggestions.push({ icon: "💾", html: `建议<strong>保存当前方案</strong>作为基础版本，方便后续对比迭代。` });
  }

  return suggestions.slice(0, 4);
}

function formatTimeAgo(isoString) {
  if (!isoString) return "尚未播放";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (diff < 60000) return "刚刚播放过";
  if (mins < 60) return `${mins} 分钟前播放`;
  if (hrs < 24) return `${hrs} 小时前播放`;
  return new Date(isoString).toLocaleDateString();
}

function renderDashboard() {
  const section = getCurrentSection();
  const now = new Date();
  dashboardTime.textContent = `${now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })} ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;

  const totalCells = instruments.length * steps;
  const filledCells = section.pattern.flat().filter(Boolean).length;
  const percent = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;
  completionBar.style.width = `${percent}%`;
  completionPercent.textContent = `${percent}%`;
  completionDetail.textContent = `${filledCells}/${totalCells} 个口令`;

  const totalNotes = state.sections.reduce((sum, s) => sum + s.notes.length, 0);
  difficultyCount.textContent = totalNotes;
  savedCount.textContent = state.saved.length;
  playCount.textContent = state.playCount || 0;

  const focusMeasures = getFocusMeasures();
  if (focusMeasures.length === 0) {
    focusList.innerHTML = `<div class="focus-empty">暂未识别到明显重点<br>继续编辑或添加批注</div>`;
  } else {
    focusList.innerHTML = focusMeasures.map((m) => {
      const badges = [];
      if (m.noteCount > 0) badges.push(`${m.noteCount}条批注`);
      if (m.ratio < 0.7) badges.push(`待完善`);
      if (m.instrumentCoverage >= 3) badges.push(`多声部`);
      const badgeText = badges.length ? badges[0] : (m.ratio >= 1 ? "已填满" : "需关注");
      const highlightClass = m.noteCount > 0 || m.ratio < 0.5 ? "highlight" : "";
      return `
        <div class="focus-item ${highlightClass}">
          <span class="focus-measure">第${m.measure}小节</span>
          <span class="focus-meta">
            ${m.filled}/${m.total} 口令
            <span class="focus-badge">${badgeText}</span>
          </span>
        </div>
      `;
    }).join("");
  }

  const suggestions = getSuggestions();
  if (suggestions.length === 0) {
    suggestList.innerHTML = `<div class="suggest-empty">排练进展良好<br>继续保持当前状态</div>`;
  } else {
    suggestList.innerHTML = suggestions.map((s) => `
      <div class="suggest-item">
        <span class="suggest-icon">${s.icon}</span>
        <span class="suggest-text">${s.html}</span>
      </div>
    `).join("");
  }

  const statusDot = timer ? `<span class="play-status"><span class="play-dot active"></span>正在播放</span>` : `<span class="play-status"><span class="play-dot"></span>${formatTimeAgo(state.lastPlayedAt)}</span>`;
  const sectionText = state.recentPlayedSection ? ` · ${state.recentPlayedSection}` : "";
  const continuousText = state.continuousPlay ? ` · ${state.sections.length}个段落` : "";
  lastPlay.innerHTML = `${statusDot}<span>${state.playCount ? `共 ${state.playCount} 次${sectionText}${continuousText}` : "等待开始"}</span>`;
}

function render() {
  syncFields();
  renderSectionList();
  renderScoreHeader();
  renderGrid();
  renderVoicePanel();
  renderSidebars();
  renderDashboard();
}

const canonicalMap = {
  "仓": "仓", "匡": "仓", "哐": "仓", "铛": "仓",
  "冬": "冬", "咚": "冬", "大": "冬",
  "才": "才", "七": "才", "呛": "才", "镲": "才",
  "台": "台", "令": "台", "另": "台", "当": "台", "来": "台"
};

const tokenMap = {
  "仓": 0, "匡": 0, "哐": 0, "铛": 0,
  "冬": 1, "咚": 1, "大": 1,
  "才": 2, "七": 2, "呛": 2, "镲": 2,
  "台": 3, "令": 3, "另": 3, "当": 3, "来": 3
};

const restTokens = new Set(["0", "０", "〇", "空", "乙", "一", "×", "·", "冷"]);

const tokenNames = ["大锣", "鼓", "钹", "小锣"];

const aliasLabels = {
  0: ["仓", "匡", "哐", "铛"],
  1: ["冬", "咚", "大"],
  2: ["才", "七", "呛", "镲"],
  3: ["台", "令", "另", "当", "来"]
};

function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入锣鼓经口令。");
  }

  const measureStrs = trimmed.split(/\|\|/).map(s => s.trim()).filter(Boolean);
  if (measureStrs.length === 0) {
    throw new Error("未找到有效的小节内容，请检查分隔符是否正确。");
  }
  if (measureStrs.length > 4) {
    throw new Error(`最多支持 4 小节，当前输入了 ${measureStrs.length} 小节。`);
  }

  const pattern = instruments.map(() => Array(steps).fill(""));
  let currentStep = 0;
  const warnings = [];
  const aliasConversions = [];

  for (let measureIdx = 0; measureIdx < measureStrs.length; measureIdx++) {
    const measureStr = measureStrs[measureIdx];
    const beatStrs = measureStr.split(/[|\s]+/).map(s => s.trim()).filter(s => s !== "");

    if (beatStrs.length !== 4) {
      throw new Error(
        `第 ${measureIdx + 1} 小节拍数错误：<span class="error-location">${measureStr}</span><br>` +
        `期望 <strong>4 拍</strong>，实际有 <strong>${beatStrs.length} 拍</strong>。<br>` +
        `请使用空格或单竖线 <code>|</code> 分隔每一拍。`
      );
    }

    for (let beatIdx = 0; beatIdx < beatStrs.length; beatIdx++) {
      const beatStr = beatStrs[beatIdx];
      const stepIdx = measureIdx * 4 + beatIdx;

      if (stepIdx >= steps) {
        throw new Error(`超出最大拍数限制（${steps} 拍）。`);
      }

      if (restTokens.has(beatStr)) {
        continue;
      }

      for (let charIdx = 0; charIdx < beatStr.length; charIdx++) {
        const char = beatStr[charIdx];
        const rowIdx = tokenMap[char];

        if (rowIdx === undefined) {
          const allValid = Object.keys(aliasLabels).map((rowKey) => {
            const names = aliasLabels[rowKey].join("、");
            return `${tokenNames[rowKey]}：${names}`;
          }).join("；");
          const restList = [...restTokens].filter(t => t !== "０" && t !== "〇").join("、");
          throw new Error(
            `第 ${measureIdx + 1} 小节第 ${beatIdx + 1} 拍出现无法识别的字符：<span class="error-location">${char}</span><br>` +
            `有效口令字：<strong>${allValid}</strong><br>` +
            `休止符：<strong>${restList}</strong><br>` +
            `完整拍内容：<span class="error-location">${beatStr}</span>`
          );
        }

        const canonical = canonicalMap[char] || char;
        if (char !== canonical) {
          aliasConversions.push({ from: char, to: canonical, instrument: tokenNames[rowIdx] });
        }
        if (pattern[rowIdx][stepIdx]) {
          warnings.push(
            `第 ${measureIdx + 1} 小节第 ${beatIdx + 1} 拍的 ${tokenNames[rowIdx]}（${char}${char !== canonical ? "→" + canonical : ""}）重复定义，已保留第一个。`
          );
          continue;
        }

        pattern[rowIdx][stepIdx] = canonical;
      }
    }
  }

  return { pattern, warnings, measureCount: measureStrs.length, aliasConversions };
}

function showError(message) {
  importError.innerHTML = `
    <strong>⚠️ 解析失败：</strong>${message}
  `;
  importError.style.display = "block";
}

function hideError() {
  importError.style.display = "none";
}

function renderPreview(parsed) {
  const section = getCurrentSection();
  const { pattern, warnings, measureCount } = parsed;
  const totalFilled = pattern.flat().filter(Boolean).length;

  let summary = `解析成功：共 <strong>${measureCount} 小节</strong>，<strong>${totalFilled} 个口令</strong>`;
  let willFillCount = 0;
  let willSkipCount = 0;

  for (let r = 0; r < instruments.length; r++) {
    for (let c = 0; c < steps; c++) {
      if (pattern[r][c]) {
        if (section.pattern[r][c]) {
          willSkipCount++;
        } else {
          willFillCount++;
        }
      }
    }
  }

  summary += `，将填入 <strong style="color:#047857">${willFillCount} 个空格</strong>`;
  if (willSkipCount > 0) {
    summary += `，跳过 <strong style="color:#991b1b">${willSkipCount} 个已有内容</strong>`;
  }
  summary += "。";

  if (warnings.length > 0) {
    summary += `<br><span style="color:#b45309">⚠️ ${warnings.join(" ")}</span>`;
  }

  if (parsed.aliasConversions && parsed.aliasConversions.length > 0) {
    const uniqueAliases = [...new Set(parsed.aliasConversions.map(a => `${a.from}→${a.to}（${a.instrument}）`))];
    summary += `<br><span style="color:#1d4ed8">🔄 别名转换：${uniqueAliases.join("、")}</span>`;
  }

  importSummary.innerHTML = summary;
  importSummary.style.display = "block";

  const header = ['<div class="preview-label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    const measureDivider = (i + 1) % 4 === 0 && i < steps - 1 ? " preview-measure-divider" : "";
    header.push(`<div class="preview-beat-cell${measureDivider}">${beatLabel(i)}</div>`);
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const row = [`<div class="preview-label-cell">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const parsedValue = pattern[rowIndex][step];
      const existingValue = section.pattern[rowIndex][step];
      const measureDivider = (step + 1) % 4 === 0 && step < steps - 1 ? " preview-measure-divider" : "";

      let cellClass = "preview-cell" + measureDivider;
      let displayValue = "";

      if (parsedValue && existingValue) {
        cellClass += " will-overwrite";
        displayValue = existingValue;
      } else if (parsedValue) {
        cellClass += " will-fill filled";
        displayValue = parsedValue;
      } else if (existingValue) {
        cellClass += " filled";
        displayValue = existingValue;
      }

      row.push(`<div class="${cellClass}">${displayValue}</div>`);
    }
    return row;
  });

  previewGrid.innerHTML = `<div class="preview-grid-inner">${[...header, ...rows].join("")}</div>
    <div style="margin-top: 10px; display: flex; gap: 16px; font-size: 12px; color: var(--muted);">
      <span><span style="display:inline-block;width:14px;height:14px;background:#d1fae5;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 新填入</span>
      <span><span style="display:inline-block;width:14px;height:14px;background:#fff1d1;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 原有内容</span>
      <span><span style="display:inline-block;width:14px;height:14px;background:#fee2e2;border-radius:3px;margin-right:4px;vertical-align:middle;position:relative;"><span style="position:absolute;top:-2px;right:1px;font-size:9px;color:var(--accent);font-weight:900;">×</span></span> 跳过（已有内容）</span>
    </div>
  `;
  importPreview.style.display = "block";
}

function resetImportState() {
  parsedPattern = null;
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  importPreview.style.display = "none";
  importSummary.style.display = "none";
  hideError();
}

function applyParsedPattern() {
  if (!parsedPattern) return;

  const section = getCurrentSection();
  let filledCount = 0;
  let skippedCount = 0;

  for (let r = 0; r < instruments.length; r++) {
    for (let c = 0; c < steps; c++) {
      const parsedValue = parsedPattern.pattern[r][c];
      if (parsedValue && !section.pattern[r][c]) {
        section.pattern[r][c] = parsedValue;
        filledCount++;
      } else if (parsedValue && section.pattern[r][c]) {
        skippedCount++;
      }
    }
  }

  save();
  render();

  let message = `✓ 已成功写入 <strong>${filledCount}</strong> 个口令`;
  if (skippedCount > 0) {
    message += `，已跳过 <strong>${skippedCount}</strong> 个已有内容。`;
  } else {
    message += "。";
  }

  importSummary.innerHTML = message;
  resetImportState();
  commandInput.value = "";
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

function currentRange(section = null) {
  const targetSection = section || getCurrentSection();
  if (targetSection.loop === "") return [0, steps - 1];
  const start = Number(targetSection.loop) * 4;
  return [start, start + 3];
}

function tick() {
  if (state.continuousPlay) {
    continuousTick();
  } else {
    singleTick();
  }
}

function singleTick() {
  const section = getCurrentSection();
  const [start, end] = currentRange(section);
  if (playhead < start || playhead > end) playhead = start;
  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });
  playhead = playhead >= end ? start : playhead + 1;
}

function continuousTick() {
  const section = state.sections[state.continuousPlayIndex];
  if (!section) {
    stopPlayback();
    return;
  }

  const [start, end] = currentRange(section);
  if (playhead < start || playhead > end) playhead = start;

  if (state.currentSectionId !== section.id) {
    state.currentSectionId = section.id;
    renderGrid();
    renderVoicePanel();
    renderSidebars();
    renderScoreHeader();
    renderSectionList();
  }

  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });

  if (playhead >= end) {
    if (state.continuousPlayIndex < state.sections.length - 1) {
      state.continuousPlayIndex++;
      playhead = 0;
      if (timer) {
        clearInterval(timer);
        const nextSection = state.sections[state.continuousPlayIndex];
        timer = setInterval(tick, 60000 / nextSection.bpm);
      }
      renderSectionList();
      renderScoreHeader();
    } else {
      stopPlayback();
    }
  } else {
    playhead++;
  }
}

function stopPlayback() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  state.continuousPlayIndex = 0;
  renderDashboard();
  renderSectionList();
  renderScoreHeader();
}

grid.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const step = Number(cell.dataset.step);
  const section = getCurrentSection();
  section.pattern[row][step] = section.pattern[row][step] ? "" : instruments[row].token;
  save();
  render();
});

pieceName.addEventListener("input", () => {
  const section = getCurrentSection();
  section.name = pieceName.value;
  save();
  renderScoreHeader();
  renderSectionList();
});

bpmInput.addEventListener("input", () => {
  const section = getCurrentSection();
  section.bpm = Number(bpmInput.value || 96);
  save();
  renderScoreHeader();
  renderSectionList();
  if (timer && !state.continuousPlay) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / section.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  const section = getCurrentSection();
  section.loop = loopSelect.value;
  playhead = currentRange(section)[0];
  save();
  renderSectionList();
});

noteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !noteInput.value.trim()) return;
  const section = getCurrentSection();
  section.notes.unshift(noteInput.value.trim());
  noteInput.value = "";
  save();
  render();
});

document.querySelector("#playBtn").addEventListener("click", () => {
  if (timer) clearInterval(timer);
  
  const startSection = state.continuousPlay ? state.sections[state.continuousPlayIndex] : getCurrentSection();
  playhead = currentRange(startSection)[0];
  
  state.playCount = (state.playCount || 0) + 1;
  state.lastPlayedAt = new Date().toISOString();
  
  if (state.continuousPlay) {
    state.recentPlayedSection = `连续播放 ${state.sections.length} 个段落`;
  } else {
    const section = getCurrentSection();
    state.recentPlayedSection = section.loop === "" ? "全段播放" : `第${Number(section.loop) + 1}小节循环`;
  }
  
  save();
  tick();
  timer = setInterval(tick, 60000 / startSection.bpm);
  renderDashboard();
  renderSectionList();
});

document.querySelector("#stopBtn").addEventListener("click", stopPlayback);

continuousPlayBtn.addEventListener("click", toggleContinuousPlay);

addSectionBtn.addEventListener("click", addSection);
duplicateSectionBtn.addEventListener("click", () => {
  duplicateSection(state.currentSectionId);
});
deleteSectionBtn.addEventListener("click", () => {
  deleteSection(state.currentSectionId);
});
prevSectionBtn.addEventListener("click", prevSection);
nextSectionBtn.addEventListener("click", nextSection);

sectionList.addEventListener("click", (event) => {
  const renameId = event.target.closest("[data-rename-section]")?.dataset.renameSection;
  const duplicateId = event.target.closest("[data-duplicate-section]")?.dataset.duplicateSection;
  const deleteId = event.target.closest("[data-delete-section]")?.dataset.deleteSection;
  const sectionItem = event.target.closest("[data-section-id]");
  
  if (renameId) {
    event.stopPropagation();
    editingSectionId = renameId;
    renderSectionList();
    const input = document.querySelector(`[data-section-name-input="${renameId}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  } else if (duplicateId) {
    event.stopPropagation();
    duplicateSection(duplicateId);
  } else if (deleteId) {
    event.stopPropagation();
    deleteSection(deleteId);
  } else if (sectionItem && !event.target.closest("[data-drag-handle]")) {
    switchSection(sectionItem.dataset.sectionId);
  }
});

sectionList.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-section-name-input]");
  if (!input) return;
  
  const sectionId = input.dataset.sectionNameInput;
  if (event.key === "Enter") {
    event.preventDefault();
    renameSection(sectionId, input.value);
    editingSectionId = null;
  } else if (event.key === "Escape") {
    event.preventDefault();
    editingSectionId = null;
    renderSectionList();
  }
});

sectionList.addEventListener("blur", (event) => {
  const input = event.target.closest("[data-section-name-input]");
  if (!input) return;
  const sectionId = input.dataset.sectionNameInput;
  renameSection(sectionId, input.value);
  editingSectionId = null;
}, true);

sectionList.addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-section-id]");
  if (!item) return;
  draggedSectionId = item.dataset.sectionId;
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

sectionList.addEventListener("dragend", (event) => {
  const item = event.target.closest("[data-section-id]");
  if (item) item.classList.remove("dragging");
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  draggedSectionId = null;
});

sectionList.addEventListener("dragover", (event) => {
  event.preventDefault();
  const item = event.target.closest("[data-section-id]");
  if (!item || item.dataset.sectionId === draggedSectionId) return;
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  item.classList.add("drag-over");
});

sectionList.addEventListener("drop", (event) => {
  event.preventDefault();
  const item = event.target.closest("[data-section-id]");
  if (!item || !draggedSectionId) return;
  moveSection(draggedSectionId, item.dataset.sectionId);
});

document.querySelector("#saveBtn").addEventListener("click", () => {
  const firstSection = state.sections[0];
  state.saved.unshift({
    id: crypto.randomUUID(),
    name: firstSection.name || "未命名方案",
    schemaVersion: 2,
    sections: state.sections.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      bpm: s.bpm,
      loop: s.loop,
      notes: [...s.notes],
      pattern: s.pattern.map((row) => [...row]),
      enabledInstruments: [...s.enabledInstruments]
    })),
    currentSectionId: null,
    continuousPlay: state.continuousPlay,
    createdAt: new Date().toISOString()
  });
  save();
  render();
});

savedList.addEventListener("click", (event) => {
  const id = event.target.closest("[data-load]")?.dataset.load;
  const item = state.saved.find((entry) => entry.id === id);
  if (!item) return;
  
  if (timer) stopPlayback();
  
  if (item.schemaVersion === 2 && Array.isArray(item.sections)) {
    state.sections = item.sections.map((s) => ({ ...s, id: crypto.randomUUID() }));
    state.currentSectionId = state.sections[0].id;
    state.continuousPlay = item.continuousPlay || false;
  } else {
    const migrated = migrateOldData(item);
    state.sections = migrated.sections.map((s) => ({ ...s, id: crypto.randomUUID() }));
    state.currentSectionId = state.sections[0].id;
    state.continuousPlay = false;
  }
  
  state.continuousPlayIndex = 0;
  playhead = 0;
  save();
  render();
});

voicePanel.addEventListener("change", (event) => {
  const voiceIndex = event.target.closest("[data-voice]")?.dataset.voice;
  if (voiceIndex === undefined) return;
  const section = getCurrentSection();
  section.enabledInstruments[Number(voiceIndex)] = event.target.checked;
  save();
  render();
});

voicePanel.addEventListener("click", (event) => {
  const allBtn = event.target.closest("[data-voice-all]");
  if (!allBtn) return;
  const action = allBtn.dataset.voiceAll;
  const section = getCurrentSection();
  section.enabledInstruments = section.enabledInstruments.map(() => action === "on");
  save();
  render();
});

parseBtn.addEventListener("click", () => {
  hideError();
  importPreview.style.display = "none";
  importSummary.style.display = "none";
  try {
    parsedPattern = parseCommand(commandInput.value);
    renderPreview(parsedPattern);
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
  } catch (error) {
    showError(error.message);
    parsedPattern = null;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
  }
});

confirmBtn.addEventListener("click", () => {
  if (!parsedPattern) return;
  applyParsedPattern();
});

cancelBtn.addEventListener("click", () => {
  resetImportState();
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    parseBtn.click();
  }
});

commandInput.addEventListener("input", () => {
  if (parsedPattern) {
    resetImportState();
  }
});

const toggleRefBtn = document.querySelector("#toggleRefBtn");
const tokenRefPanel = document.querySelector("#tokenRefPanel");

toggleRefBtn.addEventListener("click", () => {
  const isOpen = tokenRefPanel.classList.toggle("open");
  toggleRefBtn.textContent = isOpen ? "收起对照表 ▴" : "查看完整对照表 ▾";
});

render();

setInterval(() => {
  if (dashboardTime) {
    const now = new Date();
    dashboardTime.textContent = `${now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })} ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (lastPlay && !timer) {
    const statusDot = `<span class="play-status"><span class="play-dot"></span>${formatTimeAgo(state.lastPlayedAt)}</span>`;
    const sectionText = state.recentPlayedSection ? ` · ${state.recentPlayedSection}` : "";
    const countSpan = document.createElement("span");
    countSpan.innerHTML = state.playCount ? `共 ${state.playCount} 次${sectionText}` : "等待开始";
    lastPlay.innerHTML = `${statusDot}<span>${countSpan.innerHTML}</span>`;
  }
}, 30000);
