const storageKey = "wxyy-4-luogujing-grid";
const rehearsalLogKey = "wxyy-4-rehearsal-log";
const MAX_REHEARSAL_LOG = 50;
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

function migrateRehearsalEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const result = {
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp || new Date().toISOString(),
    sectionId: entry.sectionId || null,
    sectionName: entry.sectionName || "未知段落",
    pieceName: entry.pieceName || "",
    bpm: typeof entry.bpm === "number" ? entry.bpm : 96,
    loop: entry.loop ?? "",
    loopLabel: entry.loopLabel || (entry.loop === "" ? "全段" : `第${Number(entry.loop) + 1}小节`),
    enabledInstruments: Array.isArray(entry.enabledInstruments)
      ? [...entry.enabledInstruments]
      : [true, true, true, true],
    activeVoices: Array.isArray(entry.activeVoices)
      ? [...entry.activeVoices]
      : instruments
          .filter((_, idx) => (Array.isArray(entry.enabledInstruments) ? entry.enabledInstruments[idx] : true))
          .map((i) => i.name),
    pausePosition: entry.pausePosition ?? null,
    pauseLabel: entry.pauseLabel || (entry.pausePosition != null
      ? `第${Math.floor(entry.pausePosition / 4) + 1}小节第${(entry.pausePosition % 4) + 1}拍`
      : "播放完成"),
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    snapshot: entry.snapshot ? {
      sections: Array.isArray(entry.snapshot.sections)
        ? deepCloneSections(entry.snapshot.sections)
        : null,
      currentSectionId: entry.snapshot.currentSectionId || null,
      pieceName: entry.snapshot.pieceName || "",
      continuousPlay: entry.snapshot.continuousPlay ?? false
    } : null
  };
  if (!result.snapshot || !result.snapshot.sections) {
    result.snapshot = {
      sections: null,
      currentSectionId: result.sectionId,
      pieceName: result.pieceName,
      continuousPlay: false
    };
  }
  return result;
}

function loadRehearsalLog() {
  try {
    const raw = localStorage.getItem(rehearsalLogKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed
      .map(migrateRehearsalEntry)
      .filter(Boolean);
    return migrated.slice(0, MAX_REHEARSAL_LOG);
  } catch {
    return [];
  }
}

function saveRehearsalLog() {
  localStorage.setItem(rehearsalLogKey, JSON.stringify(rehearsalLog));
}

let rehearsalLog = loadRehearsalLog();

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
let currentRehearsalId = null;
let currentRehearsalStartTime = null;
let pendingRehearsalResume = null;

const diagnosisStorageKey = "wxyy-4-diagnosis-result";
let diagnosisMode = false;
let diagnosisActive = false;
let diagnosisTimer = null;
let diagnosisHiddenCells = [];
let diagnosisCurrentStep = -1;
let diagnosisAnswers = [];
let diagnosisStats = {
  total: 0,
  correct: 0,
  wrong: 0,
  wrongPositions: [],
  confusedInstruments: {}
};
let diagnosisWaitingForAnswer = false;
let diagnosisPaused = false;
let diagnosisStartTime = null;
let lastDiagnosisResult = null;

let tempoTrainer = {
  active: false,
  enabled: false,
  currentRound: 0,
  totalRounds: 0,
  bpmSteps: [],
  roundsPerBpm: 2,
  pauseBetweenRounds: 1000,
  beatsRemaining: 0,
  totalBeatsPerRound: 0,
  pausing: false,
  pauseTimer: null,
  completed: false,
  originalBpm: 96,
  originalLoop: "",
  currentBpmIndex: 0,
  currentSubRound: 0
};

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
const rehearsalTimelineBody = document.querySelector("#rehearsalTimelineBody");
const rehearsalCount = document.querySelector("#rehearsalCount");
const rehearsalClearBtn = document.querySelector("#rehearsalClearBtn");
const schemeExportBtn = document.querySelector("#schemeExportBtn");
const schemeFileInput = document.querySelector("#schemeFileInput");
const schemeImportListBtn = document.querySelector("#schemeImportListBtn");
const schemeIeError = document.querySelector("#schemeIeError");
const schemeIePreview = document.querySelector("#schemeIePreview");
const previewSchemeName = document.querySelector("#previewSchemeName");
const previewSchemeBpm = document.querySelector("#previewSchemeBpm");
const previewSchemeNotes = document.querySelector("#previewSchemeNotes");
const previewSchemeGrid = document.querySelector("#previewSchemeGrid");
const previewSchemeSections = document.querySelector("#previewSchemeSections");
const previewSchemeVersion = document.querySelector("#previewSchemeVersion");
const schemeCompatibility = document.querySelector("#schemeCompatibility");
const compatibilityList = document.querySelector("#compatibilityList");
const schemeConfirmBtn = document.querySelector("#schemeConfirmBtn");
const schemeCancelBtn = document.querySelector("#schemeCancelBtn");

const tempoTrainerSection = document.querySelector("#tempoTrainer");
const tempoTrainerToggle = document.querySelector("#tempoTrainerToggle");
const tempoStartBpm = document.querySelector("#tempoStartBpm");
const tempoEndBpm = document.querySelector("#tempoEndBpm");
const tempoStepBpm = document.querySelector("#tempoStepBpm");
const tempoRoundsPerBpm = document.querySelector("#tempoRoundsPerBpm");
const tempoPauseMs = document.querySelector("#tempoPauseMs");
const tempoGenerateBtn = document.querySelector("#tempoGenerateBtn");
const tempoResetBtn = document.querySelector("#tempoResetBtn");
const tempoStepsPreview = document.querySelector("#tempoStepsPreview");
const tempoStatus = document.querySelector("#tempoStatus");
const tempoStateValue = document.querySelector("#tempoStateValue");
const tempoRoundValue = document.querySelector("#tempoRoundValue");
const tempoBpmValue = document.querySelector("#tempoBpmValue");
const tempoBeatsValue = document.querySelector("#tempoBeatsValue");
const tempoProgressFill = document.querySelector("#tempoProgressFill");
const tempoProgressText = document.querySelector("#tempoProgressText");

const SCHEMA_VERSION = 2;
const SUPPORTED_VERSIONS = [1, 2];

let parsedPattern = null;
let editingSectionId = null;
let parsedSchemeData = null;
let parsedSchemeIsImportToList = false;
let parsedSchemeCompatibility = null;
let pendingImportToList = false;

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

  const hiddenStepMap = {};
  const answeredStepMap = {};
  if (diagnosisMode) {
    diagnosisHiddenCells.forEach(q => {
      hiddenStepMap[q.step] = q;
    });
    diagnosisAnswers.forEach(a => {
      answeredStepMap[a.step] = a;
    });
  }

  const header = ['<div class="label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    const question = hiddenStepMap[i];
    const answered = answeredStepMap[i];
    const isRestHidden = question && question.rows.length === 0;

    let beatClass = "beat-cell";
    let beatContent = beatLabel(i);

    if (isRestHidden) {
      beatClass += " hidden-cell hidden-rest";
      if (answered) {
        beatClass += answered.correct ? " answered-correct" : " answered-wrong";
        beatContent = beatLabel(i);
        if (!answered.correct) {
          beatContent += `<span class="correct-answer">休止</span>`;
        }
      }
    }

    header.push(`<div class="${beatClass}" data-step="${i}">${beatContent}</div>`);
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const muted = !section.enabledInstruments[rowIndex];
    const row = [`<div class="label-cell ${muted ? "muted" : ""}">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const value = section.pattern[rowIndex][step];
      const question = hiddenStepMap[step];
      const isInstrumentHidden = question && question.rows.length > 0 && question.rows.includes(rowIndex);
      const answered = answeredStepMap[step];

      let cellClass = `cell ${value ? "filled" : ""} ${muted ? "muted" : ""}`;
      let cellContent = value;

      if (isInstrumentHidden) {
        cellClass += " hidden-cell";
        if (answered) {
          cellClass += answered.correct ? " answered-correct" : " answered-wrong";
          cellContent = value || "";
          if (!answered.correct && value) {
            cellContent += `<span class="correct-answer">${value}</span>`;
          }
        }
      }

      row.push(`<button class="${cellClass}" type="button" data-row="${rowIndex}" data-step="${step}">${cellContent}</button>`);
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

function formatRehearsalTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) {
    return `${mins}分${secs}秒`;
  }
  return `${secs}秒`;
}

function renderRehearsalTimeline() {
  if (rehearsalLog.length === 0) {
    rehearsalTimelineBody.innerHTML = `<div class="rehearsal-empty">尚未产生排练记录，播放后将自动记录</div>`;
    rehearsalCount.textContent = "";
    return;
  }
  rehearsalCount.textContent = `${rehearsalLog.length}/${MAX_REHEARSAL_LOG}`;
  rehearsalTimelineBody.innerHTML = rehearsalLog.map((entry, idx) => {
    const voiceNames = entry.activeVoices || instruments
      .filter((_, idx2) => entry.enabledInstruments?.[idx2])
      .map((i) => i.name);
    const voiceStr = voiceNames.length === instruments.length ? "全部声部" : voiceNames.join("、");
    const pauseStr = entry.pauseLabel || (entry.pausePosition != null ? `第${Math.floor(entry.pausePosition / 4) + 1}小节第${(entry.pausePosition % 4) + 1}拍` : "播放完成");
    const isPlaying = entry.id === currentRehearsalId;
    const durationStr = formatDuration(entry.durationMs);
    const canRestore = entry.snapshot && entry.snapshot.sections && entry.snapshot.sections.length > 0;
    return `
      <div class="rehearsal-item ${isPlaying ? "rehearsal-playing" : ""}" data-rehearsal-id="${entry.id}" data-rehearsal-idx="${idx}">
        <div class="rehearsal-item-top">
          <div class="rehearsal-item-info">
            <div class="rehearsal-item-title">
              ${isPlaying ? '<span class="rehearsal-live-badge">直播中</span>' : ""}
              ${entry.sectionName || "未知段落"}${entry.pieceName ? ` · ${entry.pieceName}` : ""}
            </div>
            <div class="rehearsal-item-time">
              ${formatRehearsalTime(entry.timestamp)}${durationStr ? ` · 播放时长 ${durationStr}` : ""}
            </div>
          </div>
          <div class="rehearsal-item-btns">
            <button type="button" class="rehearsal-restore-btn" data-rehearsal-restore="${entry.id}" title="恢复此排练状态" ${canRestore ? "" : "disabled style=\"opacity:0.4;cursor:not-allowed;\""}>↺</button>
            <button type="button" class="rehearsal-delete-btn" data-rehearsal-delete="${entry.id}" title="删除此条记录">✕</button>
          </div>
        </div>
        <div class="rehearsal-item-tags">
          <span class="rehearsal-tag bpm-tag">${entry.bpm}BPM</span>
          <span class="rehearsal-tag measure-tag">${entry.loopLabel || "全段"}</span>
          <span class="rehearsal-tag voice-tag">${voiceStr}</span>
          <span class="rehearsal-tag pause-tag">${isPlaying ? "播放中…" : `暂停：${pauseStr}`}</span>
        </div>
      </div>
    `;
  }).join("");
}

function render() {
  renderSectionsList();
  syncFields();
  renderGrid();
  renderVoicePanel();
  renderSidebars();
  renderDashboard();
  renderRehearsalTimeline();
  if (tempoTrainerSection && tempoTrainerSection.classList.contains('disabled') === false && !tempoTrainer.enabled) {
    tempoTrainerSection.classList.add('disabled');
  }
  if (tempoStepsPreview && tempoTrainer.bpmSteps.length === 0) {
    renderTempoStepsPreview();
  }
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

function getValidPlayhead(section, position) {
  if (typeof position !== "number") return null;
  const [start, end] = currentRange(section);
  return position >= start && position <= end ? position : null;
}

function tick() {
  if (tempoTrainer.active) {
    return;
  }

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
  if (diagnosisActive) {
    alert("诊断练习进行中，请先结束诊断练习再使用普通播放。");
    return;
  }

  if (tempoTrainer.enabled && tempoTrainer.bpmSteps.length > 0) {
    startTempoTrainer();
    return;
  }

  if (tempoTrainer.active) {
    alert("变速训练进行中，请先停止训练。");
    return;
  }

  if (timer) clearInterval(timer);

  let section = getPlaySection();
  if (!section) return;
  const resume = pendingRehearsalResume;

  if (state.continuousPlay) {
    const resumeIndex = resume ? state.sections.findIndex((s) => s.id === resume.sectionId) : -1;
    currentPlaySectionIndex = resumeIndex >= 0 ? resumeIndex : 0;
    continuousPlaySectionCount = 0;
    state.currentSectionId = state.sections[currentPlaySectionIndex].id;
    section = getPlaySection();
    renderSectionsList();
  }

  const resumedPlayhead = resume && resume.sectionId === section.id
    ? getValidPlayhead(section, resume.playhead)
    : null;
  playhead = resumedPlayhead ?? currentRange(section)[0];
  pendingRehearsalResume = null;
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

  currentRehearsalId = crypto.randomUUID();
  currentRehearsalStartTime = Date.now();
  const activeVoices = instruments
    .filter((_, idx) => section.enabledInstruments[idx])
    .map((i) => i.name);
  const loopLabel = section.loop === "" ? "全段" : `第${Number(section.loop) + 1}小节`;
  rehearsalLog.unshift({
    id: currentRehearsalId,
    timestamp: new Date().toISOString(),
    sectionId: section.id,
    sectionName: section.name,
    pieceName: state.pieceName,
    bpm: section.bpm,
    loop: section.loop,
    loopLabel,
    enabledInstruments: [...section.enabledInstruments],
    activeVoices,
    pausePosition: null,
    pauseLabel: "播放中…",
    durationMs: null,
    snapshot: {
      sections: deepCloneSections(state.sections),
      currentSectionId: state.currentSectionId,
      pieceName: state.pieceName,
      continuousPlay: state.continuousPlay
    }
  });
  if (rehearsalLog.length > MAX_REHEARSAL_LOG) {
    rehearsalLog = rehearsalLog.slice(0, MAX_REHEARSAL_LOG);
  }
  saveRehearsalLog();

  renderDashboard();
  renderGrid();
  renderRehearsalTimeline();
}

function stopPlayback() {
  if (diagnosisActive) return;

  if (tempoTrainer.active) {
    stopTempoTrainer();
    return;
  }

  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));

  if (currentRehearsalId) {
    const entry = rehearsalLog.find((r) => r.id === currentRehearsalId);
    if (entry) {
      const currentPlayedSection = getPlaySection() || getCurrentSection();
      entry.durationMs = currentRehearsalStartTime ? Date.now() - currentRehearsalStartTime : null;

      if (currentPlayedSection) {
        const [start, end] = currentRange(currentPlayedSection);
        if (playhead >= start && playhead <= end) {
          entry.pausePosition = playhead;
          entry.pauseLabel = currentPlayedSection.id !== entry.sectionId
            ? `${currentPlayedSection.name} · 第${Math.floor(playhead / 4) + 1}小节第${(playhead % 4) + 1}拍`
            : `第${Math.floor(playhead / 4) + 1}小节第${(playhead % 4) + 1}拍`;
          entry.sectionId = currentPlayedSection.id;
          entry.sectionName = currentPlayedSection.name;
          entry.bpm = currentPlayedSection.bpm;
        } else {
          entry.pausePosition = null;
          entry.pauseLabel = "播放完成";
        }
      } else {
        entry.pausePosition = null;
        entry.pauseLabel = "播放完成";
      }

      if (entry.snapshot) {
        entry.snapshot.currentSectionId = state.currentSectionId;
      }

      saveRehearsalLog();
    }
    currentRehearsalId = null;
    currentRehearsalStartTime = null;
  }

  if (state.continuousPlay && state.sections.length > 1) {
    playhead = 0;
    currentPlaySectionIndex = 0;
  }

  renderDashboard();
  renderRehearsalTimeline();
}

grid.addEventListener("click", (event) => {
  if (diagnosisMode) return;
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
  const newBpm = Number(bpmInput.value || 96);
  section.bpm = newBpm;
  save();

  if (tempoTrainer.active && timer && !tempoTrainer.pausing) {
    clearInterval(timer);
    timer = setInterval(tempoTrainerTick, 60000 / newBpm);
    return;
  }

  if (timer && !state.continuousPlay) {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / section.bpm);
  }
  if (diagnosisTimer && !diagnosisPaused) {
    clearInterval(diagnosisTimer);
    diagnosisTimer = setInterval(diagnosisTick, 60000 / section.bpm);
  }
});

loopSelect.addEventListener("change", () => {
  if (tempoTrainer.active) {
    loopSelect.value = tempoTrainer.originalLoop;
    alert("变速训练进行中，无法修改循环小节。请先停止训练。");
    return;
  }
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

  if (tempoTrainer.active) {
    if (!confirm("变速训练进行中，加载方案将停止训练，确定继续吗？")) {
      return;
    }
    stopTempoTrainer();
  }

  if (Array.isArray(item.sections) && item.sections.length > 0) {
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
    if (tempoTrainer.active) {
      if (!confirm("变速训练进行中，切换段落将停止训练，确定继续吗？")) {
        return;
      }
      stopTempoTrainer();
    }
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
  if (tempoTrainer.active) {
    continuousPlayCheckbox.checked = state.continuousPlay;
    alert("变速训练进行中，无法切换连续播放。请先停止训练。");
    return;
  }
  state.continuousPlay = continuousPlayCheckbox.checked;
  if (timer) {
    stopPlayback();
  }
  save();
  renderDashboard();
});

tempoTrainerToggle.addEventListener("change", toggleTempoTrainer);

tempoGenerateBtn.addEventListener("click", generateBpmSteps);

tempoResetBtn.addEventListener("click", resetTempoTrainer);

[tempoStartBpm, tempoEndBpm, tempoStepBpm, tempoRoundsPerBpm, tempoPauseMs].forEach(input => {
  input.addEventListener("input", () => {
    if (!tempoTrainer.active) {
      tempoGenerateBtn.disabled = false;
      tempoGenerateBtn.textContent = '🎯 生成BPM阶梯';
      tempoTrainer.bpmSteps = [];
      renderTempoStepsPreview();
      updatePlayButtonsState();
    }
  });
});

rehearsalTimelineBody.addEventListener("click", (event) => {
  const restoreBtn = event.target.closest("[data-rehearsal-restore]");
  const deleteBtn = event.target.closest("[data-rehearsal-delete]");

  if (restoreBtn) {
    event.stopPropagation();
    const id = restoreBtn.dataset.rehearsalRestore;
    const entry = rehearsalLog.find((r) => r.id === id);
    if (!entry || !entry.snapshot || !entry.snapshot.sections) return;
    if (!confirm(`确定要恢复到「${entry.sectionName || "未知段落"}」的排练状态吗？\n当前未保存的谱面修改将丢失。`)) return;
    if (timer) stopPlayback();
    state.sections = deepCloneSections(entry.snapshot.sections);
    state.currentSectionId = entry.snapshot.currentSectionId || state.sections[0]?.id || entry.sectionId;
    state.pieceName = entry.snapshot.pieceName || state.pieceName;
    state.continuousPlay = entry.snapshot.continuousPlay ?? state.continuousPlay;

    const targetSection = state.sections.find((s) => s.id === state.currentSectionId) || state.sections[0];
    if (targetSection) {
      const [rangeStart] = currentRange(targetSection);
      if (entry.pausePosition != null && entry.sectionId === targetSection.id) {
        playhead = entry.pausePosition;
        pendingRehearsalResume = {
          sectionId: targetSection.id,
          playhead: entry.pausePosition
        };
      } else {
        playhead = rangeStart;
        pendingRehearsalResume = null;
      }
    } else {
      playhead = 0;
      pendingRehearsalResume = null;
    }
    save();
    render();
    return;
  }

  if (deleteBtn) {
    event.stopPropagation();
    const id = deleteBtn.dataset.rehearsalDelete;
    const entry = rehearsalLog.find((r) => r.id === id);
    if (!entry) return;
    if (!confirm(`确定要删除「${entry.sectionName || "未知段落"}」的排练记录吗？`)) return;
    rehearsalLog = rehearsalLog.filter((r) => r.id !== id);
    saveRehearsalLog();
    renderRehearsalTimeline();
  }
});

rehearsalClearBtn.addEventListener("click", () => {
  if (rehearsalLog.length === 0) return;
  if (!confirm("确定要清空所有排练记录吗？此操作不可撤销。")) return;
  rehearsalLog = [];
  saveRehearsalLog();
  renderRehearsalTimeline();
});

function buildExportData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pieceName: state.pieceName,
    sections: deepCloneSections(state.sections),
    currentSectionId: state.currentSectionId,
    continuousPlay: state.continuousPlay,
    saved: deepCloneSavedList(state.saved),
    appInfo: {
      name: "传统戏曲锣鼓经排练可视化",
      version: "1.0.0"
    }
  };
}

function exportScheme() {
  try {
    const exportData = buildExportData();
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (state.pieceName || "未命名方案").replace(/[<>:"/\\|?*]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${safeName}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSchemeSuccess("方案已成功导出！");
  } catch (error) {
    showSchemeError(`导出失败：${error.message}`);
  }
}

function showSchemeError(message) {
  schemeIeError.innerHTML = `<strong>⚠️ 错误：</strong>${message}`;
  schemeIeError.style.display = "block";
}

function showSchemeSuccess(message) {
  schemeIeError.innerHTML = `<strong>✓ 成功：</strong><span style="color:#047857;">${message}</span>`;
  schemeIeError.style.display = "block";
}

function hideSchemeError() {
  schemeIeError.style.display = "none";
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

async function parseSchemeFile(file) {
  if (!file) {
    throw new Error("请选择一个文件。");
  }
  if (file.type && !file.type.includes("json") && !file.name.endsWith(".json")) {
    throw new Error("文件格式不正确，请选择 .json 文件。");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("文件过大（超过 5MB），请选择较小的文件。");
  }

  let text;
  try {
    text = await readFileAsText(file);
  } catch (error) {
    throw new Error(`文件读取失败：${error.message}。文件可能已损坏。`);
  }

  if (!text || !text.trim()) {
    throw new Error("文件为空，无法解析。");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const pos = error.message.match(/position (\d+)/);
    const posInfo = pos ? `（位置 ${pos[1]}）` : "";
    throw new Error(`JSON 解析失败${posInfo}：文件格式不正确或已损坏。<br>请确保文件是有效的 JSON 格式。`);
  }

  return data;
}

function validateAndMigrateScheme(data) {
  const compatibility = {
    issues: [],
    warnings: [],
    infos: [],
    errors: [],
    migrated: false,
    canImport: true
  };

  if (!data || typeof data !== "object") {
    compatibility.errors.push("数据格式无效，不是一个对象。");
    compatibility.canImport = false;
    return { data, compatibility };
  }

  const fileVersion = data.schemaVersion || 1;
  compatibility.infos.push(`文件数据版本：v${fileVersion}`);

  if (!SUPPORTED_VERSIONS.includes(fileVersion)) {
    compatibility.errors.push(`不支持的文件版本 v${fileVersion}。当前支持的版本：v${SUPPORTED_VERSIONS.join("、v")}。`);
    compatibility.canImport = false;
    return { data, compatibility };
  }

  if (fileVersion < SCHEMA_VERSION) {
    compatibility.warnings.push(`文件版本较旧（v${fileVersion}），将自动迁移到当前版本 v${SCHEMA_VERSION}。`);
    compatibility.migrated = true;
  } else if (fileVersion > SCHEMA_VERSION) {
    compatibility.warnings.push(`文件版本 v${fileVersion} 高于当前版本 v${SCHEMA_VERSION}，部分字段可能无法识别。`);
  }

  let migratedData = { ...data };

  if (!migratedData.sections || !Array.isArray(migratedData.sections)) {
    if (migratedData.pattern) {
      compatibility.warnings.push("检测到旧版单段落格式，正在转换为多段落格式。");
      migratedData = migrateOldFormat(migratedData);
      compatibility.migrated = true;
    } else {
      compatibility.errors.push("缺少必要字段：sections（段落数据）。");
      compatibility.canImport = false;
      return { data: migratedData, compatibility };
    }
  }

  if (migratedData.sections.length === 0) {
    compatibility.errors.push("段落数据为空，至少需要一个段落。");
    compatibility.canImport = false;
    return { data: migratedData, compatibility };
  }

  const requiredSectionFields = ["id", "name", "bpm", "pattern"];
  migratedData.sections.forEach((section, idx) => {
    if (!section || typeof section !== "object") {
      compatibility.errors.push(`第 ${idx + 1} 个段落格式无效。`);
      compatibility.canImport = false;
      return;
    }
    requiredSectionFields.forEach((field) => {
      if (!(field in section)) {
        compatibility.warnings.push(`第 ${idx + 1} 个段落缺少字段「${field}」，将使用默认值。`);
      }
    });
    if (!section.id) {
      section.id = crypto.randomUUID();
      compatibility.warnings.push(`第 ${idx + 1} 个段落 ID 缺失，已自动生成。`);
    }
    if (!section.pattern || !Array.isArray(section.pattern)) {
      compatibility.errors.push(`第 ${idx + 1} 个段落缺少有效的 pattern 数据。`);
      compatibility.canImport = false;
    } else if (section.pattern.length !== instruments.length) {
      compatibility.warnings.push(`第 ${idx + 1} 个段落乐器数量不匹配，将自动调整。`);
    }
  });

  if (!migratedData.pieceName) {
    migratedData.pieceName = "导入的方案";
    compatibility.infos.push("方案名称缺失，已使用默认名称。");
  }

  if (!migratedData.currentSectionId && migratedData.sections.length > 0) {
    migratedData.currentSectionId = migratedData.sections[0].id;
    compatibility.infos.push("当前段落 ID 缺失，已设置为第一个段落。");
  }

  if (migratedData.saved && Array.isArray(migratedData.saved)) {
    const savedIds = new Set();
    const duplicateIds = [];
    migratedData.saved.forEach((item, idx) => {
      if (item && item.id) {
        if (savedIds.has(item.id)) {
          duplicateIds.push(item.id);
          item.id = crypto.randomUUID();
          compatibility.warnings.push(`已存方案第 ${idx + 1} 个 ID 重复，已自动重新生成。`);
        } else {
          savedIds.add(item.id);
        }
      }
    });

    if (state.saved && state.saved.length > 0) {
      const existingIds = new Set(state.saved.map((s) => s.id));
      let conflictCount = 0;
      migratedData.saved.forEach((item) => {
        if (item && item.id && existingIds.has(item.id)) {
          item.id = crypto.randomUUID();
          conflictCount++;
        }
      });
      if (conflictCount > 0) {
        compatibility.warnings.push(`检测到 ${conflictCount} 个已存方案 ID 与本地冲突，已自动重新生成。`);
      }
    }
  }

  const currentSectionIds = new Set(migratedData.sections.map((s) => s.id));
  const duplicateSectionIds = migratedData.sections
    .map((s) => s.id)
    .filter((id, idx, arr) => arr.indexOf(id) !== idx);
  if (duplicateSectionIds.length > 0) {
    compatibility.errors.push(`段落 ID 存在重复：${[...new Set(duplicateSectionIds)].join("、")}。`);
    compatibility.canImport = false;
  }

  return { data: migratedData, compatibility };
}

function calculateSchemeStats(data) {
  const stats = {
    name: data.pieceName || "未命名方案",
    bpm: 0,
    noteCount: 0,
    gridSize: `${instruments.length}×${steps}`,
    sectionCount: 0,
    version: data.schemaVersion || 1
  };

  if (Array.isArray(data.sections) && data.sections.length > 0) {
    stats.sectionCount = data.sections.length;
    const firstSection = data.sections.find((s) => s.id === data.currentSectionId) || data.sections[0];
    stats.bpm = firstSection?.bpm || data.bpm || 96;

    data.sections.forEach((section) => {
      if (Array.isArray(section.notes)) {
        stats.noteCount += section.notes.length;
      }
    });
  } else {
    stats.bpm = data.bpm || 96;
    stats.noteCount = Array.isArray(data.notes) ? data.notes.length : 0;
    stats.sectionCount = 1;
  }

  return stats;
}

function renderSchemePreview(data, compatibility, isImportToList) {
  const stats = calculateSchemeStats(data);

  previewSchemeName.textContent = stats.name;
  previewSchemeBpm.textContent = `${stats.bpm} BPM`;
  previewSchemeNotes.textContent = `${stats.noteCount} 条`;
  previewSchemeGrid.textContent = stats.gridSize;
  previewSchemeSections.textContent = `${stats.sectionCount} 个`;
  previewSchemeVersion.textContent = `v${stats.version}`;

  if (compatibility.errors.length > 0 || compatibility.warnings.length > 0 || compatibility.infos.length > 0) {
    schemeCompatibility.style.display = "block";

    let severityClass = "success";
    if (compatibility.errors.length > 0) {
      severityClass = "error";
    } else if (compatibility.warnings.length > 0) {
      severityClass = "";
    }

    schemeCompatibility.className = `scheme-compatibility ${severityClass}`;

    const items = [];
    compatibility.errors.forEach((msg) => {
      items.push(`<div class="compatibility-item error"><span class="compatibility-icon">✕</span><span>${msg}</span></div>`);
    });
    compatibility.warnings.forEach((msg) => {
      items.push(`<div class="compatibility-item warning"><span class="compatibility-icon">⚠</span><span>${msg}</span></div>`);
    });
    compatibility.infos.forEach((msg) => {
      items.push(`<div class="compatibility-item info"><span class="compatibility-icon">ℹ</span><span>${msg}</span></div>`);
    });

    compatibilityList.innerHTML = items.join("");
  } else {
    schemeCompatibility.style.display = "none";
  }

  if (isImportToList) {
    const savedCount = Array.isArray(data.saved) ? data.saved.length : 0;
    if (savedCount === 0) {
      showSchemeError("该文件不包含任何已存方案，无法导入到列表。");
      schemeIePreview.style.display = "none";
      return;
    }
    const importListInfo = document.createElement("div");
    importListInfo.style.cssText = "margin-bottom:12px;padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e;";
    importListInfo.innerHTML = `📥 将导入 <strong>${savedCount}</strong> 个已存方案到本地列表，不会覆盖当前编辑内容。`;
    const previewHeader = schemeIePreview.querySelector(".preview-header");
    if (previewHeader && !previewHeader.nextElementSibling?.dataset.importListInfo) {
      importListInfo.dataset.importListInfo = "true";
      previewHeader.after(importListInfo);
    }
  } else {
    const existingInfo = schemeIePreview.querySelector('[data-import-list-info]');
    if (existingInfo) existingInfo.remove();
  }

  schemeConfirmBtn.disabled = !compatibility.canImport;
  schemeIePreview.style.display = "block";
}

function resetSchemeImportState() {
  parsedSchemeData = null;
  parsedSchemeIsImportToList = false;
  parsedSchemeCompatibility = null;
  schemeFileInput.value = "";
  schemeIePreview.style.display = "none";
  schemeConfirmBtn.disabled = true;
  hideSchemeError();
}

async function handleSchemeFileSelect(event, isImportToList) {
  const file = event.target.files?.[0];
  if (!file) return;

  hideSchemeError();
  resetSchemeImportState();

  try {
    const rawData = await parseSchemeFile(file);
    const { data, compatibility } = validateAndMigrateScheme(rawData);

    parsedSchemeData = data;
    parsedSchemeIsImportToList = isImportToList;
    parsedSchemeCompatibility = compatibility;

    renderSchemePreview(data, compatibility, isImportToList);
  } catch (error) {
    showSchemeError(error.message);
    schemeFileInput.value = "";
  }
}

function applySchemeImport() {
  if (!parsedSchemeData || !parsedSchemeCompatibility?.canImport) {
    showSchemeError("当前没有可导入的有效数据。");
    return;
  }

  try {
    if (parsedSchemeIsImportToList) {
      if (!Array.isArray(parsedSchemeData.saved) || parsedSchemeData.saved.length === 0) {
        throw new Error("文件中不包含可导入的已存方案。");
      }

      const existingIds = new Set(state.saved.map((s) => s.id));
      const importedItems = deepCloneSavedList(parsedSchemeData.saved);
      let addedCount = 0;

      importedItems.forEach((item) => {
        while (item.id && existingIds.has(item.id)) {
          item.id = crypto.randomUUID();
        }
        if (!item.createdAt) {
          item.createdAt = new Date().toISOString();
        }
        state.saved.unshift(item);
        existingIds.add(item.id);
        addedCount++;
      });

      save();
      render();
      showSchemeSuccess(`已成功导入 ${addedCount} 个方案到已存列表！`);
    } else {
      const confirmMsg = parsedSchemeCompatibility.migrated
        ? "检测到数据已迁移，确定要导入并覆盖当前内容吗？"
        : "确定要导入此方案吗？当前未保存的内容将被覆盖。";

      if (!confirm(confirmMsg)) {
        return;
      }

      const originalState = JSON.parse(JSON.stringify(state));

      try {
        if (timer) {
          stopPlayback();
        }

        if (tempoTrainer.active) {
          stopTempoTrainer();
        }

        state.pieceName = parsedSchemeData.pieceName || "导入的方案";
        state.sections = deepCloneSections(parsedSchemeData.sections);
        state.currentSectionId = parsedSchemeData.currentSectionId || state.sections[0]?.id;
        state.continuousPlay = parsedSchemeData.continuousPlay ?? false;

        if (parsedSchemeData.saved && Array.isArray(parsedSchemeData.saved) && parsedSchemeData.saved.length > 0) {
          const existingIds = new Set(state.saved.map((s) => s.id));
          const importedSaved = deepCloneSavedList(parsedSchemeData.saved);
          importedSaved.forEach((item) => {
            while (item.id && existingIds.has(item.id)) {
              item.id = crypto.randomUUID();
            }
            if (!item.createdAt) {
              item.createdAt = new Date().toISOString();
            }
            state.saved.unshift(item);
            existingIds.add(item.id);
          });
        }

        save();
        render();
        showSchemeSuccess("方案导入成功！");
      } catch (applyError) {
        Object.assign(state, originalState);
        save();
        render();
        throw new Error(`导入时发生错误，已回滚到之前的状态：${applyError.message}`);
      }
    }

    resetSchemeImportState();
  } catch (error) {
    showSchemeError(error.message);
  }
}

schemeExportBtn.addEventListener("click", exportScheme);

schemeFileInput.addEventListener("change", (e) => {
  handleSchemeFileSelect(e, pendingImportToList);
  pendingImportToList = false;
});

schemeImportListBtn.addEventListener("click", () => {
  pendingImportToList = true;
  schemeFileInput.click();
});

schemeConfirmBtn.addEventListener("click", applySchemeImport);

schemeCancelBtn.addEventListener("click", resetSchemeImportState);

const diagnosisToggleBtn = document.querySelector("#diagnosisToggleBtn");
const diagnosisPanel = document.querySelector("#diagnosisPanel");
const diagnosisStartBtn = document.querySelector("#diagnosisStartBtn");
const diagnosisStopBtn = document.querySelector("#diagnosisStopBtn");
const diagnosisCloseBtn = document.querySelector("#diagnosisCloseBtn");
const diagnosisDifficulty = document.querySelector("#diagnosisDifficulty");
const diagnosisStatus = document.querySelector("#diagnosisStatus");
const diagnosisAnswered = document.querySelector("#diagnosisAnswered");
const diagnosisCorrect = document.querySelector("#diagnosisCorrect");
const diagnosisAccuracy = document.querySelector("#diagnosisAccuracy");
const diagnosisAnswerPanel = document.querySelector("#diagnosisAnswerPanel");
const diagnosisAnswerButtons = document.querySelector("#diagnosisAnswerButtons");
const diagnosisFeedback = document.querySelector("#diagnosisFeedback");
const diagnosisResult = document.querySelector("#diagnosisResult");
const wrongPositionsEl = document.querySelector("#wrongPositions");
const confusedInstrumentsEl = document.querySelector("#confusedInstruments");
const resultAccuracy = document.querySelector("#resultAccuracy");
const resultTotal = document.querySelector("#resultTotal");
const resultCorrect = document.querySelector("#resultCorrect");
const resultWrong = document.querySelector("#resultWrong");

function loadLastDiagnosisResult() {
  try {
    const raw = localStorage.getItem(diagnosisStorageKey);
    if (raw) {
      lastDiagnosisResult = JSON.parse(raw);
    }
  } catch {
    lastDiagnosisResult = null;
  }
}

function saveDiagnosisResult(result) {
  try {
    localStorage.setItem(diagnosisStorageKey, JSON.stringify(result));
    lastDiagnosisResult = result;
  } catch {}
}

function updatePlayButtonsState() {
  const playBtn = document.querySelector("#playBtn");
  const stopBtn = document.querySelector("#stopBtn");
  if (playBtn) {
    if (tempoTrainer.active) {
      playBtn.textContent = "训练中...";
      playBtn.disabled = true;
      playBtn.title = "变速训练进行中，请使用训练器控制";
    } else if (tempoTrainer.enabled && tempoTrainer.bpmSteps.length > 0) {
      playBtn.textContent = "开始训练";
      playBtn.disabled = diagnosisActive;
      playBtn.title = diagnosisActive ? "诊断练习进行中" : "点击开始变速训练";
    } else {
      playBtn.textContent = "播放";
      playBtn.disabled = diagnosisActive;
      playBtn.title = diagnosisActive ? "诊断练习进行中" : "";
    }
  }
  if (stopBtn) {
    if (tempoTrainer.active) {
      stopBtn.textContent = "停止训练";
    } else {
      stopBtn.textContent = "停止";
    }
    stopBtn.disabled = diagnosisActive;
  }
}

function generateBpmSteps() {
  const start = Number(tempoStartBpm.value);
  const end = Number(tempoEndBpm.value);
  const step = Number(tempoStepBpm.value);
  const roundsPerBpm = Number(tempoRoundsPerBpm.value);
  const pauseMs = Number(tempoPauseMs.value);

  if (start <= 0 || end <= 0 || step <= 0) {
    alert("请输入有效的BPM数值");
    return;
  }

  if (start > end) {
    alert("起始BPM不能大于结束BPM");
    return;
  }

  const steps = [];
  for (let bpm = start; bpm <= end; bpm += step) {
    steps.push(bpm);
  }

  if (steps.length === 0) {
    alert("无法生成有效的BPM阶梯");
    return;
  }

  if (steps[steps.length - 1] !== end && (end - steps[steps.length - 1]) < step) {
    steps.push(end);
  }

  tempoTrainer.bpmSteps = steps;
  tempoTrainer.roundsPerBpm = roundsPerBpm;
  tempoTrainer.pauseBetweenRounds = pauseMs;
  tempoTrainer.totalRounds = steps.length * roundsPerBpm;

  renderTempoStepsPreview();
  tempoGenerateBtn.textContent = `✓ 已生成 ${steps.length} 个速度，共 ${tempoTrainer.totalRounds} 轮`;
  tempoGenerateBtn.disabled = true;
  updatePlayButtonsState();
}

function renderTempoStepsPreview() {
  if (tempoTrainer.bpmSteps.length === 0) {
    tempoStepsPreview.innerHTML = '<span style="color: var(--muted); font-size: 13px;">点击"生成BPM阶梯"按钮预览训练计划</span>';
    return;
  }

  const html = tempoTrainer.bpmSteps.map((bpm, index) => {
    const statusClass = index < tempoTrainer.currentBpmIndex ? 'completed' :
                       (index === tempoTrainer.currentBpmIndex && tempoTrainer.active ? 'active' : '');
    return `<span class="tempo-step-badge ${statusClass}" data-bpm-index="${index}">
              ${bpm} BPM
              <span class="step-rounds">×${tempoTrainer.roundsPerBpm}</span>
            </span>`;
  }).join('');

  tempoStepsPreview.innerHTML = html;
}

function updateTempoStatusDisplay() {
  const totalRounds = tempoTrainer.totalRounds;
  const currentRound = tempoTrainer.currentRound;
  const currentBpm = tempoTrainer.bpmSteps[tempoTrainer.currentBpmIndex] || 0;
  const beatsRemaining = tempoTrainer.beatsRemaining;
  const progress = totalRounds > 0 ? Math.round((currentRound / totalRounds) * 100) : 0;

  tempoRoundValue.textContent = `${currentRound} / ${totalRounds}`;
  tempoBpmValue.textContent = `${currentBpm} BPM`;
  tempoBeatsValue.textContent = beatsRemaining;

  tempoProgressFill.style.width = `${progress}%`;
  tempoProgressText.textContent = `${progress}%`;

  tempoStateValue.textContent = tempoTrainer.completed ? '训练完成' :
                                 tempoTrainer.pausing ? '轮间停顿' :
                                 tempoTrainer.active ? '训练进行中' : '准备就绪';

  tempoStateValue.className = 'tempo-status-value ' +
    (tempoTrainer.completed ? 'completed' :
     tempoTrainer.pausing ? 'pausing' : '');

  renderTempoStepsPreview();
}

function getTempoTrainerRange(section) {
  const sec = section || getCurrentSection();
  if (!sec) return [0, steps - 1];
  if (tempoTrainer.originalLoop === "") return [0, steps - 1];
  const start = Number(tempoTrainer.originalLoop) * 4;
  return [start, start + 3];
}

function getTempoTrainerBeatsPerRound() {
  const [start, end] = getTempoTrainerRange();
  return end - start + 1;
}

function startTempoTrainer() {
  if (tempoTrainer.active) {
    alert("变速训练已经在进行中。");
    return;
  }

  if (diagnosisActive) {
    alert("诊断练习进行中，请先结束诊断练习。");
    return;
  }

  if (tempoTrainer.bpmSteps.length === 0) {
    alert("请先生成BPM阶梯。");
    return;
  }

  const section = getCurrentSection();
  if (!section) return;

  if (tempoTrainer.pauseTimer) {
    clearTimeout(tempoTrainer.pauseTimer);
    tempoTrainer.pauseTimer = null;
  }

  tempoTrainer.originalBpm = section.bpm;
  tempoTrainer.originalLoop = section.loop;
  tempoTrainer.active = true;
  tempoTrainer.completed = false;
  tempoTrainer.currentRound = 0;
  tempoTrainer.currentBpmIndex = 0;
  tempoTrainer.currentSubRound = 0;
  tempoTrainer.pausing = false;
  tempoTrainer.totalBeatsPerRound = getTempoTrainerBeatsPerRound();
  tempoTrainer.beatsRemaining = tempoTrainer.totalBeatsPerRound;

  section.bpm = tempoTrainer.bpmSteps[0];
  bpmInput.value = section.bpm;

  if (timer) clearInterval(timer);

  const [start, end] = getTempoTrainerRange(section);
  playhead = start;

  state.playCount = (state.playCount || 0) + 1;
  state.lastPlayedAt = new Date().toISOString();
  state.recentPlayedSection = `变速训练: ${tempoTrainer.bpmSteps[0]}-${tempoTrainer.bpmSteps[tempoTrainer.bpmSteps.length - 1]}BPM`;

  save();

  tempoStatus.style.display = "block";
  tempoTrainerSection.querySelector('.tempo-setup').classList.add('disabled');
  tempoTrainerToggle.disabled = true;
  loopSelect.disabled = true;

  updateTempoStatusDisplay();
  updatePlayButtonsState();

  currentRehearsalId = crypto.randomUUID();
  currentRehearsalStartTime = Date.now();
  const activeVoices = instruments
    .filter((_, idx) => section.enabledInstruments[idx])
    .map((i) => i.name);
  const loopLabel = tempoTrainer.originalLoop === "" ? "全段" : `第${Number(tempoTrainer.originalLoop) + 1}小节`;
  rehearsalLog.unshift({
    id: currentRehearsalId,
    timestamp: new Date().toISOString(),
    sectionId: section.id,
    sectionName: section.name,
    pieceName: state.pieceName,
    bpm: section.bpm,
    loop: tempoTrainer.originalLoop,
    loopLabel,
    enabledInstruments: [...section.enabledInstruments],
    activeVoices,
    pausePosition: null,
    pauseLabel: "变速训练中…",
    durationMs: null,
    snapshot: {
      sections: deepCloneSections(state.sections),
      currentSectionId: state.currentSectionId,
      pieceName: state.pieceName,
      continuousPlay: state.continuousPlay
    }
  });
  if (rehearsalLog.length > MAX_REHEARSAL_LOG) {
    rehearsalLog = rehearsalLog.slice(0, MAX_REHEARSAL_LOG);
  }
  saveRehearsalLog();

  renderDashboard();
  renderRehearsalTimeline();

  tempoTrainerTick();
  timer = setInterval(tempoTrainerTick, 60000 / section.bpm);
}

function tempoTrainerTick() {
  const section = getCurrentSection();
  if (!section) return;

  const [start, end] = getTempoTrainerRange(section);
  if (playhead < start || playhead > end) playhead = start;

  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });

  tempoTrainer.beatsRemaining--;
  updateTempoStatusDisplay();

  if (playhead >= end) {
    tempoTrainer.currentSubRound++;

    tempoTrainer.currentRound++;
    tempoTrainer.beatsRemaining = tempoTrainer.totalBeatsPerRound;

    if (tempoTrainer.currentSubRound >= tempoTrainer.roundsPerBpm) {
      tempoTrainer.currentBpmIndex++;
      tempoTrainer.currentSubRound = 0;

      if (tempoTrainer.currentBpmIndex >= tempoTrainer.bpmSteps.length) {
        finishTempoTrainer();
        return;
      }

      const nextBpm = tempoTrainer.bpmSteps[tempoTrainer.currentBpmIndex];
      section.bpm = nextBpm;
      bpmInput.value = nextBpm;
      save();
    }

    if (tempoTrainer.pauseBetweenRounds > 0) {
      clearInterval(timer);
      timer = null;
      tempoTrainer.pausing = true;
      updateTempoStatusDisplay();

      tempoTrainer.pauseTimer = setTimeout(() => {
        tempoTrainer.pausing = false;
        playhead = start;
        updateTempoStatusDisplay();
        timer = setInterval(tempoTrainerTick, 60000 / section.bpm);
        tempoTrainerTick();
      }, tempoTrainer.pauseBetweenRounds);
      return;
    }

    playhead = start;
  } else {
    playhead = playhead + 1;
  }
}

function stopTempoTrainer() {
  if (!tempoTrainer.active) return;

  if (tempoTrainer.pauseTimer) {
    clearTimeout(tempoTrainer.pauseTimer);
    tempoTrainer.pauseTimer = null;
  }

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));

  const section = getCurrentSection();
  if (section) {
    section.bpm = tempoTrainer.originalBpm;
    section.loop = tempoTrainer.originalLoop;
    bpmInput.value = section.bpm;
    loopSelect.value = section.loop;
    save();
  }

  if (currentRehearsalId) {
    const entry = rehearsalLog.find((r) => r.id === currentRehearsalId);
    if (entry) {
      entry.durationMs = currentRehearsalStartTime ? Date.now() - currentRehearsalStartTime : null;
      entry.pausePosition = null;
      entry.pauseLabel = tempoTrainer.completed ? "变速训练完成" : "变速训练已停止";
      if (entry.snapshot) {
        entry.snapshot.currentSectionId = state.currentSectionId;
      }
      saveRehearsalLog();
    }
    currentRehearsalId = null;
    currentRehearsalStartTime = null;
  }

  tempoTrainer.active = false;
  tempoTrainer.pausing = false;

  if (!tempoTrainer.completed) {
    tempoStatus.style.display = "none";
  }
  tempoTrainerSection.querySelector('.tempo-setup').classList.remove('disabled');
  tempoTrainerToggle.disabled = false;
  loopSelect.disabled = false;
  tempoGenerateBtn.disabled = false;
  tempoGenerateBtn.textContent = '🎯 生成BPM阶梯';

  playhead = 0;

  updateTempoStatusDisplay();
  updatePlayButtonsState();
  renderDashboard();
  renderRehearsalTimeline();
  render();
}

function finishTempoTrainer() {
  tempoTrainer.completed = true;
  tempoTrainer.currentRound = tempoTrainer.totalRounds;
  tempoTrainer.beatsRemaining = 0;
  updateTempoStatusDisplay();
  stopTempoTrainer();
  alert("🎉 恭喜！变速训练已完成！");
}

function resetTempoTrainer() {
  if (tempoTrainer.active) {
    stopTempoTrainer();
  }

  tempoTrainer.bpmSteps = [];
  tempoTrainer.currentRound = 0;
  tempoTrainer.totalRounds = 0;
  tempoTrainer.currentBpmIndex = 0;
  tempoTrainer.currentSubRound = 0;
  tempoTrainer.completed = false;
  tempoTrainer.beatsRemaining = 0;

  tempoStatus.style.display = "none";

  tempoGenerateBtn.disabled = false;
  tempoGenerateBtn.textContent = '🎯 生成BPM阶梯';
  renderTempoStepsPreview();
  updatePlayButtonsState();
}

function toggleTempoTrainer() {
  const enabled = tempoTrainerToggle.checked;
  tempoTrainer.enabled = enabled;

  if (enabled) {
    if (diagnosisActive) {
      alert("诊断练习进行中，请先结束诊断练习。");
      tempoTrainerToggle.checked = false;
      tempoTrainer.enabled = false;
      return;
    }
    tempoTrainerSection.classList.remove('disabled');
    tempoStatus.style.display = "none";
    renderTempoStepsPreview();
    updatePlayButtonsState();
  } else {
    if (tempoTrainer.active) {
      if (!confirm("变速训练正在进行中，确定要关闭吗？")) {
        tempoTrainerToggle.checked = true;
        tempoTrainer.enabled = true;
        return;
      }
      stopTempoTrainer();
    }
    tempoTrainer.completed = false;
    tempoTrainerSection.classList.add('disabled');
    tempoStatus.style.display = "none";
    updatePlayButtonsState();
  }
}

function getDifficultyRatio() {
  const difficulty = diagnosisDifficulty.value;
  switch (difficulty) {
    case "easy": return 0.2;
    case "hard": return 0.6;
    default: return 0.4;
  }
}

function generateHiddenCells() {
  const section = getCurrentSection();
  if (!section) return [];

  const ratio = getDifficultyRatio();
  const candidateSteps = [];

  for (let step = 0; step < steps; step++) {
    const activeRows = [];
    for (let row = 0; row < instruments.length; row++) {
      if (section.pattern[row][step]) {
        activeRows.push(row);
      }
    }

    if (activeRows.length === 0) {
      candidateSteps.push({
        step: step,
        rows: [],
        correctAnswer: -1
      });
    } else if (activeRows.length === 1) {
      candidateSteps.push({
        step: step,
        rows: [activeRows[0]],
        correctAnswer: activeRows[0]
      });
    } else if (activeRows.length > 1) {
      candidateSteps.push({
        step: step,
        rows: activeRows,
        correctAnswer: activeRows
      });
    }
  }

  const totalQuestions = Math.max(3, Math.floor(candidateSteps.length * ratio));
  const shuffled = [...candidateSteps].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(totalQuestions, shuffled.length));

  selected.sort((a, b) => a.step - b.step);

  return selected;
}

function updateDiagnosisInfo() {
  const answered = diagnosisAnswers.length;
  const correct = diagnosisAnswers.filter(a => a.correct).length;
  const total = diagnosisHiddenCells.length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  diagnosisAnswered.textContent = `${answered}/${total}`;
  diagnosisCorrect.textContent = correct;
  diagnosisAccuracy.textContent = answered > 0 ? `${accuracy}%` : "—";
}

function formatAnswerLabel(answer) {
  if (answer === -1) return "休止";
  if (answer === "ensemble") return "合奏";
  if (Array.isArray(answer)) {
    if (answer.length === 0) return "休止";
    if (answer.length === 1) return instruments[answer[0]]?.name || "未知";
    return answer.map(r => instruments[r]?.name).filter(Boolean).join("+");
  }
  return instruments[answer]?.name || "未知";
}

function showDiagnosisFeedback(correct, correctAnswer, userAnswer) {
  diagnosisFeedback.className = "diagnosis-feedback " + (correct ? "correct" : "wrong");
  if (correct) {
    diagnosisFeedback.textContent = "✓ 回答正确！";
  } else {
    const correctName = formatAnswerLabel(correctAnswer);
    const userName = formatAnswerLabel(userAnswer);
    diagnosisFeedback.innerHTML = `✗ 回答错误！正确答案：<strong>${correctName}</strong>，你的答案：<strong>${userName}</strong>`;
  }
}

function clearDiagnosisFeedback() {
  diagnosisFeedback.className = "diagnosis-feedback";
  diagnosisFeedback.textContent = "";
}

function enableAnswerButtons(enabled) {
  const buttons = diagnosisAnswerButtons.querySelectorAll(".diagnosis-answer-btn");
  buttons.forEach(btn => {
    btn.disabled = !enabled;
    btn.classList.remove("correct", "wrong");
  });
}

function getCurrentQuestion() {
  if (diagnosisCurrentStep < 0 || diagnosisCurrentStep >= diagnosisHiddenCells.length) {
    return null;
  }
  return diagnosisHiddenCells[diagnosisCurrentStep];
}

function isAnswerCorrect(userAnswer, correctAnswer) {
  if (Array.isArray(correctAnswer)) {
    if (correctAnswer.length === 0) {
      return userAnswer === -1;
    }
    if (correctAnswer.length === 1) {
      return userAnswer === correctAnswer[0];
    }
    return userAnswer === "ensemble";
  }
  return userAnswer === correctAnswer;
}

function getPrimaryCorrectAnswer(correctAnswer) {
  if (Array.isArray(correctAnswer)) {
    if (correctAnswer.length === 0) return -1;
    if (correctAnswer.length === 1) return correctAnswer[0];
    return "ensemble";
  }
  return correctAnswer;
}

function answerDiagnosis(answerIndexRaw) {
  if (!diagnosisWaitingForAnswer || !diagnosisActive) return;

  const question = getCurrentQuestion();
  if (!question) return;

  const section = getCurrentSection();
  if (!section) return;

  let userAnswer;
  if (answerIndexRaw === "ensemble") {
    userAnswer = "ensemble";
  } else {
    userAnswer = Number(answerIndexRaw);
  }

  const correctAnswer = question.correctAnswer;
  const isCorrect = isAnswerCorrect(userAnswer, correctAnswer);
  const primaryCorrect = getPrimaryCorrectAnswer(correctAnswer);

  const buttons = diagnosisAnswerButtons.querySelectorAll(".diagnosis-answer-btn");
  buttons.forEach(btn => {
    const btnAnswerRaw = btn.dataset.answer;
    const btnAnswer = btnAnswerRaw === "ensemble" ? "ensemble" : Number(btnAnswerRaw);
    if (btnAnswer === primaryCorrect) {
      btn.classList.add("correct");
    }
    if (btnAnswer === userAnswer && !isCorrect) {
      btn.classList.add("wrong");
    }
  });

  enableAnswerButtons(false);
  showDiagnosisFeedback(isCorrect, correctAnswer, userAnswer);

  diagnosisAnswers.push({
    step: question.step,
    rows: question.rows,
    userAnswer: userAnswer,
    correctAnswer: correctAnswer,
    correct: isCorrect,
    beatLabel: beatLabel(question.step)
  });

  if (!isCorrect) {
    diagnosisStats.wrongPositions.push({
      step: question.step,
      beatLabel: beatLabel(question.step),
      rows: question.rows,
      correctAnswer: correctAnswer,
      userAnswer: userAnswer
    });

    const correctInstrs = Array.isArray(correctAnswer)
      ? correctAnswer
      : (correctAnswer === -1 ? [] : (typeof correctAnswer === "number" ? [correctAnswer] : []));
    let userInstrs;
    if (userAnswer === "ensemble") {
      userInstrs = correctInstrs.length > 0
        ? instruments.map((_, i) => i).filter(i => !correctInstrs.includes(i))
        : [];
    } else if (userAnswer === -1) {
      userInstrs = [];
    } else if (typeof userAnswer === "number") {
      userInstrs = [userAnswer];
    } else {
      userInstrs = [];
    }

    if (correctInstrs.length === 0 && userInstrs.length > 0) {
      const key = "rest-" + userInstrs[0];
      if (!diagnosisStats.confusedInstruments[key]) {
        diagnosisStats.confusedInstruments[key] = {
          type: "rest-vs-instr",
          instr1: -1,
          instr2: userInstrs[0],
          label: `休止 ↔ ${instruments[userInstrs[0]]?.name}`,
          count: 0
        };
      }
      diagnosisStats.confusedInstruments[key].count++;
    } else if (correctInstrs.length > 0 && userInstrs.length === 0) {
      const key = "rest-" + correctInstrs[0];
      if (!diagnosisStats.confusedInstruments[key]) {
        diagnosisStats.confusedInstruments[key] = {
          type: "rest-vs-instr",
          instr1: -1,
          instr2: correctInstrs[0],
          label: `休止 ↔ ${instruments[correctInstrs[0]]?.name}`,
          count: 0
        };
      }
      diagnosisStats.confusedInstruments[key].count++;
    } else if (correctInstrs.length > 1 && typeof userAnswer === "number" && userAnswer >= 0) {
      correctInstrs.forEach(ci => {
        if (ci !== userAnswer) {
          const key = `${Math.min(ci, userAnswer)}-${Math.max(ci, userAnswer)}`;
          if (!diagnosisStats.confusedInstruments[key]) {
            diagnosisStats.confusedInstruments[key] = {
              type: "instr-vs-instr",
              instr1: Math.min(ci, userAnswer),
              instr2: Math.max(ci, userAnswer),
              label: `${instruments[Math.min(ci, userAnswer)]?.name} ↔ ${instruments[Math.max(ci, userAnswer)]?.name}`,
              count: 0
            };
          }
          diagnosisStats.confusedInstruments[key].count++;
        }
      });
    } else {
      correctInstrs.forEach(ci => {
        userInstrs.forEach(ui => {
          if (ci !== ui) {
            const key = `${Math.min(ci, ui)}-${Math.max(ci, ui)}`;
            if (!diagnosisStats.confusedInstruments[key]) {
              diagnosisStats.confusedInstruments[key] = {
                type: "instr-vs-instr",
                instr1: Math.min(ci, ui),
                instr2: Math.max(ci, ui),
                label: `${instruments[Math.min(ci, ui)]?.name} ↔ ${instruments[Math.max(ci, ui)]?.name}`,
                count: 0
              };
            }
            diagnosisStats.confusedInstruments[key].count++;
          }
        });
      });
    }
  }

  diagnosisStats.total = diagnosisAnswers.length;
  diagnosisStats.correct = diagnosisAnswers.filter(a => a.correct).length;
  diagnosisStats.wrong = diagnosisAnswers.filter(a => !a.correct).length;

  updateDiagnosisInfo();
  renderGrid();

  diagnosisWaitingForAnswer = false;

  setTimeout(() => {
    if (diagnosisActive) {
      diagnosisCurrentStep++;
      if (diagnosisCurrentStep < diagnosisHiddenCells.length) {
        clearDiagnosisFeedback();
        enableAnswerButtons(true);
        continueDiagnosisPlayback();
      } else {
        finishDiagnosis();
      }
    }
  }, 1200);
}

function continueDiagnosisPlayback() {
  if (!diagnosisActive || !diagnosisPaused) return;

  diagnosisPaused = false;
  diagnosisStatus.textContent = "播放中...";

  const section = getCurrentSection();
  if (!section) return;

  const bpm = section.bpm;
  diagnosisTimer = setInterval(diagnosisTick, 60000 / bpm);
}

function diagnosisTick() {
  const section = getCurrentSection();
  if (!section) return;

  const diagnosisStart = 0;
  const diagnosisEnd = steps - 1;
  if (playhead < diagnosisStart || playhead > diagnosisEnd) playhead = diagnosisStart;

  const nextQuestion = diagnosisHiddenCells[diagnosisCurrentStep];

  if (nextQuestion && playhead === nextQuestion.step) {
    clearInterval(diagnosisTimer);
    diagnosisTimer = null;
    diagnosisPaused = true;
    diagnosisWaitingForAnswer = true;
    diagnosisStatus.textContent = "请作答...";
    diagnosisAnswerPanel.style.display = "block";
    clearDiagnosisFeedback();
    enableAnswerButtons(true);

    highlight(playhead);
    instruments.forEach((instrument, rowIndex) => {
      if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
        playSound(instrument);
      }
    });

    return;
  }

  highlight(playhead);
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument);
    }
  });

  if (playhead >= diagnosisEnd) {
    if (nextQuestion && diagnosisCurrentStep < diagnosisHiddenCells.length) {
      playhead = diagnosisStart;
    } else {
      finishDiagnosis();
      return;
    }
  } else {
    playhead = playhead + 1;
  }
}

function startDiagnosis() {
  if (tempoTrainer.enabled || tempoTrainer.active) {
    alert("变速训练已启用，请先关闭变速训练再使用诊断模式。");
    return;
  }

  const section = getCurrentSection();
  if (!section) {
    alert("请先选择一个段落。");
    return;
  }

  if (timer) {
    stopPlayback();
  }

  if (currentRehearsalId) {
    stopPlayback();
  }

  if (diagnosisTimer) {
    clearInterval(diagnosisTimer);
    diagnosisTimer = null;
  }

  diagnosisHiddenCells = generateHiddenCells();
  if (diagnosisHiddenCells.length === 0) {
    alert("当前谱面没有足够的内容用于诊断练习，请先填入口令。");
    return;
  }

  diagnosisActive = true;
  diagnosisCurrentStep = 0;
  diagnosisAnswers = [];
  diagnosisStats = {
    total: 0,
    correct: 0,
    wrong: 0,
    wrongPositions: [],
    confusedInstruments: {}
  };
  diagnosisWaitingForAnswer = false;
  diagnosisPaused = false;
  diagnosisStartTime = Date.now();
  playhead = 0;

  diagnosisStartBtn.style.display = "none";
  diagnosisStopBtn.style.display = "inline-block";
  diagnosisDifficulty.disabled = true;
  diagnosisResult.style.display = "none";
  diagnosisAnswerPanel.style.display = "none";
  diagnosisStatus.textContent = "准备开始...";

  updatePlayButtonsState();
  updateDiagnosisInfo();
  renderGrid();

  setTimeout(() => {
    if (diagnosisActive) {
      diagnosisStatus.textContent = "播放中...";
      const bpm = section.bpm;
      diagnosisTimer = setInterval(diagnosisTick, 60000 / bpm);
      diagnosisTick();
    }
  }, 500);
}

function stopDiagnosis() {
  if (diagnosisTimer) {
    clearInterval(diagnosisTimer);
    diagnosisTimer = null;
  }

  diagnosisActive = false;
  diagnosisPaused = false;
  diagnosisWaitingForAnswer = false;

  diagnosisStartBtn.style.display = "inline-block";
  diagnosisStopBtn.style.display = "none";
  diagnosisDifficulty.disabled = false;
  diagnosisAnswerPanel.style.display = "none";
  diagnosisStatus.textContent = "已结束";

  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));

  updatePlayButtonsState();
  renderGrid();

  if (diagnosisAnswers.length > 0) {
    const result = buildDiagnosisResultData();
    saveDiagnosisResult(result);
    showDiagnosisResult();
  }
}

function finishDiagnosis() {
  stopDiagnosis();
}

function buildDiagnosisResultData() {
  return {
    timestamp: new Date().toISOString(),
    sectionName: getCurrentSection()?.name || "",
    pieceName: state.pieceName,
    bpm: getCurrentSection()?.bpm || 96,
    difficulty: diagnosisDifficulty.value,
    totalQuestions: diagnosisHiddenCells.length,
    answered: diagnosisAnswers.length,
    correct: diagnosisStats.correct,
    wrong: diagnosisStats.wrong,
    accuracy: diagnosisAnswers.length > 0
      ? Math.round((diagnosisStats.correct / diagnosisAnswers.length) * 100)
      : 0,
    wrongPositions: [...diagnosisStats.wrongPositions],
    confusedInstruments: Object.values(diagnosisStats.confusedInstruments).sort((a, b) => b.count - a.count),
    durationMs: diagnosisStartTime ? Date.now() - diagnosisStartTime : null
  };
}

function showDiagnosisResult() {
  const total = diagnosisAnswers.length;
  const correct = diagnosisStats.correct;
  const wrong = diagnosisStats.wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  resultAccuracy.textContent = `${accuracy}%`;
  resultTotal.textContent = total;
  resultCorrect.textContent = correct;
  resultWrong.textContent = wrong;

  if (diagnosisStats.wrongPositions.length > 0) {
    wrongPositionsEl.innerHTML = diagnosisStats.wrongPositions.map(pos => `
      <span class="wrong-position-item">
        <span class="wrong-beat">${pos.beatLabel}</span>
        <span class="wrong-instrument">
          答：${formatAnswerLabel(pos.userAnswer)}
          → 正确：${formatAnswerLabel(pos.correctAnswer)}
        </span>
      </span>
    `).join("");
  } else {
    wrongPositionsEl.innerHTML = '<span class="diagnosis-empty">全部正确，没有错拍！🎉</span>';
  }

  const confusedList = Object.values(diagnosisStats.confusedInstruments).sort((a, b) => b.count - a.count);
  if (confusedList.length > 0) {
    confusedInstrumentsEl.innerHTML = confusedList.map(item => {
      const name1 = item.instr1 === -1 ? "休止" : (instruments[item.instr1]?.name || "未知");
      const name2 = item.instr2 === -1 ? "休止" : (instruments[item.instr2]?.name || "未知");
      return `
        <span class="confused-item">
          ${name1} ↔ ${name2}
          <span class="confused-count">${item.count}次</span>
        </span>
      `;
    }).join("");
  } else {
    confusedInstrumentsEl.innerHTML = '<span class="diagnosis-empty">暂无混淆记录</span>';
  }

  diagnosisResult.style.display = "block";
}

function showLastDiagnosisResult() {
  if (!lastDiagnosisResult) return;

  resultAccuracy.textContent = `${lastDiagnosisResult.accuracy}%`;
  resultTotal.textContent = lastDiagnosisResult.answered;
  resultCorrect.textContent = lastDiagnosisResult.correct;
  resultWrong.textContent = lastDiagnosisResult.wrong;

  if (lastDiagnosisResult.wrongPositions && lastDiagnosisResult.wrongPositions.length > 0) {
    wrongPositionsEl.innerHTML = lastDiagnosisResult.wrongPositions.map(pos => `
      <span class="wrong-position-item">
        <span class="wrong-beat">${pos.beatLabel}</span>
        <span class="wrong-instrument">
          答：${formatAnswerLabel(pos.userAnswer)}
          → 正确：${formatAnswerLabel(pos.correctAnswer)}
        </span>
      </span>
    `).join("");
  } else {
    wrongPositionsEl.innerHTML = '<span class="diagnosis-empty">全部正确，没有错拍！🎉</span>';
  }

  if (lastDiagnosisResult.confusedInstruments && lastDiagnosisResult.confusedInstruments.length > 0) {
    confusedInstrumentsEl.innerHTML = lastDiagnosisResult.confusedInstruments.map(item => {
      let label;
      if (item.label) {
        label = item.label;
      } else {
        const name1 = item.instr1 === -1 ? "休止" : (instruments[item.instr1]?.name || "未知");
        const name2 = item.instr2 === -1 ? "休止" : (instruments[item.instr2]?.name || "未知");
        label = `${name1} ↔ ${name2}`;
      }
      return `
        <span class="confused-item">
          ${label}
          <span class="confused-count">${item.count}次</span>
        </span>
      `;
    }).join("");
  } else {
    confusedInstrumentsEl.innerHTML = '<span class="diagnosis-empty">暂无混淆记录</span>';
  }

  diagnosisResult.style.display = "block";
  diagnosisStatus.textContent = lastDiagnosisResult.timestamp
    ? `上次：${new Date(lastDiagnosisResult.timestamp).toLocaleString("zh-CN")}`
    : "上次结果";
}

function toggleDiagnosisMode() {
  if (!diagnosisMode && tempoTrainer.enabled) {
    alert("变速训练已启用，请先关闭变速训练再使用诊断模式。");
    return;
  }

  diagnosisMode = !diagnosisMode;

  if (diagnosisMode) {
    diagnosisPanel.style.display = "block";
    diagnosisToggleBtn.classList.add("active");
    diagnosisStartBtn.style.display = "inline-block";
    diagnosisStopBtn.style.display = "none";
    diagnosisDifficulty.disabled = false;
    diagnosisAnswerPanel.style.display = "none";
    diagnosisResult.style.display = "none";
    diagnosisStatus.textContent = "准备就绪";
    diagnosisAnswered.textContent = "0";
    diagnosisCorrect.textContent = "0";
    diagnosisAccuracy.textContent = "—";

    if (lastDiagnosisResult) {
      showLastDiagnosisResult();
    }

    updatePlayButtonsState();
    renderGrid();
  } else {
    if (diagnosisActive) {
      if (!confirm("诊断练习正在进行中，确定要关闭吗？")) {
        diagnosisMode = true;
        return;
      }
      stopDiagnosis();
    }

    diagnosisHiddenCells = [];
    diagnosisAnswers = [];
    diagnosisCurrentStep = -1;
    diagnosisStats = {
      total: 0,
      correct: 0,
      wrong: 0,
      wrongPositions: [],
      confusedInstruments: {}
    };

    diagnosisPanel.style.display = "none";
    diagnosisToggleBtn.classList.remove("active");
    updatePlayButtonsState();
    renderGrid();
  }
}

diagnosisToggleBtn.addEventListener("click", toggleDiagnosisMode);

diagnosisStartBtn.addEventListener("click", startDiagnosis);

diagnosisStopBtn.addEventListener("click", () => {
  if (confirm("确定要结束诊断练习吗？")) {
    stopDiagnosis();
  }
});

diagnosisCloseBtn.addEventListener("click", () => {
  toggleDiagnosisMode();
});

diagnosisAnswerButtons.addEventListener("click", (event) => {
  const btn = event.target.closest(".diagnosis-answer-btn");
  if (!btn || btn.disabled) return;
  const raw = btn.dataset.answer;
  const answer = raw === "ensemble" ? "ensemble" : Number(raw);
  answerDiagnosis(answer);
});

loadLastDiagnosisResult();

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
  if (rehearsalLog.length > 0) {
    renderRehearsalTimeline();
  }
}, 30000);
