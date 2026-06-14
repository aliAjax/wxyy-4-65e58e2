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

const collabFilters = {
  type: "all",
  status: "all",
  assignee: "all",
  priority: "all",
  sort: "newest"
};

const PRIORITY_LEVELS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

const PRIORITY_LABELS = {
  high: "高优先",
  medium: "中优先",
  low: "低优先"
};

const PRIORITY_ICONS = {
  high: "🔴",
  medium: "🟡",
  low: "🟢"
};

const ASSIGNEES = [
  { value: "teacher1", label: "张老师" },
  { value: "teacher2", label: "李老师" },
  { value: "student1", label: "学生甲" },
  { value: "student2", label: "学生乙" },
  { value: "student3", label: "学生丙" },
  { value: "other", label: "其他" }
];

function createDefaultMixConfig() {
  return {
    volume: [100, 100, 100, 100],
    timbre: [100, 100, 100, 100],
    accent: [false, false, false, false]
  };
}

function deepCloneMixConfig(mix) {
  if (!mix) return createDefaultMixConfig();
  return {
    volume: Array.isArray(mix.volume) ? [...mix.volume] : [100, 100, 100, 100],
    timbre: Array.isArray(mix.timbre) ? [...mix.timbre] : [100, 100, 100, 100],
    accent: Array.isArray(mix.accent) ? [...mix.accent] : [false, false, false, false]
  };
}

function deepCloneSection(section) {
  if (!section) return null;
  return {
    id: section.id,
    name: section.name,
    bpm: section.bpm,
    loop: section.loop,
    notes: Array.isArray(section.notes) ? [...section.notes] : [],
    collabNotes: Array.isArray(section.collabNotes)
      ? section.collabNotes.map(n => ({ ...n }))
      : [],
    pattern: Array.isArray(section.pattern)
      ? section.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
      : instruments.map(() => Array(steps).fill("")),
    enabledInstruments: Array.isArray(section.enabledInstruments)
      ? [...section.enabledInstruments]
      : [true, true, true, true],
    mixConfig: deepCloneMixConfig(section.mixConfig),
    measureRange: section.measureRange ? { ...section.measureRange } : null
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
      : null,
    mixConfig: deepCloneMixConfig(item.mixConfig)
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
    collabNotes: [],
    pattern: instruments.map((instrument) =>
      Array.from({ length: steps }, (_, index) =>
        index % 4 === 0 ? instrument.token : ""
      )
    ),
    enabledInstruments: [true, true, true, true],
    mixConfig: createDefaultMixConfig(),
    measureRange: null
  };
}

function createEmptySection(name = "段落 1") {
  return {
    id: crypto.randomUUID(),
    name,
    bpm: 96,
    loop: "",
    notes: [],
    collabNotes: [],
    pattern: instruments.map(() => Array.from({ length: steps }, () => "")),
    enabledInstruments: [true, true, true, true],
    mixConfig: createDefaultMixConfig(),
    measureRange: null
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

function parseMeasureFromNote(content) {
  const match = content.match(/第\s*([一二三四\d]+)\s*小节/);
  if (!match) return null;
  const numStr = match[1];
  if (["一", "二", "三", "四"].includes(numStr)) {
    return ["一", "二", "三", "四"].indexOf(numStr);
  }
  const num = parseInt(numStr);
  if (!isNaN(num) && num >= 1 && num <= 4) {
    return num - 1;
  }
  return null;
}

function migrateNotesToCollabNotes(section) {
  if (!section) return;
  if (!Array.isArray(section.notes) || section.notes.length === 0) {
    if (!Array.isArray(section.collabNotes)) {
      section.collabNotes = [];
    }
    return;
  }
  if (!Array.isArray(section.collabNotes)) {
    section.collabNotes = [];
  }
  const existingContents = new Set(section.collabNotes.map(n => n.content));
  const now = new Date().toISOString();
  section.notes.forEach((noteContent, index) => {
    if (!noteContent || typeof noteContent !== "string") return;
    if (existingContents.has(noteContent)) return;
    const measure = parseMeasureFromNote(noteContent);
    section.collabNotes.push({
      id: crypto.randomUUID(),
      type: "teacher",
      content: noteContent,
      target: measure !== null ? measure : "all",
      resolved: false,
      assignee: "teacher1",
      priority: PRIORITY_LEVELS.MEDIUM,
      practiceGoal: 0,
      completionNote: "",
      createdAt: now,
      updatedAt: now,
      _migrated: true,
      _taskMigrated: true
    });
    existingContents.add(noteContent);
  });
}

function migrateCollabNoteToTaskFormat(note) {
  if (!note || typeof note !== "object") return note;
  if (note._taskMigrated) return note;
  const defaultAssignee = note.type === "teacher" ? "teacher1" : "student1";
  return {
    ...note,
    assignee: note.assignee || defaultAssignee,
    priority: note.priority || PRIORITY_LEVELS.MEDIUM,
    practiceGoal: typeof note.practiceGoal === "number" ? note.practiceGoal : 0,
    completionNote: note.completionNote || "",
    _taskMigrated: true
  };
}

function migrateAllCollabNotesToTasks(section) {
  if (!section || !Array.isArray(section.collabNotes)) return;
  section.collabNotes = section.collabNotes.map(migrateCollabNoteToTaskFormat);
}

function migrateAllSectionsToCollabNotes(state) {
  if (!state || !Array.isArray(state.sections)) return;
  state.sections.forEach(section => {
    migrateNotesToCollabNotes(section);
    migrateAllCollabNotesToTasks(section);
  });
  if (Array.isArray(state.saved)) {
    state.saved.forEach(savedItem => {
      if (Array.isArray(savedItem.sections)) {
        savedItem.sections.forEach(section => {
          migrateNotesToCollabNotes(section);
          migrateAllCollabNotesToTasks(section);
        });
      } else if (savedItem.notes) {
        migrateNotesToCollabNotes(savedItem);
        if (savedItem.collabNotes) {
          migrateAllCollabNotesToTasks(savedItem);
        }
      }
    });
  }
}

function migrateOldFormat(oldState) {
  let result;
  if (oldState.sections && Array.isArray(oldState.sections)) {
    result = {
      pieceName: oldState.pieceName || "出场锣鼓-慢起",
      sections: deepCloneSections(oldState.sections),
      currentSectionId: oldState.currentSectionId || oldState.sections[0]?.id || null,
      continuousPlay: oldState.continuousPlay || false,
      saved: deepCloneSavedList(oldState.saved),
      playCount: oldState.playCount || 0,
      lastPlayedAt: oldState.lastPlayedAt || null,
      recentPlayedSection: oldState.recentPlayedSection || ""
    };
  } else {
    const section = {
      id: crypto.randomUUID(),
      name: oldState.pieceName || "主段落",
      bpm: oldState.bpm || 96,
      loop: oldState.loop || "",
      notes: Array.isArray(oldState.notes) ? [...oldState.notes] : [],
      collabNotes: [],
      pattern: Array.isArray(oldState.pattern)
        ? oldState.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
        : instruments.map((instrument) =>
            Array.from({ length: steps }, (_, index) =>
              index % 4 === 0 ? instrument.token : ""
            )
          ),
      enabledInstruments: Array.isArray(oldState.enabledInstruments)
        ? [...oldState.enabledInstruments]
        : [true, true, true, true],
      mixConfig: deepCloneMixConfig(oldState.mixConfig),
      measureRange: oldState.measureRange ? { ...oldState.measureRange } : null
    };
    result = {
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
  migrateAllSectionsToCollabNotes(result);
  return result;
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
    mixConfig: deepCloneMixConfig(entry.mixConfig),
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
migrateAllSectionsToCollabNotes(state);
save();

let timer = null;
let playhead = 0;
let audioContext = null;
let currentPlaySectionIndex = 0;
let continuousPlaySectionCount = 0;
let currentRehearsalId = null;
let currentRehearsalStartTime = null;
let pendingRehearsalResume = null;

const diagnosisStorageKey = "wxyy-4-diagnosis-result";
const practiceListStorageKey = "wxyy-4-practice-list";
const PRIORITY = { HIGH: "high", MEDIUM: "medium", LOW: "low" };
const CATEGORY_LABELS = {
  completion: "谱面完成度",
  note: "协作批注",
  rehearsal: "排练记录",
  diagnosis: "错拍诊断",
  mute: "静音声部"
};

let practiceTasks = [];
let completedPracticeIds = new Set();
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
const writeModeRadios = document.querySelectorAll('input[name="writeMode"]');
const previewSectionsContainer = document.querySelector("#previewSectionsContainer");
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

const collabNoteInput = document.querySelector("#collabNoteInput");
const collabAddBtn = document.querySelector("#collabAddBtn");
const collabTargetSelect = document.querySelector("#collabTargetSelect");
const collabAssigneeSelect = document.querySelector("#collabAssigneeSelect");
const collabPrioritySelect = document.querySelector("#collabPrioritySelect");
const collabPracticeGoal = document.querySelector("#collabPracticeGoal");
const collabNotesList = document.querySelector("#collabNotesList");
const teacherCountEl = document.querySelector("#teacherCount");
const studentCountEl = document.querySelector("#studentCount");
const pendingCountEl = document.querySelector("#pendingCount");
const resolvedCountEl = document.querySelector("#resolvedCount");
const collabTypeBtns = document.querySelectorAll(".collab-type-btn");
const filterTypeBtns = document.querySelectorAll("[data-filter-type]");
const filterStatusBtns = document.querySelectorAll("[data-filter-status]");
const filterAssigneeBtns = document.querySelectorAll("[data-filter-assignee]");
const filterPriorityBtns = document.querySelectorAll("[data-filter-priority]");
const sortBtns = document.querySelectorAll("[data-sort]");

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

const SCHEMA_VERSION = 4;
const SUPPORTED_VERSIONS = [1, 2, 3, 4];

let parsedPattern = null;
let editingSectionId = null;
let parsedSchemeData = null;
let parsedSchemeIsImportToList = false;
let parsedSchemeCompatibility = null;
let pendingImportToList = false;
let parsedWriteMode = "merge";

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
      const rangeText = section.measureRange
        ? `${section.measureRange.start}-${section.measureRange.end}小节`
        : "";
      return `
        <div class="section-item ${isActive ? "active" : ""}" data-section-id="${section.id}">
          <span class="section-order">${index + 1}</span>
          <div class="section-info">
            ${isEditing
              ? `<input type="text" class="section-name-input" value="${section.name}" data-section-rename="${section.id}" autofocus>`
              : `<div class="section-name">${section.name}</div>
                 <div class="section-meta">${section.bpm}BPM${rangeText ? ` · ${rangeText}` : ""} · ${noteCount}条批注 · ${filledCount}个口令</div>`
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

  const measureNoteTypes = getMeasureNoteTypes();

  const header = ['<div class="label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    const question = hiddenStepMap[i];
    const answered = answeredStepMap[i];
    const isRestHidden = question && question.rows.length === 0;
    const measure = Math.floor(i / 4);
    const noteTypes = measureNoteTypes[measure];
    let noteClass = "";
    if (noteTypes && noteTypes.types && noteTypes.types.size > 0) {
      if (noteTypes.types.has("teacher") && noteTypes.types.has("student")) {
        noteClass = " has-notes has-both-notes";
      } else if (noteTypes.types.has("teacher")) {
        noteClass = " has-notes has-teacher-notes";
      } else if (noteTypes.types.has("student")) {
        noteClass = " has-notes has-student-notes";
      }
      if (noteTypes.hasHighPriority) {
        noteClass += " has-high-priority";
      }
    }

    let beatClass = "beat-cell" + noteClass;
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
      const measure = Math.floor(step / 4);
      const noteTypes = measureNoteTypes[measure];
      let noteClass = "";
      if (noteTypes && noteTypes.types && noteTypes.types.size > 0 && !diagnosisMode) {
        if (noteTypes.types.has("teacher") && noteTypes.types.has("student")) {
          noteClass = " has-notes has-both-notes";
        } else if (noteTypes.types.has("teacher")) {
          noteClass = " has-notes has-teacher-notes";
        } else if (noteTypes.types.has("student")) {
          noteClass = " has-notes has-student-notes";
        }
        if (noteTypes.hasHighPriority) {
          noteClass += " has-high-priority";
        }
      }

      let cellClass = `cell ${value ? "filled" : ""} ${muted ? "muted" : ""}${noteClass}`;
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

function getCurrentCollabType() {
  const checked = document.querySelector('input[name="collabType"]:checked');
  return checked ? checked.value : "teacher";
}

function createCollabNote(content, type, target, assignee, priority, practiceGoal) {
  const section = getCurrentSection();
  if (!section) return;
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    type: type || "teacher",
    content: content.trim(),
    target: target === "all" ? "all" : Number(target),
    resolved: false,
    assignee: assignee || (type === "teacher" ? "teacher1" : "student1"),
    priority: priority || PRIORITY_LEVELS.MEDIUM,
    practiceGoal: typeof practiceGoal === "number" ? practiceGoal : 0,
    completionNote: "",
    createdAt: now,
    updatedAt: now,
    _taskMigrated: true
  };
  section.collabNotes.unshift(note);
  save();
  renderCollabNotes();
  renderGrid();
  renderDashboard();
}

function updateCollabNote(noteId, updates) {
  const section = getCurrentSection();
  if (!section) return;
  const note = section.collabNotes.find(n => n.id === noteId);
  if (!note) return;
  Object.assign(note, updates);
  note.updatedAt = new Date().toISOString();
  save();
  renderCollabNotes();
  renderGrid();
  renderDashboard();
}

function toggleCollabNoteResolved(noteId) {
  const section = getCurrentSection();
  if (!section) return;
  const note = section.collabNotes.find(n => n.id === noteId);
  if (!note) return;
  note.resolved = !note.resolved;
  note.updatedAt = new Date().toISOString();
  save();
  renderCollabNotes();
  renderGrid();
  renderDashboard();
}

function deleteCollabNote(noteId) {
  const section = getCurrentSection();
  if (!section) return;
  if (!confirm("确定要删除这条批注吗？")) return;
  section.collabNotes = section.collabNotes.filter(n => n.id !== noteId);
  save();
  renderCollabNotes();
  renderGrid();
  renderDashboard();
}

function getFilteredCollabNotes() {
  const section = getCurrentSection();
  if (!section || !Array.isArray(section.collabNotes)) return [];
  let notes = [...section.collabNotes];
  if (collabFilters.type !== "all") {
    notes = notes.filter(n => n.type === collabFilters.type);
  }
  if (collabFilters.status !== "all") {
    notes = notes.filter(n => collabFilters.status === "resolved" ? n.resolved : !n.resolved);
  }
  if (collabFilters.assignee !== "all") {
    notes = notes.filter(n => n.assignee === collabFilters.assignee);
  }
  if (collabFilters.priority !== "all") {
    notes = notes.filter(n => n.priority === collabFilters.priority);
  }
  if (collabFilters.sort === "newest") {
    notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (collabFilters.sort === "priority") {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notes.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else {
    notes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  return notes;
}

function getCollabNotesStats() {
  const section = getCurrentSection();
  if (!section || !Array.isArray(section.collabNotes)) {
    return { teacher: 0, student: 0, pending: 0, resolved: 0, total: 0 };
  }
  const notes = section.collabNotes;
  return {
    teacher: notes.filter(n => n.type === "teacher").length,
    student: notes.filter(n => n.type === "student").length,
    pending: notes.filter(n => !n.resolved).length,
    resolved: notes.filter(n => n.resolved).length,
    total: notes.length
  };
}

function getMeasureNoteTypes() {
  const section = getCurrentSection();
  if (!section || !Array.isArray(section.collabNotes)) return {};
  const measureTypes = {};
  section.collabNotes.forEach(note => {
    if (note.target === "all") {
      for (let i = 0; i < 4; i++) {
        if (!measureTypes[i]) measureTypes[i] = { types: new Set(), hasHighPriority: false };
        measureTypes[i].types.add(note.type);
        if (!note.resolved && note.priority === PRIORITY_LEVELS.HIGH) {
          measureTypes[i].hasHighPriority = true;
        }
      }
    } else {
      if (!measureTypes[note.target]) measureTypes[note.target] = { types: new Set(), hasHighPriority: false };
      measureTypes[note.target].types.add(note.type);
      if (!note.resolved && note.priority === PRIORITY_LEVELS.HIGH) {
        measureTypes[note.target].hasHighPriority = true;
      }
    }
  });
  return measureTypes;
}

function formatCollabTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderCollabStats() {
  const stats = getCollabNotesStats();
  if (teacherCountEl) teacherCountEl.textContent = stats.teacher;
  if (studentCountEl) studentCountEl.textContent = stats.student;
  if (pendingCountEl) pendingCountEl.textContent = stats.pending;
  if (resolvedCountEl) resolvedCountEl.textContent = stats.resolved;
}

function getAssigneeLabel(value) {
  const assignee = ASSIGNEES.find(a => a.value === value);
  return assignee ? assignee.label : value;
}

function renderCollabNotes() {
  const section = getCurrentSection();
  if (!section || !collabNotesList) return;
  renderCollabStats();
  const notes = getFilteredCollabNotes();
  if (notes.length === 0) {
    collabNotesList.innerHTML = `
      <div class="empty-collab-notes">
        暂无任务批注<br>
        在上方添加老师批注或学生反馈任务
      </div>
    `;
    return;
  }
  collabNotesList.innerHTML = notes.map(note => {
    const typeLabel = note.type === "teacher" ? "👨‍🏫 老师" : "👨‍🎓 学生";
    const targetLabel = note.target === "all" ? "全段" : `第${note.target + 1}小节`;
    const statusLabel = note.resolved ? "✅ 已解决" : "⏳ 未解决";
    const typeClass = note.type === "teacher" ? "teacher-note" : "student-note";
    const resolvedClass = note.resolved ? "resolved" : "";
    const targetClass = note.target === "all" ? "target-all" : "target-measure";
    const statusClass = note.resolved ? "status-resolved" : "status-pending";
    const priorityClass = `priority-${note.priority || "medium"}`;
    const priorityLabel = PRIORITY_LABELS[note.priority] || PRIORITY_LABELS.medium;
    const priorityIcon = PRIORITY_ICONS[note.priority] || PRIORITY_ICONS.medium;
    const assigneeLabel = getAssigneeLabel(note.assignee);
    const resolveBtn = note.resolved
      ? `<button type="button" class="collab-action-btn unresolve-btn" data-collab-unresolve="${note.id}" title="标记为未解决">↩</button>`
      : `<button type="button" class="collab-action-btn resolve-btn" data-collab-resolve="${note.id}" title="标记为已解决">✓</button>`;
    
    const practiceGoalText = note.practiceGoal > 0 
      ? `<span class="collab-tag goal-tag">🎯 ${note.practiceGoal}次练习</span>` 
      : "";
    
    const completionNoteText = note.resolved && note.completionNote
      ? `<div class="collab-completion-note"><strong>完成说明：</strong>${note.completionNote}</div>`
      : "";

    return `
      <div class="collab-note ${typeClass} ${resolvedClass} ${priorityClass}" data-collab-id="${note.id}">
        <div class="collab-note-header">
          <div class="collab-note-tags">
            <span class="collab-tag type-${note.type}">${typeLabel}</span>
            <span class="collab-tag ${targetClass}">${targetLabel}</span>
            <span class="collab-tag ${statusClass}">${statusLabel}</span>
            <span class="collab-tag priority-tag">${priorityIcon} ${priorityLabel}</span>
            <span class="collab-tag assignee-tag">👤 ${assigneeLabel}</span>
            ${practiceGoalText}
          </div>
          <div class="collab-note-actions">
            <button type="button" class="collab-action-btn edit-btn" data-collab-edit="${note.id}" title="编辑任务">✎</button>
            ${resolveBtn}
            <button type="button" class="collab-action-btn delete-btn" data-collab-delete="${note.id}" title="删除">✕</button>
          </div>
        </div>
        <div class="collab-note-content">${note.content}</div>
        ${completionNoteText}
        <div class="collab-note-footer">
          <span class="collab-note-time">${formatCollabTime(note.createdAt)}</span>
          ${note.updatedAt !== note.createdAt ? `<span class="collab-note-time">更新于 ${formatCollabTime(note.updatedAt)}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderVoicePanel() {
  const section = getCurrentSection();
  if (!section) return;

  const mixConfig = section.mixConfig || createDefaultMixConfig();
  const allEnabled = section.enabledInstruments.every(Boolean);
  const allMixDefault = mixConfig.volume.every(v => v === 100) &&
                        mixConfig.timbre.every(t => t === 100) &&
                        mixConfig.accent.every(a => !a);

  const voiceToggles = instruments.map((instrument, index) => {
    const enabled = section.enabledInstruments[index];
    const volume = mixConfig.volume[index];
    const timbre = mixConfig.timbre[index];
    const accent = mixConfig.accent[index];
    return `
      <div class="voice-card ${enabled ? "on" : "off"}" data-voice-card="${index}">
        <div class="voice-card-header">
          <label class="voice-main-toggle">
            <input type="checkbox" data-voice="${index}" ${enabled ? "checked" : ""}>
            <span class="voice-indicator"></span>
            <span class="voice-name">${instrument.name}</span>
            <span class="voice-token">${instrument.token}</span>
          </label>
          <button type="button" class="voice-preview-btn" data-voice-preview="${index}" title="试听音色">
            🔊
          </button>
        </div>
        <div class="voice-card-body">
          <div class="voice-control">
            <label class="voice-control-label">
              <span>音量</span>
              <span class="voice-value">${volume}%</span>
            </label>
            <input type="range" class="voice-slider volume-slider" 
                   data-volume="${index}" 
                   min="0" max="150" value="${volume}"
                   ${enabled ? "" : "disabled"}>
          </div>
          <div class="voice-control">
            <label class="voice-control-label">
              <span>音色</span>
              <span class="voice-value">${timbre}%</span>
            </label>
            <input type="range" class="voice-slider timbre-slider" 
                   data-timbre="${index}" 
                   min="20" max="180" value="${timbre}"
                   ${enabled ? "" : "disabled"}>
          </div>
          <div class="voice-control accent-control">
            <label class="voice-control-label">
              <span>重音</span>
            </label>
            <button type="button" class="accent-toggle-btn ${accent ? "on" : ""}" 
                    data-accent="${index}"
                    ${enabled ? "" : "disabled"}>
              ${accent ? "🔴 强" : "⚪ 弱"}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  voicePanel.innerHTML = `
    <div class="voice-header">
      <h2>分声部练习 & 混音控制</h2>
      <div class="voice-header-actions">
        <button type="button" class="voice-reset-btn" data-voice-reset="all" ${allMixDefault ? "disabled" : ""}>
          ↺ 重置混音
        </button>
        <button type="button" class="voice-all-btn" data-voice-all="${allEnabled ? "off" : "on"}">
          ${allEnabled ? "全部静音" : "全部启用"}
        </button>
      </div>
    </div>
    <div class="voice-grid">${voiceToggles}</div>
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

  if (notesList) {
    notesList.innerHTML = section.notes.length ? section.notes.map((note) => `
      <article class="note"><p>${note}</p></article>
    `).join("") : "<p>暂无批注。</p>";
  }

  renderCollabNotes();

  savedList.innerHTML = state.saved.length ? state.saved.map((item) => {
    const sectionCount = item.sectionCount || (item.sections ? item.sections.length : 1);
    const bpm = item.bpm || (item.sections && item.sections[0]?.bpm) || 96;
    const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    return `
    <div class="saved-item">
      <strong>${item.name}</strong><br><span>${sectionCount}个段落 · ${bpm}BPM${dateStr ? " · " + dateStr : ""}</span>
      <div class="saved-item-actions">
        <button type="button" class="saved-action-btn compare-btn" data-compare="${item.id}">对比</button>
        <button type="button" class="saved-action-btn load-btn" data-load="${item.id}">加载</button>
        <button type="button" class="saved-action-btn delete-btn" data-delete-saved="${item.id}">删除</button>
      </div>
    </div>
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
    const oldNotesForMeasure = section.notes.filter((n) =>
      /第\s*([一二三四\d]+)\s*小节/.test(n) &&
      (parseInt(RegExp.$1) === measure + 1 ||
       ["一", "二", "三", "四"][measure] === RegExp.$1)
    );
    const collabNotesForMeasure = Array.isArray(section.collabNotes)
      ? section.collabNotes.filter(n =>
          !n.resolved && (n.target === "all" || n.target === measure)
        )
      : [];
    const allNotesForMeasure = [...oldNotesForMeasure, ...collabNotesForMeasure];
    const instrumentCoverage = section.pattern.filter((row, idx) =>
      section.enabledInstruments[idx] && row.slice(start, start + 4).some(Boolean)
    ).length;
    return {
      measure: measure + 1,
      filled,
      total,
      ratio: total ? filled / total : 0,
      noteCount: allNotesForMeasure.length,
      instrumentCoverage,
      hasNotes: allNotesForMeasure.length > 0
    };
  });
}

function getFocusMeasures() {
  const measures = getMeasureData();
  const difficultyKeywords = /难|易错|注意|重点|慢|加速|易错点|节奏|配合/;
  let scored = measures
    .map((m) => ({
      ...m,
      score: (m.noteCount * 3) + (1 - m.ratio) * 2 + (m.instrumentCoverage >= 3 ? 1 : 0)
    }));

  if (typeof completedPracticeIds !== "undefined" && Array.isArray(practiceTasks)) {
    const completedMeasures = new Set();
    practiceTasks.forEach(task => {
      if (completedPracticeIds.has(task.id) && task.measure != null) {
        completedMeasures.add(task.measure);
      }
    });
    if (completedMeasures.size > 0) {
      scored = scored.map(m => {
        const measureIdx = m.measure - 1;
        if (completedMeasures.has(measureIdx)) {
          return { ...m, score: m.score * 0.3 };
        }
        return m;
      });
    }
  }

  return scored
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
  } else if (section.notes.length > 0 || (Array.isArray(section.collabNotes) && section.collabNotes.length > 0)) {
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
    if (Array.isArray(section.collabNotes)) {
      section.collabNotes.forEach((n) => {
        if (n.target !== "all" && n.target != null) {
          const num = n.target + 1;
          if (!matchedMeasures.includes(num)) matchedMeasures.push(num);
        }
      });
    }
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

  if (typeof completedPracticeIds !== "undefined" && Array.isArray(practiceTasks)) {
    const completedMeasureNums = new Set();
    practiceTasks.forEach(task => {
      if (completedPracticeIds.has(task.id) && task.measure != null) {
        completedMeasureNums.add(task.measure + 1);
      }
    });
    const pendingTaskCount = practiceTasks.filter(t => !completedPracticeIds.has(t.id)).length;
    if (pendingTaskCount > 0) {
      const insertAt = suggestions.length < 3 ? suggestions.length : 1;
      suggestions.splice(insertAt, 0, {
        icon: "✅",
        html: `练习清单中还有 <strong>${pendingTaskCount}</strong> 项待完成任务，完成后可提升排练效率。`
      });
    }
    if (completedMeasureNums.size > 0) {
      for (let i = suggestions.length - 1; i >= 0; i--) {
        const s = suggestions[i];
        for (const num of completedMeasureNums) {
          if (s.html && s.html.includes(`第${num}小节`)) {
            suggestions.splice(i, 1);
            break;
          }
        }
      }
    }
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

  const collabStats = getCollabNotesStats();
  difficultyCount.textContent = collabStats.total;
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

function formatMixConfigSummary(mixConfig, enabledInstruments) {
  if (!mixConfig) return "";
  const details = [];
  instruments.forEach((inst, idx) => {
    if (!enabledInstruments || enabledInstruments[idx]) {
      const vol = mixConfig.volume?.[idx] ?? 100;
      const tim = mixConfig.timbre?.[idx] ?? 100;
      const acc = mixConfig.accent?.[idx] ?? false;
      if (vol !== 100 || tim !== 100 || acc) {
        const parts = [];
        if (vol !== 100) parts.push(`音量${vol}%`);
        if (tim !== 100) parts.push(`音色${tim}%`);
        if (acc) parts.push("重音");
        details.push(`${inst.token}${parts.length ? `(${parts.join(",")})` : ""}`);
      }
    }
  });
  return details.join(" ");
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
    const mixSummary = formatMixConfigSummary(entry.mixConfig, entry.enabledInstruments);
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
          ${mixSummary ? `<span class="rehearsal-tag mix-tag">🎚️ ${mixSummary}</span>` : ""}
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
  renderPracticeList();
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

function parseSinglePattern(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const measureStrs = trimmed.split(/\|\|/).map(s => s.trim()).filter(Boolean);
  if (measureStrs.length === 0) {
    return null;
  }
  if (measureStrs.length > 4) {
    throw new Error(`最多支持 4 小节，当前输入了 ${measureStrs.length} 小节。`);
  }

  const pattern = instruments.map(() => Array(steps).fill(""));
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

function parseSectionHeader(line) {
  const headerRe = /^(?:#{1,3}|={3,}|-{3,})\s*(.+?)\s*(?:={3,}|-{3,})?\s*$/;
  const match = line.trim().match(headerRe);
  if (!match) return null;

  const headerContent = match[1].trim();
  let name = headerContent;
  let bpm = 96;
  let measureRange = null;

  const bpmMatch = headerContent.match(/[@:：]\s*(\d{2,3})\s*(?:BPM|bpm)?/i) ||
                   headerContent.match(/(\d{2,3})\s*(?:BPM|bpm)/i);
  if (bpmMatch) {
    bpm = parseInt(bpmMatch[1]);
    if (bpm < 40) bpm = 40;
    if (bpm > 220) bpm = 220;
    name = headerContent.replace(bpmMatch[0], "").trim().replace(/[@:：，,\s]+$/, "").trim();
  }

  const rangeMatch = name.match(/[([【〔]?\s*(?:小节\s*)?(\d+)\s*[-–—~～]\s*(?:小节\s*)?(\d+)\s*(?:小节)?\s*[)\]】〕]?/);
  if (rangeMatch) {
    const rangeStart = parseInt(rangeMatch[1]);
    const rangeEnd = parseInt(rangeMatch[2]);
    if (rangeStart >= 1 && rangeEnd >= rangeStart && rangeEnd <= 99) {
      measureRange = { start: rangeStart, end: rangeEnd };
      name = name.replace(rangeMatch[0], "").trim().replace(/[[([【〔\])】〕\s]+$/, "").trim();
    }
  }

  if (!name) {
    name = "未命名段落";
  }

  return { name, bpm, measureRange };
}

function computeMeasureRangeLabel(measureRange, measureCount) {
  if (measureRange) {
    return `${measureRange.start}-${measureRange.end}小节`;
  }
  return `${measureCount}小节`;
}

function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入锣鼓经口令。");
  }

  const lines = trimmed.split(/\r?\n/);
  const sectionHeaders = [];
  lines.forEach((line, idx) => {
    const parsed = parseSectionHeader(line);
    if (parsed) {
      sectionHeaders.push({ lineIdx: idx, ...parsed });
    }
  });

  if (sectionHeaders.length === 0) {
    const result = parseSinglePattern(trimmed);
    if (!result) {
      throw new Error("未找到有效的小节内容，请检查分隔符是否正确。");
    }
    return {
      isMultiSection: false,
      sections: [{
        name: "当前段落",
        bpm: getCurrentSection()?.bpm || 96,
        measureRange: null,
        ...result
      }]
    };
  }

  const sections = [];
  let autoMeasureOffset = 0;
  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const nextHeader = sectionHeaders[i + 1];
    const contentStart = header.lineIdx + 1;
    const contentEnd = nextHeader ? nextHeader.lineIdx : lines.length;
    const contentLines = lines.slice(contentStart, contentEnd);
    const content = contentLines.join("\n").trim();

    if (!content) continue;

    try {
      const parsed = parseSinglePattern(content);
      if (parsed) {
        let measureRange = header.measureRange;
        if (!measureRange) {
          measureRange = {
            start: autoMeasureOffset + 1,
            end: autoMeasureOffset + parsed.measureCount
          };
        }
        sections.push({
          name: header.name,
          bpm: header.bpm,
          measureRange,
          ...parsed
        });
        autoMeasureOffset += parsed.measureCount;
      }
    } catch (error) {
      throw new Error(`段落「${header.name}」解析失败：${error.message}`);
    }
  }

  if (sections.length === 0) {
    throw new Error("找到段落标题，但未找到有效的口令内容。请在每个标题下输入口令。");
  }

  return {
    isMultiSection: true,
    sections
  };
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

function renderSingleSectionPreviewGrid(parsedSection, existingSection, sectionIndex, globalMeasureStart) {
  const { pattern, warnings, measureCount, aliasConversions, measureRange } = parsedSection;
  const totalFilled = pattern.flat().filter(Boolean).length;

  let sectionInfo = `<div class="preview-section-info">`;
  if (sectionIndex != null) {
    sectionInfo += `<span class="preview-section-index">段落 ${sectionIndex + 1}</span>`;
  }

  const rangeLabel = measureRange
    ? `${measureRange.start}-${measureRange.end}小节`
    : (globalMeasureStart != null
        ? `${globalMeasureStart + 1}-${globalMeasureStart + measureCount}小节`
        : `${measureCount}小节`);
  sectionInfo += `<span class="section-range-badge">${rangeLabel}</span>`;

  sectionInfo += `<strong>${parsedSection.name}</strong> · <span class="preview-bpm-badge">${parsedSection.bpm} BPM</span> · ${totalFilled} 个口令`;

  let willFillCount = 0;
  let willSkipCount = 0;
  if (existingSection) {
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < steps; c++) {
        if (pattern[r][c]) {
          if (existingSection.pattern[r][c]) {
            willSkipCount++;
          } else {
            willFillCount++;
          }
        }
      }
    }
    if (willFillCount > 0) {
      sectionInfo += ` · 填入 <span style="color:#047857">${willFillCount} 空格</span>`;
    }
    if (willSkipCount > 0) {
      sectionInfo += ` · 跳过 <span style="color:#991b1b">${willSkipCount} 已有</span>`;
    }
  } else {
    sectionInfo += ` · 新段落，<span style="color:#047857">${totalFilled} 口令待写入</span>`;
  }
  sectionInfo += `</div>`;

  if (warnings && warnings.length > 0) {
    sectionInfo += `<div style="font-size:12px;color:#b45309;margin-top:4px;">⚠️ ${warnings.join(" ")}</div>`;
  }
  if (aliasConversions && aliasConversions.length > 0) {
    const uniqueAliases = [...new Set(aliasConversions.map(a => `${a.from}→${a.to}（${a.instrument}）`))];
    sectionInfo += `<div style="font-size:12px;color:#1d4ed8;margin-top:4px;">🔄 别名转换：${uniqueAliases.join("、")}</div>`;
  }

  const header = ['<div class="preview-label-cell">乐器</div>'];
  for (let i = 0; i < steps; i += 1) {
    const measureDivider = (i + 1) % 4 === 0 && i < steps - 1 ? " preview-measure-divider" : "";
    header.push(`<div class="preview-beat-cell${measureDivider}">${beatLabel(i)}</div>`);
  }

  const rows = instruments.flatMap((instrument, rowIndex) => {
    const row = [`<div class="preview-label-cell">${instrument.name}</div>`];
    for (let step = 0; step < steps; step += 1) {
      const parsedValue = pattern[rowIndex][step];
      const existingValue = existingSection ? existingSection.pattern[rowIndex][step] : "";
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

  return `
    <div class="preview-section-block">
      ${sectionInfo}
      <div class="preview-grid">
        <div class="preview-grid-inner">${[...header, ...rows].join("")}</div>
      </div>
    </div>
  `;
}

function renderPreview(parsed) {
  if (!parsed || !parsed.sections || parsed.sections.length === 0) return;

  const isMulti = parsed.isMultiSection || parsed.sections.length > 1;
  const currentSection = getCurrentSection();

  if (isMulti && parsedWriteMode === "merge") {
    parsedWriteMode = "append";
  }
  const currentIdx = state.sections.findIndex(s => s.id === state.currentSectionId);

  let summaryHtml = "";
  if (isMulti) {
    const totalMeasures = parsed.sections.reduce((sum, s) => sum + s.measureCount, 0);
    const totalTokens = parsed.sections.reduce((sum, s) => sum + s.pattern.flat().filter(Boolean).length, 0);
    const bpmList = [...new Set(parsed.sections.map(s => s.bpm))].join("/");
    const sectionDetails = parsed.sections.map((s, i) => {
      const range = s.measureRange ? `${s.measureRange.start}-${s.measureRange.end}小节` : `${s.measureCount}小节`;
      return `${s.name}（${range}，${s.bpm}BPM）`;
    }).join("、");
    summaryHtml = `解析成功：共 <strong>${parsed.sections.length} 个段落</strong>，<strong>${totalMeasures} 小节</strong>，<strong>${totalTokens} 个口令</strong>，速度：<strong>${bpmList} BPM</strong>。<br><span class="preview-section-list">${sectionDetails}</span>`;
  } else {
    const s = parsed.sections[0];
    const totalFilled = s.pattern.flat().filter(Boolean).length;
    const range = s.measureRange ? `${s.measureRange.start}-${s.measureRange.end}小节` : `${s.measureCount}小节`;
    summaryHtml = `解析成功：<strong>${range}</strong>，<strong>${totalFilled} 个口令</strong>，速度：<strong>${s.bpm} BPM</strong>。`;
  }

  importSummary.innerHTML = summaryHtml;
  importSummary.style.display = "block";

  const appendNote = isMulti && currentSection
    ? `（在「${currentSection.name}」后插入）`
    : "";

  const overwriteNote = isMulti
    ? `<div class="write-mode-hint">⚠️ 多段落覆盖：第1段覆盖当前段，其余自动追加为新段落</div>`
    : "";

  const mergeNote = !isMulti && currentSection
    ? `<span class="write-mode-hint">当前段落：${currentSection.name}</span>`
    : "";

  const appendLabel = isMulti
    ? `追加为新段落（${parsed.sections.length} 个）${appendNote}`
    : "追加为新段落";

  const overwriteLabel = isMulti
    ? "覆盖当前段落（混合模式）"
    : "覆盖当前段落";

  const writeModeBar = `
    <div class="write-mode-selector">
      <span class="write-mode-label">写入方式：</span>
      <label class="write-mode-option">
        <input type="radio" name="writeMode" value="merge" ${parsedWriteMode === "merge" ? "checked" : ""} ${isMulti ? "disabled" : ""}>
        <span>合并到当前段落（仅填空格）</span>
      </label>
      ${mergeNote}
      <label class="write-mode-option">
        <input type="radio" name="writeMode" value="overwrite" ${parsedWriteMode === "overwrite" ? "checked" : ""}>
        <span>${overwriteLabel}</span>
      </label>
      <label class="write-mode-option">
        <input type="radio" name="writeMode" value="append" ${parsedWriteMode === "append" || (isMulti && parsedWriteMode !== "overwrite") ? "checked" : ""}>
        <span>${appendLabel}</span>
      </label>
      ${overwriteNote}
    </div>
  `;

  let gridsHtml = "";
  let measureOffset = 0;
  if (isMulti && parsedWriteMode === "overwrite") {
    gridsHtml = parsed.sections.map((s, idx) => {
      const existing = idx === 0 ? currentSection : null;
      const html = renderSingleSectionPreviewGrid(s, existing, idx, measureOffset);
      measureOffset += s.measureCount;
      return html;
    }).join("");
  } else if (isMulti || parsedWriteMode === "append") {
    gridsHtml = parsed.sections.map((s, idx) => {
      const html = renderSingleSectionPreviewGrid(s, null, idx, measureOffset);
      measureOffset += s.measureCount;
      return html;
    }).join("");
  } else {
    gridsHtml = renderSingleSectionPreviewGrid(parsed.sections[0], currentSection, 0, 0);
  }

  const legend = `
    <div style="margin-top: 10px; display: flex; gap: 16px; font-size: 12px; color: var(--muted); flex-wrap: wrap;">
      <span><span style="display:inline-block;width:14px;height:14px;background:#d1fae5;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 新填入</span>
      <span><span style="display:inline-block;width:14px;height:14px;background:#fff1d1;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 原有内容</span>
      <span><span style="display:inline-block;width:14px;height:14px;background:#fee2e2;border-radius:3px;margin-right:4px;vertical-align:middle;position:relative;"><span style="position:absolute;top:-2px;right:1px;font-size:9px;color:var(--accent);font-weight:900;">×</span></span> 跳过（已有内容）</span>
    </div>
  `;

  previewGrid.innerHTML = writeModeBar + gridsHtml + legend;

  const newWriteRadios = previewGrid.querySelectorAll('input[name="writeMode"]');
  newWriteRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      parsedWriteMode = e.target.value;
      renderPreview(parsedPattern);
    });
  });

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
  if (!parsedPattern || !parsedPattern.sections || parsedPattern.sections.length === 0) return;

  let filledCount = 0;
  let skippedCount = 0;
  let appendedCount = 0;
  let overwrittenCount = 0;
  let message = "";

  const isMulti = parsedPattern.isMultiSection || parsedPattern.sections.length > 1;

  if (parsedWriteMode === "append") {
    const currentIdx = state.sections.findIndex((s) => s.id === state.currentSectionId);
    const insertIdx = currentIdx >= 0 ? currentIdx + 1 : state.sections.length;

    parsedPattern.sections.forEach((parsedSection) => {
      const newSection = createEmptySection(parsedSection.name);
      newSection.bpm = parsedSection.bpm;
      if (parsedSection.measureRange) {
        newSection.measureRange = { ...parsedSection.measureRange };
      }
      for (let r = 0; r < instruments.length; r++) {
        for (let c = 0; c < steps; c++) {
          if (parsedSection.pattern[r][c]) {
            newSection.pattern[r][c] = parsedSection.pattern[r][c];
            filledCount++;
          }
        }
      }
      state.sections.splice(insertIdx + appendedCount, 0, newSection);
      appendedCount++;
    });

    state.currentSectionId = state.sections[insertIdx].id;
    message = `✓ 已追加 <strong>${appendedCount}</strong> 个新段落，共写入 <strong>${filledCount}</strong> 个口令。`;

  } else if (isMulti && parsedWriteMode === "overwrite") {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    const currentIdx = state.sections.findIndex((s) => s.id === state.currentSectionId);
    const insertIdx = currentIdx + 1;

    const firstParsed = parsedPattern.sections[0];
    currentSection.bpm = firstParsed.bpm;
    if (firstParsed.name && firstParsed.name !== "当前段落") {
      currentSection.name = firstParsed.name;
    }
    if (firstParsed.measureRange) {
      currentSection.measureRange = { ...firstParsed.measureRange };
    }
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < steps; c++) {
        if (firstParsed.pattern[r][c]) {
          currentSection.pattern[r][c] = firstParsed.pattern[r][c];
          filledCount++;
        } else {
          if (currentSection.pattern[r][c]) {
            overwrittenCount++;
          }
          currentSection.pattern[r][c] = "";
        }
      }
    }

    for (let i = 1; i < parsedPattern.sections.length; i++) {
      const parsedSection = parsedPattern.sections[i];
      const newSection = createEmptySection(parsedSection.name);
      newSection.bpm = parsedSection.bpm;
      if (parsedSection.measureRange) {
        newSection.measureRange = { ...parsedSection.measureRange };
      }
      for (let r = 0; r < instruments.length; r++) {
        for (let c = 0; c < steps; c++) {
          if (parsedSection.pattern[r][c]) {
            newSection.pattern[r][c] = parsedSection.pattern[r][c];
            filledCount++;
          }
        }
      }
      state.sections.splice(insertIdx + appendedCount, 0, newSection);
      appendedCount++;
    }

    message = `✓ 混合模式：覆盖当前段落，追加 <strong>${appendedCount}</strong> 个段。共写入 <strong>${filledCount}</strong> 口令，清空 <strong>${overwrittenCount}</strong> 原有。`;

  } else if (parsedWriteMode === "overwrite") {
    const section = getCurrentSection();
    if (!section) return;
    const parsedSection = parsedPattern.sections[0];

    section.bpm = parsedSection.bpm;
    if (parsedSection.name && parsedSection.name !== "当前段落") {
      section.name = parsedSection.name;
    }
    if (parsedSection.measureRange) {
      section.measureRange = { ...parsedSection.measureRange };
    }
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < steps; c++) {
        if (parsedSection.pattern[r][c]) {
          section.pattern[r][c] = parsedSection.pattern[r][c];
          filledCount++;
        } else {
          if (section.pattern[r][c]) {
            overwrittenCount++;
          }
          section.pattern[r][c] = "";
        }
      }
    }
    message = `✓ 已覆盖当前段落，写入 <strong>${filledCount}</strong> 个口令，清空 <strong>${overwrittenCount}</strong> 个原有口令。`;

  } else {
    const section = getCurrentSection();
    if (!section) return;
    const parsedSection = parsedPattern.sections[0];

    section.bpm = parsedSection.bpm;
    if (parsedSection.name && parsedSection.name !== "当前段落") {
      section.name = parsedSection.name;
    }
    if (parsedSection.measureRange) {
      section.measureRange = { ...parsedSection.measureRange };
    }
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < steps; c++) {
        const parsedValue = parsedSection.pattern[r][c];
        if (parsedValue && !section.pattern[r][c]) {
          section.pattern[r][c] = parsedValue;
          filledCount++;
        } else if (parsedValue && section.pattern[r][c]) {
          skippedCount++;
        }
      }
    }
    message = `✓ 已成功写入 <strong>${filledCount}</strong> 个口令`;
    if (skippedCount > 0) {
      message += `，已跳过 <strong>${skippedCount}</strong> 个已有内容。`;
    } else {
      message += "。";
    }
  }

  save();
  render();
  importSummary.innerHTML = message;
  resetImportState();
  commandInput.value = "";
}

function playSound(instrument, mix = {}) {
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  const volume = typeof mix.volume === "number" ? mix.volume : 100;
  const timbre = typeof mix.timbre === "number" ? mix.timbre : 100;
  const accent = mix.accent === true;

  const baseFreq = instrument.freq;
  const freqMultiplier = timbre / 100;
  osc.frequency.value = baseFreq * freqMultiplier;

  const baseGain = 0.08;
  const volumeMultiplier = volume / 100;
  const accentMultiplier = accent ? 1.5 : 1;
  const finalGain = baseGain * volumeMultiplier * accentMultiplier;

  osc.type = instrument.name === "鼓" ? "sine" : "square";

  gain.gain.setValueAtTime(finalGain, audioContext.currentTime);
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
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument, {
        volume: section.mixConfig.volume[rowIndex],
        timbre: section.mixConfig.timbre[rowIndex],
        accent: section.mixConfig.accent[rowIndex]
      });
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
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
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
    mixConfig: deepCloneMixConfig(section.mixConfig),
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
  const content = noteInput.value.trim();
  section.notes.unshift(content);
  if (!Array.isArray(section.collabNotes)) {
    section.collabNotes = [];
  }
  const measure = parseMeasureFromNote(content);
  const now = new Date().toISOString();
  section.collabNotes.unshift({
    id: crypto.randomUUID(),
    type: "teacher",
    content: content,
    target: measure !== null ? measure : "all",
    resolved: false,
    assignee: "teacher1",
    priority: PRIORITY_LEVELS.MEDIUM,
    practiceGoal: 0,
    completionNote: "",
    createdAt: now,
    updatedAt: now,
    _taskMigrated: true,
    _fromLegacy: true
  });
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
  const compareId = event.target.closest("[data-compare]")?.dataset.compare;
  if (compareId) {
    const item = state.saved.find((entry) => entry.id === compareId);
    if (item) openVersionCompare(item);
    return;
  }

  const deleteId = event.target.closest("[data-delete-saved]")?.dataset.deleteSaved;
  if (deleteId) {
    if (!confirm("确定删除此方案？")) return;
    state.saved = state.saved.filter((entry) => entry.id !== deleteId);
    save();
    render();
    return;
  }

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

  state.sections.forEach(section => {
    migrateNotesToCollabNotes(section);
  });

  save();
  render();
});

voicePanel.addEventListener("change", (event) => {
  const voiceIndex = event.target.closest("[data-voice]")?.dataset.voice;
  const volumeIndex = event.target.closest("[data-volume]")?.dataset.volume;
  const timbreIndex = event.target.closest("[data-timbre]")?.dataset.timbre;

  const section = getCurrentSection();
  if (!section) return;
  section.mixConfig = section.mixConfig || createDefaultMixConfig();

  if (voiceIndex !== undefined) {
    section.enabledInstruments[Number(voiceIndex)] = event.target.checked;
    save();
    render();
    return;
  }

  if (volumeIndex !== undefined) {
    const value = Number(event.target.value);
    section.mixConfig.volume[Number(volumeIndex)] = value;
    const valueLabel = event.target.closest(".voice-control")?.querySelector(".voice-value");
    if (valueLabel) valueLabel.textContent = `${value}%`;
    save();
    return;
  }

  if (timbreIndex !== undefined) {
    const value = Number(event.target.value);
    section.mixConfig.timbre[Number(timbreIndex)] = value;
    const valueLabel = event.target.closest(".voice-control")?.querySelector(".voice-value");
    if (valueLabel) valueLabel.textContent = `${value}%`;
    save();
    return;
  }
});

voicePanel.addEventListener("input", (event) => {
  const volumeIndex = event.target.closest("[data-volume]")?.dataset.volume;
  const timbreIndex = event.target.closest("[data-timbre]")?.dataset.timbre;

  const section = getCurrentSection();
  if (!section) return;
  section.mixConfig = section.mixConfig || createDefaultMixConfig();

  if (volumeIndex !== undefined) {
    const value = Number(event.target.value);
    section.mixConfig.volume[Number(volumeIndex)] = value;
    const valueLabel = event.target.closest(".voice-control")?.querySelector(".voice-value");
    if (valueLabel) valueLabel.textContent = `${value}%`;
    save();
    return;
  }

  if (timbreIndex !== undefined) {
    const value = Number(event.target.value);
    section.mixConfig.timbre[Number(timbreIndex)] = value;
    const valueLabel = event.target.closest(".voice-control")?.querySelector(".voice-value");
    if (valueLabel) valueLabel.textContent = `${value}%`;
    save();
    return;
  }
});

voicePanel.addEventListener("click", (event) => {
  const allBtn = event.target.closest("[data-voice-all]");
  const accentBtn = event.target.closest("[data-accent]");
  const previewBtn = event.target.closest("[data-voice-preview]");
  const resetBtn = event.target.closest("[data-voice-reset]");

  const section = getCurrentSection();
  if (!section) return;
  section.mixConfig = section.mixConfig || createDefaultMixConfig();

  if (allBtn) {
    const action = allBtn.dataset.voiceAll;
    section.enabledInstruments = section.enabledInstruments.map(() => action === "on");
    save();
    render();
    return;
  }

  if (accentBtn) {
    const index = Number(accentBtn.dataset.accent);
    section.mixConfig.accent[index] = !section.mixConfig.accent[index];
    save();
    render();
    return;
  }

  if (previewBtn) {
    const index = Number(previewBtn.dataset.voicePreview);
    playSound(instruments[index], {
      volume: section.mixConfig.volume[index],
      timbre: section.mixConfig.timbre[index],
      accent: section.mixConfig.accent[index]
    });
    return;
  }

  if (resetBtn) {
    section.mixConfig = createDefaultMixConfig();
    save();
    render();
    return;
  }
});

parseBtn.addEventListener("click", () => {
  hideError();
  importPreview.style.display = "none";
  importSummary.style.display = "none";
  try {
    parsedPattern = parseCommand(commandInput.value);
    parsedWriteMode = (parsedPattern.isMultiSection || parsedPattern.sections.length > 1)
      ? "append"
      : "merge";
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
    if (!section.measureRange && fileVersion < 3) {
      const measureCount = Math.max(1, Math.ceil(
        section.pattern
          ? section.pattern[0]?.filter((c, i) =>
              section.pattern.some(row => row[i])
            ).length / 4
          : 4
      ));
      section.measureRange = {
        start: idx * 4 + 1,
        end: idx * 4 + Math.min(measureCount, 4)
      };
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

  migrateAllSectionsToCollabNotes(migratedData);

  return { data: migratedData, compatibility };
}

function calculateSchemeStats(data) {
  const stats = {
    name: data.pieceName || "未命名方案",
    bpm: 0,
    noteCount: 0,
    gridSize: `${instruments.length}×${steps}`,
    sectionCount: 0,
    totalMeasures: 0,
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
      if (section.measureRange) {
        stats.totalMeasures = Math.max(stats.totalMeasures, section.measureRange.end);
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
  previewSchemeSections.textContent = `${stats.sectionCount} 个${stats.totalMeasures > 0 ? ` · 共${stats.totalMeasures}小节` : ""}`;
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
        if (Array.isArray(item.sections)) {
          item.sections.forEach(section => {
            migrateNotesToCollabNotes(section);
          });
        } else if (item.notes) {
          migrateNotesToCollabNotes(item);
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

        state.sections.forEach(section => {
          migrateNotesToCollabNotes(section);
        });

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
            if (Array.isArray(item.sections)) {
              item.sections.forEach(section => {
                migrateNotesToCollabNotes(section);
              });
            } else if (item.notes) {
              migrateNotesToCollabNotes(item);
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

const practiceListSection = document.querySelector("#practiceList");
const practiceListBody = document.querySelector("#practiceListBody");
const practiceProgressEl = document.querySelector("#practiceProgress");
const practiceRegenerateBtn = document.querySelector("#practiceRegenerateBtn");
const practiceClearBtn = document.querySelector("#practiceClearBtn");

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
  const currentBpmIndex = tempoTrainer.completed
    ? tempoTrainer.bpmSteps.length - 1
    : tempoTrainer.currentBpmIndex;
  const currentBpm = tempoTrainer.bpmSteps[currentBpmIndex] || 0;
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
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
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
    mixConfig: deepCloneMixConfig(section.mixConfig),
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
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument, {
        volume: section.mixConfig.volume[rowIndex],
        timbre: section.mixConfig.timbre[rowIndex],
        accent: section.mixConfig.accent[rowIndex]
      });
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
    section.mixConfig = section.mixConfig || createDefaultMixConfig();
    instruments.forEach((instrument, rowIndex) => {
      if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
        playSound(instrument, {
          volume: section.mixConfig.volume[rowIndex],
          timbre: section.mixConfig.timbre[rowIndex],
          accent: section.mixConfig.accent[rowIndex]
        });
      }
    });

    return;
  }

  highlight(playhead);
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
  instruments.forEach((instrument, rowIndex) => {
    if (section.enabledInstruments[rowIndex] && section.pattern[rowIndex][playhead]) {
      playSound(instrument, {
        volume: section.mixConfig.volume[rowIndex],
        timbre: section.mixConfig.timbre[rowIndex],
        accent: section.mixConfig.accent[rowIndex]
      });
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

loadPracticeTasks();

if (practiceRegenerateBtn) {
  practiceRegenerateBtn.addEventListener("click", () => {
    if (practiceTasks.length > 0 && !confirm("重新生成将覆盖当前练习清单，确定继续吗？")) return;
    regeneratePracticeTasks();
  });
}

if (practiceClearBtn) {
  practiceClearBtn.addEventListener("click", clearPracticeTasks);
}

if (practiceListBody) {
  practiceListBody.addEventListener("change", (event) => {
    const toggleEl = event.target.closest("[data-practice-toggle]");
    if (toggleEl) {
      togglePracticeTask(toggleEl.dataset.practiceToggle);
    }
  });

  practiceListBody.addEventListener("click", (event) => {
    const deleteEl = event.target.closest("[data-practice-delete]");
    if (deleteEl) {
      deletePracticeTask(deleteEl.dataset.practiceDelete);
    }
  });
}

function addCollabNoteFromInput() {
  if (!collabNoteInput || !collabNoteInput.value.trim()) return;
  const type = getCurrentCollabType();
  const target = collabTargetSelect ? collabTargetSelect.value : "all";
  const assignee = collabAssigneeSelect ? collabAssigneeSelect.value : (type === "teacher" ? "teacher1" : "student1");
  const priority = collabPrioritySelect ? collabPrioritySelect.value : PRIORITY_LEVELS.MEDIUM;
  const practiceGoal = collabPracticeGoal ? parseInt(collabPracticeGoal.value) || 0 : 0;
  createCollabNote(collabNoteInput.value, type, target, assignee, priority, practiceGoal);
  collabNoteInput.value = "";
  if (collabPracticeGoal) collabPracticeGoal.value = "0";
}

if (collabAddBtn) {
  collabAddBtn.addEventListener("click", addCollabNoteFromInput);
}

if (collabNoteInput) {
  collabNoteInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !collabNoteInput.value.trim()) return;
    event.preventDefault();
    addCollabNoteFromInput();
  });
}

if (collabTypeBtns) {
  collabTypeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      collabTypeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

if (filterTypeBtns) {
  filterTypeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.filterType;
      collabFilters.type = type;
      filterTypeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCollabNotes();
    });
  });
}

if (filterStatusBtns) {
  filterStatusBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const status = btn.dataset.filterStatus;
      collabFilters.status = status;
      filterStatusBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCollabNotes();
    });
  });
}

if (filterAssigneeBtns) {
  filterAssigneeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const assignee = btn.dataset.filterAssignee;
      collabFilters.assignee = assignee;
      filterAssigneeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCollabNotes();
    });
  });
}

if (filterPriorityBtns) {
  filterPriorityBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const priority = btn.dataset.filterPriority;
      collabFilters.priority = priority;
      filterPriorityBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCollabNotes();
    });
  });
}

if (sortBtns) {
  sortBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const sort = btn.dataset.sort;
      collabFilters.sort = sort;
      sortBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderCollabNotes();
    });
  });
}

function showTaskEditModal(noteId) {
  const section = getCurrentSection();
  if (!section) return;
  const note = section.collabNotes.find(n => n.id === noteId);
  if (!note) return;

  const assigneeOptions = ASSIGNEES.map(a => 
    `<option value="${a.value}" ${note.assignee === a.value ? "selected" : ""}>${a.label}</option>`
  ).join("");

  const priorityOptions = Object.entries(PRIORITY_LABELS).map(([value, label]) => 
    `<option value="${value}" ${note.priority === value ? "selected" : ""}>${PRIORITY_ICONS[value]} ${label}</option>`
  ).join("");

  const modalHtml = `
    <div class="task-edit-overlay" id="taskEditOverlay">
      <div class="task-edit-modal">
        <div class="task-edit-header">
          <h3>✎ 编辑任务</h3>
          <button type="button" class="task-edit-close" id="taskEditClose">✕</button>
        </div>
        <div class="task-edit-body">
          <div class="task-edit-field">
            <label>任务内容</label>
            <textarea id="taskEditContent" rows="3">${note.content}</textarea>
          </div>
          <div class="task-edit-row">
            <div class="task-edit-field">
              <label>类型</label>
              <select id="taskEditType">
                <option value="teacher" ${note.type === "teacher" ? "selected" : ""}>👨‍🏫 老师批注</option>
                <option value="student" ${note.type === "student" ? "selected" : ""}>👨‍🎓 学生反馈</option>
              </select>
            </div>
            <div class="task-edit-field">
              <label>目标小节</label>
              <select id="taskEditTarget">
                <option value="all" ${note.target === "all" ? "selected" : ""}>全段</option>
                <option value="0" ${note.target === 0 ? "selected" : ""}>第1小节</option>
                <option value="1" ${note.target === 1 ? "selected" : ""}>第2小节</option>
                <option value="2" ${note.target === 2 ? "selected" : ""}>第3小节</option>
                <option value="3" ${note.target === 3 ? "selected" : ""}>第4小节</option>
              </select>
            </div>
          </div>
          <div class="task-edit-row">
            <div class="task-edit-field">
              <label>负责人</label>
              <select id="taskEditAssignee">${assigneeOptions}</select>
            </div>
            <div class="task-edit-field">
              <label>优先级</label>
              <select id="taskEditPriority">${priorityOptions}</select>
            </div>
            <div class="task-edit-field">
              <label>练习目标（次）</label>
              <input type="number" id="taskEditPracticeGoal" min="0" max="100" value="${note.practiceGoal || 0}">
            </div>
          </div>
          <div class="task-edit-field">
            <label>完成说明</label>
            <textarea id="taskEditCompletionNote" rows="2" placeholder="标记完成时填写的说明...">${note.completionNote || ""}</textarea>
          </div>
        </div>
        <div class="task-edit-footer">
          <button type="button" class="task-edit-cancel" id="taskEditCancel">取消</button>
          <button type="button" class="task-edit-save" id="taskEditSave">✓ 保存修改</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const overlay = document.querySelector("#taskEditOverlay");
  const closeBtn = document.querySelector("#taskEditClose");
  const cancelBtn = document.querySelector("#taskEditCancel");
  const saveBtn = document.querySelector("#taskEditSave");

  const closeModal = () => overlay.remove();

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  saveBtn.addEventListener("click", () => {
    const content = document.querySelector("#taskEditContent").value.trim();
    if (!content) {
      alert("任务内容不能为空");
      return;
    }
    const updates = {
      content,
      type: document.querySelector("#taskEditType").value,
      target: document.querySelector("#taskEditTarget").value === "all" ? "all" : Number(document.querySelector("#taskEditTarget").value),
      assignee: document.querySelector("#taskEditAssignee").value,
      priority: document.querySelector("#taskEditPriority").value,
      practiceGoal: parseInt(document.querySelector("#taskEditPracticeGoal").value) || 0,
      completionNote: document.querySelector("#taskEditCompletionNote").value.trim()
    };
    updateCollabNote(noteId, updates);
    closeModal();
  });
}

function promptCompletionNote(noteId) {
  const completionNote = prompt("请填写完成说明（可选）：", "");
  if (completionNote !== null) {
    updateCollabNote(noteId, { resolved: true, completionNote: completionNote.trim() });
  }
}

if (collabNotesList) {
  collabNotesList.addEventListener("click", (event) => {
    const resolveBtn = event.target.closest("[data-collab-resolve]");
    const unresolveBtn = event.target.closest("[data-collab-unresolve]");
    const deleteBtn = event.target.closest("[data-collab-delete]");
    const editBtn = event.target.closest("[data-collab-edit]");

    if (resolveBtn) {
      const noteId = resolveBtn.dataset.collabResolve;
      promptCompletionNote(noteId);
    } else if (unresolveBtn) {
      const noteId = unresolveBtn.dataset.collabUnresolve;
      updateCollabNote(noteId, { resolved: false });
    } else if (deleteBtn) {
      const noteId = deleteBtn.dataset.collabDelete;
      deleteCollabNote(noteId);
    } else if (editBtn) {
      const noteId = editBtn.dataset.collabEdit;
      showTaskEditModal(noteId);
    }
  });
}

render();

const vcOverlay = document.querySelector("#versionCompareOverlay");
const vcSubtitle = document.querySelector("#vcSubtitle");
const vcSummary = document.querySelector("#vcSummary");
const vcBody = document.querySelector("#vcBody");
const vcCloseBtn = document.querySelector("#vcCloseBtn");
const vcRestoreSelectedBtn = document.querySelector("#vcRestoreSelectedBtn");
const vcRestoreAllBtn = document.querySelector("#vcRestoreAllBtn");
const vcCancelBtn = document.querySelector("#vcCancelBtn");

let vcCompareItem = null;
let vcSelectedSections = new Set();
let vcSelectedBeats = {};

function loadPracticeTasks() {
  try {
    const raw = localStorage.getItem(practiceListStorageKey);
    if (!raw) {
      practiceTasks = [];
      completedPracticeIds = new Set();
      return;
    }
    const data = JSON.parse(raw);
    practiceTasks = Array.isArray(data.tasks) ? data.tasks : [];
    completedPracticeIds = new Set(Array.isArray(data.completedIds) ? data.completedIds : []);
    practiceTasks.forEach(t => {
      if (!t.id) t.id = crypto.randomUUID();
    });
  } catch {
    practiceTasks = [];
    completedPracticeIds = new Set();
  }
}

function savePracticeTasks() {
  try {
    localStorage.setItem(practiceListStorageKey, JSON.stringify({
      tasks: practiceTasks,
      completedIds: [...completedPracticeIds]
    }));
  } catch {}
}

function makePracticeTask(params) {
  return {
    id: crypto.randomUUID(),
    category: params.category,
    priority: params.priority || PRIORITY.MEDIUM,
    title: params.title,
    description: params.description || "",
    measure: params.measure != null ? params.measure : null,
    instrument: params.instrument != null ? params.instrument : null,
    sourceData: params.sourceData || null,
    createdAt: new Date().toISOString()
  };
}

function getCompletedMeasureSet() {
  const completedMeasures = new Set();
  const completedInstruments = new Set();
  practiceTasks.forEach(task => {
    if (completedPracticeIds.has(task.id)) {
      if (task.category === "completion" && task.measure != null) {
        completedMeasures.add(task.measure);
      }
      if (task.category === "mute" && task.instrument != null) {
        completedInstruments.add(task.instrument);
      }
      if (task.category === "note" && task.measure != null) {
        completedMeasures.add(task.measure);
      }
      if (task.category === "rehearsal" && task.measure != null) {
        completedMeasures.add(task.measure);
      }
      if (task.category === "diagnosis" && task.measure != null) {
        completedMeasures.add(task.measure);
      }
    }
  });
  return { completedMeasures, completedInstruments };
}

function getDedupeKey(task) {
  const parts = [task.category];
  if (task.measure != null) parts.push(`m:${task.measure}`);
  if (task.instrument != null) parts.push(`i:${task.instrument}`);
  if (task.sourceData && task.sourceData.noteId) parts.push(`note:${task.sourceData.noteId}`);
  if (task.sourceData && task.sourceData.step != null) parts.push(`step:${task.sourceData.step}`);
  return parts.join("|");
}

function generateTasksFromCompletion() {
  const section = getCurrentSection();
  if (!section) return [];
  const tasks = [];
  const measures = getMeasureData();
  measures.forEach(m => {
    if (m.ratio < 0.8) {
      const priority = m.ratio < 0.4 ? PRIORITY.HIGH : (m.ratio < 0.6 ? PRIORITY.MEDIUM : PRIORITY.LOW);
      const pct = Math.round(m.ratio * 100);
      tasks.push(makePracticeTask({
        category: "completion",
        priority,
        measure: m.measure - 1,
        title: `完善第${m.measure}小节的谱面（当前${pct}%）`,
        description: `第${m.measure}小节还有 ${m.total - m.filled} 个空格需要填入口令，建议逐拍补充完整。`,
        sourceData: { measure: m.measure - 1, ratio: m.ratio }
      }));
    }
  });
  if (measures.length > 0) {
    const totalFilled = measures.reduce((s, m) => s + m.filled, 0);
    const totalCells = measures.reduce((s, m) => s + m.total, 0);
    const overallRatio = totalCells ? totalFilled / totalCells : 0;
    if (overallRatio < 0.5) {
      tasks.push(makePracticeTask({
        category: "completion",
        priority: PRIORITY.HIGH,
        title: `整体谱面完善（当前完成度 ${Math.round(overallRatio * 100)}%）`,
        description: `整段谱面整体完成度不足，建议按小节顺序依次填充，确保每个乐器声部的节奏准确。`,
        sourceData: { overall: true, ratio: overallRatio }
      }));
    }
  }
  return tasks;
}

function generateTasksFromNotes() {
  const section = getCurrentSection();
  if (!section || !Array.isArray(section.collabNotes)) return [];
  const tasks = [];
  const pendingNotes = section.collabNotes.filter(n => !n.resolved);
  pendingNotes.forEach(note => {
    const priority = note.type === "teacher" ? PRIORITY.HIGH : PRIORITY.MEDIUM;
    const targetLabel = note.target === "all" ? "全段" : `第${Number(note.target) + 1}小节`;
    const typeLabel = note.type === "teacher" ? "老师批注" : "学生反馈";
    tasks.push(makePracticeTask({
      category: "note",
      priority,
      measure: note.target === "all" ? null : Number(note.target),
      title: `解决${targetLabel}的${typeLabel}：${note.content.slice(0, 30)}${note.content.length > 30 ? "..." : ""}`,
      description: `${typeLabel}：${note.content}\n目标：${targetLabel}\n创建于 ${new Date(note.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      sourceData: { noteId: note.id, type: note.type, target: note.target }
    }));
  });
  return tasks;
}

function generateTasksFromRehearsal() {
  if (!rehearsalLog || rehearsalLog.length === 0) return [];
  const tasks = [];
  const recent = rehearsalLog.slice(0, 5);
  const pauseMeasures = new Map();
  recent.forEach(entry => {
    if (entry.pausePosition != null && entry.pauseLabel && !entry.pauseLabel.includes("播放完成")) {
      const measure = Math.floor(entry.pausePosition / 4);
      pauseMeasures.set(measure, (pauseMeasures.get(measure) || 0) + 1);
    }
  });
  pauseMeasures.forEach((count, measure) => {
    if (measure >= 0 && measure < 4 && count >= 1) {
      const priority = count >= 2 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
      tasks.push(makePracticeTask({
        category: "rehearsal",
        priority,
        measure,
        title: `重点练习第${measure + 1}小节（最近在附近暂停${count}次）`,
        description: `最近的排练中多次在第${measure + 1}小节附近暂停，说明该小节衔接或节奏存在问题，建议单独循环练习该小节。`,
        sourceData: { measure, pauseCount: count }
      }));
    }
  });
  return tasks;
}

function generateTasksFromDiagnosis() {
  if (!lastDiagnosisResult) return [];
  const tasks = [];
  const { wrongPositions = [], confusedInstruments = [], accuracy = 100 } = lastDiagnosisResult;
  if (accuracy < 80) {
    const priority = accuracy < 50 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
    tasks.push(makePracticeTask({
      category: "diagnosis",
      priority,
      title: `整体错拍率较高（正确率 ${accuracy}%），建议重新做一轮诊断练习`,
      description: `上次诊断练习正确率仅 ${accuracy}%，建议降低难度或先针对易错位置专项练习后再重新诊断。`,
      sourceData: { accuracy }
    }));
  }
  if (Array.isArray(wrongPositions) && wrongPositions.length > 0) {
    const measureMap = new Map();
    wrongPositions.forEach(pos => {
      const measure = Math.floor((pos.step || 0) / 4);
      if (!measureMap.has(measure)) measureMap.set(measure, []);
      measureMap.get(measure).push(pos);
    });
    measureMap.forEach((positions, measure) => {
      if (measure >= 0 && measure < 4) {
        const beatLabels = positions.map(p => p.beatLabel || `第${measure + 1}小节`).join("、");
        const priority = positions.length >= 2 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
        tasks.push(makePracticeTask({
          category: "diagnosis",
          priority,
          measure,
          title: `纠正第${measure + 1}小节的错拍（${positions.length}处错误）`,
          description: `错拍位置：${beatLabels}\n建议慢速逐拍练习，确认每个拍点的乐器口令准确后再逐步提速。`,
          sourceData: { measure, positions: positions.map(p => p.step) }
        }));
      }
    });
  }
  if (Array.isArray(confusedInstruments) && confusedInstruments.length > 0) {
    confusedInstruments.slice(0, 2).forEach(item => {
      const priority = item.count >= 3 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
      tasks.push(makePracticeTask({
        category: "diagnosis",
        priority,
        title: `区分易混淆乐器：${item.label}（混淆${item.count}次）`,
        description: `诊断练习中「${item.label}」出现了 ${item.count} 次混淆，建议对比两种乐器的音色特征，单独听辨练习。`,
        sourceData: { confusedItem: item }
      }));
    });
  }
  return tasks;
}

function generateTasksFromMute() {
  const section = getCurrentSection();
  if (!section) return [];
  const tasks = [];
  const mutedIndices = [];
  section.enabledInstruments.forEach((enabled, idx) => {
    if (!enabled) mutedIndices.push(idx);
  });
  mutedIndices.forEach(idx => {
    const inst = instruments[idx];
    if (!inst) return;
    const hasContent = section.pattern[idx] && section.pattern[idx].some(Boolean);
    if (hasContent) {
      tasks.push(makePracticeTask({
        category: "mute",
        priority: PRIORITY.MEDIUM,
        instrument: idx,
        title: `单独练习「${inst.name}」声部（当前静音）`,
        description: `「${inst.name}」声部目前处于静音状态，该声部有谱面内容。建议先开启该声部单独练习，熟练后再与其他声部合奏。`,
        sourceData: { instrument: idx }
      }));
    }
  });
  if (mutedIndices.length >= 2) {
    tasks.push(makePracticeTask({
      category: "mute",
      priority: PRIORITY.LOW,
      title: `恢复全部声部队合奏验证（${mutedIndices.length}个声部静音）`,
      description: `当前有 ${mutedIndices.length} 个乐器声部处于静音状态。分声部练习完成后，建议开启全部声部进行合奏练习，验证整体配合效果。`,
      sourceData: { allMuted: mutedIndices }
    }));
  }
  return tasks;
}

function generatePracticeTasks() {
  const section = getCurrentSection();
  if (!section) return [];
  const allTasks = [
    ...generateTasksFromCompletion(),
    ...generateTasksFromNotes(),
    ...generateTasksFromRehearsal(),
    ...generateTasksFromDiagnosis(),
    ...generateTasksFromMute()
  ];
  const seen = new Set();
  const deduped = [];
  allTasks.forEach(task => {
    const key = getDedupeKey(task);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(task);
    }
  });
  const priorityOrder = { [PRIORITY.HIGH]: 0, [PRIORITY.MEDIUM]: 1, [PRIORITY.LOW]: 2 };
  const categoryOrder = { note: 0, diagnosis: 1, rehearsal: 2, completion: 3, mute: 4 };
  deduped.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (categoryOrder[a.category] !== categoryOrder[b.category]) {
      return categoryOrder[a.category] - categoryOrder[b.category];
    }
    return 0;
  });
  return deduped.slice(0, 12);
}

function regeneratePracticeTasks() {
  practiceTasks = generatePracticeTasks();
  completedPracticeIds = new Set();
  savePracticeTasks();
  renderPracticeList();
  renderDashboard();
}

function clearPracticeTasks() {
  if (practiceTasks.length === 0) return;
  if (!confirm("确定要清空整个练习清单吗？此操作不可撤销。")) return;
  practiceTasks = [];
  completedPracticeIds = new Set();
  savePracticeTasks();
  renderPracticeList();
  renderDashboard();
}

function togglePracticeTask(taskId) {
  if (completedPracticeIds.has(taskId)) {
    completedPracticeIds.delete(taskId);
  } else {
    completedPracticeIds.add(taskId);
  }
  savePracticeTasks();
  renderPracticeList();
  renderDashboard();
}

function deletePracticeTask(taskId) {
  practiceTasks = practiceTasks.filter(t => t.id !== taskId);
  completedPracticeIds.delete(taskId);
  savePracticeTasks();
  renderPracticeList();
  renderDashboard();
}

function getPriorityLabel(p) {
  switch (p) {
    case PRIORITY.HIGH: return "高优先";
    case PRIORITY.LOW: return "低优先";
    default: return "中优先";
  }
}

function renderPracticeList() {
  if (!practiceListBody || !practiceProgressEl) return;
  const total = practiceTasks.length;
  const completed = practiceTasks.filter(t => completedPracticeIds.has(t.id)).length;
  practiceProgressEl.textContent = `${completed}/${total} 已完成`;
  if (total === 0) {
    practiceListBody.innerHTML = `
      <div class="practice-empty">点击「🔄 重新生成」按钮，系统将根据谱面完成度、协作批注、排练记录、错拍诊断和静音声部状态智能生成练习任务</div>
    `;
    return;
  }
  const tasksHtml = practiceTasks.map(task => {
    const isDone = completedPracticeIds.has(task.id);
    const priorityLabel = getPriorityLabel(task.priority);
    const categoryLabel = CATEGORY_LABELS[task.category] || "练习任务";
    return `
      <div class="practice-task category-${task.category} ${isDone ? "completed" : ""}" data-practice-id="${task.id}">
        <label class="practice-task-checkbox">
          <input type="checkbox" data-practice-toggle="${task.id}" ${isDone ? "checked" : ""}>
        </label>
        <div class="practice-task-body">
          <div class="practice-task-title">${task.title}</div>
          ${task.description ? `<div class="practice-task-desc">${task.description.replace(/\n/g, "<br>")}</div>` : ""}
          <div class="practice-task-meta">
            <span class="priority-badge priority-${task.priority}">${priorityLabel}</span>
            <span class="category-badge category-${task.category}">${categoryLabel}</span>
            ${task.measure != null ? `<span class="source-badge">📍 第${task.measure + 1}小节</span>` : ""}
            ${task.instrument != null ? `<span class="source-badge">🎵 ${instruments[task.instrument]?.name || ""}</span>` : ""}
          </div>
        </div>
        <div class="practice-task-action">
          <button type="button" class="practice-delete-btn" data-practice-delete="${task.id}" title="移除此任务">✕</button>
        </div>
      </div>
    `;
  }).join("");
  const categoryStats = {};
  practiceTasks.forEach(t => {
    if (!categoryStats[t.category]) categoryStats[t.category] = { total: 0, done: 0 };
    categoryStats[t.category].total++;
    if (completedPracticeIds.has(t.id)) categoryStats[t.category].done++;
  });
  const statsHtml = Object.entries(categoryStats).map(([cat, s]) => {
    return `<span>${CATEGORY_LABELS[cat] || cat}: <span class="practice-stat-num">${s.done}/${s.total}</span></span>`;
  }).join("");
  practiceListBody.innerHTML = tasksHtml + `
    <div class="practice-tasks-footer">
      <div class="practice-tasks-stats">${statsHtml}</div>
      <div>已完成 <strong style="color:var(--active)">${completed}</strong> / ${total} 项</div>
    </div>
  `;
}

function normalizeSavedToSections(item) {
  if (Array.isArray(item.sections) && item.sections.length > 0) {
    const sections = deepCloneSections(item.sections);
    sections.forEach(section => {
      migrateNotesToCollabNotes(section);
      migrateAllCollabNotesToTasks(section);
    });
    return sections;
  }
  const section = deepCloneSection({
    id: crypto.randomUUID(),
    name: item.name || "未命名",
    bpm: item.bpm || 96,
    loop: item.loop || "",
    notes: item.notes || [],
    pattern: item.pattern,
    enabledInstruments: item.enabledInstruments
  });
  migrateNotesToCollabNotes(section);
  migrateAllCollabNotesToTasks(section);
  return [section];
}

function pairSections(curSections, histSections) {
  const pairs = [];
  const curById = new Map(curSections.map(s => [s.id, s]));
  const histById = new Map(histSections.map(s => [s.id, s]));
  const usedCur = new Set();
  const usedHist = new Set();

  for (const cur of curSections) {
    if (histById.has(cur.id)) {
      pairs.push({
        cur,
        hist: histById.get(cur.id),
        pairKey: `id:${cur.id}`,
        matchType: "id",
        status: "compare",
        displayIdx: null
      });
      usedCur.add(cur.id);
      usedHist.add(cur.id);
    }
  }

  const remainingCur = curSections.filter(s => !usedCur.has(s.id));
  const remainingHist = histSections.filter(s => !usedHist.has(s.id));

  const histByName = new Map();
  for (const h of remainingHist) {
    if (!histByName.has(h.name)) histByName.set(h.name, []);
    histByName.get(h.name).push(h);
  }

  for (const cur of remainingCur) {
    const sameNameList = histByName.get(cur.name);
    if (sameNameList && sameNameList.length > 0) {
      const hist = sameNameList.shift();
      if (sameNameList.length === 0) histByName.delete(cur.name);
      pairs.push({
        cur,
        hist,
        pairKey: `name:${cur.id}:${hist.id}`,
        matchType: "name",
        status: "compare",
        displayIdx: null
      });
      usedCur.add(cur.id);
      usedHist.add(hist.id);
    }
  }

  const leftCur = curSections.filter(s => !usedCur.has(s.id));
  const leftHist = histSections.filter(s => !usedHist.has(s.id));
  const maxLen = Math.max(leftCur.length, leftHist.length);

  for (let i = 0; i < maxLen; i++) {
    const cur = leftCur[i] || null;
    const hist = leftHist[i] || null;
    if (cur && hist) {
      pairs.push({
        cur,
        hist,
        pairKey: `index:${cur.id}:${hist.id}`,
        matchType: "index",
        status: "compare",
        displayIdx: null
      });
    } else if (!cur && hist) {
      pairs.push({
        cur: null,
        hist,
        pairKey: `new:${hist.id}`,
        matchType: "new",
        status: "new",
        displayIdx: null
      });
    } else if (cur && !hist) {
      pairs.push({
        cur,
        hist: null,
        pairKey: `removed:${cur.id}`,
        matchType: "removed",
        status: "removed",
        displayIdx: null
      });
    }
  }

  pairs.sort((a, b) => {
    const aIdx = a.cur ? curSections.indexOf(a.cur) : (a.hist ? histSections.indexOf(a.hist) + 0.5 : 999);
    const bIdx = b.cur ? curSections.indexOf(b.cur) : (b.hist ? histSections.indexOf(b.hist) + 0.5 : 999);
    return aIdx - bIdx;
  });

  pairs.forEach((p, i) => { p.displayIdx = i + 1; });
  return pairs;
}

function computeNoteFieldDiff(curNote, histNote) {
  const fields = [
    { key: "content", label: "内容" },
    { key: "type", label: "类型", format: v => v === "teacher" ? "老师" : v === "student" ? "学生" : v },
    { key: "target", label: "目标", format: v => v === "all" ? "全段" : `第${Number(v) + 1}小节` },
    { key: "resolved", label: "状态", format: v => v ? "已解决" : "未解决" },
    { key: "assignee", label: "负责人", format: v => getAssigneeLabel(v) || v },
    { key: "priority", label: "优先级", format: v => PRIORITY_LABELS[v] || v },
    { key: "practiceGoal", label: "练习目标", format: v => v > 0 ? `${v}次` : "无" },
    { key: "completionNote", label: "完成说明" }
  ];
  const changes = [];
  for (const f of fields) {
    const curVal = curNote[f.key];
    const histVal = histNote[f.key];
    if (curVal !== histVal) {
      changes.push({
        field: f.key,
        label: f.label,
        curVal,
        histVal,
        curDisplay: f.format ? f.format(curVal) : curVal,
        histDisplay: f.format ? f.format(histVal) : histVal
      });
    }
  }
  return changes;
}

function computeSectionDiff(curSection, histSection) {
  const diff = {
    nameChanged: curSection.name !== histSection.name,
    curName: curSection.name,
    histName: histSection.name,
    bpmChanged: curSection.bpm !== histSection.bpm,
    curBpm: curSection.bpm,
    histBpm: histSection.bpm,
    voiceDiff: [],
    gridDiff: [],
    collabDiff: { added: [], removed: [], modified: [] },
    hasDiff: false
  };

  for (let i = 0; i < instruments.length; i++) {
    const curOn = curSection.enabledInstruments[i];
    const histOn = histSection.enabledInstruments[i];
    if (curOn !== histOn) {
      diff.voiceDiff.push({
        index: i,
        name: instruments[i].name,
        curOn,
        histOn
      });
    }
  }

  const curPattern = curSection.pattern;
  const histPattern = histSection.pattern;
  for (let row = 0; row < instruments.length; row++) {
    for (let step = 0; step < steps; step++) {
      const curVal = (curPattern[row] && curPattern[row][step]) || "";
      const histVal = (histPattern[row] && histPattern[row][step]) || "";
      if (curVal !== histVal) {
        diff.gridDiff.push({
          row,
          step,
          instrument: instruments[row].name,
          curVal,
          histVal
        });
      }
    }
  }

  const curNotes = Array.isArray(curSection.collabNotes) ? curSection.collabNotes : [];
  const histNotes = Array.isArray(histSection.collabNotes) ? histSection.collabNotes : [];
  const curNoteMap = new Map(curNotes.map(n => [n.id, n]));
  const histNoteMap = new Map(histNotes.map(n => [n.id, n]));
  const allNoteIds = new Set([...curNoteMap.keys(), ...histNoteMap.keys()]);

  diff.collabDiff = { added: [], removed: [], modified: [] };

  for (const nid of allNoteIds) {
    const curN = curNoteMap.get(nid);
    const histN = histNoteMap.get(nid);
    if (curN && !histN) {
      diff.collabDiff.removed.push(curN);
    } else if (!curN && histN) {
      diff.collabDiff.added.push(histN);
    } else if (curN && histN) {
      const fieldChanges = computeNoteFieldDiff(curN, histN);
      if (fieldChanges.length > 0) {
        diff.collabDiff.modified.push({
          id: nid,
          curNote: curN,
          histNote: histN,
          changes: fieldChanges
        });
      }
    }
  }

  diff.hasDiff = diff.nameChanged || diff.bpmChanged ||
    diff.voiceDiff.length > 0 || diff.gridDiff.length > 0 ||
    diff.collabDiff.added.length > 0 || diff.collabDiff.removed.length > 0 ||
    diff.collabDiff.modified.length > 0;

  return diff;
}

let vcPairMap = {};

function renderVersionCompare(curSections, histSections, histName) {
  vcPairMap = {};
  const pairs = pairSections(curSections, histSections);
  const diffs = [];
  let totalBpmDiff = 0;
  let totalVoiceDiff = 0;
  let totalGridDiff = 0;
  let totalCollabAdded = 0;
  let totalCollabRemoved = 0;
  let totalCollabModified = 0;
  let anyDiff = false;

  for (const pair of pairs) {
    const { cur, hist, pairKey, matchType, status, displayIdx } = pair;
    let diff;

    if (!cur && hist) {
      diff = {
        status: "new",
        matchType,
        pairKey,
        displayIdx,
        nameChanged: true,
        curName: "（不存在）",
        histName: hist.name,
        bpmChanged: true,
        curBpm: "-",
        histBpm: hist.bpm,
        voiceDiff: instruments.map((inst, idx) => ({
          index: idx,
          name: inst.name,
          curOn: null,
          histOn: hist.enabledInstruments[idx]
        })),
        gridDiff: [],
        collabDiff: { added: hist.collabNotes || [], removed: [], modified: [] },
        hasDiff: true,
        histSection: hist,
        curSection: null
      };
      for (let row = 0; row < instruments.length; row++) {
        for (let step = 0; step < steps; step++) {
          const val = (hist.pattern[row] && hist.pattern[row][step]) || "";
          if (val) {
            diff.gridDiff.push({ row, step, instrument: instruments[row].name, curVal: "", histVal: val });
          }
        }
      }
    } else if (cur && !hist) {
      diff = {
        status: "removed",
        matchType,
        pairKey,
        displayIdx,
        nameChanged: true,
        curName: cur.name,
        histName: "（不存在）",
        bpmChanged: true,
        curBpm: cur.bpm,
        histBpm: "-",
        voiceDiff: [],
        gridDiff: [],
        collabDiff: { added: [], removed: cur.collabNotes || [], modified: [] },
        hasDiff: false,
        curSection: cur,
        histSection: null
      };
    } else {
      diff = computeSectionDiff(cur, hist);
      diff.status = "compare";
      diff.matchType = matchType;
      diff.pairKey = pairKey;
      diff.displayIdx = displayIdx;
      diff.curSection = cur;
      diff.histSection = hist;
    }
    diffs.push(diff);
    vcPairMap[pairKey] = { curId: cur?.id || null, histId: hist?.id || null };
    if (diff.bpmChanged) totalBpmDiff++;
    if (diff.voiceDiff.length > 0) totalVoiceDiff += diff.voiceDiff.length;
    if (diff.gridDiff.length > 0) totalGridDiff += diff.gridDiff.length;
    if (diff.collabDiff.added.length > 0) totalCollabAdded += diff.collabDiff.added.length;
    if (diff.collabDiff.removed.length > 0) totalCollabRemoved += diff.collabDiff.removed.length;
    if (diff.collabDiff.modified && diff.collabDiff.modified.length > 0) totalCollabModified += diff.collabDiff.modified.length;
    if (diff.hasDiff || diff.status === "new") anyDiff = true;
  }

  const tags = [];
  if (curSections.length !== histSections.length) {
    tags.push(`<span class="vc-summary-tag diff-section">段落 ${curSections.length} → ${histSections.length}</span>`);
  }
  if (totalBpmDiff > 0) {
    tags.push(`<span class="vc-summary-tag diff-bpm">BPM差异 ${totalBpmDiff}处</span>`);
  }
  if (totalVoiceDiff > 0) {
    tags.push(`<span class="vc-summary-tag diff-voice">声部差异 ${totalVoiceDiff}处</span>`);
  }
  if (totalGridDiff > 0) {
    tags.push(`<span class="vc-summary-tag diff-grid">口令差异 ${totalGridDiff}处</span>`);
  }
  if (totalCollabAdded > 0 || totalCollabRemoved > 0 || totalCollabModified > 0) {
    tags.push(`<span class="vc-summary-tag diff-collab">批注 +${totalCollabAdded} -${totalCollabRemoved} ~${totalCollabModified}</span>`);
  }
  if (!anyDiff) {
    tags.push(`<span class="vc-summary-tag no-diff">完全一致</span>`);
  }
  vcSummary.innerHTML = tags.length ? tags.join("") : '<span class="vc-summary-tag no-diff">无差异</span>';

  if (!anyDiff) {
    vcBody.innerHTML = '<div class="vc-empty">当前谱面与历史方案完全一致，无需恢复。</div>';
    vcRestoreSelectedBtn.disabled = true;
    vcRestoreAllBtn.disabled = true;
    return;
  }

  const matchTypeLabels = { id: "🆔", name: "🏷️", index: "🔢", new: "➕", removed: "➖" };
  const matchTypeTitles = {
    id: "按ID精确匹配",
    name: "按名称匹配",
    index: "按索引顺序匹配",
    new: "历史方案多出此段落",
    removed: "当前多出此段落"
  };

  let html = "";
  diffs.forEach((diff) => {
    const pairKey = diff.pairKey;
    const badgeText = diff.status === "new" ? "历史多出" : diff.status === "removed" ? "当前多出" : diff.hasDiff ? "有差异" : "一致";
    const badgeClass = diff.status === "new" ? "new" : diff.status === "removed" ? "removed" : diff.hasDiff ? "" : "same";
    const canRestore = diff.status === "new" || (diff.hasDiff && diff.histSection);
    const isChecked = vcSelectedSections.has(pairKey);
    const matchLabel = matchTypeLabels[diff.matchType] || "";
    const matchTitle = matchTypeTitles[diff.matchType] || "";

    html += `<div class="vc-diff-section" data-vc-pair="${pairKey}">`;
    html += `<div class="vc-diff-section-header">`;
    html += `<div class="vc-diff-section-title">`;
    html += `<span>段落 ${diff.displayIdx}</span>`;
    if (matchLabel) {
      html += `<span class="vc-match-badge" title="${matchTitle}">${matchLabel}</span>`;
    }
    html += `<span class="vc-diff-section-badge ${badgeClass}">${badgeText}</span>`;
    if (diff.nameChanged) {
      html += `<span style="font-size:13px;color:var(--muted);">「${diff.curName}」→「${diff.histName}」</span>`;
    } else {
      html += `<span style="font-size:13px;color:var(--muted);">「${diff.histName || diff.curName}」</span>`;
    }
    html += `</div>`;
    html += `<div class="vc-diff-section-check">`;
    if (canRestore) {
      html += `<label><input type="checkbox" data-vc-check-section="${pairKey}" ${isChecked ? "checked" : ""}> 恢复此段落</label>`;
    }
    html += `</div>`;
    html += `</div>`;

    if (!diff.hasDiff && diff.status !== "new") {
      html += `</div>`;
      return;
    }

    html += `<div class="vc-diff-section-body">`;

    if (diff.bpmChanged) {
      html += `<div class="vc-diff-item">`;
      html += `<div class="vc-diff-label"><span class="diff-icon changed"></span> BPM</div>`;
      html += `<div class="vc-diff-values">`;
      html += `<span class="vc-diff-val old">${diff.curBpm}</span>`;
      html += `<span class="vc-diff-arrow">→</span>`;
      html += `<span class="vc-diff-val new">${diff.histBpm}</span>`;
      html += `</div></div>`;
    }

    if (diff.voiceDiff.length > 0) {
      html += `<div class="vc-diff-item">`;
      html += `<div class="vc-diff-label"><span class="diff-icon changed"></span> 声部开关</div>`;
      diff.voiceDiff.forEach(v => {
        html += `<div class="vc-diff-values" style="margin-bottom:4px;">`;
        html += `<span style="font-weight:700;font-size:13px;min-width:40px;">${v.name}</span>`;
        html += `<span class="vc-diff-val old">${v.curOn === null ? "-" : v.curOn ? "开" : "关"}</span>`;
        html += `<span class="vc-diff-arrow">→</span>`;
        html += `<span class="vc-diff-val new">${v.histOn === null ? "-" : v.histOn ? "开" : "关"}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    }

    if (diff.gridDiff.length > 0) {
      html += `<div class="vc-diff-item">`;
      html += `<div class="vc-diff-label"><span class="diff-icon changed"></span> 口令网格 <span style="font-weight:400;font-size:11px;">（点击拍行可选中恢复）</span></div>`;
      html += `<div class="vc-grid-diff"><table>`;

      html += `<tr><th></th>`;
      for (let s = 0; s < steps; s++) {
        html += `<th>${beatLabel(s)}</th>`;
      }
      html += `</tr>`;

      const changedSteps = new Set(diff.gridDiff.map(d => d.step));

      for (let row = 0; row < instruments.length; row++) {
        html += `<tr><td class="inst-label">${instruments[row].name}</td>`;
        for (let s = 0; s < steps; s++) {
          const change = diff.gridDiff.find(d => d.row === row && d.step === s);
          if (change) {
            const histDisplay = change.histVal || "∅";
            html += `<td class="changed" data-hist="${histDisplay}" title="当前: ${change.curVal || "空"} → 历史: ${change.histVal || "空"}">${change.curVal || "∅"}</td>`;
          } else {
            const val = (diff.histSection?.pattern?.[row]?.[s]) || (diff.curSection?.pattern?.[row]?.[s]) || "";
            html += `<td class="same-cell">${val}</td>`;
          }
        }
        html += `</tr>`;
      }

      const changedStepList = [...changedSteps].sort((a, b) => a - b);
      if (changedStepList.length > 0 && (diff.histSection || diff.status === "new")) {
        html += `<tr class="beat-select-row"><td class="inst-label" style="font-size:11px;">选择拍</td>`;
        for (let s = 0; s < steps; s++) {
          const isChanged = changedSteps.has(s);
          const beatKey = `${pairKey}::${s}`;
          const isBeatSelected = vcSelectedBeats[beatKey] || false;
          if (isChanged) {
            html += `<td class="beat-header ${isBeatSelected ? "selected" : ""}" data-vc-beat="${pairKey}:${s}" style="cursor:pointer;">✓</td>`;
          } else {
            html += `<td class="beat-header same-cell"></td>`;
          }
        }
        html += `</tr>`;
      }

      html += `</table></div></div>`;
    }

    const collabAdded = diff.collabDiff.added || [];
    const collabRemoved = diff.collabDiff.removed || [];
    const collabModified = diff.collabDiff.modified || [];
    if (collabAdded.length > 0 || collabRemoved.length > 0 || collabModified.length > 0) {
      html += `<div class="vc-diff-item">`;
      html += `<div class="vc-diff-label"><span class="diff-icon changed"></span> 协作批注</div>`;
      html += `<div class="vc-collab-diff">`;
      const renderCollabNoteMeta = n => {
        let meta = `<span class="cm-tag cm-type-${n.type}">${n.type === "teacher" ? "老师" : "学生"}</span>`;
        meta += `<span class="cm-tag cm-target">${n.target === "all" ? "全段" : `第${Number(n.target) + 1}小节`}</span>`;
        meta += `<span class="cm-tag ${n.resolved ? "cm-resolved" : "cm-pending"}">${n.resolved ? "已解决" : "未解决"}</span>`;
        if (n.assignee) meta += `<span class="cm-tag cm-assignee">👤${getAssigneeLabel(n.assignee)}</span>`;
        if (n.priority) meta += `<span class="cm-tag cm-priority-${n.priority}">${PRIORITY_ICONS[n.priority] || ""}${PRIORITY_LABELS[n.priority] || n.priority}</span>`;
        if (n.practiceGoal > 0) meta += `<span class="cm-tag cm-goal">🎯${n.practiceGoal}次</span>`;
        if (n.completionNote) meta += `<span class="cm-tag cm-completion">完成说明：${n.completionNote}</span>`;
        return meta;
      };
      collabAdded.forEach(n => {
        html += `<div class="vc-collab-item added">`;
        html += `<span class="collab-diff-badge">历史有</span>`;
        html += `<div class="collab-diff-content">`;
        html += `<div class="collab-diff-body">${n.content}</div>`;
        html += `<div class="collab-diff-meta">`;
        html += renderCollabNoteMeta(n);
        html += `</div>`;
        html += `</div></div>`;
      });
      collabRemoved.forEach(n => {
        html += `<div class="vc-collab-item removed">`;
        html += `<span class="collab-diff-badge">当前有</span>`;
        html += `<div class="collab-diff-content">`;
        html += `<div class="collab-diff-body">${n.content}</div>`;
        html += `<div class="collab-diff-meta">`;
        html += renderCollabNoteMeta(n);
        html += `</div>`;
        html += `</div></div>`;
      });
      collabModified.forEach(m => {
        const curNote = m.curNote;
        const histNote = m.histNote;
        html += `<div class="vc-collab-item modified">`;
        html += `<span class="collab-diff-badge">字段修改</span>`;
        html += `<div class="collab-diff-content">`;
        const hasContentChange = m.changes.some(c => c.field === "content");
        if (hasContentChange) {
          const cc = m.changes.find(c => c.field === "content");
          html += `<div class="collab-diff-body-row">`;
          html += `<span class="vc-diff-label-small">内容:</span>`;
          html += `<span class="vc-diff-val old">${cc.curVal}</span>`;
          html += `<span class="vc-diff-arrow">→</span>`;
          html += `<span class="vc-diff-val new">${cc.histVal}</span>`;
          html += `</div>`;
        } else {
          html += `<div class="collab-diff-body">${curNote.content}</div>`;
        }
        html += `<div class="collab-field-changes">`;
        m.changes.filter(c => c.field !== "content").forEach(c => {
          html += `<div class="collab-field-change">`;
          html += `<span class="vc-diff-label-small">${c.label}:</span>`;
          html += `<span class="vc-diff-val old">${c.curDisplay}</span>`;
          html += `<span class="vc-diff-arrow">→</span>`;
          html += `<span class="vc-diff-val new">${c.histDisplay}</span>`;
          html += `</div>`;
        });
        html += `</div>`;
        html += `<div class="collab-diff-meta" style="margin-top:6px;color:var(--muted);">同一条批注（ID匹配）</div>`;
        html += `</div></div>`;
      });
      html += `</div></div>`;
    }

    html += `</div></div>`;
  });

  vcBody.innerHTML = html;
  updateVcRestoreBtn();
}

function updateVcRestoreBtn() {
  const sectionCount = vcSelectedSections.size;
  const beatCount = Object.values(vcSelectedBeats).filter(Boolean).length;
  const hasSelection = sectionCount > 0 || beatCount > 0;

  let btnText = "↺ 恢复选中项";
  if (hasSelection) {
    const parts = [];
    if (sectionCount > 0) parts.push(`${sectionCount} 段落`);
    if (beatCount > 0) parts.push(`${beatCount} 拍`);
    btnText = `↺ 恢复选中项 (${parts.join(" + ")})`;
  }
  vcRestoreSelectedBtn.textContent = btnText;
  vcRestoreSelectedBtn.disabled = !hasSelection;
}

function openVersionCompare(item) {
  vcCompareItem = item;
  vcSelectedSections = new Set();
  vcSelectedBeats = {};

  if (vcSubtitle) {
    const itemDate = item.savedAt ? new Date(item.savedAt).toLocaleString("zh-CN") : "历史版本";
    vcSubtitle.textContent = `对比「${item.name}」(${itemDate}) 与当前编辑谱面`;
  }

  const histSections = normalizeSavedToSections(item);
  histSections.forEach(section => {
    migrateNotesToCollabNotes(section);
  });
  const curSections = deepCloneSections(state.sections);

  renderVersionCompare(curSections, histSections, item.name);
  vcOverlay.style.display = "flex";
}

function closeVersionCompare() {
  vcOverlay.style.display = "none";
  vcCompareItem = null;
  vcSelectedSections = new Set();
  vcSelectedBeats = {};
}

function restoreCollabNotes(curSection, histSection) {
  if (!histSection.collabNotes && !curSection.collabNotes) return;
  const histNotes = histSection.collabNotes || [];
  const curNotes = curSection.collabNotes ? [...curSection.collabNotes] : [];
  const histNoteMap = new Map(histNotes.map(n => [n.id, n]));
  const curNoteMap = new Map(curNotes.map(n => [n.id, n]));
  const merged = [];
  const processedIds = new Set();

  for (const curN of curNotes) {
    processedIds.add(curN.id);
    if (histNoteMap.has(curN.id)) {
      merged.push(deepCloneSection ? { ...histNoteMap.get(curN.id) } : JSON.parse(JSON.stringify(histNoteMap.get(curN.id))));
    } else {
      merged.push(curN);
    }
  }
  for (const histN of histNotes) {
    if (!processedIds.has(histN.id)) {
      merged.push(JSON.parse(JSON.stringify(histN)));
    }
  }
  curSection.collabNotes = merged;
}

function restoreFromCompare(restoreAll) {
  if (!vcCompareItem) return;

  const histSections = normalizeSavedToSections(vcCompareItem);
  histSections.forEach(section => {
    migrateNotesToCollabNotes(section);
  });

  if (restoreAll) {
    if (!confirm(`确认整份覆盖恢复「${vcCompareItem.name}」？\n当前编辑内容将被完全替换。`)) return;
    state.pieceName = vcCompareItem.pieceName || vcCompareItem.name;
    state.sections = deepCloneSections(histSections);
    if (state.sections.length > 0) {
      state.currentSectionId = state.sections[0].id;
    }
  } else {
    const sectionCount = vcSelectedSections.size;
    const beatCount = Object.values(vcSelectedBeats).filter(Boolean).length;
    if (!confirm(`确认恢复选中内容？\n${sectionCount > 0 ? `• ${sectionCount} 个段落\n` : ""}${beatCount > 0 ? `• ${beatCount} 拍口令` : ""}`)) return;

    const selectedBeatInfo = {};
    Object.entries(vcSelectedBeats).forEach(([key, selected]) => {
      if (!selected) return;
      const [pairKey, stepStr] = key.split("::");
      if (!selectedBeatInfo[pairKey]) selectedBeatInfo[pairKey] = new Set();
      selectedBeatInfo[pairKey].add(Number(stepStr));
    });

    vcSelectedSections.forEach(pairKey => {
      const pairInfo = vcPairMap[pairKey];
      if (!pairInfo) return;
      const histSection = pairInfo.histId ? histSections.find(s => s.id === pairInfo.histId) : null;
      if (!histSection) return;
      const curSection = pairInfo.curId ? state.sections.find(s => s.id === pairInfo.curId) : null;

      if (!curSection) {
        state.sections.push(deepCloneSection(histSection));
        return;
      }

      if (selectedBeatInfo[pairKey] && selectedBeatInfo[pairKey].size > 0) {
        const beatsToRestore = selectedBeatInfo[pairKey];
        for (let row = 0; row < instruments.length; row++) {
          for (const step of beatsToRestore) {
            if (step < steps && histSection.pattern[row] && histSection.pattern[row][step] !== undefined) {
              curSection.pattern[row][step] = histSection.pattern[row][step];
            }
          }
        }
        if (histSection.bpm !== undefined) curSection.bpm = histSection.bpm;
        if (histSection.name) curSection.name = histSection.name;
        if (histSection.enabledInstruments) curSection.enabledInstruments = [...histSection.enabledInstruments];
        restoreCollabNotes(curSection, histSection);
      } else {
        const idx = state.sections.indexOf(curSection);
        if (idx >= 0) {
          const restoredSection = deepCloneSection(histSection);
          state.sections[idx] = restoredSection;
          if (state.currentSectionId === curSection.id) {
            state.currentSectionId = restoredSection.id;
          }
        }
      }
    });

    Object.entries(vcSelectedBeats).forEach(([key, selected]) => {
      if (!selected) return;
      const [pairKey, stepStr] = key.split("::");
      const step = Number(stepStr);
      if (vcSelectedSections.has(pairKey)) return;

      const pairInfo = vcPairMap[pairKey];
      if (!pairInfo) return;
      const histSection = pairInfo.histId ? histSections.find(s => s.id === pairInfo.histId) : null;
      if (!histSection) return;
      const curSection = pairInfo.curId ? state.sections.find(s => s.id === pairInfo.curId) : null;
      if (!curSection) return;

      for (let row = 0; row < instruments.length; row++) {
        if (histSection.pattern[row] && histSection.pattern[row][step] !== undefined) {
          curSection.pattern[row][step] = histSection.pattern[row][step];
        }
      }
    });
  }

  save();
  render();
  closeVersionCompare();
}

if (vcCloseBtn) {
  vcCloseBtn.addEventListener("click", closeVersionCompare);
}
if (vcCancelBtn) {
  vcCancelBtn.addEventListener("click", closeVersionCompare);
}
if (vcOverlay) {
  vcOverlay.addEventListener("click", (event) => {
    if (event.target === vcOverlay) closeVersionCompare();
  });
}
if (vcRestoreSelectedBtn) {
  vcRestoreSelectedBtn.addEventListener("click", () => restoreFromCompare(false));
}
if (vcRestoreAllBtn) {
  vcRestoreAllBtn.addEventListener("click", () => restoreFromCompare(true));
}
if (vcBody) {
  vcBody.addEventListener("change", (event) => {
    const checkEl = event.target.closest("[data-vc-check-section]");
    if (checkEl) {
      const pairKey = checkEl.dataset.vcCheckSection;
      if (checkEl.checked) {
        vcSelectedSections.add(pairKey);
      } else {
        vcSelectedSections.delete(pairKey);
        Object.keys(vcSelectedBeats).forEach(key => {
          if (key.startsWith(pairKey + "::")) {
            delete vcSelectedBeats[key];
            const beatEl = vcBody.querySelector(`[data-vc-beat="${pairKey}:${key.split("::")[1]}"]`);
            if (beatEl) beatEl.classList.remove("selected");
          }
        });
      }
      updateVcRestoreBtn();
    }
  });

  vcBody.addEventListener("click", (event) => {
    const beatEl = event.target.closest("[data-vc-beat]");
    if (beatEl) {
      const raw = beatEl.dataset.vcBeat;
      const lastColonIdx = raw.lastIndexOf(":");
      const pairKey = raw.slice(0, lastColonIdx);
      const step = Number(raw.slice(lastColonIdx + 1));
      const key = `${pairKey}::${step}`;
      if (vcSelectedBeats[key]) {
        delete vcSelectedBeats[key];
        beatEl.classList.remove("selected");
      } else {
        vcSelectedBeats[key] = true;
        beatEl.classList.add("selected");
      }
      updateVcRestoreBtn();
    }
  });
}

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
