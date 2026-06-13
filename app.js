const storageKey = "wxyy-4-luogujing-grid";
const instruments = [
  { name: "大锣", token: "仓", freq: 180 },
  { name: "鼓", token: "冬", freq: 120 },
  { name: "钹", token: "才", freq: 360 },
  { name: "小锣", token: "台", freq: 520 }
];
const steps = 16;

function deepCloneSection(section) {
  if (!section) return null;
  return {
    id: section.id,
    name: section.name,
    bpm: section.bpm,
    loop: section.loop,
    notes: Array.isArray(section.notes) ? [...section.notes] : [],
    pattern: Array.isArray(section.pattern)
      ? section.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
      : instruments.map(() => Array(steps).fill("")),
    enabledInstruments: Array.isArray(section.enabledInstruments)
      ? [...section.enabledInstruments]
      : [true, true, true, true]
  };
}

function deepCloneSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(deepCloneSection);
}

function deepCloneSavedItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    bpm: item.bpm,
    sectionCount: item.sectionCount || 1,
    pieceName: item.pieceName,
    sections: deepCloneSections(item.sections),
    currentSectionId: item.currentSectionId,
    createdAt: item.createdAt,
    loop: item.loop,
    notes: Array.isArray(item.notes) ? [...item.notes] : [],
    pattern: Array.isArray(item.pattern)
      ? item.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
      : null,
    enabledInstruments: Array.isArray(item.enabledInstruments)
      ? [...item.enabledInstruments]
      : null
  };
}

function deepCloneSavedList(savedList) {
  if (!Array.isArray(savedList)) return [];
  return savedList.map(deepCloneSavedItem);
}

function createDefaultSection(name = "段落 1") {
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 96,
    loop: "",
    notes: [],
    pattern: instruments.map((instrument) =>
      Array.from({ length: steps }, (_, index) =>
        index % 4 === 0 ? instrument.token : ""
      )
    ),
    enabledInstruments: [true, true, true, true]
  };
}

const defaultState = {
  pieceName: "出场锣鼓-慢起",
  sections: [createDefaultSection("出场锣鼓")],
  currentSectionId: null,
  continuousPlay: false,
  saved: [],
  playCount: 0,
  lastPlayedAt: null,
  recentPlayedSection: ""
};

function migrateOldFormat(oldState) {
  if (oldState.sections && Array.isArray(oldState.sections)) {
    return {
      pieceName: oldState.pieceName || "出场锣鼓-慢起",
      sections: deepCloneSections(oldState.sections),
      currentSectionId: oldState.currentSectionId || oldState.sections[0]?.id || null,
      continuousPlay: oldState.continuousPlay || false,
      saved: deepCloneSavedList(oldState.saved),
      playCount: oldState.playCount || 0,
      lastPlayedAt: oldState.lastPlayedAt || null,
      recentPlayedSection: oldState.recentPlayedSection || ""
    };
  }
  const section = {
    id: crypto.randomUUID(),
    name: oldState.pieceName || "主段落",
    bpm: oldState.bpm || 96,
    loop: oldState.loop || "",
    notes: Array.isArray(oldState.notes) ? [...oldState.notes] : [],
    pattern: Array.isArray(oldState.pattern)
      ? oldState.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
      : instruments.map((instrument) =>
          Array.from({ length: steps }, (_, index) =>
            index % 4 === 0 ? instrument.token : ""
          )
        ),
    enabledInstruments: Array.isArray(oldState.enabledInstruments)
      ? [...oldState.enabledInstruments]
      : [true, true, true, true]
  };
  return {
    pieceName: oldState.pieceName || "出场锣鼓-慢起",
    sections: [section],
    currentSectionId: section.id,
    continuousPlay: false,
    saved: deepCloneSavedList(oldState.saved),
    playCount: oldState.playCount || 0,
    lastPlayedAt: oldState.lastPlayedAt || null,
    recentPlayedSection: oldState.recentPlayedSection || ""
  };
}

const storedState = JSON.parse(localStorage.getItem(storageKey) || "null");
let state;
if (storedState) {
  const migrated = migrateOldFormat(storedState);
  state = {
    pieceName: migrated.pieceName,
    sections: deepCloneSections(migrated.sections),
    currentSectionId: migrated.currentSectionId,
    continuousPlay: migrated.continuousPlay,
    saved: deepCloneSavedList(migrated.saved),
    playCount: migrated.playCount,
    lastPlayedAt: migrated.lastPlayedAt,
    recentPlayedSection: migrated.recentPlayedSection
  };
  if (!state.currentSectionId && state.sections.length > 0) {
    state.currentSectionId = state.sections[0].id;
  }
} else {
  state = {
    pieceName: "出场锣鼓-慢起",
    sections: deepCloneSections(defaultState.sections),
    currentSectionId: null,
    continuousPlay: false,
    saved: [],
    playCount: 0,
    lastPlayedAt: null,
    recentPlayedSection: ""
  };
  state.currentSectionId = state.sections[0].id;
}

let timer = null;
let playhead = 0;
let audioContext = null;
let currentPlaySectionIndex = 0;
let continuousPlaySectionCount = 0;

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
const sectionsList = document.querySelector("#sectionsList");
const addSectionBtn = document.querySelector("#addSectionBtn");
const continuousPlayCheckbox = document.querySelector("#continuousPlay");

let parsedPattern = null;
let editingSectionId = null;

function getCurrentSection() {
  return state.sections.find((s) => s.id === state.currentSectionId);
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function syncFields() {
  const section = getCurrentSection();
  if (!section) return;
  pieceName.value = state.pieceName;
  bpmInput.value = section.bpm;
  loopSelect.value = section.loop;
  continuousPlayCheckbox.checked = state.continuousPlay;
}

function beatLabel(index) {
  const measure = Math.floor(index / 4) + 1;
  const beat = (index % 4) + 1;
  return `${measure}-${beat}`;
}

function renderSectionsList() {
  sectionsList.innerHTML = state.sections
    .map((section, index) => {
      const isActive = section.id === state.currentSectionId;
      const isEditing = editingSectionId === section.id;
      const noteCount = section.notes.length;
      const filledCount = section.pattern.flat().filter(Boolean).length;
      return `
        <div class="section-item ${isActive ? "active" : ""}" data-section-id="${section.id}">
          <span class="section-order">${index + 1}</span>
          <div class="section-info">
            ${isEditing
              ? `<input type="text" class="section-name-input" value="${section.name}" data-section-rename="${section.id}" autofocus>`
              : `<div class="section-name">${section.name}</div>
                 <div class="section-meta">${section.bpm}BPM · ${noteCount}条批注 · ${filledCount}个口令</div>`
            }
          </div>
          <div class="section-item-btns">
            <button type="button" class="section-item-btn" data-section-duplicate="${section.id}" title="复制段落">⎘</button>
            <button type="button" class="section-item-btn" data-section-rename-btn="${section.id}" title="重命名">✎</button>
            <button type="button" class="section-item-btn" data-section-delete="${section.id}" title="删除段落">✕</button>
          </div>
        </div>
      `;
    })
    .join("");

  if (editingSectionId) {
    const input = sectionsList.querySelector(`[data-section-rename="${editingSectionId}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }
}

function renderGrid() {
  const section = getCurrentSection();
  if (!section) return;

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
  if (!section) return;

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
  if (!section) return;

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
    const sectionCount = item.sectionCount || (item.sections ? item.sections.length : 1);
    const bpm = item.bpm || (item.sections && item.sections[0]?.bpm) || 96;
    return `
    <button class="saved-item" type="button" data-load="${item.id}">
      <strong>${item.name}</strong><br><span>${sectionCount}个段落 · ${bpm}BPM</span>
    </button>
  `;
  }).join("") : "<p>还没有保存方案。</p>";
}

function getMeasureData() {
  const section = getCurrentSection();
  if (!section) return [];

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
  if (!section) return [];

  const suggestions = [];
  const measures = getMeasureData();
  const focus = getFocusMeasures();
  const incomplete = measures.filter((m) => m.ratio < 1);
  const totalFilled = measures.reduce((s, m) => s + m.filled, 0);
  const totalCells = measures.reduce((s, m) => s + m.total, 0);
  const totalRatio = totalCells ? totalFilled / totalCells : 0;

  if (state.sections.length > 1) {
    suggestions.push({ icon: "📋", html: `当前共 <strong>${state.sections.length}</strong> 个段落，可开启<strong>连续播放</strong>按顺序排练。` });
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
  if (!section) return;

  const now = new Date();
  dashboardTime.textContent = `${now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })} ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;

  const totalCells = instruments.length * steps;
  const filledCells = section.pattern.flat().filter(Boolean).length;
  const percent = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;
  completionBar.style.width = `${percent}%`;
  completionPercent.textContent = `${percent}%`;
  completionDetail.textContent = `${filledCells}/${totalCells} 个口令`;

  difficultyCount.textContent = section.notes.length;
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
  lastPlay.innerHTML = `${statusDot}<span>${state.playCount ? `共 ${state.playCount} 次${sectionText}` : "等待开始"}</span>`;
}

function render() {
  renderSectionsList();
  syncFields();
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
  if (!section) return;

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
  if (!section) return;

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

function currentRange(section) {
  const sec = section || getCurrentSection();
  if (!sec) return [0, steps - 1];
  if (sec.loop === "") return [0, steps - 1];
  const start = Number(sec.loop) * 4;
  return [start, start + 3];
}

function getPlaySection() {
  if (state.continuousPlay) {
    return state.sections[currentPlaySectionIndex];
  }
  return getCurrentSection();
}

function tick() {
  const section = getPlaySection();
  if (!section) return;

  const [start, end] = currentRange(section);
  if (playhead < start || playhead > end) playhead = start;

  if (state.continuousPlay && state.sections.length > 1) {
    const currentSection = state.sections[currentPlaySectionIndex];
    if (currentSection && currentSection.id !== getCurrentSection()?.id) {
      state.currentSectionId = currentSection.id;
      renderSectionsList();
      renderGrid();
      renderVoicePanel();
      renderSidebars();
      renderDashboard();
    }
  }

  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });

  if (playhead >= end) {
    if (state.continuousPlay && state.sections.length > 1) {
      const nextIndex = currentPlaySectionIndex + 1;
      if (nextIndex < state.sections.length) {
        currentPlaySectionIndex = nextIndex;
        continuousPlaySectionCount++;
        playhead = currentRange(state.sections[nextIndex])[0];
        const nextSection = state.sections[nextIndex];
        if (nextSection.bpm !== section.bpm) {
          clearInterval(timer);
          timer = setInterval(tick, 60000 / nextSection.bpm);
        }
        return;
      } else {
        stopPlayback();
        return;
      }
    } else {
      playhead = start;
    }
  } else {
    playhead = playhead + 1;
  }
}

function startPlayback() {
  if (timer) clearInterval(timer);

  const section = getPlaySection();
  if (!section) return;

  if (state.continuousPlay) {
    currentPlaySectionIndex = 0;
    continuousPlaySectionCount = 0;
    state.currentSectionId = state.sections[0].id;
    renderSectionsList();
  }

  playhead = currentRange(section)[0];
  state.playCount = (state.playCount || 0) + 1;
  state.lastPlayedAt = new Date().toISOString();

  if (state.continuousPlay && state.sections.length > 1) {
    state.recentPlayedSection = `连续播放 ${state.sections.length} 个段落`;
  } else {
    state.recentPlayedSection = section.loop === "" ? "全段播放" : `第${Number(section.loop) + 1}小节循环`;
  }

  save();
  tick();
  timer = setInterval(tick, 60000 / section.bpm);
  renderDashboard();
  renderGrid();
}

function stopPlayback() {
  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));

  if (state.continuousPlay && state.sections.length > 1) {
    playhead = 0;
    currentPlaySectionIndex = 0;
  }

  renderDashboard();
}

grid.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const section = getCurrentSection();
  if (!section) return;
  const row = Number(cell.dataset.row);
  const step = Number(cell.dataset.step);
  section.pattern[row][step] = section.pattern[row][step] ? "" : instruments[row].token;
  save();
  render();
});

pieceName.addEventListener("input", () => {
  state.pieceName = pieceName.value;
  save();
});

bpmInput.addEventListener("input", () => {
  const section = getCurrentSection();
  if (!section) return;
  section.bpm = Number(bpmInput.value || 96);
  save();
  if (timer && !state.continuousPlay) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / section.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  const section = getCurrentSection();
  if (!section) return;
  section.loop = loopSelect.value;
  playhead = currentRange(section)[0];
  save();
});

noteInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !noteInput.value.trim()) return;
  const section = getCurrentSection();
  if (!section) return;
  section.notes.unshift(noteInput.value.trim());
  noteInput.value = "";
  save();
  render();
});

document.querySelector("#playBtn").addEventListener("click", startPlayback);
document.querySelector("#stopBtn").addEventListener("click", stopPlayback);

document.querySelector("#saveBtn").addEventListener("click", () => {
  const savedData = {
    id: crypto.randomUUID(),
    name: state.pieceName || "未命名方案",
    bpm: getCurrentSection()?.bpm || 96,
    sectionCount: state.sections.length,
    pieceName: state.pieceName,
    sections: deepCloneSections(state.sections),
    currentSectionId: state.currentSectionId,
    createdAt: new Date().toISOString()
  };
  state.saved.unshift(savedData);
  save();
  render();
});

savedList.addEventListener("click", (event) => {
  const id = event.target.closest("[data-load]")?.dataset.load;
  const item = state.saved.find((entry) => entry.id === id);
  if (!item) return;

  if (item.sections && Array.isArray(item.sections)) {
    state.pieceName = item.pieceName || item.name;
    state.sections = deepCloneSections(item.sections);
    state.currentSectionId = item.currentSectionId || state.sections[0].id;
  } else {
    const section = deepCloneSection({
      id: crypto.randomUUID(),
      name: item.name,
      bpm: item.bpm,
      loop: item.loop || "",
      notes: item.notes,
      pattern: item.pattern,
      enabledInstruments: item.enabledInstruments
    });
    state.pieceName = item.name;
    state.sections = [section];
    state.currentSectionId = section.id;
  }

  save();
  render();
});

voicePanel.addEventListener("change", (event) => {
  const voiceIndex = event.target.closest("[data-voice]")?.dataset.voice;
  if (voiceIndex === undefined) return;
  const section = getCurrentSection();
  if (!section) return;
  section.enabledInstruments[Number(voiceIndex)] = event.target.checked;
  save();
  render();
});

voicePanel.addEventListener("click", (event) => {
  const allBtn = event.target.closest("[data-voice-all]");
  if (!allBtn) return;
  const section = getCurrentSection();
  if (!section) return;
  const action = allBtn.dataset.voiceAll;
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

sectionsList.addEventListener("click", (event) => {
  const sectionItem = event.target.closest(".section-item");
  const duplicateBtn = event.target.closest("[data-section-duplicate]");
  const deleteBtn = event.target.closest("[data-section-delete]");
  const renameBtn = event.target.closest("[data-section-rename-btn]");

  if (duplicateBtn) {
    event.stopPropagation();
    const id = duplicateBtn.dataset.sectionDuplicate;
    const section = state.sections.find((s) => s.id === id);
    if (section) {
      const newSection = deepCloneSection(section);
      newSection.id = crypto.randomUUID();
      newSection.name = `${section.name} (副本)`;
      const index = state.sections.findIndex((s) => s.id === id);
      state.sections.splice(index + 1, 0, newSection);
      state.currentSectionId = newSection.id;
      save();
      render();
    }
    return;
  }

  if (deleteBtn) {
    event.stopPropagation();
    const id = deleteBtn.dataset.sectionDelete;
    if (state.sections.length <= 1) {
      alert("至少需要保留一个段落。");
      return;
    }
    if (!confirm("确定要删除这个段落吗？")) return;
    const index = state.sections.findIndex((s) => s.id === id);
    state.sections.splice(index, 1);
    if (state.currentSectionId === id) {
      state.currentSectionId = state.sections[Math.max(0, index - 1)].id;
    }
    save();
    render();
    return;
  }

  if (renameBtn) {
    event.stopPropagation();
    const id = renameBtn.dataset.sectionRenameBtn;
    editingSectionId = id;
    renderSectionsList();
    return;
  }

  if (sectionItem && !event.target.closest(".section-item-btns")) {
    const id = sectionItem.dataset.sectionId;
    state.currentSectionId = id;
    playhead = 0;
    save();
    render();
  }
});

sectionsList.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.classList.contains("section-name-input")) {
    const id = event.target.dataset.sectionRename;
    const newName = event.target.value.trim();
    if (newName && id) {
      const section = state.sections.find((s) => s.id === id);
      if (section) {
        section.name = newName;
        save();
      }
    }
    editingSectionId = null;
    render();
  }
  if (event.key === "Escape" && event.target.classList.contains("section-name-input")) {
    editingSectionId = null;
    render();
  }
});

sectionsList.addEventListener("blur", (event) => {
  if (event.target.classList.contains("section-name-input")) {
    const id = event.target.dataset.sectionRename;
    const newName = event.target.value.trim();
    if (newName && id) {
      const section = state.sections.find((s) => s.id === id);
      if (section) {
        section.name = newName;
        save();
      }
    }
    editingSectionId = null;
    render();
  }
}, true);

addSectionBtn.addEventListener("click", () => {
  const newSection = createDefaultSection(`段落 ${state.sections.length + 1}`);
  state.sections.push(newSection);
  state.currentSectionId = newSection.id;
  playhead = 0;
  save();
  render();
});

continuousPlayCheckbox.addEventListener("change", () => {
  state.continuousPlay = continuousPlayCheckbox.checked;
  if (timer) {
    stopPlayback();
  }
  save();
  renderDashboard();
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
