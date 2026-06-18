const storageKey = "wxyy-4-luogujing-grid";
const rehearsalLogKey = "wxyy-4-rehearsal-log";
const MAX_REHEARSAL_LOG = 50;
const reviewDetailKey = "wxyy-4-review-detail";
const REVIEW_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const REVIEW_SUMMARY_THRESHOLD = 10;
const SNAPSHOT_INTERVAL_BEATS = 8;
const instruments = [
  { name: "大锣", token: "仓", freq: 180 },
  { name: "鼓", token: "冬", freq: 120 },
  { name: "钹", token: "才", freq: 360 },
  { name: "小锣", token: "台", freq: 520 }
];
const steps = 16;

const PHRASE_TYPES = {
  QISHI: { id: "qishi", name: "起势", icon: "🚀", color: "#b3252e", desc: "开场引入，奠定节奏基础" },
  LIANGXIANG: { id: "liangxiang", name: "亮相", icon: "✨", color: "#c59427", desc: "核心展示，节奏鲜明" },
  ZHUANCHANG: { id: "zhuanchang", name: "转场", icon: "🔄", color: "#1b6a68", desc: "过渡衔接，节奏变化" },
  SHOUSHU: { id: "shoushu", name: "收束", icon: "🎯", color: "#6d28d9", desc: "结尾收煞，节奏渐缓" },
  FANFU: { id: "fanfu", name: "反复", icon: "♻️", color: "#0891b2", desc: "重复主题，强化记忆" },
  BIANZOU: { id: "bianzou", name: "变奏", icon: "🎼", color: "#db2777", desc: "主题变化，增加层次" },
  CUSTOM: { id: "custom", name: "自定义", icon: "📝", color: "#6b665e", desc: "用户自定义乐句块" }
};

const PHRASE_TYPE_LIST = Object.values(PHRASE_TYPES);

let structuralMode = false;
let selectedPhraseId = null;
let phraseDragSourceId = null;

function getSectionSteps(section) {
  if (!section) return 16;
  const mc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;
  return mc * bpm;
}
function beatLabelForSection(section, index) {
  const bpm = section.beatsPerMeasure || 4;
  const measure = Math.floor(index / bpm) + 1;
  const beat = (index % bpm) + 1;
  return `${measure}-${beat}`;
}

function getPhraseType(typeId) {
  return PHRASE_TYPE_LIST.find(t => t.id === typeId) || PHRASE_TYPES.CUSTOM;
}

function createDefaultPhrase(typeId, startMeasure, endMeasure, section) {
  const type = getPhraseType(typeId);
  const mc = section?.measureCount || 4;
  const bpm = section?.beatsPerMeasure || 4;
  const safeStart = Math.max(0, Math.min(mc - 1, startMeasure));
  const safeEnd = Math.max(safeStart, Math.min(mc - 1, endMeasure));
  return {
    id: crypto.randomUUID(),
    name: type.name,
    type: typeId,
    startMeasure: safeStart,
    endMeasure: safeEnd,
    repeat: 1,
    tempoMultiplier: 1.0,
    note: "",
    color: type.color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function autoGeneratePhrases(section) {
  if (!section) return [];
  const mc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;
  const phrases = [];
  const phrasesPerBlock = 4;
  
  if (mc <= 2) {
    phrases.push(createDefaultPhrase("liangxiang", 0, mc - 1, section));
    return phrases;
  }
  
  if (mc <= 4) {
    phrases.push(createDefaultPhrase("qishi", 0, Math.floor(mc / 2), section));
    phrases.push(createDefaultPhrase("shoushu", Math.floor(mc / 2) + 1, mc - 1, section));
    return phrases;
  }
  
  const blocks = Math.ceil(mc / phrasesPerBlock);
  for (let i = 0; i < blocks; i++) {
    const start = i * phrasesPerBlock;
    const end = Math.min(start + phrasesPerBlock - 1, mc - 1);
    let typeId;
    if (i === 0) typeId = "qishi";
    else if (i === blocks - 1) typeId = "shoushu";
    else if (i % 2 === 1) typeId = "zhuanchang";
    else typeId = "liangxiang";
    phrases.push(createDefaultPhrase(typeId, start, end, section));
  }
  return phrases;
}

function ensureSectionPhrases(section) {
  if (!section) return;
  if (!Array.isArray(section.phrases) || section.phrases.length === 0) {
    section.phrases = autoGeneratePhrases(section);
    return;
  }
  const mc = section.measureCount || 4;
  section.phrases = section.phrases.map(p => ({
    ...p,
    startMeasure: Math.max(0, Math.min(mc - 1, p.startMeasure || 0)),
    endMeasure: Math.max(p.startMeasure || 0, Math.min(mc - 1, p.endMeasure || 0)),
    repeat: typeof p.repeat === "number" ? Math.max(1, Math.min(16, p.repeat)) : 1,
    tempoMultiplier: typeof p.tempoMultiplier === "number" ? Math.max(0.25, Math.min(4, p.tempoMultiplier)) : 1.0,
    name: p.name || getPhraseType(p.type).name,
    color: p.color || getPhraseType(p.type).color
  }));
}

function getPhraseAtMeasure(section, measureIndex) {
  if (!section || !Array.isArray(section.phrases)) return null;
  return section.phrases.find(p => 
    measureIndex >= p.startMeasure && measureIndex <= p.endMeasure
  );
}

function getPhraseAtBeat(section, beatIndex) {
  if (!section) return null;
  const bpm = section.beatsPerMeasure || 4;
  const measure = Math.floor(beatIndex / bpm);
  return getPhraseAtMeasure(section, measure);
}

function getPhraseBeatRange(section, phrase) {
  if (!section || !phrase) return { start: 0, end: 0, length: 0 };
  const bpm = section.beatsPerMeasure || 4;
  const start = phrase.startMeasure * bpm;
  const end = (phrase.endMeasure + 1) * bpm - 1;
  return { start, end, length: end - start + 1 };
}

function normalizePhraseOverlaps(phrases, mc) {
  if (!Array.isArray(phrases)) return [];
  const sorted = [...phrases].sort((a, b) => a.startMeasure - b.startMeasure);
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (next && curr.endMeasure >= next.startMeasure) {
      const mid = Math.floor((curr.startMeasure + next.endMeasure) / 2);
      curr.endMeasure = Math.min(curr.endMeasure, mid);
      next.startMeasure = Math.max(next.startMeasure, mid + 1);
    }
    curr.startMeasure = Math.max(0, Math.min(mc - 1, curr.startMeasure));
    curr.endMeasure = Math.max(curr.startMeasure, Math.min(mc - 1, curr.endMeasure));
  }
  return sorted.sort((a, b) => a.startMeasure - b.startMeasure);
}

function detectPhraseOverlaps(phrases) {
  if (!Array.isArray(phrases) || phrases.length < 2) return [];
  const overlaps = [];
  const sorted = [...phrases].sort((a, b) => a.startMeasure - b.startMeasure);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.endMeasure >= b.startMeasure && b.endMeasure >= a.startMeasure) {
        overlaps.push({ phraseA: a, phraseB: b });
      }
    }
  }
  return overlaps;
}

function migrateSectionPhrases(section) {
  if (!section) return;
  ensureSectionPhrases(section);
}

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
    measureCount: section.measureCount || 4,
    beatsPerMeasure: section.beatsPerMeasure || 4,
    notes: Array.isArray(section.notes) ? [...section.notes] : [],
    collabNotes: Array.isArray(section.collabNotes)
      ? section.collabNotes.map(n => ({ ...n }))
      : [],
    pattern: Array.isArray(section.pattern)
      ? section.pattern.map((row) => (Array.isArray(row) ? [...row] : []))
      : instruments.map(() => Array(getSectionSteps(section)).fill("")),
    enabledInstruments: Array.isArray(section.enabledInstruments)
      ? [...section.enabledInstruments]
      : [true, true, true, true],
    mixConfig: deepCloneMixConfig(section.mixConfig),
    measureRange: section.measureRange ? { ...section.measureRange } : null,
    phrases: Array.isArray(section.phrases)
      ? section.phrases.map(p => ({ ...p }))
      : null
  };
}

function deepCloneSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(deepCloneSection);
}

function deepCloneBaseSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.sections)) {
    return null;
  }
  return {
    versionId: snapshot.versionId || null,
    schemeId: snapshot.schemeId || null,
    pieceName: snapshot.pieceName || "",
    sections: deepCloneSections(snapshot.sections),
    currentSectionId: snapshot.currentSectionId || null,
    continuousPlay: snapshot.continuousPlay ?? false,
    rehearsalLog: Array.isArray(snapshot.rehearsalLog)
      ? snapshot.rehearsalLog.map((entry) => ({ ...entry }))
      : [],
    snapshotAt: snapshot.snapshotAt || null
  };
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
    measureCount: item.measureCount || 4,
    beatsPerMeasure: item.beatsPerMeasure || 4,
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
  const mc = 4;
  const bpm = 4;
  const totalSteps = mc * bpm;
  const section = {
    id: crypto.randomUUID(),
    name,
    bpm: 96,
    loop: "",
    measureCount: mc,
    beatsPerMeasure: bpm,
    notes: [],
    collabNotes: [],
    pattern: instruments.map((instrument) =>
      Array.from({ length: totalSteps }, (_, index) =>
        index % bpm === 0 ? instrument.token : ""
      )
    ),
    enabledInstruments: [true, true, true, true],
    mixConfig: createDefaultMixConfig(),
    measureRange: null,
    phrases: []
  };
  section.phrases = autoGeneratePhrases(section);
  return section;
}

function createEmptySection(name = "段落 1") {
  const mc = 4;
  const bpm = 4;
  const totalSteps = mc * bpm;
  const section = {
    id: crypto.randomUUID(),
    name,
    bpm: 96,
    loop: "",
    measureCount: mc,
    beatsPerMeasure: bpm,
    notes: [],
    collabNotes: [],
    pattern: instruments.map(() => Array.from({ length: totalSteps }, () => "")),
    enabledInstruments: [true, true, true, true],
    mixConfig: createDefaultMixConfig(),
    measureRange: null,
    phrases: []
  };
  section.phrases = autoGeneratePhrases(section);
  return section;
}

const defaultState = {
  pieceName: "出场锣鼓-慢起",
  sections: [createDefaultSection("出场锣鼓")],
  currentSectionId: null,
  continuousPlay: false,
  saved: [],
  playCount: 0,
  lastPlayedAt: null,
  recentPlayedSection: "",
  schemeId: null,
  versionId: null,
  parentVersionId: null,
  baseSnapshot: null
};

function parseMeasureFromNote(content) {
  const match = content.match(/第\s*([一二三四五六七八九十\d]+)\s*小节/);
  if (!match) return null;
  const numStr = match[1];
  const cnNums = ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六"];
  if (cnNums.includes(numStr)) {
    return cnNums.indexOf(numStr);
  }
  const num = parseInt(numStr);
  if (!isNaN(num) && num >= 1 && num <= 16) {
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
  const ensureSectionDefaults = (sec) => {
    if (!sec.measureCount) sec.measureCount = 4;
    if (!sec.beatsPerMeasure) sec.beatsPerMeasure = 4;
    return sec;
  };
  if (oldState.sections && Array.isArray(oldState.sections)) {
    const sections = deepCloneSections(oldState.sections).map(ensureSectionDefaults);
    let saved = deepCloneSavedList(oldState.saved);
    saved.forEach(item => {
      if (Array.isArray(item.sections)) {
        item.sections = item.sections.map(ensureSectionDefaults);
      }
    });
    result = {
      pieceName: oldState.pieceName || "出场锣鼓-慢起",
      sections,
      currentSectionId: oldState.currentSectionId || oldState.sections[0]?.id || null,
      continuousPlay: oldState.continuousPlay || false,
      saved,
      playCount: oldState.playCount || 0,
      lastPlayedAt: oldState.lastPlayedAt || null,
      recentPlayedSection: oldState.recentPlayedSection || "",
      schemeId: oldState.schemeId || null,
      versionId: oldState.versionId || null,
      parentVersionId: oldState.parentVersionId || null,
      baseSnapshot: deepCloneBaseSnapshot(oldState.baseSnapshot)
    };
  } else {
    const section = ensureSectionDefaults({
      id: crypto.randomUUID(),
      name: oldState.pieceName || "主段落",
      bpm: oldState.bpm || 96,
      loop: oldState.loop || "",
      measureCount: 4,
      beatsPerMeasure: 4,
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
    });
    let saved = deepCloneSavedList(oldState.saved);
    saved.forEach(item => {
      if (Array.isArray(item.sections)) {
        item.sections = item.sections.map(ensureSectionDefaults);
      }
    });
    result = {
      pieceName: oldState.pieceName || "出场锣鼓-慢起",
      sections: [section],
      currentSectionId: section.id,
      continuousPlay: false,
      saved,
      playCount: oldState.playCount || 0,
      lastPlayedAt: oldState.lastPlayedAt || null,
      recentPlayedSection: oldState.recentPlayedSection || "",
      schemeId: oldState.schemeId || null,
      versionId: oldState.versionId || null,
      parentVersionId: oldState.parentVersionId || null,
      baseSnapshot: deepCloneBaseSnapshot(oldState.baseSnapshot)
    };
  }
  migrateAllSectionsToCollabNotes(result);
  migrateAllSectionsPhrases(result);
  return result;
}

function migrateAllSectionsPhrases(state) {
  if (!state || !Array.isArray(state.sections)) return;
  state.sections.forEach(section => {
    migrateSectionPhrases(section);
  });
  if (Array.isArray(state.saved)) {
    state.saved.forEach(savedItem => {
      if (Array.isArray(savedItem.sections)) {
        savedItem.sections.forEach(section => {
          migrateSectionPhrases(section);
        });
      }
    });
  }
}

function migrateRehearsalEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const tempSections = entry.snapshot && Array.isArray(entry.snapshot.sections)
    ? deepCloneSections(entry.snapshot.sections)
    : null;
  const findSection = () => {
    if (!tempSections) return null;
    const sid = entry.sectionId || entry.snapshot?.currentSectionId;
    if (sid) return tempSections.find(s => s.id === sid) || tempSections[0] || null;
    return tempSections[0] || null;
  };
  const matchedSection = findSection();
  const defaultBpm = matchedSection?.beatsPerMeasure || 4;
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
      ? (matchedSection
          ? beatLabelForSection(matchedSection, entry.pausePosition)
          : `第${Math.floor(entry.pausePosition / defaultBpm) + 1}小节第${(entry.pausePosition % defaultBpm) + 1}拍`)
      : "播放完成"),
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
    snapshot: entry.snapshot ? {
      sections: tempSections,
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
    recentPlayedSection: migrated.recentPlayedSection,
    schemeId: migrated.schemeId || null,
    versionId: migrated.versionId || null,
    parentVersionId: migrated.parentVersionId || null,
    baseSnapshot: deepCloneBaseSnapshot(migrated.baseSnapshot)
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
    recentPlayedSection: "",
    schemeId: defaultState.schemeId,
    versionId: defaultState.versionId,
    parentVersionId: defaultState.parentVersionId,
    baseSnapshot: defaultState.baseSnapshot
  };
  state.currentSectionId = state.sections[0].id;
}
migrateAllSectionsToCollabNotes(state);
migrateAllSectionsPhrases(state);
save();

let timer = null;
let playhead = 0;
let audioContext = null;
let currentPlaySectionIndex = 0;
let continuousPlaySectionCount = 0;
let currentRehearsalId = null;
let currentRehearsalStartTime = null;
let pendingRehearsalResume = null;

let currentPhraseId = null;
let currentPhraseRepeatCount = 0;
let basePlaybackBpm = 0;

const diagnosisStorageKey = "wxyy-4-diagnosis-result";
const weaknessProfileStorageKey = "wxyy-4-weakness-profile";
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

let weaknessProfile = null;
let weaknessProfileLoaded = false;

const ADAPTIVE_WEIGHTS = {
  wrongHistory: 0.35,
  confusedInstruments: 0.25,
  pendingNotes: 0.15,
  recentPauses: 0.15,
  complexity: 0.10
};

const COLD_START_QUESTION_RATIO = 0.35;
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 20;

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

let reviewState = {
  active: false,
  selectedRehearsalId: null,
  selectedEventIndex: -1,
  currentEvents: [],
  currentWeakness: null,
  autoOpenAfterPlay: true,
  lastBeatSnapshot: -1,
  eventBeatCounter: 0,
  prevBpm: null,
  prevLoop: null,
  prevSectionId: null,
  prevVoices: null,
  prevMixConfig: null,
  voiceChangeCount: 0,
  loopIterationCount: 0
};

function loadReviewDetailStore() {
  try {
    const raw = localStorage.getItem(reviewDetailKey);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveReviewDetailStore(store) {
  try {
    const serialized = JSON.stringify(store);
    if (serialized.length > REVIEW_STORAGE_LIMIT_BYTES * 1.5) {
      console.warn("[Review] 复盘数据过大，开始压缩...");
      const compressed = compressReviewDetailStore(store);
      localStorage.setItem(reviewDetailKey, JSON.stringify(compressed));
    } else {
      localStorage.setItem(reviewDetailKey, serialized);
    }
  } catch (e) {
    console.error("[Review] 存储复盘数据失败:", e);
  }
}

function getReviewDetailStoreSize() {
  try {
    const raw = localStorage.getItem(reviewDetailKey);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
}

function compressReviewDetailStore(store) {
  const ids = Object.keys(store);
  if (ids.length <= REVIEW_SUMMARY_THRESHOLD) return store;
  const sorted = ids
    .map(id => ({ id, ts: store[id]?.timestamp || 0, events: store[id]?.events?.length || 0 }))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const keepFull = sorted.slice(0, REVIEW_SUMMARY_THRESHOLD);
  const keepFullIds = new Set(keepFull.map(k => k.id));
  const result = {};
  keepFull.forEach(k => {
    result[k.id] = store[k.id];
  });
  sorted.slice(REVIEW_SUMMARY_THRESHOLD).forEach(s => {
    const original = store[s.id];
    if (!original) return;
    result[s.id] = {
      id: s.id,
      timestamp: original.timestamp,
      summaryOnly: true,
      summary: buildRehearsalSummary(original)
    };
  });
  return result;
}

function buildRehearsalSummary(detail) {
  if (!detail) return null;
  const events = detail.events || [];
  const pauseEvents = events.filter(e => e.type === "pause");
  const bpmChanges = events.filter(e => e.type === "bpm");
  const loopChanges = events.filter(e => e.type === "loop");
  const voiceChanges = events.filter(e => e.type === "voice");
  const sectionChanges = events.filter(e => e.type === "section");
  return {
    totalEvents: events.length,
    pauseCount: pauseEvents.length,
    lastPauseBeat: pauseEvents.length > 0 ? pauseEvents[pauseEvents.length - 1].beat : null,
    bpmChangeCount: bpmChanges.length,
    loopChangeCount: loopChanges.length,
    voiceChangeCount: voiceChanges.length,
    sectionChangeCount: sectionChanges.length,
    hasWeakness: !!detail.weakness,
    durationMs: detail.durationMs || null,
    mode: detail.mode || "normal"
  };
}

function getReviewDetailForRehearsal(rehearsalId) {
  if (!rehearsalId) return null;
  const store = loadReviewDetailStore();
  const detail = store[rehearsalId];
  if (!detail) return null;
  if (detail.summaryOnly) {
    return {
      id: rehearsalId,
      timestamp: detail.timestamp,
      summaryOnly: true,
      summary: detail.summary,
      events: [],
      snapshots: [],
      weakness: null
    };
  }
  return detail;
}

function setReviewDetailForRehearsal(rehearsalId, detail) {
  if (!rehearsalId || !detail) return;
  const store = loadReviewDetailStore();
  store[rehearsalId] = detail;
  cleanupOldReviewDetails(store);
  saveReviewDetailStore(store);
}

function cleanupOldReviewDetails(store) {
  const rehearsalIds = new Set(rehearsalLog.map(r => r.id));
  Object.keys(store).forEach(id => {
    if (!rehearsalIds.has(id)) {
      delete store[id];
    }
  });
}

function initRehearsalDetail() {
  reviewState.currentEvents = [];
  reviewState.lastBeatSnapshot = -1;
  reviewState.eventBeatCounter = 0;
  reviewState.prevBpm = null;
  reviewState.prevLoop = null;
  reviewState.prevSectionId = null;
  reviewState.prevVoices = null;
  reviewState.prevMixConfig = null;
  reviewState.voiceChangeCount = 0;
  reviewState.loopIterationCount = 0;
}

function addReviewEvent(type, data, section, beatIndex) {
  if (!currentRehearsalId) return;
  const sec = section || getPlaySection() || getCurrentSection();
  if (!sec) return;
  const now = Date.now();
  const elapsed = currentRehearsalStartTime ? now - currentRehearsalStartTime : 0;
  const totalSteps = getSectionSteps(sec);
  const clampedBeat = typeof beatIndex === "number"
    ? Math.max(0, Math.min(beatIndex, totalSteps - 1))
    : (playhead != null ? playhead : 0);
  const beat = Math.max(0, Math.min(clampedBeat, totalSteps - 1));
  const bpm = sec.beatsPerMeasure || 4;
  const measure = Math.floor(beat / bpm);
  const beatInMeasure = (beat % bpm) + 1;
  const event = {
    id: `evt_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: new Date(now).toISOString(),
    elapsedMs: elapsed,
    sectionId: sec.id,
    sectionName: sec.name,
    beat,
    beatLabel: `${measure + 1}-${beatInMeasure}`,
    measure,
    beatInMeasure,
    data: data || {}
  };
  reviewState.currentEvents.push(event);
  if (type === "snapshot" || reviewState.currentEvents.length === 1) {
    captureMiniSnapshotForEvent(event, sec, beat);
  }
  reviewState.eventBeatCounter++;
}

function captureMiniSnapshotForEvent(event, section, beat) {
  try {
    if (!event) return;
    const sec = section || getPlaySection() || getCurrentSection();
    if (!sec || !sec.pattern) return;
    const totalSteps = getSectionSteps(sec);
    const bpm = sec.beatsPerMeasure || 4;
    const measureCount = sec.measureCount || 4;
    const instrCount = instruments.length;
    const pattern = [];
    for (let row = 0; row < instrCount; row++) {
      const rowData = sec.pattern[row] || [];
      const rowArr = [];
      const len = Math.max(rowData.length, totalSteps || 0);
      for (let i = 0; i < len; i++) {
        rowArr.push(rowData[i] ? 1 : 0);
      }
      pattern.push(rowArr);
    }
    if (pattern.length === 0 || (pattern[0] && pattern[0].length === 0)) return;
    let enabled = [true, true, true, true];
    if (Array.isArray(sec.enabledInstruments)) {
      enabled = [...sec.enabledInstruments];
      while (enabled.length < instrCount) enabled.push(true);
    }
    const snapshot = {
      eventId: event.id,
      timestamp: event.timestamp,
      sectionId: sec.id,
      pattern,
      enabledInstruments: enabled,
      currentBeat: typeof beat === "number" ? beat : (playhead != null ? playhead : 0),
      bpm: sec.bpm,
      measureCount,
      beatsPerMeasure: bpm,
      totalSteps
    };
    event.miniSnapshot = snapshot;
  } catch (e) {
    console.warn("[Review] 快照采集失败:", e);
  }
}

function checkAndRecordChanges(section, beat) {
  const sec = section || getPlaySection() || getCurrentSection();
  if (!sec) return;
  if (reviewState.prevBpm !== null && sec.bpm !== reviewState.prevBpm) {
    addReviewEvent("bpm", {
      from: reviewState.prevBpm,
      to: sec.bpm,
      delta: sec.bpm - reviewState.prevBpm
    }, sec, beat);
  }
  reviewState.prevBpm = sec.bpm;
  if (reviewState.prevLoop !== null && sec.loop !== reviewState.prevLoop) {
    reviewState.loopIterationCount++;
    addReviewEvent("loop", {
      from: reviewState.prevLoop,
      to: sec.loop,
      iteration: reviewState.loopIterationCount
    }, sec, beat);
  }
  reviewState.prevLoop = sec.loop;
  if (reviewState.prevSectionId !== null && sec.id !== reviewState.prevSectionId) {
    addReviewEvent("section", {
      fromId: reviewState.prevSectionId,
      toId: sec.id,
      toName: sec.name
    }, sec, beat);
  }
  reviewState.prevSectionId = sec.id;
  const voicesKey = (sec.enabledInstruments || []).join(",");
  if (reviewState.prevVoices !== null && voicesKey !== reviewState.prevVoices) {
    reviewState.voiceChangeCount++;
    const changes = instruments.map((inst, idx) => {
      const prev = reviewState.prevVoices ? reviewState.prevVoices.split(",")[idx] === "true" : true;
      const curr = sec.enabledInstruments[idx];
      if (prev !== curr) {
        return { name: inst.name, from: prev, to: curr };
      }
      return null;
    }).filter(Boolean);
    addReviewEvent("voice", {
      count: reviewState.voiceChangeCount,
      changes,
      voices: [...sec.enabledInstruments]
    }, sec, beat);
  }
  reviewState.prevVoices = voicesKey;
  const mixKey = JSON.stringify(sec.mixConfig);
  if (reviewState.prevMixConfig !== null && mixKey !== reviewState.prevMixConfig) {
    addReviewEvent("mix", {
      mixConfig: deepCloneMixConfig(sec.mixConfig)
    }, sec, beat);
  }
  reviewState.prevMixConfig = mixKey;
  if (beat - reviewState.lastBeatSnapshot >= SNAPSHOT_INTERVAL_BEATS || reviewState.lastBeatSnapshot === -1) {
    addReviewEvent("snapshot", {}, sec, beat);
    reviewState.lastBeatSnapshot = beat;
  }
}

function finalizeRehearsalDetail(pauseBeat, mode) {
  if (!currentRehearsalId) return null;
  try {
    if (pauseBeat != null) {
      const sec = getPlaySection() || getCurrentSection();
      addReviewEvent("pause", {
        completed: pauseBeat == null,
        finalBeat: pauseBeat
      }, sec, pauseBeat);
    } else {
      addReviewEvent("end", { completed: true });
    }
    const now = Date.now();
    const durationMs = currentRehearsalStartTime ? now - currentRehearsalStartTime : 0;
    const weakness = diagnoseWeaknessFromEvents(reviewState.currentEvents);
    const detail = {
      id: currentRehearsalId,
      timestamp: new Date().toISOString(),
      mode: mode || (tempoTrainer.active ? "tempo" : (state.continuousPlay ? "continuous" : "normal")),
      durationMs,
      events: reviewState.currentEvents,
      weakness
    };
    setReviewDetailForRehearsal(currentRehearsalId, detail);
    return detail;
  } catch (e) {
    console.error("[Review] 复盘数据保存失败:", e);
    return null;
  }
}

function diagnoseWeaknessFromEvents(events) {
  if (!events || events.length === 0) return null;
  const pauseBeats = events
    .filter(e => e.type === "pause")
    .map(e => ({ ...e, reason: e.data?.reason || "manual" }));
  const bpmChanges = events.filter(e => e.type === "bpm");
  const loopEvents = events.filter(e => e.type === "loop");
  const voiceChanges = events.filter(e => e.type === "voice");
  const sectionChanges = events.filter(e => e.type === "section");
  const beatCountMap = {};
  events.forEach(e => {
    if (typeof e.beat === "number") {
      const key = `${e.sectionId || "default"}:${e.beat}`;
      if (!beatCountMap[key]) {
        beatCountMap[key] = { sectionId: e.sectionId, beat: e.beat, count: 0, eventTypes: new Set() };
      }
      beatCountMap[key].count++;
      beatCountMap[key].eventTypes.add(e.type);
    }
  });
  const weakPoints = [];
  pauseBeats.forEach(e => {
    weakPoints.push({
      type: "pause",
      sectionId: e.sectionId,
      beat: e.beat,
      beatLabel: e.beatLabel,
      severity: pauseBeats.length >= 3 ? "high" : (pauseBeats.length >= 2 ? "medium" : "low"),
      score: 80 + Math.min(pauseBeats.length * 5, 20),
      reason: "频繁暂停",
      description: `在${e.beatLabel}处暂停，可能此处节奏不熟悉`
    });
  });
  Object.values(beatCountMap).forEach(bc => {
    if (bc.eventTypes.has("snapshot") && bc.eventTypes.size > 2 && bc.count > 3) {
      const exists = weakPoints.some(w => w.beat === bc.beat && w.sectionId === bc.sectionId);
      if (!exists) {
        weakPoints.push({
          type: "cluster",
          sectionId: bc.sectionId,
          beat: bc.beat,
          severity: bc.count > 5 ? "high" : "medium",
          score: bc.count * 10,
          reason: "事件集中",
          description: `第${Math.floor(bc.beat / 4) + 1}小节附近有多个状态变化事件，可能是练习难点`
        });
      }
    }
  });
  if (loopEvents.length > 4) {
    const lastLoop = loopEvents[loopEvents.length - 1];
    weakPoints.push({
      type: "loop",
      sectionId: lastLoop.sectionId,
      beat: lastLoop.beat,
      beatLabel: lastLoop.beatLabel,
      severity: loopEvents.length > 8 ? "high" : "medium",
      score: loopEvents.length * 6,
      reason: "反复循环",
      description: `循环练习${loopEvents.length}次，建议加强此段落练习`
    });
  }
  if (voiceChanges.length > 2) {
    const last = voiceChanges[voiceChanges.length - 1];
    weakPoints.push({
      type: "voice",
      sectionId: last.sectionId,
      beat: last.beat,
      beatLabel: last.beatLabel,
      severity: voiceChanges.length > 4 ? "high" : "low",
      score: voiceChanges.length * 8,
      reason: "声部调整",
      description: `反复切换声部（${voiceChanges.length}次），可能在排查声部配合问题`
    });
  }
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const totalScore = weakPoints.reduce((s, w) => s + w.score * severityWeight[w.severity], 0);
  const maxPossibleScore = 100 * 10;
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - (totalScore / maxPossibleScore) * 100)));
  let level = "good";
  let desc = "本次排练整体稳定";
  if (stabilityScore < 50) { level = "poor"; desc = "存在较多薄弱点，建议针对性强化"; }
  else if (stabilityScore < 75) { level = "fair"; desc = "有进步空间，部分段落需加强"; }
  else if (stabilityScore < 90) { level = "good"; desc = "整体稳定，少量细节可提升"; }
  else { level = "excellent"; desc = "表现优秀，排练效果出色！"; }
  weakPoints.sort((a, b) => b.score - a.score);
  return {
    stabilityScore,
    level,
    description: desc,
    weakPoints: weakPoints.slice(0, 8),
    stats: {
      pauseCount: pauseBeats.length,
      bpmChangeCount: bpmChanges.length,
      loopCount: loopEvents.length,
      voiceChangeCount: voiceChanges.length,
      sectionChangeCount: sectionChanges.length,
      totalEvents: events.length
    }
  };
}

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
const weaknessOverall = document.querySelector("#weaknessOverall");
const weaknessAccuracy = document.querySelector("#weaknessAccuracy");
const weaknessWrongCount = document.querySelector("#weaknessWrongCount");
const weaknessConfusedCount = document.querySelector("#weaknessConfusedCount");
const weaknessTopList = document.querySelector("#weaknessTopList");
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

const structuralModeBtn = document.querySelector("#structuralModeBtn");
const phrasePanel = document.querySelector("#phrasePanel");
const phraseList = document.querySelector("#phraseList");
const addPhraseBtn = document.querySelector("#addPhraseBtn");
const phraseLibraryBtn = document.querySelector("#phraseLibraryBtn");
const phraseEditPanel = document.querySelector("#phraseEditPanel");
const phraseEditCloseBtn = document.querySelector("#phraseEditCloseBtn");
const phraseNameInput = document.querySelector("#phraseNameInput");
const phraseTypeSelect = document.querySelector("#phraseTypeSelect");
const phraseStartMeasure = document.querySelector("#phraseStartMeasure");
const phraseEndMeasure = document.querySelector("#phraseEndMeasure");
const phraseRepeat = document.querySelector("#phraseRepeat");
const phraseTempo = document.querySelector("#phraseTempo");
const phraseNote = document.querySelector("#phraseNote");
const phraseSaveBtn = document.querySelector("#phraseSaveBtn");
const phraseDuplicateBtn = document.querySelector("#phraseDuplicateBtn");
const phraseDeleteBtn = document.querySelector("#phraseDeleteBtn");

const phraseLibraryOverlay = document.querySelector("#phraseLibraryOverlay");
const phraseLibraryCloseBtn = document.querySelector("#phraseLibraryCloseBtn");
const phraseLibraryCancelBtn = document.querySelector("#phraseLibraryCancelBtn");
const presetPhraseList = document.querySelector("#presetPhraseList");
const customPhraseList = document.querySelector("#customPhraseList");
const currentPhraseList = document.querySelector("#currentPhraseList");
const phraseLibrarySectionSelect = document.querySelector("#phraseLibrarySectionSelect");
const phraseLibraryTabs = document.querySelectorAll(".phrase-library-tab");
const phraseLibraryTabContents = document.querySelectorAll("[data-phrase-library-tab]");
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

const SCHEMA_VERSION = 5;
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5];

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
  renderLoopSelect();
  renderCollabTargetSelect();
}

function beatLabel(index, section) {
  const sec = section || getCurrentSection();
  const bpm = sec?.beatsPerMeasure || 4;
  const measure = Math.floor(index / bpm) + 1;
  const beat = (index % bpm) + 1;
  return `${measure}-${beat}`;
}

function renderLoopSelect() {
  const section = getCurrentSection();
  if (!section || !loopSelect) return;
  const mc = section.measureCount || 4;
  const currentVal = loopSelect.value;
  let html = '<option value="">全段</option>';
  for (let i = 0; i < mc; i++) {
    html += `<option value="${i}">第${i+1}小节</option>`;
  }
  loopSelect.innerHTML = html;
  loopSelect.value = (currentVal !== "" && Number(currentVal) < mc) ? currentVal : (section.loop || "");
}
function renderCollabTargetSelect() {
  const section = getCurrentSection();
  if (!section || !collabTargetSelect) return;
  const mc = section.measureCount || 4;
  const currentVal = collabTargetSelect.value;
  let html = '<option value="all">全段</option>';
  for (let i = 0; i < mc; i++) {
    html += `<option value="${i}">第${i+1}小节</option>`;
  }
  collabTargetSelect.innerHTML = html;
  if (currentVal === "all" || (Number(currentVal) >= 0 && Number(currentVal) < mc)) {
    collabTargetSelect.value = currentVal;
  } else {
    collabTargetSelect.value = "all";
  }
}
function resizeSectionPattern(section, newMc, newBpm) {
  newMc = Math.max(1, Math.min(16, parseInt(newMc) || 4));
  newBpm = Math.max(2, Math.min(7, parseInt(newBpm) || 4));
  const oldMc = section.measureCount || 4;
  const oldBpm = section.beatsPerMeasure || 4;
  if (newMc === oldMc && newBpm === oldBpm) return;
  const oldSteps = oldMc * oldBpm;
  const newSteps = newMc * newBpm;
  const newPattern = instruments.map((inst, row) => {
    const newRow = Array.from({length: newSteps}, (_, i) => "");
    for (let oldIdx = 0; oldIdx < oldSteps && oldIdx < newSteps; oldIdx++) {
      const oldMeasure = Math.floor(oldIdx / oldBpm);
      const oldBeat = oldIdx % oldBpm;
      if (oldMeasure < newMc && oldBeat < newBpm) {
        const newIdx = oldMeasure * newBpm + oldBeat;
        if (newIdx < newSteps && oldIdx < section.pattern[row].length) {
          newRow[newIdx] = section.pattern[row][oldIdx] || "";
        }
      }
    }
    return newRow;
  });
  section.pattern = newPattern;
  section.measureCount = newMc;
  section.beatsPerMeasure = newBpm;
  if (section.loop !== "") {
    const loopNum = Number(section.loop);
    if (isNaN(loopNum) || loopNum >= newMc) {
      section.loop = "";
    }
  }
  if (Array.isArray(section.collabNotes)) {
    section.collabNotes.forEach(n => {
      if (n.target !== "all" && Number(n.target) >= newMc) {
        n.target = "all";
      }
    });
  }
  save();
}

let editingMeasureSectionId = null;

function renderSectionsList() {
  sectionsList.innerHTML = state.sections
    .map((section, index) => {
      const isActive = section.id === state.currentSectionId;
      const isEditing = editingSectionId === section.id;
      const isMeasureEditing = editingMeasureSectionId === section.id;
      const noteCount = section.notes.length;
      const filledCount = section.pattern.flat().filter(Boolean).length;
      const rangeText = section.measureRange
        ? `${section.measureRange.start}-${section.measureRange.end}小节`
        : "";
      const mc = section.measureCount || 4;
      const bpm = section.beatsPerMeasure || 4;
      return `
        <div class="section-item ${isActive ? "active" : ""}" data-section-id="${section.id}">
          <span class="section-order">${index + 1}</span>
          <div class="section-info">
            ${isEditing
              ? `<input type="text" class="section-name-input" value="${section.name}" data-section-rename="${section.id}" autofocus>`
              : `<div class="section-name">${section.name}</div>
                 <div class="section-meta">
                   ${section.bpm}BPM${rangeText ? ` · ${rangeText}` : ""} · ${noteCount}条批注 · ${filledCount}个口令
                   ${isMeasureEditing
                     ? ` · <span class="measure-edit">
                         <input type="number" min="1" max="16" value="${mc}" class="measure-count-input" data-mc-section="${section.id}" style="width:48px;">小节
                         <input type="number" min="2" max="7" value="${bpm}" class="beats-input" data-bpm-section="${section.id}" style="width:48px;">/4拍
                         <button type="button" class="measure-save-btn" data-save-measure="${section.id}">保存</button>
                         <button type="button" class="measure-cancel-btn" data-cancel-measure="${section.id}">取消</button>
                       </span>`
                     : ` · <span class="measure-display" style="cursor:pointer;color:#2563eb;" data-toggle-measure="${section.id}">${mc}小节·${bpm}/4拍</span>`
                   }
                 </div>`
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
  const totalSteps = getSectionSteps(section);
  const bpm = section.beatsPerMeasure || 4;

  grid.style.gridTemplateColumns = `76px repeat(${totalSteps}, minmax(48px, 1fr))`;

  ensureSectionPhrases(section);
  const phrases = section.phrases || [];

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
  for (let i = 0; i < totalSteps; i += 1) {
    const question = hiddenStepMap[i];
    const answered = answeredStepMap[i];
    const isRestHidden = question && question.rows.length === 0;
    const measure = Math.floor(i / bpm);
    const noteTypes = measureNoteTypes[measure];
    const phrase = getPhraseAtBeat(section, i);
    const isPhraseStart = phrase && (i === phrase.startMeasure * bpm);
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

    let beatClass = "beat-cell" + noteClass + (phrase && structuralMode ? " phrase-header" : "");
    let beatContent = beatLabelForSection(section, i);

    if (phrase && structuralMode && isPhraseStart) {
      const type = getPhraseType(phrase.type);
      beatContent = `<span class="phrase-label" style="background: ${phrase.color || type.color};">${type.icon} ${phrase.name || type.name}</span>` + beatContent;
    }

    if (isRestHidden) {
      beatClass += " hidden-cell hidden-rest";
      if (answered) {
        beatClass += answered.correct ? " answered-correct" : " answered-wrong";
        beatContent = beatLabelForSection(section, i);
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
    for (let step = 0; step < totalSteps; step += 1) {
      const value = section.pattern[rowIndex] ? (section.pattern[rowIndex][step] || "") : "";
      const question = hiddenStepMap[step];
      const isInstrumentHidden = question && question.rows.length > 0 && question.rows.includes(rowIndex);
      const answered = answeredStepMap[step];
      const measure = Math.floor(step / bpm);
      const noteTypes = measureNoteTypes[measure];
      const phrase = getPhraseAtBeat(section, step);
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

      let cellClass = `cell ${value ? "filled" : ""} ${muted ? "muted" : ""}${noteClass}${phrase && structuralMode ? " phrase-highlight" : ""}`;
      let cellContent = value;
      let cellStyle = "";

      if (phrase && structuralMode) {
        cellStyle = `background-color: ${phrase.color}20;`;
      }

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

      row.push(`<button class="${cellClass}" type="button" data-row="${rowIndex}" data-step="${step}" ${cellStyle ? `style="${cellStyle}"` : ""}>${cellContent}</button>`);
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
  const mc = section.measureCount || 4;
  const measureTypes = {};
  section.collabNotes.forEach(note => {
    if (note.target === "all") {
      for (let i = 0; i < mc; i++) {
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
  const mc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;

  renderPhraseList();

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
  const mc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;
  const cnNums = ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六"];

  return Array.from({length: mc}, (_, i) => i).map((measure) => {
    const start = measure * bpm;
    const cells = section.pattern.flatMap((row) => row.slice(start, start + bpm));
    const filled = cells.filter(Boolean).length;
    const total = cells.length;
    const oldNotesForMeasure = section.notes.filter((n) => {
      const m = n.match(/第\s*([一二三四五六七八九十\d]+)\s*小节/);
      if (!m) return false;
      let parsedNum;
      if (cnNums.includes(m[1])) parsedNum = cnNums.indexOf(m[1]) + 1;
      else parsedNum = parseInt(m[1]);
      return parsedNum === measure + 1;
    });
    const collabNotesForMeasure = Array.isArray(section.collabNotes)
      ? section.collabNotes.filter(n =>
          !n.resolved && (n.target === "all" || n.target === measure)
        )
      : [];
    const allNotesForMeasure = [...oldNotesForMeasure, ...collabNotesForMeasure];
    const instrumentCoverage = section.pattern.filter((row, idx) =>
      section.enabledInstruments[idx] && row.slice(start, start + bpm).some(Boolean)
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

const phraseLibraryKey = "wxyy-4-phrase-library";

const PRESET_PHRASES = [
  {
    id: "preset-qishi-slow",
    name: "慢起势",
    type: "qishi",
    icon: "🚀",
    color: "#b3252e",
    measureCount: 2,
    description: "慢速开场，2小节，奠定沉稳基调",
    patternHint: "每小节第一拍强奏"
  },
  {
    id: "preset-liangxiang-kuai",
    name: "快亮相",
    type: "liangxiang",
    icon: "✨",
    color: "#c59427",
    measureCount: 4,
    description: "快速展示段，4小节，节奏鲜明有力",
    patternHint: "密集鼓点配合大锣"
  },
  {
    id: "preset-zhuanchang-4",
    name: "过渡转场",
    type: "zhuanchang",
    icon: "🔄",
    color: "#1b6a68",
    measureCount: 2,
    description: "2小节过渡，连接前后段落",
    patternHint: "渐强渐快处理"
  },
  {
    id: "preset-shoushu-huan",
    name: "缓收束",
    type: "shoushu",
    icon: "🎯",
    color: "#6d28d9",
    measureCount: 2,
    description: "舒缓结尾，2小节，余韵悠长",
    patternHint: "最后一拍收锣"
  },
  {
    id: "preset-fanfu-base",
    name: "基础反复",
    type: "fanfu",
    icon: "♻️",
    color: "#0891b2",
    measureCount: 2,
    description: "2小节反复段，强化记忆点",
    patternHint: "重复相同节奏型"
  },
  {
    id: "preset-bianzou-var",
    name: "变奏发展",
    type: "bianzou",
    icon: "🎼",
    color: "#db2777",
    measureCount: 4,
    description: "4小节变奏，增加节奏层次",
    patternHint: "主题旋律加花变奏"
  }
];

function loadPhraseLibrary() {
  try {
    const raw = localStorage.getItem(phraseLibraryKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePhraseLibrary(library) {
  localStorage.setItem(phraseLibraryKey, JSON.stringify(library));
}

let customPhraseLibrary = loadPhraseLibrary();

function renderPhraseList() {
  const section = getCurrentSection();
  if (!section || !phraseList) return;
  ensureSectionPhrases(section);
  const phrases = section.phrases || [];
  const mc = section.measureCount || 4;
  phraseList.innerHTML = phrases.map(phrase => {
    const type = getPhraseType(phrase.type);
    const isSelected = selectedPhraseId === phrase.id;
    const measureRange = phrase.endMeasure - phrase.startMeasure + 1;
    const idx = phrases.findIndex(p => p.id === phrase.id);
    const canMoveUp = idx > 0 || phrase.startMeasure > 0;
    const canMoveDown = idx < phrases.length - 1 || phrase.endMeasure < mc - 1;
    return `
      <div class="phrase-item ${isSelected ? "selected" : ""}" 
           data-phrase-id="${phrase.id}"
           draggable="true"
           style="border-left: 4px solid ${phrase.color || type.color};">
        <div class="phrase-item-header">
          <span class="phrase-icon" style="background: ${phrase.color || type.color}20;">${type.icon}</span>
          <span class="phrase-name">${phrase.name || type.name}</span>
          <span class="phrase-type-tag">${type.name}</span>
        </div>
        <div class="phrase-item-meta">
          <span>📏 第${phrase.startMeasure + 1}-${phrase.endMeasure + 1}小节 (${measureRange}节)</span>
          ${phrase.repeat > 1 ? `<span class="phrase-repeat-badge">🔁 ×${phrase.repeat}</span>` : ""}
          ${phrase.tempoMultiplier !== 1 ? `<span class="phrase-tempo-badge">⚡ ${phrase.tempoMultiplier}x</span>` : ""}
        </div>
        ${phrase.note ? `<div class="phrase-note-preview">${phrase.note}</div>` : ""}
        <div class="phrase-item-actions">
          <button type="button" class="phrase-item-btn" data-phrase-move-up="${phrase.id}" title="上移" ${canMoveUp ? "" : "disabled"}>↑</button>
          <button type="button" class="phrase-item-btn" data-phrase-move-down="${phrase.id}" title="下移" ${canMoveDown ? "" : "disabled"}>↓</button>
          <button type="button" class="phrase-item-btn" data-phrase-shift-left="${phrase.id}" title="前移一小节" ${phrase.startMeasure > 0 ? "" : "disabled"}>←</button>
          <button type="button" class="phrase-item-btn" data-phrase-shift-right="${phrase.id}" title="后移一小节" ${phrase.endMeasure < mc - 1 ? "" : "disabled"}>→</button>
          <button type="button" class="phrase-item-btn" data-phrase-edit="${phrase.id}" title="编辑">✎</button>
          <button type="button" class="phrase-item-btn" data-phrase-duplicate="${phrase.id}" title="复制">⎘</button>
          <button type="button" class="phrase-item-btn" data-phrase-save-lib="${phrase.id}" title="存为模板">💾</button>
        </div>
      </div>
    `;
  }).join("");
  if (phrases.length === 0) {
    phraseList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">暂无乐句块，点击「+ 乐句块」添加</div>';
  }
}

function renderPhraseTypeSelect() {
  if (!phraseTypeSelect) return;
  phraseTypeSelect.innerHTML = PHRASE_TYPE_LIST.map(type => 
    `<option value="${type.id}">${type.icon} ${type.name} - ${type.desc}</option>`
  ).join("");
}

function openPhraseEditor(phraseId) {
  const section = getCurrentSection();
  if (!section) return;
  ensureSectionPhrases(section);
  renderPhraseTypeSelect();
  const phrase = phraseId ? section.phrases.find(p => p.id === phraseId) : null;
  const mc = section.measureCount || 4;
  selectedPhraseId = phraseId;
  if (phrase) {
    phraseNameInput.value = phrase.name || "";
    phraseTypeSelect.value = phrase.type || "custom";
    phraseStartMeasure.value = phrase.startMeasure + 1;
    phraseEndMeasure.value = phrase.endMeasure + 1;
    phraseRepeat.value = phrase.repeat || 1;
    phraseTempo.value = phrase.tempoMultiplier || 1;
    phraseNote.value = phrase.note || "";
  } else {
    phraseNameInput.value = "";
    phraseTypeSelect.value = "liangxiang";
    phraseStartMeasure.value = 1;
    phraseEndMeasure.value = Math.min(2, mc);
    phraseRepeat.value = 1;
    phraseTempo.value = 1;
    phraseNote.value = "";
  }
  phraseStartMeasure.max = mc;
  phraseEndMeasure.max = mc;
  phraseEditPanel.style.display = "block";
}

function closePhraseEditor() {
  phraseEditPanel.style.display = "none";
  selectedPhraseId = null;
}

function savePhraseFromEditor() {
  const section = getCurrentSection();
  if (!section) return;
  ensureSectionPhrases(section);
  const mc = section.measureCount || 4;
  const typeId = phraseTypeSelect.value;
  const type = getPhraseType(typeId);
  let startMeasure = parseInt(phraseStartMeasure.value) - 1;
  let endMeasure = parseInt(phraseEndMeasure.value) - 1;
  startMeasure = Math.max(0, Math.min(mc - 1, startMeasure));
  endMeasure = Math.max(startMeasure, Math.min(mc - 1, endMeasure));
  const repeat = Math.max(1, Math.min(16, parseInt(phraseRepeat.value) || 1));
  const tempoMultiplier = Math.max(0.25, Math.min(4, parseFloat(phraseTempo.value) || 1));
  const name = phraseNameInput.value.trim() || type.name;
  const note = phraseNote.value.trim();
  if (selectedPhraseId) {
    const phrase = section.phrases.find(p => p.id === selectedPhraseId);
    if (phrase) {
      phrase.name = name;
      phrase.type = typeId;
      phrase.startMeasure = startMeasure;
      phrase.endMeasure = endMeasure;
      phrase.repeat = repeat;
      phrase.tempoMultiplier = tempoMultiplier;
      phrase.note = note;
      phrase.color = type.color;
      phrase.updatedAt = new Date().toISOString();
    }
  } else {
    const newPhrase = {
      id: crypto.randomUUID(),
      name,
      type: typeId,
      startMeasure,
      endMeasure,
      repeat,
      tempoMultiplier,
      note,
      color: type.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    section.phrases.push(newPhrase);
  }
  section.phrases = normalizePhraseOverlaps(section.phrases, mc);
  save();
  renderPhraseList();
  renderGrid();
  renderDashboard();
  closePhraseEditor();
}

function duplicatePhrase(phraseId) {
  const section = getCurrentSection();
  if (!section) return;
  ensureSectionPhrases(section);
  const phrase = section.phrases.find(p => p.id === phraseId);
  if (!phrase) return;
  const mc = section.measureCount || 4;
  const newPhrase = {
    ...phrase,
    id: crypto.randomUUID(),
    name: phrase.name + " (副本)",
    startMeasure: Math.min(phrase.endMeasure + 1, mc - 1),
    endMeasure: Math.min(phrase.endMeasure + (phrase.endMeasure - phrase.startMeasure + 1), mc - 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (newPhrase.startMeasure >= mc) {
    newPhrase.startMeasure = 0;
    newPhrase.endMeasure = Math.min(phrase.endMeasure - phrase.startMeasure, mc - 1);
  }
  section.phrases.push(newPhrase);
  section.phrases = normalizePhraseOverlaps(section.phrases, mc);
  save();
  renderPhraseList();
  renderGrid();
  renderDashboard();
}

function deletePhrase(phraseId) {
  const section = getCurrentSection();
  if (!section) return;
  if (!confirm("确定要删除这个乐句块吗？")) return;
  section.phrases = section.phrases.filter(p => p.id !== phraseId);
  if (selectedPhraseId === phraseId) {
    closePhraseEditor();
  }
  save();
  renderPhraseList();
  renderGrid();
  renderDashboard();
}

function movePhrase(phraseId, direction) {
  const section = getCurrentSection();
  if (!section) return;
  ensureSectionPhrases(section);
  const mc = section.measureCount || 4;
  const sorted = [...section.phrases].sort((a, b) => a.startMeasure - b.startMeasure);
  const idx = sorted.findIndex(p => p.id === phraseId);
  if (idx < 0) return;
  const phrase = sorted[idx];
  const span = phrase.endMeasure - phrase.startMeasure + 1;
  if (direction < 0) {
    if (phrase.startMeasure <= 0) return;
    const newStart = phrase.startMeasure - 1;
    const newEnd = newStart + span - 1;
    if (idx > 0) {
      const prev = sorted[idx - 1];
      if (newEnd >= prev.startMeasure) {
        const tmp = { ...prev };
        prev.startMeasure = phrase.startMeasure;
        prev.endMeasure = phrase.endMeasure;
        phrase.startMeasure = tmp.startMeasure - 1;
        phrase.endMeasure = tmp.endMeasure - 1;
      } else {
        phrase.startMeasure = newStart;
        phrase.endMeasure = newEnd;
      }
    } else {
      phrase.startMeasure = newStart;
      phrase.endMeasure = newEnd;
    }
  } else {
    if (phrase.endMeasure >= mc - 1) return;
    const newStart = phrase.startMeasure + 1;
    const newEnd = newStart + span - 1;
    if (idx < sorted.length - 1) {
      const next = sorted[idx + 1];
      if (newStart <= next.endMeasure) {
        const tmp = { ...next };
        next.startMeasure = phrase.startMeasure;
        next.endMeasure = phrase.endMeasure;
        phrase.startMeasure = tmp.startMeasure + 1;
        phrase.endMeasure = tmp.endMeasure + 1;
      } else {
        phrase.startMeasure = newStart;
        phrase.endMeasure = newEnd;
      }
    } else {
      phrase.startMeasure = newStart;
      phrase.endMeasure = newEnd;
    }
  }
  phrase.updatedAt = new Date().toISOString();
  section.phrases = normalizePhraseOverlaps(section.phrases, mc);
  save();
  renderPhraseList();
  renderGrid();
  renderDashboard();
}

function shiftPhraseMeasures(phraseId, measureDelta) {
  const section = getCurrentSection();
  if (!section) return;
  ensureSectionPhrases(section);
  const mc = section.measureCount || 4;
  const phrase = section.phrases.find(p => p.id === phraseId);
  if (!phrase) return;
  const span = phrase.endMeasure - phrase.startMeasure + 1;
  let newStart = phrase.startMeasure + measureDelta;
  let newEnd = phrase.endMeasure + measureDelta;
  newStart = Math.max(0, Math.min(mc - span, newStart));
  newEnd = newStart + span - 1;
  if (newStart === phrase.startMeasure) return;
  phrase.startMeasure = newStart;
  phrase.endMeasure = newEnd;
  phrase.updatedAt = new Date().toISOString();
  section.phrases = normalizePhraseOverlaps(section.phrases, mc);
  save();
  renderPhraseList();
  renderGrid();
  renderDashboard();
}

function savePhraseToLibrary(phraseId) {
  const section = getCurrentSection();
  if (!section) return;
  const phrase = section.phrases.find(p => p.id === phraseId);
  if (!phrase) return;
  const bpm = section.beatsPerMeasure || 4;
  const start = phrase.startMeasure * bpm;
  const end = (phrase.endMeasure + 1) * bpm;
  const patternSlice = section.pattern.map(row => row.slice(start, end));
  const libItem = {
    id: crypto.randomUUID(),
    name: phrase.name,
    type: phrase.type,
    color: phrase.color,
    measureCount: phrase.endMeasure - phrase.startMeasure + 1,
    beatsPerMeasure: bpm,
    pattern: patternSlice,
    note: phrase.note || "",
    repeat: phrase.repeat || 1,
    tempoMultiplier: phrase.tempoMultiplier || 1,
    createdAt: new Date().toISOString()
  };
  customPhraseLibrary.push(libItem);
  savePhraseLibrary(customPhraseLibrary);
  alert(`乐句块「${phrase.name}」已保存到乐句库！`);
}

function insertPhraseFromLibrary(libItem, targetMeasure = 0) {
  const section = getCurrentSection();
  if (!section) return;
  const mc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;
  const itemMc = libItem.measureCount || 2;
  const startMeasure = Math.max(0, Math.min(mc - itemMc, targetMeasure));
  const endMeasure = startMeasure + itemMc - 1;
  const type = getPhraseType(libItem.type);
  const newPhrase = {
    id: crypto.randomUUID(),
    name: libItem.name || type.name,
    type: libItem.type || "custom",
    startMeasure,
    endMeasure,
    repeat: libItem.repeat || 1,
    tempoMultiplier: libItem.tempoMultiplier || 1,
    note: libItem.note || "",
    color: libItem.color || type.color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (libItem.pattern && Array.isArray(libItem.pattern) && libItem.pattern.length === instruments.length) {
    const startBeat = startMeasure * bpm;
    const itemBpm = libItem.beatsPerMeasure || bpm;
    libItem.pattern.forEach((row, rowIdx) => {
      if (!section.pattern[rowIdx]) return;
      for (let i = 0; i < row.length && i < itemMc * itemBpm; i++) {
        const targetIdx = startBeat + i;
        if (targetIdx < section.pattern[rowIdx].length) {
          section.pattern[rowIdx][targetIdx] = row[i] || "";
        }
      }
    });
  }
  ensureSectionPhrases(section);
  section.phrases.push(newPhrase);
  section.phrases = normalizePhraseOverlaps(section.phrases, mc);
  save();
  renderPhraseList();
  renderGrid();
  renderSidebars();
  renderDashboard();
}

function renderPhraseLibrary() {
  if (!presetPhraseList || !customPhraseList) return;
  presetPhraseList.innerHTML = PRESET_PHRASES.map(item => {
    const type = getPhraseType(item.type);
    return `
      <div class="library-phrase-card">
        <div class="library-phrase-icon" style="background: ${item.color || type.color}20;">${item.icon || type.icon}</div>
        <div class="library-phrase-info">
          <div class="library-phrase-name">${item.name}</div>
          <div class="library-phrase-meta">
            <span>${item.measureCount}小节</span>
            <span>${type.name}</span>
          </div>
          <div class="library-phrase-desc">${item.description || ""}</div>
        </div>
        <div class="library-phrase-actions">
          <button type="button" class="library-phrase-btn" data-insert-preset="${item.id}">插入</button>
        </div>
      </div>
    `;
  }).join("");
  customPhraseList.innerHTML = customPhraseLibrary.map(item => {
    const type = getPhraseType(item.type);
    return `
      <div class="library-phrase-card">
        <div class="library-phrase-icon" style="background: ${item.color || type.color}20;">${type.icon}</div>
        <div class="library-phrase-info">
          <div class="library-phrase-name">${item.name}</div>
          <div class="library-phrase-meta">
            <span>${item.measureCount}小节</span>
            <span>${type.name}</span>
            ${item.tempoMultiplier !== 1 ? `<span>⚡${item.tempoMultiplier}x</span>` : ""}
          </div>
          ${item.note ? `<div class="library-phrase-desc">${item.note}</div>` : ""}
        </div>
        <div class="library-phrase-actions">
          <button type="button" class="library-phrase-btn" data-insert-custom="${item.id}">插入</button>
          <button type="button" class="library-phrase-btn danger" data-delete-custom="${item.id}">删除</button>
        </div>
      </div>
    `;
  }).join("");
  if (customPhraseLibrary.length > 0 && customPhraseEmpty) {
    customPhraseEmpty.style.display = "none";
  } else if (customPhraseEmpty) {
    customPhraseEmpty.style.display = "block";
  }
}

function renderCurrentSectionPhrases() {
  if (!currentPhraseList || !phraseLibrarySectionSelect) return;
  const sectionId = phraseLibrarySectionSelect.value;
  const section = state.sections.find(s => s.id === sectionId);
  if (!section) {
    currentPhraseList.innerHTML = "";
    return;
  }
  ensureSectionPhrases(section);
  currentPhraseList.innerHTML = section.phrases.map(phrase => {
    const type = getPhraseType(phrase.type);
    const measureRange = phrase.endMeasure - phrase.startMeasure + 1;
    return `
      <div class="library-phrase-card">
        <div class="library-phrase-icon" style="background: ${phrase.color || type.color}20;">${type.icon}</div>
        <div class="library-phrase-info">
          <div class="library-phrase-name">${phrase.name || type.name}</div>
          <div class="library-phrase-meta">
            <span>第${phrase.startMeasure + 1}-${phrase.endMeasure + 1}小节</span>
            <span>${measureRange}小节</span>
            <span>${type.name}</span>
          </div>
          ${phrase.note ? `<div class="library-phrase-desc">${phrase.note}</div>` : ""}
        </div>
        <div class="library-phrase-actions">
          <button type="button" class="library-phrase-btn" data-copy-phrase="${phrase.id}" data-section="${sectionId}">复制到当前</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderPhraseLibrarySectionSelect() {
  if (!phraseLibrarySectionSelect) return;
  phraseLibrarySectionSelect.innerHTML = state.sections.map(s => 
    `<option value="${s.id}">${s.name}</option>`
  ).join("");
  const currentSection = getCurrentSection();
  if (currentSection) {
    phraseLibrarySectionSelect.value = currentSection.id;
  }
}

function toggleStructuralMode() {
  structuralMode = !structuralMode;
  if (structuralModeBtn) {
    structuralModeBtn.classList.toggle("active", structuralMode);
  }
  document.body.classList.toggle("structural-mode", structuralMode);
  renderGrid();
  renderPhraseList();
}

function openPhraseLibrary() {
  if (!phraseLibraryOverlay) return;
  renderPhraseLibrary();
  renderPhraseLibrarySectionSelect();
  renderCurrentSectionPhrases();
  phraseLibraryOverlay.style.display = "flex";
}

function closePhraseLibrary() {
  if (!phraseLibraryOverlay) return;
  phraseLibraryOverlay.style.display = "none";
}

function switchPhraseLibraryTab(tabName) {
  phraseLibraryTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.phraseTab === tabName);
  });
  phraseLibraryTabContents.forEach(content => {
    content.classList.toggle("active", content.dataset.phraseLibraryTab === tabName);
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

  const phrases = section.phrases || [];
  const phraseTypeCounts = {};
  phrases.forEach(p => {
    phraseTypeCounts[p.type] = (phraseTypeCounts[p.type] || 0) + 1;
  });

  if (state.sections.length > 1) {
    suggestions.push({ icon: "📋", html: `当前共 <strong>${state.sections.length}</strong> 个段落，可开启<strong>连续播放</strong>按顺序排练。` });
  }

  if (structuralMode && phrases.length > 0) {
    const typeLabels = Object.entries(phraseTypeCounts)
      .map(([type, count]) => `${getPhraseType(type).label}×${count}`)
      .join("、");
    suggestions.push({ icon: "🧱", html: `结构化模式：当前段落有 <strong>${phrases.length}</strong> 个乐句块（${typeLabels}），可按乐句块组织排练。` });
  } else if (structuralMode && phrases.length === 0) {
    suggestions.push({ icon: "🧱", html: `已开启结构化模式，但尚未定义乐句块，点击右侧面板添加乐句块以获得编排建议。` });
  }

  if (phrases.length > 0) {
    const overlapping = detectPhraseOverlaps(phrases);
    if (overlapping.length > 0) {
      suggestions.push({ icon: "⚠️", html: `检测到 <strong>${overlapping.length}</strong> 处乐句块重叠，建议调整以避免编排混乱。` });
    }
  }

  if (phrases.length > 0 && phrases.some(p => p.repeat > 1)) {
    const repeatPhrases = phrases.filter(p => p.repeat > 1);
    suggestions.push({ icon: "🔄", html: `有 <strong>${repeatPhrases.length}</strong> 个乐句块设置了反复，播放时会自动重复对应小节。` });
  }

  if (phrases.length > 0 && phrases.some(p => Math.abs(p.tempoMultiplier - 1) > 0.01)) {
    const tempoPhrases = phrases.filter(p => Math.abs(p.tempoMultiplier - 1) > 0.01);
    suggestions.push({ icon: "⚡", html: `有 <strong>${tempoPhrases.length}</strong> 个乐句块设置了变速，播放时会自动调整速度。` });
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

  const totalCells = instruments.length * getSectionSteps(section);
  const filledCells = section.pattern.flat().filter(Boolean).length;
  const percent = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;
  completionBar.style.width = `${percent}%`;
  completionPercent.textContent = `${percent}%`;
  completionDetail.textContent = `${filledCells}/${totalCells} 个口令`;

  const collabStats = getCollabNotesStats();
  difficultyCount.textContent = collabStats.total;
  savedCount.textContent = state.saved.length;
  playCount.textContent = state.playCount || 0;

  const weaknessSummary = getWeaknessSummary(section);
  if (weaknessSummary) {
    if (weaknessSummary.totalQuestions > 0) {
      weaknessOverall.textContent = `整体风险：${weaknessSummary.overallWeakness === "high" ? "🔴 高" : weaknessSummary.overallWeakness === "medium" ? "🟡 中" : "🟢 低"}`;
      weaknessOverall.className = `weakness-overall weakness-${weaknessSummary.overallWeakness}`;
      weaknessAccuracy.textContent = `${weaknessSummary.accuracy}%`;
    } else {
      weaknessOverall.textContent = "暂无诊断数据";
      weaknessOverall.className = "weakness-overall weakness-none";
      weaknessAccuracy.textContent = "—";
    }
    weaknessWrongCount.textContent = weaknessSummary.wrongStepsCount;
    weaknessConfusedCount.textContent = weaknessSummary.confusedPairsCount;

    if (weaknessSummary.topWrongSteps.length > 0 || weaknessSummary.topConfusedPairs.length > 0) {
      let topHtml = "";
      if (weaknessSummary.topWrongSteps.length > 0) {
        topHtml += `<div class="weakness-top-title">易错拍点：</div>`;
        topHtml += weaknessSummary.topWrongSteps.map(step => {
          const beatLab = beatLabel(step.step);
          return `<span class="weakness-top-item">${beatLab} (${step.wrongCount}次错)</span>`;
        }).join("");
      }
      if (weaknessSummary.topConfusedPairs.length > 0) {
        topHtml += `<div class="weakness-top-title">易混淆：</div>`;
        topHtml += weaknessSummary.topConfusedPairs.map(pair => {
          return `<span class="weakness-top-item">${pair.label} (${pair.count}次)</span>`;
        }).join("");
      }
      weaknessTopList.innerHTML = topHtml;
    } else {
      weaknessTopList.innerHTML = '<div class="weakness-empty">完成诊断练习后将显示薄弱点分析</div>';
    }
  }

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
    let pauseStr = entry.pauseLabel;
    if (!pauseStr && entry.pausePosition != null) {
      let matchedSec = null;
      if (entry.snapshot?.sections?.length > 0) {
        const sid = entry.sectionId || entry.snapshot.currentSectionId;
        matchedSec = sid ? entry.snapshot.sections.find(s => s.id === sid) : entry.snapshot.sections[0];
        if (!matchedSec) matchedSec = entry.snapshot.sections[0];
      }
      if (matchedSec) {
        pauseStr = beatLabelForSection(matchedSec, entry.pausePosition);
        pauseStr = `第${Math.floor(entry.pausePosition / (matchedSec.beatsPerMeasure || 4)) + 1}小节第${(entry.pausePosition % (matchedSec.beatsPerMeasure || 4)) + 1}拍`;
      } else {
        pauseStr = `第${Math.floor(entry.pausePosition / 4) + 1}小节第${(entry.pausePosition % 4) + 1}拍`;
      }
    }
    pauseStr = pauseStr || "播放完成";
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

const CommandParser = (() => {
  const CANONICAL_MAP = {
    "仓": "仓", "匡": "仓", "哐": "仓", "铛": "仓",
    "冬": "冬", "咚": "冬", "大": "冬",
    "才": "才", "七": "才", "呛": "才", "镲": "才",
    "台": "台", "令": "台", "另": "台", "当": "台", "来": "台"
  };

  const TOKEN_MAP = {
    "仓": 0, "匡": 0, "哐": 0, "铛": 0,
    "冬": 1, "咚": 1, "大": 1,
    "才": 2, "七": 2, "呛": 2, "镲": 2,
    "台": 3, "令": 3, "另": 3, "当": 3, "来": 3
  };

  const REST_TOKENS = new Set(["0", "０", "〇", "空", "乙", "一", "×", "·", "冷"]);

  const TOKEN_NAMES = ["大锣", "鼓", "钹", "小锣"];

  const ALIAS_LABELS = {
    0: ["仓", "匡", "哐", "铛"],
    1: ["冬", "咚", "大"],
    2: ["才", "七", "呛", "镲"],
    3: ["台", "令", "另", "当", "来"]
  };

  const DEFAULT_MAX_MEASURES = 16;
  const DEFAULT_BEATS_PER_MEASURE = 4;
  const DEFAULT_BPM = 96;

  function _resolveContextDefaults(ctx) {
    return {
      measureCount: ctx?.measureCount ?? DEFAULT_MAX_MEASURES,
      beatsPerMeasure: ctx?.beatsPerMeasure ?? DEFAULT_BEATS_PER_MEASURE,
      bpm: ctx?.bpm ?? DEFAULT_BPM
    };
  }

  function _buildBeatCountErrorMessage(measureIdx, measureStr, expected, actual) {
    return (
      `第 ${measureIdx + 1} 小节拍数错误：<span class="error-location">${measureStr}</span><br>` +
      `期望 <strong>${expected} 拍</strong>，实际有 <strong>${actual} 拍</strong>。<br>` +
      `请使用空格或单竖线 <code>|</code> 分隔每一拍。`
    );
  }

  function _buildUnknownCharErrorMessage(measureIdx, beatIdx, char, beatStr) {
    const allValid = Object.keys(ALIAS_LABELS)
      .map((rowKey) => `${TOKEN_NAMES[rowKey]}：${ALIAS_LABELS[rowKey].join("、")}`)
      .join("；");
    const restList = [...REST_TOKENS].filter(t => t !== "０" && t !== "〇").join("、");
    return (
      `第 ${measureIdx + 1} 小节第 ${beatIdx + 1} 拍出现无法识别的字符：<span class="error-location">${char}</span><br>` +
      `有效口令字：<strong>${allValid}</strong><br>` +
      `休止符：<strong>${restList}</strong><br>` +
      `完整拍内容：<span class="error-location">${beatStr}</span>`
    );
  }

  function parseSinglePattern(input, context) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const { measureCount: mc, beatsPerMeasure: bpm } = _resolveContextDefaults(context);
    const totalSteps = mc * bpm;

    const measureStrs = trimmed.split(/\|\|/).map(s => s.trim()).filter(Boolean);
    if (measureStrs.length === 0) return null;
    if (measureStrs.length > mc) {
      throw new Error(`最多支持 ${mc} 小节，当前输入了 ${measureStrs.length} 小节。`);
    }

    const pattern = instruments.map(() => Array(totalSteps).fill(""));
    const warnings = [];
    const aliasConversions = [];

    for (let measureIdx = 0; measureIdx < measureStrs.length; measureIdx++) {
      const measureStr = measureStrs[measureIdx];
      const beatStrs = measureStr
        .split(/[|\s]+/)
        .map(s => s.trim())
        .filter(s => s !== "");

      if (beatStrs.length !== bpm) {
        throw new Error(_buildBeatCountErrorMessage(measureIdx, measureStr, bpm, beatStrs.length));
      }

      for (let beatIdx = 0; beatIdx < beatStrs.length; beatIdx++) {
        const beatStr = beatStrs[beatIdx];
        const stepIdx = measureIdx * bpm + beatIdx;

        if (stepIdx >= totalSteps) {
          throw new Error(`超出最大拍数限制（${totalSteps} 拍）。`);
        }
        if (REST_TOKENS.has(beatStr)) continue;

        for (let charIdx = 0; charIdx < beatStr.length; charIdx++) {
          const char = beatStr[charIdx];
          const rowIdx = TOKEN_MAP[char];

          if (rowIdx === undefined) {
            throw new Error(_buildUnknownCharErrorMessage(measureIdx, beatIdx, char, beatStr));
          }

          const canonical = CANONICAL_MAP[char] || char;
          if (char !== canonical) {
            aliasConversions.push({ from: char, to: canonical, instrument: TOKEN_NAMES[rowIdx] });
          }
          if (pattern[rowIdx][stepIdx]) {
            warnings.push(
              `第 ${measureIdx + 1} 小节第 ${beatIdx + 1} 拍的 ${TOKEN_NAMES[rowIdx]}（${char}${char !== canonical ? "→" + canonical : ""}）重复定义，已保留第一个。`
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
    let bpm = DEFAULT_BPM;
    let measureRange = null;
    let beatsPerMeasure = DEFAULT_BEATS_PER_MEASURE;

    const timeSigMatch = headerContent.match(/(\d)\s*\/\s*4/);
    if (timeSigMatch) {
      const parsedBpm = parseInt(timeSigMatch[1]);
      if (parsedBpm >= 2 && parsedBpm <= 7) {
        beatsPerMeasure = parsedBpm;
        name = headerContent.replace(timeSigMatch[0], "").trim().replace(/[\s]+$/, "").trim();
      }
    }

    const bpmMatch = name.match(/[@:：]\s*(\d{2,3})\s*(?:BPM|bpm)?/i) ||
                     name.match(/(\d{2,3})\s*(?:BPM|bpm)/i);
    if (bpmMatch) {
      const parsedVal = parseInt(bpmMatch[1]);
      bpm = Math.max(40, Math.min(220, parsedVal));
      name = name.replace(bpmMatch[0], "").trim().replace(/[@:：，,\s]+$/, "").trim();
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

    if (!name) name = "未命名段落";
    return { name, bpm, measureRange, beatsPerMeasure };
  }

  function parseCommand(input, context) {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("请输入锣鼓经口令。");
    }

    const lines = trimmed.split(/\r?\n/);
    const sectionHeaders = [];
    lines.forEach((line, idx) => {
      const parsed = parseSectionHeader(line);
      if (parsed) sectionHeaders.push({ lineIdx: idx, ...parsed });
    });

    if (sectionHeaders.length === 0) {
      const ctxDefaults = _resolveContextDefaults(context);
      const result = parseSinglePattern(trimmed, {
        measureCount: context?.measureCount ?? DEFAULT_MAX_MEASURES,
        beatsPerMeasure: ctxDefaults.beatsPerMeasure
      });
      if (!result) {
        throw new Error("未找到有效的小节内容，请检查分隔符是否正确。");
      }
      return {
        isMultiSection: false,
        sections: [{
          name: "当前段落",
          bpm: ctxDefaults.bpm,
          measureRange: null,
          measureCount: result.measureCount,
          beatsPerMeasure: ctxDefaults.beatsPerMeasure,
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
      const content = lines.slice(contentStart, contentEnd).join("\n").trim();

      if (!content) continue;

      try {
        const tempCtx = { measureCount: DEFAULT_MAX_MEASURES, beatsPerMeasure: header.beatsPerMeasure || DEFAULT_BEATS_PER_MEASURE };
        const parsed = parseSinglePattern(content, tempCtx);
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
            measureCount: parsed.measureCount,
            beatsPerMeasure: header.beatsPerMeasure || DEFAULT_BEATS_PER_MEASURE,
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

    return { isMultiSection: true, sections };
  }

  return {
    CANONICAL_MAP,
    TOKEN_MAP,
    REST_TOKENS,
    TOKEN_NAMES,
    ALIAS_LABELS,
    parseSinglePattern,
    parseSectionHeader,
    parseCommand
  };
})();

const canonicalMap = CommandParser.CANONICAL_MAP;
const tokenMap = CommandParser.TOKEN_MAP;
const restTokens = CommandParser.REST_TOKENS;
const tokenNames = CommandParser.TOKEN_NAMES;
const aliasLabels = CommandParser.ALIAS_LABELS;

const CommandValidator = (() => {
  function validateSection(section) {
    const errors = [];
    const warnings = [];

    if (!section) {
      errors.push("解析结果为空");
      return { ok: false, errors, warnings };
    }
    if (!Array.isArray(section.pattern) || section.pattern.length !== instruments.length) {
      errors.push(`pattern 维度错误：期望 ${instruments.length} 行乐器`);
    }
    if (typeof section.measureCount !== "number" || section.measureCount < 1) {
      errors.push("measureCount 非法");
    }
    if (typeof section.bpm !== "number" || section.bpm < 40 || section.bpm > 220) {
      warnings.push(`BPM ${section.bpm} 超出推荐范围（40-220）`);
    }
    if (section.measureRange) {
      if (section.measureRange.start > section.measureRange.end) {
        errors.push("measureRange 范围倒置");
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  function validateParsedResult(parsed) {
    const allErrors = [];
    const allWarnings = [];

    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return { ok: false, errors: ["无有效的解析段落"], warnings: [] };
    }

    parsed.sections.forEach((sec, idx) => {
      const result = validateSection(sec);
      result.errors.forEach(e => allErrors.push(`段落 ${idx + 1}：${e}`));
      result.warnings.forEach(w => allWarnings.push(`段落 ${idx + 1}：${w}`));
    });

    return { ok: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
  }

  return { validateSection, validateParsedResult };
})();

const PatternImpact = (() => {
  function computeFillAndSkip(parsedPatternRows, existingSection, srcSteps, dstSteps) {
    const compareSteps = Math.min(srcSteps, dstSteps);
    let willFill = 0;
    let willSkip = 0;
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < compareSteps; c++) {
        const parsedVal = parsedPatternRows[r]?.[c] || "";
        if (!parsedVal) continue;
        const existingVal = existingSection?.pattern?.[r]?.[c] || "";
        if (existingVal) willSkip++;
        else willFill++;
      }
    }
    return { willFill, willSkip };
  }
  return { computeFillAndSkip };
})();

const PreviewRenderer = (() => {
  function _computeNormalizedWriteMode(parsed, requestedWriteMode) {
    const isMulti = parsed?.isMultiSection || (parsed?.sections?.length || 0) > 1;
    if (isMulti && requestedWriteMode === "merge") return "append";
    return requestedWriteMode;
  }

  function _buildSummaryHtml(parsed) {
    const isMulti = parsed.isMultiSection || parsed.sections.length > 1;
    if (isMulti) {
      const totalMeasures = parsed.sections.reduce((sum, s) => sum + s.measureCount, 0);
      const totalTokens = parsed.sections.reduce((sum, s) => sum + s.pattern.flat().filter(Boolean).length, 0);
      const bpmList = [...new Set(parsed.sections.map(s => s.bpm))].join("/");
      const sectionDetails = parsed.sections.map(s => {
        const range = s.measureRange ? `${s.measureRange.start}-${s.measureRange.end}小节` : `${s.measureCount}小节`;
        return `${s.name}（${range}，${s.bpm}BPM）`;
      }).join("、");
      return `解析成功：共 <strong>${parsed.sections.length} 个段落</strong>，<strong>${totalMeasures} 小节</strong>，<strong>${totalTokens} 个口令</strong>，速度：<strong>${bpmList} BPM</strong>。<br><span class="preview-section-list">${sectionDetails}</span>`;
    } else {
      const s = parsed.sections[0];
      const totalFilled = s.pattern.flat().filter(Boolean).length;
      const range = s.measureRange ? `${s.measureRange.start}-${s.measureRange.end}小节` : `${s.measureCount}小节`;
      return `解析成功：<strong>${range}</strong>，<strong>${totalFilled} 个口令</strong>，速度：<strong>${s.bpm} BPM</strong>。`;
    }
  }

  function _buildWriteModeBar(parsed, writeMode, currentSection) {
    const isMulti = parsed.isMultiSection || parsed.sections.length > 1;
    const appendNote = isMulti && currentSection ? `（在「${currentSection.name}」后插入）` : "";
    const overwriteNote = isMulti
      ? `<div class="write-mode-hint">⚠️ 多段落覆盖：第1段覆盖当前段，其余自动追加为新段落</div>`
      : "";
    const mergeNote = !isMulti && currentSection
      ? `<span class="write-mode-hint">当前段落：${currentSection.name}</span>`
      : "";
    const appendLabel = isMulti
      ? `追加为新段落（${parsed.sections.length} 个）${appendNote}`
      : "追加为新段落";
    const overwriteLabel = isMulti ? "覆盖当前段落（混合模式）" : "覆盖当前段落";
    const mergeDisabled = isMulti ? "disabled" : "";
    const appendChecked = writeMode === "append" || (isMulti && writeMode !== "overwrite") ? "checked" : "";

    return `
      <div class="write-mode-selector">
        <span class="write-mode-label">写入方式：</span>
        <label class="write-mode-option">
          <input type="radio" name="writeMode" value="merge" ${writeMode === "merge" ? "checked" : ""} ${mergeDisabled}>
          <span>合并到当前段落（仅填空格）</span>
        </label>
        ${mergeNote}
        <label class="write-mode-option">
          <input type="radio" name="writeMode" value="overwrite" ${writeMode === "overwrite" ? "checked" : ""}>
          <span>${overwriteLabel}</span>
        </label>
        <label class="write-mode-option">
          <input type="radio" name="writeMode" value="append" ${appendChecked}>
          <span>${appendLabel}</span>
        </label>
        ${overwriteNote}
      </div>
    `;
  }

  function _buildLegend() {
    return `
      <div style="margin-top: 10px; display: flex; gap: 16px; font-size: 12px; color: var(--muted); flex-wrap: wrap;">
        <span><span style="display:inline-block;width:14px;height:14px;background:#d1fae5;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 新填入</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#fff1d1;border-radius:3px;margin-right:4px;vertical-align:middle;"></span> 原有内容</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#fee2e2;border-radius:3px;margin-right:4px;vertical-align:middle;position:relative;"><span style="position:absolute;top:-2px;right:1px;font-size:9px;color:var(--accent);font-weight:900;">×</span></span> 跳过（已有内容）</span>
      </div>
    `;
  }

  function renderSingleSectionGrid(parsedSection, existingSection, sectionIndex, globalMeasureStart) {
    const { pattern, warnings, measureCount, aliasConversions, measureRange } = parsedSection;
    const bpm = parsedSection.beatsPerMeasure || existingSection?.beatsPerMeasure || 4;
    const tempSec = { measureCount: measureCount || 4, beatsPerMeasure: bpm };
    const totalSteps = pattern[0]?.length || getSectionSteps(tempSec);
    const totalFilled = pattern.flat().filter(Boolean).length;
    const existSteps = existingSection ? getSectionSteps(existingSection) : 0;

    let html = `<div class="preview-section-info">`;
    if (sectionIndex != null) html += `<span class="preview-section-index">段落 ${sectionIndex + 1}</span>`;

    const rangeLabel = measureRange
      ? `${measureRange.start}-${measureRange.end}小节`
      : (globalMeasureStart != null
          ? `${globalMeasureStart + 1}-${globalMeasureStart + (measureCount || 4)}小节`
          : `${measureCount || 4}小节`);
    html += `<span class="section-range-badge">${rangeLabel}</span>`;
    html += `<strong>${parsedSection.name}</strong> · <span class="preview-bpm-badge">${parsedSection.bpm} BPM</span> · ${bpm}/4拍 · ${totalFilled} 个口令`;

    if (existingSection) {
      const { willFill, willSkip } = PatternImpact.computeFillAndSkip(pattern, existingSection, totalSteps, existSteps);
      if (willFill > 0) html += ` · 填入 <span style="color:#047857">${willFill} 空格</span>`;
      if (willSkip > 0) html += ` · 跳过 <span style="color:#991b1b">${willSkip} 已有</span>`;
    } else {
      html += ` · 新段落，<span style="color:#047857">${totalFilled} 口令待写入</span>`;
    }
    html += `</div>`;

    if (warnings && warnings.length > 0) {
      html += `<div style="font-size:12px;color:#b45309;margin-top:4px;">⚠️ ${warnings.join(" ")}</div>`;
    }
    if (aliasConversions && aliasConversions.length > 0) {
      const uniqueAliases = [...new Set(aliasConversions.map(a => `${a.from}→${a.to}（${a.instrument}）`))];
      html += `<div style="font-size:12px;color:#1d4ed8;margin-top:4px;">🔄 别名转换：${uniqueAliases.join("、")}</div>`;
    }

    const header = ['<div class="preview-label-cell">乐器</div>'];
    for (let i = 0; i < totalSteps; i++) {
      const measureDivider = (i + 1) % bpm === 0 && i < totalSteps - 1 ? " preview-measure-divider" : "";
      header.push(`<div class="preview-beat-cell${measureDivider}">${beatLabelForSection(tempSec, i)}</div>`);
    }

    const rows = instruments.flatMap((instrument, rowIndex) => {
      const row = [`<div class="preview-label-cell">${instrument.name}</div>`];
      for (let step = 0; step < totalSteps; step++) {
        const parsedValue = pattern[rowIndex]?.[step] || "";
        const existingValue = (existingSection && existingSection.pattern[rowIndex] && step < existSteps)
          ? (existingSection.pattern[rowIndex][step] || "") : "";
        const measureDivider = (step + 1) % bpm === 0 && step < totalSteps - 1 ? " preview-measure-divider" : "";

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

    const gridStyle = `style="grid-template-columns: 76px repeat(${totalSteps}, minmax(44px, 1fr));"`;
    html += `
      <div class="preview-grid">
        <div class="preview-grid-inner" ${gridStyle}>${[...header, ...rows].join("")}</div>
      </div>
    `;
    return `<div class="preview-section-block">${html}</div>`;
  }

  function render(parsed, writeMode, options) {
    if (!parsed || !parsed.sections || parsed.sections.length === 0) return { normalizedWriteMode: writeMode };
    const currentSection = options?.currentSection;
    const onWriteModeChange = options?.onWriteModeChange;

    const normalizedWriteMode = _computeNormalizedWriteMode(parsed, writeMode);
    const isMulti = parsed.isMultiSection || parsed.sections.length > 1;

    importSummary.innerHTML = _buildSummaryHtml(parsed);
    importSummary.style.display = "block";

    const writeModeBar = _buildWriteModeBar(parsed, normalizedWriteMode, currentSection);

    let gridsHtml = "";
    let measureOffset = 0;
    if (isMulti && normalizedWriteMode === "overwrite") {
      gridsHtml = parsed.sections.map((s, idx) => {
        const existing = idx === 0 ? currentSection : null;
        const grid = renderSingleSectionGrid(s, existing, idx, measureOffset);
        measureOffset += s.measureCount;
        return grid;
      }).join("");
    } else if (isMulti || normalizedWriteMode === "append") {
      gridsHtml = parsed.sections.map((s, idx) => {
        const grid = renderSingleSectionGrid(s, null, idx, measureOffset);
        measureOffset += s.measureCount;
        return grid;
      }).join("");
    } else {
      gridsHtml = renderSingleSectionGrid(parsed.sections[0], currentSection, 0, 0);
    }

    previewGrid.innerHTML = writeModeBar + gridsHtml + _buildLegend();

    if (typeof onWriteModeChange === "function") {
      const radios = previewGrid.querySelectorAll('input[name="writeMode"]');
      radios.forEach(radio => {
        radio.addEventListener("change", (e) => onWriteModeChange(e.target.value));
      });
    }

    importPreview.style.display = "block";
    return { normalizedWriteMode };
  }

  return { render, renderSingleSectionGrid };
})();

const PatternApplier = (() => {
  function _clonePatternAndCopyStats(srcPattern, dstSection, srcSteps, dstSteps, overwrite, stats) {
    const copySteps = Math.min(srcSteps, dstSteps);
    for (let r = 0; r < instruments.length; r++) {
      for (let c = 0; c < copySteps; c++) {
        const srcVal = srcPattern[r]?.[c] || "";
        if (!srcVal) {
          if (overwrite) {
            if (dstSection.pattern[r][c]) stats.overwrittenCount++;
            dstSection.pattern[r][c] = "";
          }
          continue;
        }
        if (overwrite) {
          if (dstSection.pattern[r][c] && dstSection.pattern[r][c] !== srcVal) stats.overwrittenCount++;
          dstSection.pattern[r][c] = srcVal;
          stats.filledCount++;
        } else if (dstSection.pattern[r][c]) {
          stats.skippedCount++;
        } else {
          dstSection.pattern[r][c] = srcVal;
          stats.filledCount++;
        }
      }
    }
  }

  function _applyMeta(parsedSection, dstSection) {
    dstSection.bpm = parsedSection.bpm;
    if (parsedSection.name && parsedSection.name !== "当前段落") {
      dstSection.name = parsedSection.name;
    }
    if (parsedSection.measureRange) {
      dstSection.measureRange = { ...parsedSection.measureRange };
    }
  }

  function _finalizeState(stateRef) {
    stateRef.sections.forEach(sec => {
      ensureSectionPhrases(sec);
      const mc = sec.measureCount || 4;
      sec.phrases = normalizePhraseOverlaps(sec.phrases, mc);
    });
    if (stateRef.currentSectionId) {
      const cur = stateRef.sections.find(s => s.id === stateRef.currentSectionId);
      if (cur && (!cur.phrases || cur.phrases.length === 0)) {
        autoGeneratePhrases(cur);
      }
    }
  }

  function applyToState(parsed, writeMode, stateRef) {
    const stats = {
      filledCount: 0,
      skippedCount: 0,
      appendedCount: 0,
      overwrittenCount: 0
    };
    if (!parsed || !parsed.sections || parsed.sections.length === 0) {
      return { ok: false, stats, message: "" };
    }

    const isMulti = parsed.isMultiSection || parsed.sections.length > 1;
    const currentIdx = stateRef.sections.findIndex(s => s.id === stateRef.currentSectionId);
    const currentSection = currentIdx >= 0 ? stateRef.sections[currentIdx] : null;
    let message = "";

    if (writeMode === "append") {
      const insertIdx = currentIdx >= 0 ? currentIdx + 1 : stateRef.sections.length;
      parsed.sections.forEach((parsedSection) => {
        const newSec = createEmptySection(parsedSection.name);
        _applyMeta(parsedSection, newSec);
        const srcBpm = parsedSection.beatsPerMeasure || 4;
        const srcMc = parsedSection.measureCount || 4;
        resizeSectionPattern(newSec, srcMc, srcBpm);
        const srcSteps = parsedSection.pattern[0]?.length || getSectionSteps(parsedSection);
        const dstSteps = getSectionSteps(newSec);
        _clonePatternAndCopyStats(parsedSection.pattern, newSec, srcSteps, dstSteps, true, stats);
        stateRef.sections.splice(insertIdx + stats.appendedCount, 0, newSec);
        stats.appendedCount++;
      });
      if (insertIdx < stateRef.sections.length) {
        stateRef.currentSectionId = stateRef.sections[insertIdx].id;
      }
      message = `✓ 已追加 <strong>${stats.appendedCount}</strong> 个新段落，共写入 <strong>${stats.filledCount}</strong> 个口令。`;

    } else if (isMulti && writeMode === "overwrite") {
      if (!currentSection) return { ok: false, stats, message: "" };
      const firstParsed = parsed.sections[0];
      _applyMeta(firstParsed, currentSection);
      const firstMc = firstParsed.measureCount || 4;
      const firstBpm = firstParsed.beatsPerMeasure || 4;
      resizeSectionPattern(currentSection, firstMc, firstBpm);
      const srcSteps1 = firstParsed.pattern[0]?.length || getSectionSteps(firstParsed);
      const dstSteps1 = getSectionSteps(currentSection);
      _clonePatternAndCopyStats(firstParsed.pattern, currentSection, srcSteps1, dstSteps1, true, stats);

      const insertIdx = currentIdx + 1;
      for (let i = 1; i < parsed.sections.length; i++) {
        const parsedSection = parsed.sections[i];
        const newSec = createEmptySection(parsedSection.name);
        _applyMeta(parsedSection, newSec);
        const srcMc = parsedSection.measureCount || 4;
        const srcBpm = parsedSection.beatsPerMeasure || 4;
        resizeSectionPattern(newSec, srcMc, srcBpm);
        const srcSteps = parsedSection.pattern[0]?.length || getSectionSteps(parsedSection);
        const dstSteps = getSectionSteps(newSec);
        _clonePatternAndCopyStats(parsedSection.pattern, newSec, srcSteps, dstSteps, true, stats);
        stateRef.sections.splice(insertIdx + (stats.appendedCount), 0, newSec);
        stats.appendedCount++;
      }
      message = `✓ 混合模式：覆盖当前段落，追加 <strong>${stats.appendedCount}</strong> 个段。共写入 <strong>${stats.filledCount}</strong> 口令，清空 <strong>${stats.overwrittenCount}</strong> 原有。`;

    } else if (writeMode === "overwrite") {
      const section = currentSection;
      if (!section) return { ok: false, stats, message: "" };
      const parsedSection = parsed.sections[0];
      _applyMeta(parsedSection, section);
      const dstMc = parsedSection.measureCount || 4;
      const dstBpm = parsedSection.beatsPerMeasure || 4;
      resizeSectionPattern(section, dstMc, dstBpm);
      const srcSteps = parsedSection.pattern[0]?.length || getSectionSteps(parsedSection);
      const dstSteps = getSectionSteps(section);
      _clonePatternAndCopyStats(parsedSection.pattern, section, srcSteps, dstSteps, true, stats);
      message = `✓ 已覆盖当前段落，写入 <strong>${stats.filledCount}</strong> 个口令，清空 <strong>${stats.overwrittenCount}</strong> 个原有口令。`;

    } else {
      const section = currentSection;
      if (!section) return { ok: false, stats, message: "" };
      const parsedSection = parsed.sections[0];
      _applyMeta(parsedSection, section);
      const srcSteps = parsedSection.pattern[0]?.length || getSectionSteps(parsedSection);
      const dstSteps = getSectionSteps(section);
      _clonePatternAndCopyStats(parsedSection.pattern, section, srcSteps, dstSteps, false, stats);
      message = `✓ 已成功写入 <strong>${stats.filledCount}</strong> 个口令`;
      if (stats.skippedCount > 0) {
        message += `，已跳过 <strong>${stats.skippedCount}</strong> 个已有内容。`;
      } else {
        message += "。";
      }
    }

    _finalizeState(stateRef);
    return { ok: true, stats, message };
  }

  return { applyToState };
})();

const ImportController = (() => {
  function showError(message) {
    importError.innerHTML = `<strong>⚠️ 解析失败：</strong>${message}`;
    importError.style.display = "block";
  }

  function hideError() {
    importError.style.display = "none";
  }

  function resetUIState() {
    parsedPattern = null;
    parsedWriteMode = "merge";
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    importPreview.style.display = "none";
    importSummary.style.display = "none";
    hideError();
  }

  function _onPreviewWriteModeChange(newMode) {
    parsedWriteMode = newMode;
    PreviewRenderer.render(parsedPattern, parsedWriteMode, {
      currentSection: getCurrentSection(),
      onWriteModeChange: _onPreviewWriteModeChange
    });
  }

  function handleParseClick() {
    hideError();
    importPreview.style.display = "none";
    importSummary.style.display = "none";
    try {
      const curSec = getCurrentSection();
      const parseCtx = curSec
        ? { measureCount: curSec.measureCount, beatsPerMeasure: curSec.beatsPerMeasure, bpm: curSec.bpm }
        : null;
      const parsed = CommandParser.parseCommand(commandInput.value, parseCtx);

      const v = CommandValidator.validateParsedResult(parsed);
      if (!v.ok) {
        throw new Error(v.errors.join("；"));
      }

      parsedPattern = parsed;
      const isMulti = parsed.isMultiSection || parsed.sections.length > 1;
      parsedWriteMode = isMulti ? "append" : "merge";

      const renderResult = PreviewRenderer.render(parsed, parsedWriteMode, {
        currentSection: curSec,
        onWriteModeChange: _onPreviewWriteModeChange
      });
      if (renderResult?.normalizedWriteMode) {
        parsedWriteMode = renderResult.normalizedWriteMode;
      }

      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    } catch (error) {
      showError(error.message);
      parsedPattern = null;
      parsedWriteMode = "merge";
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
    }
  }

  function handleConfirmClick() {
    if (!parsedPattern) return;
    const result = PatternApplier.applyToState(parsedPattern, parsedWriteMode, state);
    if (result.ok) {
      save();
      render();
      renderPhraseList();
      importSummary.innerHTML = result.message;
    }
    resetUIState();
    commandInput.value = "";
  }

  function handleCancelClick() {
    resetUIState();
  }

  function bindEvents() {
    parseBtn.addEventListener("click", handleParseClick);
    confirmBtn.addEventListener("click", handleConfirmClick);
    cancelBtn.addEventListener("click", handleCancelClick);
    commandInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        parseBtn.click();
      }
    });
    commandInput.addEventListener("input", () => {
      if (parsedPattern) resetUIState();
    });
  }

  return {
    showError,
    hideError,
    resetUIState,
    handleParseClick,
    handleConfirmClick,
    handleCancelClick,
    bindEvents
  };
})();

function showError(message) { ImportController.showError(message); }
function hideError() { ImportController.hideError(); }
function resetImportState() { ImportController.resetUIState(); }

function renderSingleSectionPreviewGrid(parsedSection, existingSection, sectionIndex, globalMeasureStart) {
  return PreviewRenderer.renderSingleSectionGrid(parsedSection, existingSection, sectionIndex, globalMeasureStart);
}

function renderPreview(parsed) {
  const curSec = getCurrentSection();
  const result = PreviewRenderer.render(parsed, parsedWriteMode, {
    currentSection: curSec,
    onWriteModeChange: (newMode) => {
      parsedWriteMode = newMode;
      renderPreview(parsedPattern);
    }
  });
  if (result?.normalizedWriteMode) parsedWriteMode = result.normalizedWriteMode;
}

function applyParsedPattern() {
  if (!parsedPattern) return;
  const result = PatternApplier.applyToState(parsedPattern, parsedWriteMode, state);
  if (result.ok) {
    save();
    render();
    renderPhraseList();
    importSummary.innerHTML = result.message;
  }
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
  if (!sec) return [0, 15];
  const bpm = sec.beatsPerMeasure || 4;
  const total = getSectionSteps(sec);
  if (sec.loop === "") return [0, total - 1];
  const start = Number(sec.loop) * bpm;
  return [start, start + bpm - 1];
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

  const bpm = section.beatsPerMeasure || 4;
  const currentMeasure = Math.floor(playhead / bpm);
  const phrases = section.phrases || [];
  let phraseAtPlayhead = null;
  for (const phrase of phrases) {
    if (currentMeasure >= phrase.startMeasure && currentMeasure <= phrase.endMeasure) {
      phraseAtPlayhead = phrase;
      break;
    }
  }

  if (phraseAtPlayhead && phraseAtPlayhead.id !== currentPhraseId) {
    currentPhraseId = phraseAtPlayhead.id;
    currentPhraseRepeatCount = 0;
    const multiplier = phraseAtPlayhead.tempoMultiplier || 1;
    if (Math.abs(multiplier - 1) > 0.01 && timer) {
      clearInterval(timer);
      const newBpm = basePlaybackBpm * multiplier;
      timer = setInterval(tick, 60000 / newBpm);
    }
  } else if (!phraseAtPlayhead && currentPhraseId !== null) {
    currentPhraseId = null;
    currentPhraseRepeatCount = 0;
    if (timer) {
      clearInterval(timer);
      timer = setInterval(tick, 60000 / basePlaybackBpm);
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

  if (currentRehearsalId) {
    checkAndRecordChanges(section, playhead);
  }

  if (phraseAtPlayhead && phraseAtPlayhead.repeat > 1) {
    const phraseEndBeat = (phraseAtPlayhead.endMeasure + 1) * bpm - 1;
    const phraseStartBeat = phraseAtPlayhead.startMeasure * bpm;
    if (playhead >= phraseEndBeat) {
      currentPhraseRepeatCount++;
      if (currentPhraseRepeatCount < phraseAtPlayhead.repeat) {
        playhead = phraseStartBeat;
        return;
      } else {
        currentPhraseRepeatCount = 0;
      }
    }
  }

  if (playhead >= end) {
    if (state.continuousPlay && state.sections.length > 1) {
      const nextIndex = currentPlaySectionIndex + 1;
      if (nextIndex < state.sections.length) {
        currentPlaySectionIndex = nextIndex;
        continuousPlaySectionCount++;
        const nextSection = state.sections[nextIndex];
        const [nextStart] = currentRange(nextSection);
        playhead = nextStart;
        if (currentRehearsalId) {
          reviewState.prevBpm = nextSection.bpm;
          reviewState.prevLoop = nextSection.loop;
          reviewState.prevSectionId = nextSection.id;
          reviewState.prevVoices = (nextSection.enabledInstruments || []).join(",");
          reviewState.prevMixConfig = JSON.stringify(nextSection.mixConfig || createDefaultMixConfig());
          addReviewEvent("section", {
            fromId: section.id,
            toId: nextSection.id,
            toName: nextSection.name,
            continuousSectionIndex: nextIndex,
            totalSections: state.sections.length
          }, nextSection, playhead);
          addReviewEvent("snapshot", { sectionStart: true }, nextSection, playhead);
          reviewState.lastBeatSnapshot = playhead;
          checkAndRecordChanges(nextSection, playhead);
        }
        if (nextSection.bpm !== section.bpm) {
          basePlaybackBpm = nextSection.bpm;
          clearInterval(timer);
          timer = setInterval(tick, 60000 / nextSection.bpm);
        }
        currentPhraseId = null;
        currentPhraseRepeatCount = 0;
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

  currentRehearsalId = crypto.randomUUID();
  currentRehearsalStartTime = Date.now();
  initRehearsalDetail();
  reviewState.prevBpm = section.bpm;
  reviewState.prevLoop = section.loop;
  reviewState.prevSectionId = section.id;
  reviewState.prevVoices = (section.enabledInstruments || []).join(",");
  reviewState.prevMixConfig = JSON.stringify(section.mixConfig || createDefaultMixConfig());
  const activeVoices = instruments
    .filter((_, idx) => section.enabledInstruments[idx])
    .map((i) => i.name);
  const loopLabel = section.loop === "" ? "全段" : `第${Number(section.loop) + 1}小节`;
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
  const startingBeat = playhead;
  addReviewEvent("start", {
    mode: state.continuousPlay ? "continuous" : "normal",
    initialBpm: section.bpm,
    initialLoop: loopLabel
  }, section, startingBeat);
  checkAndRecordChanges(section, startingBeat);

  basePlaybackBpm = section.bpm;
  currentPhraseId = null;
  currentPhraseRepeatCount = 0;

  tick();
  timer = setInterval(tick, 60000 / section.bpm);
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
  currentPhraseId = null;
  currentPhraseRepeatCount = 0;
  basePlaybackBpm = 0;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));

  let finalPauseBeat = null;
  let finalRehearsalIdToReview = null;

  if (currentRehearsalId) {
    const entry = rehearsalLog.find((r) => r.id === currentRehearsalId);
    if (entry) {
      const currentPlayedSection = getPlaySection() || getCurrentSection();
      entry.durationMs = currentRehearsalStartTime ? Date.now() - currentRehearsalStartTime : null;

      if (currentPlayedSection) {
        const [start, end] = currentRange(currentPlayedSection);
        if (playhead >= start && playhead <= end) {
          entry.pausePosition = playhead;
          finalPauseBeat = playhead;
          const beatStr = beatLabelForSection(currentPlayedSection, playhead);
          entry.pauseLabel = currentPlayedSection.id !== entry.sectionId
            ? `${currentPlayedSection.name} · ${beatStr}`
            : beatStr;
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

    const mode = state.continuousPlay ? "continuous" : "normal";
    finalizeRehearsalDetail(finalPauseBeat, mode);
    finalRehearsalIdToReview = currentRehearsalId;

    currentRehearsalId = null;
    currentRehearsalStartTime = null;
  }

  if (state.continuousPlay && state.sections.length > 1) {
    playhead = 0;
    currentPlaySectionIndex = 0;
  }

  renderDashboard();
  renderRehearsalTimeline();

  if (finalRehearsalIdToReview && reviewState.autoOpenAfterPlay) {
    setTimeout(() => {
      if (confirm("排练结束，是否进入复盘模式查看详细记录？")) {
        openReviewOverlay(finalRehearsalIdToReview);
      }
    }, 300);
  }
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

ImportController.bindEvents();

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
  const toggleMeasureBtn = event.target.closest("[data-toggle-measure]");
  const saveMeasureBtn = event.target.closest("[data-save-measure]");
  const cancelMeasureBtn = event.target.closest("[data-cancel-measure]");

  if (toggleMeasureBtn) {
    event.stopPropagation();
    const id = toggleMeasureBtn.dataset.toggleMeasure;
    editingMeasureSectionId = editingMeasureSectionId === id ? null : id;
    editingSectionId = null;
    renderSectionsList();
    return;
  }

  if (saveMeasureBtn) {
    event.stopPropagation();
    const id = saveMeasureBtn.dataset.saveMeasure;
    const section = state.sections.find((s) => s.id === id);
    if (section) {
      const mcInput = sectionsList.querySelector(`[data-mc-section="${id}"]`);
      const bpmInput = sectionsList.querySelector(`[data-bpm-section="${id}"]`);
      if (mcInput && bpmInput) {
        resizeSectionPattern(section, mcInput.value, bpmInput.value);
      }
    }
    editingMeasureSectionId = null;
    render();
    return;
  }

  if (cancelMeasureBtn) {
    event.stopPropagation();
    editingMeasureSectionId = null;
    renderSectionsList();
    return;
  }

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
    editingMeasureSectionId = null;
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
  const isMcInput = event.target.classList.contains("measure-count-input");
  const isBpmInput = event.target.classList.contains("beats-input");
  const sectionId = event.target.dataset?.mcSection || event.target.dataset?.bpmSection;
  if ((isMcInput || isBpmInput) && event.key === "Enter" && sectionId) {
    const section = state.sections.find((s) => s.id === sectionId);
    if (section) {
      const mcInput = sectionsList.querySelector(`[data-mc-section="${sectionId}"]`);
      const bpmInput = sectionsList.querySelector(`[data-bpm-section="${sectionId}"]`);
      if (mcInput && bpmInput) {
        resizeSectionPattern(section, mcInput.value, bpmInput.value);
      }
    }
    editingMeasureSectionId = null;
    render();
  }
  if ((isMcInput || isBpmInput) && event.key === "Escape") {
    editingMeasureSectionId = null;
    renderSectionsList();
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

if (structuralModeBtn) {
  structuralModeBtn.addEventListener("click", toggleStructuralMode);
}

if (addPhraseBtn) {
  addPhraseBtn.addEventListener("click", () => {
    openPhraseEditor(null);
  });
}

if (phraseLibraryBtn) {
  phraseLibraryBtn.addEventListener("click", openPhraseLibrary);
}

if (phraseEditCloseBtn) {
  phraseEditCloseBtn.addEventListener("click", closePhraseEditor);
}

if (phraseSaveBtn) {
  phraseSaveBtn.addEventListener("click", savePhraseFromEditor);
}

if (phraseDuplicateBtn) {
  phraseDuplicateBtn.addEventListener("click", () => {
    if (selectedPhraseId) {
      duplicatePhrase(selectedPhraseId);
    }
  });
}

if (phraseDeleteBtn) {
  phraseDeleteBtn.addEventListener("click", () => {
    if (selectedPhraseId) {
      deletePhrase(selectedPhraseId);
    }
  });
}

if (phraseList) {
  phraseList.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-phrase-edit]");
    const duplicateBtn = event.target.closest("[data-phrase-duplicate]");
    const saveLibBtn = event.target.closest("[data-phrase-save-lib]");
    const moveUpBtn = event.target.closest("[data-phrase-move-up]");
    const moveDownBtn = event.target.closest("[data-phrase-move-down]");
    const shiftLeftBtn = event.target.closest("[data-phrase-shift-left]");
    const shiftRightBtn = event.target.closest("[data-phrase-shift-right]");
    const phraseItem = event.target.closest("[data-phrase-id]");

    if (editBtn) {
      event.stopPropagation();
      const phraseId = editBtn.dataset.phraseEdit;
      openPhraseEditor(phraseId);
    } else if (duplicateBtn) {
      event.stopPropagation();
      const phraseId = duplicateBtn.dataset.phraseDuplicate;
      duplicatePhrase(phraseId);
    } else if (saveLibBtn) {
      event.stopPropagation();
      const phraseId = saveLibBtn.dataset.phraseSaveLib;
      savePhraseToLibrary(phraseId);
    } else if (moveUpBtn) {
      event.stopPropagation();
      const phraseId = moveUpBtn.dataset.phraseMoveUp;
      movePhrase(phraseId, -1);
    } else if (moveDownBtn) {
      event.stopPropagation();
      const phraseId = moveDownBtn.dataset.phraseMoveDown;
      movePhrase(phraseId, 1);
    } else if (shiftLeftBtn) {
      event.stopPropagation();
      const phraseId = shiftLeftBtn.dataset.phraseShiftLeft;
      shiftPhraseMeasures(phraseId, -1);
    } else if (shiftRightBtn) {
      event.stopPropagation();
      const phraseId = shiftRightBtn.dataset.phraseShiftRight;
      shiftPhraseMeasures(phraseId, 1);
    } else if (phraseItem) {
      const phraseId = phraseItem.dataset.phraseId;
      selectedPhraseId = selectedPhraseId === phraseId ? null : phraseId;
      if (selectedPhraseId) {
        openPhraseEditor(phraseId);
      } else {
        closePhraseEditor();
      }
      renderPhraseList();
      renderGrid();
    }
  });
}

if (phraseLibraryCloseBtn) {
  phraseLibraryCloseBtn.addEventListener("click", closePhraseLibrary);
}

if (phraseLibraryCancelBtn) {
  phraseLibraryCancelBtn.addEventListener("click", closePhraseLibrary);
}

if (phraseLibraryOverlay) {
  phraseLibraryOverlay.addEventListener("click", (e) => {
    if (e.target === phraseLibraryOverlay) {
      closePhraseLibrary();
    }
  });
}

if (phraseLibraryTabs) {
  phraseLibraryTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.phraseTab;
      switchPhraseLibraryTab(tabName);
    });
  });
}

if (phraseLibrarySectionSelect) {
  phraseLibrarySectionSelect.addEventListener("change", renderCurrentSectionPhrases);
}

if (presetPhraseList) {
  presetPhraseList.addEventListener("click", (event) => {
    const insertBtn = event.target.closest("[data-insert-preset]");
    if (insertBtn) {
      const presetId = insertBtn.dataset.insertPreset;
      const preset = PRESET_PHRASES.find(p => p.id === presetId);
      if (preset) {
        const section = getCurrentSection();
        const mc = section?.measureCount || 4;
        let targetMeasure = 0;
        if (section?.phrases?.length > 0) {
          const lastPhrase = section.phrases[section.phrases.length - 1];
          targetMeasure = lastPhrase.endMeasure + 1;
        }
        if (targetMeasure + preset.measureCount > mc) {
          targetMeasure = Math.max(0, mc - preset.measureCount);
        }
        const libItem = {
          name: preset.name,
          type: preset.type,
          color: preset.color,
          measureCount: preset.measureCount,
          note: preset.description,
          pattern: null
        };
        insertPhraseFromLibrary(libItem, targetMeasure);
        closePhraseLibrary();
      }
    }
  });
}

if (customPhraseList) {
  customPhraseList.addEventListener("click", (event) => {
    const insertBtn = event.target.closest("[data-insert-custom]");
    const deleteBtn = event.target.closest("[data-delete-custom]");

    if (insertBtn) {
      const itemId = insertBtn.dataset.insertCustom;
      const item = customPhraseLibrary.find(p => p.id === itemId);
      if (item) {
        const section = getCurrentSection();
        const mc = section?.measureCount || 4;
        let targetMeasure = 0;
        if (section?.phrases?.length > 0) {
          const lastPhrase = section.phrases[section.phrases.length - 1];
          targetMeasure = lastPhrase.endMeasure + 1;
        }
        if (targetMeasure + item.measureCount > mc) {
          targetMeasure = Math.max(0, mc - item.measureCount);
        }
        insertPhraseFromLibrary(item, targetMeasure);
        closePhraseLibrary();
      }
    } else if (deleteBtn) {
      const itemId = deleteBtn.dataset.deleteCustom;
      if (confirm("确定要删除这个乐句模板吗？")) {
        customPhraseLibrary = customPhraseLibrary.filter(p => p.id !== itemId);
        savePhraseLibrary(customPhraseLibrary);
        renderPhraseLibrary();
      }
    }
  });
}

if (currentPhraseList) {
  currentPhraseList.addEventListener("click", (event) => {
    const copyBtn = event.target.closest("[data-copy-phrase]");
    if (copyBtn) {
      const phraseId = copyBtn.dataset.copyPhrase;
      const sourceSectionId = copyBtn.dataset.section;
      const sourceSection = state.sections.find(s => s.id === sourceSectionId);
      if (!sourceSection) return;
      const sourcePhrase = sourceSection.phrases?.find(p => p.id === phraseId);
      if (!sourcePhrase) return;
      
      const targetSection = getCurrentSection();
      if (!targetSection) return;
      
      const bpm = sourceSection.beatsPerMeasure || 4;
      const start = sourcePhrase.startMeasure * bpm;
      const end = (sourcePhrase.endMeasure + 1) * bpm;
      const patternSlice = sourceSection.pattern.map(row => row.slice(start, end));
      
      const libItem = {
        name: sourcePhrase.name + " (副本)",
        type: sourcePhrase.type,
        color: sourcePhrase.color,
        measureCount: sourcePhrase.endMeasure - sourcePhrase.startMeasure + 1,
        beatsPerMeasure: bpm,
        pattern: patternSlice,
        note: sourcePhrase.note || "",
        repeat: sourcePhrase.repeat || 1,
        tempoMultiplier: sourcePhrase.tempoMultiplier || 1
      };
      
      const mc = targetSection.measureCount || 4;
      let targetMeasure = 0;
      if (targetSection.phrases?.length > 0) {
        const lastPhrase = targetSection.phrases[targetSection.phrases.length - 1];
        targetMeasure = lastPhrase.endMeasure + 1;
      }
      if (targetMeasure + libItem.measureCount > mc) {
        targetMeasure = Math.max(0, mc - libItem.measureCount);
      }
      
      insertPhraseFromLibrary(libItem, targetMeasure);
      closePhraseLibrary();
    }
  });
}

continuousPlayCheckbox.addEventListener("change", () => {
  if (tempoTrainer.active) {
    continuousPlayCheckbox.checked = state.continuousPlay;
    alert("变速训练进行中，无法切换连续播放。请先停止训练。");
    return;
  }
  if (diagnosisMode || diagnosisActive) {
    continuousPlayCheckbox.checked = state.continuousPlay;
    alert("诊断模式已开启，无法使用连续播放。请先关闭诊断模式。");
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

function ensureSchemeIds() {
  if (!state.schemeId) {
    state.schemeId = crypto.randomUUID();
  }
  if (!state.versionId) {
    state.versionId = crypto.randomUUID();
  }
}

function createCurrentBaseSnapshot(versionId) {
  return {
    versionId,
    schemeId: state.schemeId,
    pieceName: state.pieceName,
    sections: deepCloneSections(state.sections),
    currentSectionId: state.currentSectionId,
    continuousPlay: state.continuousPlay,
    rehearsalLog: Array.isArray(rehearsalLog)
      ? rehearsalLog.map((entry) => ({ ...entry }))
      : [],
    snapshotAt: new Date().toISOString()
  };
}

function buildExportData() {
  ensureSchemeIds();

  const currentVersionId = state.versionId;
  const newVersionId = crypto.randomUUID();
  const baseSnapshot = deepCloneBaseSnapshot(state.baseSnapshot)
    || createCurrentBaseSnapshot(currentVersionId);

  const exportData = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    schemeId: state.schemeId,
    versionId: newVersionId,
    parentVersionId: currentVersionId,
    pieceName: state.pieceName,
    sections: deepCloneSections(state.sections),
    currentSectionId: state.currentSectionId,
    continuousPlay: state.continuousPlay,
    saved: deepCloneSavedList(state.saved),
    rehearsalLog: JSON.parse(JSON.stringify(rehearsalLog || [])),
    baseSnapshot,
    appInfo: {
      name: "传统戏曲锣鼓经排练可视化",
      version: "1.0.0",
      feature: "3-way-merge"
    }
  };

  state.baseSnapshot = deepCloneBaseSnapshot(baseSnapshot);
  state.versionId = newVersionId;
  state.parentVersionId = currentVersionId;
  save();

  return exportData;
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
    if (!section.measureCount) {
      section.measureCount = 4;
      if (fileVersion < 5) compatibility.warnings.push(`第 ${idx + 1} 个段落缺少小节数字段，已自动填充为 4。`);
    }
    if (!section.beatsPerMeasure) {
      section.beatsPerMeasure = 4;
      if (fileVersion < 5) compatibility.warnings.push(`第 ${idx + 1} 个段落缺少拍号字段，已自动填充为 4/4。`);
    }
    if (!section.measureRange && fileVersion < 3) {
      const measureCount = Math.max(1, Math.ceil(
        section.pattern
          ? section.pattern[0]?.filter((c, i) =>
              section.pattern.some(row => row[i])
            ).length / (section.beatsPerMeasure || 4)
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
    gridSize: `${instruments.length}×16`,
    sectionCount: 0,
    totalMeasures: 0,
    version: data.schemaVersion || 1
  };

  if (Array.isArray(data.sections) && data.sections.length > 0) {
    stats.sectionCount = data.sections.length;
    const firstSection = data.sections.find((s) => s.id === data.currentSectionId) || data.sections[0];
    stats.bpm = firstSection?.bpm || data.bpm || 96;
    const fsMc = firstSection?.measureCount || 4;
    const fsBpm = firstSection?.beatsPerMeasure || 4;
    stats.gridSize = `${instruments.length}×${fsMc * fsBpm}`;

    data.sections.forEach((section) => {
      if (Array.isArray(section.notes)) {
        stats.noteCount += section.notes.length;
      }
      if (section.measureRange) {
        stats.totalMeasures = Math.max(stats.totalMeasures, section.measureRange.end);
      } else if (section.measureCount) {
        stats.totalMeasures = Math.max(stats.totalMeasures, section.measureCount);
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
        state.schemeId = parsedSchemeData.schemeId || crypto.randomUUID();
        state.versionId = parsedSchemeData.versionId || crypto.randomUUID();
        state.parentVersionId = parsedSchemeData.parentVersionId || null;
        state.baseSnapshot = deepCloneBaseSnapshot(parsedSchemeData.baseSnapshot);

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
const diagnosisTotal = document.querySelector("#diagnosisTotal");
const diagnosisAnswered = document.querySelector("#diagnosisAnswered");
const diagnosisCorrect = document.querySelector("#diagnosisCorrect");
const diagnosisAccuracy = document.querySelector("#diagnosisAccuracy");
const diagnosisCoverage = document.querySelector("#diagnosisCoverage");
const adaptiveHint = document.querySelector("#adaptiveHint");
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
const phraseDiagnosisSection = document.querySelector("#phraseDiagnosisSection");
const phraseDiagnosisList = document.querySelector("#phraseDiagnosisList");

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

function createEmptyWeaknessProfile() {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: {},
    migrationState: {
      oldDiagnosisMigrated: false,
      lastDiagnosisMigratedAt: null,
      migratedDiagnosisTimestamps: []
    },
    globalStats: {
      totalDiagnoses: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalQuestions: 0
    }
  };
}

function getSectionWeaknessKey(section) {
  if (!section) return "default";
  return section.id || section.name || "default";
}

function ensureSectionWeakness(section) {
  if (!weaknessProfile) {
    weaknessProfile = createEmptyWeaknessProfile();
  }
  const key = getSectionWeaknessKey(section);
  if (!weaknessProfile.sections[key]) {
    weaknessProfile.sections[key] = {
      wrongSteps: {},
      confusedPairs: {},
      noteRelatedSteps: [],
      pauseRelatedSteps: [],
      stepComplexity: {},
      stats: {
        totalQuestions: 0,
        totalCorrect: 0,
        totalWrong: 0,
        lastDiagnosedAt: null
      }
    };
  }
  return weaknessProfile.sections[key];
}

function loadWeaknessProfile() {
  try {
    const raw = localStorage.getItem(weaknessProfileStorageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version === 2 && data.sections) {
        weaknessProfile = data;
        weaknessProfileLoaded = true;
        return true;
      }
    }
  } catch {}
  weaknessProfile = null;
  weaknessProfileLoaded = false;
  return false;
}

function saveWeaknessProfile() {
  if (!weaknessProfile) return false;
  try {
    weaknessProfile.updatedAt = new Date().toISOString();
    localStorage.setItem(weaknessProfileStorageKey, JSON.stringify(weaknessProfile));
    return true;
  } catch {
    return false;
  }
}

function migrateOldDiagnosisToWeaknessProfile() {
  if (!lastDiagnosisResult) return false;

  const section = getCurrentSection();
  if (!section) return false;

  if (!weaknessProfile) {
    weaknessProfile = createEmptyWeaknessProfile();
    weaknessProfileLoaded = true;
  }

  if (!weaknessProfile.migrationState) {
    weaknessProfile.migrationState = {
      oldDiagnosisMigrated: false,
      lastDiagnosisMigratedAt: null,
      migratedDiagnosisTimestamps: []
    };
  }

  const resultTimestamp = lastDiagnosisResult.timestamp || new Date().toISOString();
  if (weaknessProfile.migrationState.migratedDiagnosisTimestamps.includes(resultTimestamp)) {
    return false;
  }

  const sectionWeakness = ensureSectionWeakness(section);
  let migrated = 0;

  if (Array.isArray(lastDiagnosisResult.wrongPositions)) {
    lastDiagnosisResult.wrongPositions.forEach(pos => {
      const stepKey = String(pos.step);
      if (!sectionWeakness.wrongSteps[stepKey]) {
        sectionWeakness.wrongSteps[stepKey] = {
          step: pos.step,
          wrongCount: 1,
          correctCount: 0,
          lastWrongAt: lastDiagnosisResult.timestamp,
          lastCorrectAt: null,
          wrongAnswers: {}
        };
        const userAns = pos.userAnswer;
        const ansKey = typeof userAns === "number" ? String(userAns) : String(userAns);
        sectionWeakness.wrongSteps[stepKey].wrongAnswers[ansKey] = 1;
        migrated++;
      }
    });
  }

  if (Array.isArray(lastDiagnosisResult.confusedInstruments)) {
    lastDiagnosisResult.confusedInstruments.forEach(item => {
      const pairKey = `${item.instr1}-${item.instr2}`;
      if (!sectionWeakness.confusedPairs[pairKey]) {
        sectionWeakness.confusedPairs[pairKey] = {
          instr1: item.instr1,
          instr2: item.instr2,
          count: item.count,
          lastWrongAt: lastDiagnosisResult.timestamp,
          label: item.label
        };
        migrated++;
      } else {
        const existing = sectionWeakness.confusedPairs[pairKey];
        if (!existing.lastWrongAt || new Date(item.lastWrongAt || lastDiagnosisResult.timestamp) > new Date(existing.lastWrongAt)) {
          existing.count = Math.max(existing.count, item.count);
          existing.lastWrongAt = lastDiagnosisResult.timestamp;
        }
        migrated++;
      }
    });
  }

  if (!sectionWeakness.stats.lastDiagnosedAt || 
      new Date(lastDiagnosisResult.timestamp) > new Date(sectionWeakness.stats.lastDiagnosedAt)) {
    sectionWeakness.stats.totalQuestions = Math.max(
      sectionWeakness.stats.totalQuestions,
      lastDiagnosisResult.answered || 0
    );
    sectionWeakness.stats.totalCorrect = Math.max(
      sectionWeakness.stats.totalCorrect,
      lastDiagnosisResult.correct || 0
    );
    sectionWeakness.stats.totalWrong = Math.max(
      sectionWeakness.stats.totalWrong,
      lastDiagnosisResult.wrong || 0
    );
    sectionWeakness.stats.lastDiagnosedAt = lastDiagnosisResult.timestamp;
  }

  if (weaknessProfile.globalStats) {
    weaknessProfile.globalStats.totalDiagnoses = Math.max(
      weaknessProfile.globalStats.totalDiagnoses,
      1
    );
    weaknessProfile.globalStats.totalQuestions = Math.max(
      weaknessProfile.globalStats.totalQuestions,
      lastDiagnosisResult.answered || 0
    );
    weaknessProfile.globalStats.totalCorrect = Math.max(
      weaknessProfile.globalStats.totalCorrect,
      lastDiagnosisResult.correct || 0
    );
    weaknessProfile.globalStats.totalWrong = Math.max(
      weaknessProfile.globalStats.totalWrong,
      lastDiagnosisResult.wrong || 0
    );
  }

  weaknessProfile.migrationState.oldDiagnosisMigrated = true;
  weaknessProfile.migrationState.lastDiagnosisMigratedAt = new Date().toISOString();
  weaknessProfile.migrationState.migratedDiagnosisTimestamps.push(resultTimestamp);

  const saved = saveWeaknessProfile();
  return migrated > 0 && saved;
}

function updateWeaknessAfterAnswer(step, correct, userAnswer, correctAnswer) {
  const section = getCurrentSection();
  if (!section) return;

  const sectionWeakness = ensureSectionWeakness(section);
  const stepKey = String(step);

  if (!sectionWeakness.wrongSteps[stepKey]) {
    sectionWeakness.wrongSteps[stepKey] = {
      step: step,
      wrongCount: 0,
      correctCount: 0,
      lastWrongAt: null,
      lastCorrectAt: null,
      wrongAnswers: {}
    };
  }

  const stepData = sectionWeakness.wrongSteps[stepKey];
  const now = new Date().toISOString();

  if (correct) {
    stepData.correctCount++;
    stepData.lastCorrectAt = now;
  } else {
    stepData.wrongCount++;
    stepData.lastWrongAt = now;
    const ansKey = typeof userAnswer === "number" ? String(userAnswer) : String(userAnswer);
    stepData.wrongAnswers[ansKey] = (stepData.wrongAnswers[ansKey] || 0) + 1;

    const correctInstrs = Array.isArray(correctAnswer) ? correctAnswer :
      (correctAnswer === -1 ? [] : (typeof correctAnswer === "number" ? [correctAnswer] : []));
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

    correctInstrs.forEach(ci => {
      userInstrs.forEach(ui => {
        if (ci !== ui) {
          const pairKey = `${Math.min(ci, ui)}-${Math.max(ci, ui)}`;
          if (!sectionWeakness.confusedPairs[pairKey]) {
            sectionWeakness.confusedPairs[pairKey] = {
              instr1: Math.min(ci, ui),
              instr2: Math.max(ci, ui),
              count: 0,
              lastWrongAt: null,
              label: `${instruments[Math.min(ci, ui)]?.name || "未知"} ↔ ${instruments[Math.max(ci, ui)]?.name || "未知"}`
            };
          }
          sectionWeakness.confusedPairs[pairKey].count++;
          sectionWeakness.confusedPairs[pairKey].lastWrongAt = now;
        }
      });
    });
  }

  sectionWeakness.stats.totalQuestions++;
  if (correct) {
    sectionWeakness.stats.totalCorrect++;
  } else {
    sectionWeakness.stats.totalWrong++;
  }
  sectionWeakness.stats.lastDiagnosedAt = now;

  if (weaknessProfile.globalStats) {
    weaknessProfile.globalStats.totalQuestions++;
    if (correct) {
      weaknessProfile.globalStats.totalCorrect++;
    } else {
      weaknessProfile.globalStats.totalWrong++;
    }
  }

  saveWeaknessProfile();
}

function calculateStepComplexity(section, step) {
  if (!section || !section.pattern) return 0;

  let activeInstruments = 0;
  for (let row = 0; row < instruments.length; row++) {
    if (section.pattern[row] && section.pattern[row][step] && section.enabledInstruments[row]) {
      activeInstruments++;
    }
  }

  const bpm = section.beatsPerMeasure || 4;
  const measure = Math.floor(step / bpm);
  const measureStart = measure * bpm;
  const measureEnd = measureStart + bpm;

  let measureDensity = 0;
  for (let s = measureStart; s < measureEnd && s < getSectionSteps(section); s++) {
    for (let row = 0; row < instruments.length; row++) {
      if (section.pattern[row] && section.pattern[row][s] && section.enabledInstruments[row]) {
        measureDensity++;
      }
    }
  }

  const instrScore = Math.min(activeInstruments / instruments.length, 1);
  const densityScore = Math.min(measureDensity / (instruments.length * bpm), 1);

  return instrScore * 0.6 + densityScore * 0.4;
}

function getPendingNoteSteps(section) {
  if (!section || !Array.isArray(section.collabNotes)) return [];
  const steps = new Set();
  const bpm = section.beatsPerMeasure || 4;

  section.collabNotes.forEach(note => {
    if (note.resolved) return;
    if (note.target === "all") {
      for (let s = 0; s < getSectionSteps(section); s++) {
        steps.add(s);
      }
    } else {
      const measure = Number(note.target);
      if (!isNaN(measure) && measure >= 0) {
        const start = measure * bpm;
        const end = start + bpm;
        for (let s = start; s < end; s++) {
          steps.add(s);
        }
      }
    }
  });

  return Array.from(steps);
}

function getRecentPauseSteps(section) {
  if (!rehearsalLog || rehearsalLog.length === 0) return [];
  const steps = new Map();
  const recent = rehearsalLog.slice(0, 5);
  const bpm = section?.beatsPerMeasure || 4;
  const totalSteps = getSectionSteps(section);

  recent.forEach(entry => {
    if (entry.pausePosition != null && entry.pauseLabel && !entry.pauseLabel.includes("播放完成")) {
      let pos = entry.pausePosition;
      if (pos >= 0 && pos < totalSteps) {
        steps.set(pos, (steps.get(pos) || 0) + 1);
        for (let offset = -1; offset <= 1; offset++) {
          const nearPos = pos + offset;
          if (nearPos >= 0 && nearPos < totalSteps && nearPos !== pos) {
            steps.set(nearPos, (steps.get(nearPos) || 0) + 0.5);
          }
        }
      }
    }
  });

  return steps;
}

function getConfusedInstrumentSteps(section, sectionWeakness) {
  if (!sectionWeakness || !sectionWeakness.confusedPairs) return new Map();
  const stepScores = new Map();
  const pairs = Object.values(sectionWeakness.confusedPairs);

  if (pairs.length === 0) return stepScores;

  const maxCount = Math.max(...pairs.map(p => p.count), 1);
  const totalSteps = getSectionSteps(section);

  for (let step = 0; step < totalSteps; step++) {
    let score = 0;
    let activeRows = [];
    for (let row = 0; row < instruments.length; row++) {
      if (section.pattern[row] && section.pattern[row][step] && section.enabledInstruments[row]) {
        activeRows.push(row);
      }
    }

    if (activeRows.length === 0) continue;

    pairs.forEach(pair => {
      const instr1Active = activeRows.includes(pair.instr1);
      const instr2Active = activeRows.includes(pair.instr2);
      if (instr1Active || instr2Active) {
        const pairScore = (pair.count / maxCount) * (instr1Active && instr2Active ? 1 : 0.5);
        score = Math.max(score, pairScore);
      }
    });

    if (score > 0) {
      stepScores.set(step, score);
    }
  }

  return stepScores;
}

function generateAdaptiveQuestionQueue() {
  const section = getCurrentSection();
  if (!section) return [];

  if (!weaknessProfileLoaded) {
    loadWeaknessProfile();
  }

  const hasHistory = weaknessProfile && Object.keys(weaknessProfile.sections).length > 0;
  const sectionWeakness = ensureSectionWeakness(section);
  const totalSteps = getSectionSteps(section);

  const noteSteps = getPendingNoteSteps(section);
  const noteStepSet = new Set(noteSteps);

  const pauseStepMap = getRecentPauseSteps(section);

  const confusedStepMap = getConfusedInstrumentSteps(section, sectionWeakness);

  const candidateSteps = [];

  for (let step = 0; step < totalSteps; step++) {
    const activeRows = [];
    for (let row = 0; row < instruments.length; row++) {
      if (section.pattern[row] && section.pattern[row][step] && section.enabledInstruments[row]) {
        activeRows.push(row);
      }
    }

    let correctAnswer;
    if (activeRows.length === 0) {
      correctAnswer = -1;
    } else if (activeRows.length === 1) {
      correctAnswer = activeRows[0];
    } else {
      correctAnswer = activeRows;
    }

    candidateSteps.push({
      step: step,
      rows: activeRows,
      correctAnswer: correctAnswer,
      scores: {
        wrongHistory: 0,
        confusedInstruments: 0,
        pendingNotes: 0,
        recentPauses: 0,
        complexity: 0
      },
      totalScore: 0
    });
  }

  const wrongStepEntries = Object.entries(sectionWeakness.wrongSteps);
  const maxWrongCount = wrongStepEntries.length > 0
    ? Math.max(...wrongStepEntries.map(([, d]) => d.wrongCount), 1)
    : 1;

  candidateSteps.forEach(candidate => {
    const stepKey = String(candidate.step);
    const stepData = sectionWeakness.wrongSteps[stepKey];

    if (stepData && stepData.wrongCount > 0) {
      const wrongRatio = stepData.wrongCount / (stepData.wrongCount + stepData.correctCount);
      const freqScore = stepData.wrongCount / maxWrongCount;
      const recencyScore = stepData.lastWrongAt
        ? Math.max(0, 1 - (Date.now() - new Date(stepData.lastWrongAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 0.5;
      candidate.scores.wrongHistory = wrongRatio * 0.5 + freqScore * 0.3 + recencyScore * 0.2;
    }

    if (confusedStepMap.has(candidate.step)) {
      candidate.scores.confusedInstruments = confusedStepMap.get(candidate.step);
    }

    if (noteStepSet.has(candidate.step)) {
      candidate.scores.pendingNotes = 1;
    }

    if (pauseStepMap.has(candidate.step)) {
      candidate.scores.recentPauses = Math.min(pauseStepMap.get(candidate.step) / 3, 1);
    }

    candidate.scores.complexity = calculateStepComplexity(section, candidate.step);

    candidate.totalScore =
      candidate.scores.wrongHistory * ADAPTIVE_WEIGHTS.wrongHistory +
      candidate.scores.confusedInstruments * ADAPTIVE_WEIGHTS.confusedInstruments +
      candidate.scores.pendingNotes * ADAPTIVE_WEIGHTS.pendingNotes +
      candidate.scores.recentPauses * ADAPTIVE_WEIGHTS.recentPauses +
      candidate.scores.complexity * ADAPTIVE_WEIGHTS.complexity;
  });

  let questionCount;
  if (!hasHistory) {
    questionCount = Math.max(MIN_QUESTIONS, Math.floor(totalSteps * COLD_START_QUESTION_RATIO));
  } else {
    const avgScore = candidateSteps.reduce((s, c) => s + c.totalScore, 0) / totalSteps;
    const dynamicRatio = 0.2 + avgScore * 0.4;
    questionCount = Math.max(MIN_QUESTIONS, Math.floor(totalSteps * dynamicRatio));
  }
  questionCount = Math.min(questionCount, MAX_QUESTIONS, totalSteps);

  candidateSteps.sort((a, b) => b.totalScore - a.totalScore);

  const selected = [];
  const guaranteedCount = Math.min(3, questionCount);
  for (let i = 0; i < guaranteedCount && i < candidateSteps.length; i++) {
    if (candidateSteps[i].totalScore > 0) {
      selected.push(candidateSteps[i]);
    }
  }

  const remainingCandidates = candidateSteps.filter(c => !selected.includes(c));
  const remainingNeeded = questionCount - selected.length;

  if (remainingNeeded > 0 && remainingCandidates.length > 0) {
    const totalWeight = remainingCandidates.reduce((s, c) => s + Math.max(c.totalScore, 0.01), 0);
    let cumulative = 0;
    const weighted = remainingCandidates.map(c => {
      cumulative += Math.max(c.totalScore, 0.01) / totalWeight;
      return { candidate: c, weight: cumulative };
    });

    const selectedIndices = new Set();
    for (let i = 0; i < remainingNeeded && i < remainingCandidates.length; i++) {
      let rand = Math.random();
      let chosen = null;
      for (const w of weighted) {
        if (!selectedIndices.has(w.candidate.step) && rand <= w.weight) {
          chosen = w.candidate;
          break;
        }
      }
      if (!chosen) {
        for (const w of weighted) {
          if (!selectedIndices.has(w.candidate.step)) {
            chosen = w.candidate;
            break;
          }
        }
      }
      if (chosen) {
        selectedIndices.add(chosen.step);
        selected.push(chosen);
      }
    }
  }

  selected.sort((a, b) => a.step - b.step);

  return selected.map(s => ({
    step: s.step,
    rows: s.rows,
    correctAnswer: s.correctAnswer,
    scores: s.scores,
    totalScore: s.totalScore
  }));
}

function getWeaknessSummary(section) {
  if (!section) return null;
  const sectionWeakness = ensureSectionWeakness(section);

  const wrongSteps = Object.values(sectionWeakness.wrongSteps)
    .filter(s => s.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount);

  const confusedPairs = Object.values(sectionWeakness.confusedPairs)
    .sort((a, b) => b.count - a.count);

  const stats = sectionWeakness.stats;
  const accuracy = stats.totalQuestions > 0
    ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
    : 0;

  const topWrongSteps = wrongSteps.slice(0, 5);
  const topConfusedPairs = confusedPairs.slice(0, 3);

  const noteSteps = getPendingNoteSteps(section);
  const pauseSteps = getRecentPauseSteps(section);

  const overallWeakness = wrongSteps.length > 0 || confusedPairs.length > 0
    ? "high"
    : (noteSteps.length > 0 || pauseSteps.size > 0 ? "medium" : "low");

  return {
    accuracy,
    totalQuestions: stats.totalQuestions,
    totalWrong: stats.totalWrong,
    wrongStepsCount: wrongSteps.length,
    confusedPairsCount: confusedPairs.length,
    topWrongSteps,
    topConfusedPairs,
    noteStepsCount: noteSteps.length,
    pauseStepsCount: pauseSteps.size,
    overallWeakness,
    lastDiagnosedAt: stats.lastDiagnosedAt
  };
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
  if (!sec) return [0, 15];
  const bpm = sec.beatsPerMeasure || 4;
  const total = getSectionSteps(sec);
  if (tempoTrainer.originalLoop === "") return [0, total - 1];
  const start = Number(tempoTrainer.originalLoop) * bpm;
  return [start, start + bpm - 1];
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
  initRehearsalDetail();
  reviewState.prevBpm = section.bpm;
  reviewState.prevLoop = tempoTrainer.originalLoop;
  reviewState.prevSectionId = section.id;
  reviewState.prevVoices = (section.enabledInstruments || []).join(",");
  reviewState.prevMixConfig = JSON.stringify(section.mixConfig || createDefaultMixConfig());
  const activeVoices = instruments
    .filter((_, idx) => section.enabledInstruments[idx])
    .map((i) => i.name);
  const loopLabel = tempoTrainer.originalLoop === "" ? "全段" : `第${Number(tempoTrainer.originalLoop) + 1}小节`;
  section.mixConfig = section.mixConfig || createDefaultMixConfig();
  const startingBeat = playhead;
  addReviewEvent("start", {
    mode: "tempo",
    initialBpm: tempoTrainer.bpmSteps[0],
    bpmSteps: [...tempoTrainer.bpmSteps],
    totalRounds: tempoTrainer.totalRounds
  }, section, startingBeat);
  checkAndRecordChanges(section, startingBeat);
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

  if (currentRehearsalId) {
    checkAndRecordChanges(section, playhead);
  }

  tempoTrainer.beatsRemaining--;
  updateTempoStatusDisplay();

  if (playhead >= end) {
    tempoTrainer.currentSubRound++;
    tempoTrainer.currentRound++;
    tempoTrainer.beatsRemaining = tempoTrainer.totalBeatsPerRound;

    if (currentRehearsalId) {
      addReviewEvent("round", {
        currentRound: tempoTrainer.currentRound,
        currentSubRound: tempoTrainer.currentSubRound,
        currentBpmIndex: tempoTrainer.currentBpmIndex,
        bpm: section.bpm
      }, section, end);
    }

    if (tempoTrainer.currentSubRound >= tempoTrainer.roundsPerBpm) {
      tempoTrainer.currentBpmIndex++;
      tempoTrainer.currentSubRound = 0;

      if (tempoTrainer.currentBpmIndex >= tempoTrainer.bpmSteps.length) {
        finishTempoTrainer();
        return;
      }

      const nextBpm = tempoTrainer.bpmSteps[tempoTrainer.currentBpmIndex];
      if (currentRehearsalId) {
        addReviewEvent("bpm", {
          from: section.bpm,
          to: nextBpm,
          delta: nextBpm - section.bpm,
          tempoStep: true,
          bpmIndex: tempoTrainer.currentBpmIndex
        }, section, start);
        reviewState.prevBpm = nextBpm;
      }
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
        if (currentRehearsalId) {
          checkAndRecordChanges(getCurrentSection(), playhead);
        }
        updateTempoStatusDisplay();
        timer = setInterval(tempoTrainerTick, 60000 / section.bpm);
        tempoTrainerTick();
      }, tempoTrainer.pauseBetweenRounds);
      return;
    }

    playhead = start;
    if (currentRehearsalId) {
      checkAndRecordChanges(section, playhead);
    }
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

  let finalRehearsalIdToReview = null;
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

    finalizeRehearsalDetail(null, "tempo");
    finalRehearsalIdToReview = currentRehearsalId;

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

  if (finalRehearsalIdToReview && reviewState.autoOpenAfterPlay) {
    setTimeout(() => {
      if (confirm("变速训练结束，是否进入复盘模式查看详细记录？")) {
        openReviewOverlay(finalRehearsalIdToReview);
      }
    }, 300);
  }
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
    if (diagnosisActive || diagnosisMode) {
      alert("诊断模式已开启，请先关闭诊断模式再使用变速训练。");
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
  const difficulty = diagnosisDifficulty?.value || "adaptive";

  if (difficulty === "adaptive") {
    return generateAdaptiveQuestionQueue();
  }

  const section = getCurrentSection();
  if (!section) return [];

  const ratio = getDifficultyRatio();
  const candidateSteps = [];
  const totalSteps = getSectionSteps(section);

  for (let step = 0; step < totalSteps; step++) {
    const activeRows = [];
    for (let row = 0; row < instruments.length; row++) {
      if (section.pattern[row] && section.pattern[row][step]) {
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

  if (diagnosisTotal) {
    diagnosisTotal.textContent = total;
  }
  diagnosisAnswered.textContent = `${answered}/${total}`;
  diagnosisCorrect.textContent = correct;
  diagnosisAccuracy.textContent = answered > 0 ? `${accuracy}%` : "—";

  if (diagnosisCoverage) {
    const difficulty = diagnosisDifficulty?.value || "adaptive";
    if (difficulty === "adaptive") {
      const highScoreCount = diagnosisHiddenCells.filter(q => q.totalScore > 0.3).length;
      const coverage = total > 0 ? Math.round((highScoreCount / total) * 100) : 0;
      diagnosisCoverage.textContent = `${coverage}%`;
    } else {
      diagnosisCoverage.textContent = "随机";
    }
  }
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

  updateWeaknessAfterAnswer(question.step, isCorrect, userAnswer, correctAnswer);

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
  const diagnosisEnd = getSectionSteps(section) - 1;
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

  if (continuousPlayCheckbox && continuousPlayCheckbox.checked) {
    if (!confirm("诊断练习期间将关闭连续播放，是否继续？")) {
      return;
    }
    continuousPlayCheckbox.checked = false;
    state.continuousPlay = false;
    save();
    renderDashboard();
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

  if (!weaknessProfileLoaded) {
    loadWeaknessProfile();
    if (lastDiagnosisResult) {
      migrateOldDiagnosisToWeaknessProfile();
    }
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

    if (weaknessProfile && weaknessProfile.globalStats) {
      weaknessProfile.globalStats.totalDiagnoses++;
      saveWeaknessProfile();
    }

    renderDashboard();
    regeneratePracticeTasks();
  }
}

function finishDiagnosis() {
  stopDiagnosis();
}

function analyzePhraseDiagnosis(wrongPositions) {
  const section = getCurrentSection();
  if (!section || !section.phrases || section.phrases.length === 0) return [];
  const bpm = section.beatsPerMeasure || 4;
  const phraseStats = new Map();
  section.phrases.forEach(phrase => {
    phraseStats.set(phrase.id, {
      phrase,
      totalQuestions: 0,
      wrongCount: 0,
      wrongDetails: []
    });
  });
  diagnosisHiddenCells.forEach(q => {
    const measure = Math.floor(q.step / bpm);
    section.phrases.forEach(phrase => {
      if (measure >= phrase.startMeasure && measure <= phrase.endMeasure) {
        const stat = phraseStats.get(phrase.id);
        if (stat) stat.totalQuestions++;
      }
    });
  });
  wrongPositions.forEach(pos => {
    const measure = Math.floor(pos.step / bpm);
    section.phrases.forEach(phrase => {
      if (measure >= phrase.startMeasure && measure <= phrase.endMeasure) {
        const stat = phraseStats.get(phrase.id);
        if (stat) {
          stat.wrongCount++;
          stat.wrongDetails.push(pos);
        }
      }
    });
  });
  const result = [];
  phraseStats.forEach(stat => {
    if (stat.totalQuestions > 0) {
      stat.accuracy = stat.totalQuestions > 0
        ? Math.round(((stat.totalQuestions - stat.wrongCount) / stat.totalQuestions) * 100)
        : 100;
      result.push(stat);
    }
  });
  return result.sort((a, b) => a.accuracy - b.accuracy);
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
    phraseAnalysis: analyzePhraseDiagnosis(diagnosisStats.wrongPositions),
    durationMs: diagnosisStartTime ? Date.now() - diagnosisStartTime : null
  };
}

function renderPhraseDiagnosisList(phraseAnalysis) {
  if (!phraseDiagnosisSection || !phraseDiagnosisList) return;
  if (!phraseAnalysis || phraseAnalysis.length === 0) {
    phraseDiagnosisSection.style.display = "none";
    return;
  }
  phraseDiagnosisSection.style.display = "block";
  phraseDiagnosisList.innerHTML = phraseAnalysis.map(stat => {
    const type = getPhraseType(stat.phrase.type);
    const accuracyColor = stat.accuracy >= 80 ? "#047857" : stat.accuracy >= 50 ? "#b45309" : "#991b1b";
    const weakBadge = stat.accuracy < 70 ? '<span class="weak-phrase-badge" style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:4px;font-size:11px;margin-left:4px;">⚠️ 薄弱</span>' : '';
    return `
      <div class="phrase-diagnosis-item" style="border-left:3px solid ${stat.phrase.color || type.color};padding:8px 12px;margin-bottom:8px;background:${stat.phrase.color || type.color}10;border-radius:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-weight:600;">${type.icon} ${stat.phrase.name || type.name}</span>
          <span style="font-weight:600;color:${accuracyColor};">${stat.accuracy}%</span>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">
          📏 第${stat.phrase.startMeasure + 1}-${stat.phrase.endMeasure + 1}小节 · 
          共${stat.totalQuestions}题 · 错${stat.wrongCount}题${weakBadge}
        </div>
        ${stat.wrongDetails.length > 0 ? `
          <div style="font-size:11px;color:#6b7280;">
            错拍：${stat.wrongDetails.map(d => d.beatLabel).slice(0, 5).join("、")}${stat.wrongDetails.length > 5 ? "..." : ""}
          </div>
        ` : ''}
      </div>
    `;
  }).join("");
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

  const phraseAnalysis = analyzePhraseDiagnosis(diagnosisStats.wrongPositions);
  renderPhraseDiagnosisList(phraseAnalysis);

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

  renderPhraseDiagnosisList(lastDiagnosisResult.phraseAnalysis);

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
    if (diagnosisTotal) diagnosisTotal.textContent = "0";
    diagnosisAnswered.textContent = "0";
    diagnosisCorrect.textContent = "0";
    diagnosisAccuracy.textContent = "—";
    if (diagnosisCoverage) diagnosisCoverage.textContent = "—";

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
loadWeaknessProfile();
if (lastDiagnosisResult) {
  migrateOldDiagnosisToWeaknessProfile();
}

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

  const mc = section.measureCount || 4;
  let targetOptions = `<option value="all" ${note.target === "all" ? "selected" : ""}>全段</option>`;
  for (let i = 0; i < mc; i++) {
    targetOptions += `<option value="${i}" ${note.target === i ? "selected" : ""}>第${i + 1}小节</option>`;
  }

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
                ${targetOptions}
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

window.__luoguTest = {
  parseSinglePattern: (input, section) => {
    const sec = section || getCurrentSection();
    const ctx = sec
      ? { measureCount: sec.measureCount, beatsPerMeasure: sec.beatsPerMeasure, bpm: sec.bpm }
      : null;
    return CommandParser.parseSinglePattern(input, ctx);
  },
  parseSectionHeader: (line) => CommandParser.parseSectionHeader(line),
  parseCommand: (input, section) => {
    const sec = section || getCurrentSection();
    const ctx = sec
      ? { measureCount: sec.measureCount, beatsPerMeasure: sec.beatsPerMeasure, bpm: sec.bpm }
      : null;
    return CommandParser.parseCommand(input, ctx);
  },
  applyParsedPattern,
  createEmptySection,
  getCurrentSection,
  save,
  deepCloneSection,
  deepCloneSections: (sections) => sections.map(s => deepCloneSection(s)),
  get state() { return state; },
  set state(val) { state = val; },
  get parsedPattern() { return parsedPattern; },
  set parsedPattern(val) { parsedPattern = val; },
  get parsedWriteMode() { return parsedWriteMode; },
  set parsedWriteMode(val) { parsedWriteMode = val; },
  instruments,
  steps,
  restTokens,
  aliasLabels,
  tokenNames
};

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
  const curSection = getCurrentSection();
  const maxMc = curSection?.measureCount || 4;
  const bpm = curSection?.beatsPerMeasure || 4;
  recent.forEach(entry => {
    if (entry.pausePosition != null && entry.pauseLabel && !entry.pauseLabel.includes("播放完成")) {
      let matchedSec = curSection;
      if (!matchedSec && entry.snapshot?.sections?.length > 0) {
        const sid = entry.sectionId || entry.snapshot.currentSectionId;
        matchedSec = sid ? entry.snapshot.sections.find(s => s.id === sid) || entry.snapshot.sections[0] : entry.snapshot.sections[0];
      }
      const entryBpm = matchedSec?.beatsPerMeasure || bpm;
      const measure = Math.floor(entry.pausePosition / entryBpm);
      pauseMeasures.set(measure, (pauseMeasures.get(measure) || 0) + 1);
    }
  });
  pauseMeasures.forEach((count, measure) => {
    if (measure >= 0 && measure < maxMc && count >= 1) {
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
  const section = getCurrentSection();
  if (!section) return [];

  const tasks = [];

  if (!weaknessProfileLoaded) {
    loadWeaknessProfile();
    if (lastDiagnosisResult) {
      migrateOldDiagnosisToWeaknessProfile();
    }
  }

  const sectionWeakness = weaknessProfile
    ? weaknessProfile.sections[getSectionWeaknessKey(section)]
    : null;

  const hasWeaknessData = sectionWeakness &&
    (Object.keys(sectionWeakness.wrongSteps || {}).length > 0 ||
     Object.keys(sectionWeakness.confusedPairs || {}).length > 0);

  let accuracy = 100;
  let wrongSteps = [];
  let confusedPairs = [];

  if (hasWeaknessData) {
    const stats = sectionWeakness.stats;
    accuracy = stats.totalQuestions > 0
      ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100)
      : 100;

    wrongSteps = Object.values(sectionWeakness.wrongSteps)
      .filter(s => s.wrongCount > 0)
      .sort((a, b) => b.wrongCount - a.wrongCount);

    confusedPairs = Object.values(sectionWeakness.confusedPairs)
      .sort((a, b) => b.count - a.count);
  } else if (lastDiagnosisResult) {
    accuracy = lastDiagnosisResult.accuracy || 100;
    wrongSteps = lastDiagnosisResult.wrongPositions || [];
    confusedPairs = lastDiagnosisResult.confusedInstruments || [];
  } else {
    return [];
  }

  const maxMc = section.measureCount || 4;
  const bpm = section.beatsPerMeasure || 4;

  if (accuracy < 80) {
    const priority = accuracy < 50 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
    tasks.push(makePracticeTask({
      category: "diagnosis",
      priority,
      title: `整体错拍率较高（正确率 ${accuracy}%），建议重新做一轮诊断练习`,
      description: `诊断练习正确率仅 ${accuracy}%，建议针对易错位置专项练习后再重新诊断。自适应系统已根据你的薄弱点生成题目。`,
      sourceData: { accuracy }
    }));
  }

  if (wrongSteps.length > 0) {
    const measureMap = new Map();
    wrongSteps.forEach(step => {
      const stepIndex = step.step != null ? step.step : (step.step || 0);
      const measure = Math.floor(stepIndex / bpm);
      if (!measureMap.has(measure)) measureMap.set(measure, []);
      measureMap.get(measure).push(step);
    });

    measureMap.forEach((steps, measure) => {
      if (measure >= 0 && measure < maxMc) {
        const beatLabels = steps.map(s => {
          if (s.beatLabel) return s.beatLabel;
          const stepIdx = s.step != null ? s.step : s.step;
          return beatLabel(stepIdx);
        }).join("、");
        const totalWrong = steps.reduce((sum, s) => sum + (s.wrongCount || 1), 0);
        const priority = steps.length >= 2 || totalWrong >= 3 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
        tasks.push(makePracticeTask({
          category: "diagnosis",
          priority,
          measure,
          title: `纠正第${measure + 1}小节的错拍（${steps.length}处易错点）`,
          description: `易错拍点：${beatLabels}\n累计错误 ${totalWrong} 次。建议慢速逐拍练习，确认每个拍点的乐器口令准确后再逐步提速。`,
          sourceData: { measure, steps: steps.map(s => s.step != null ? s.step : s.step) }
        }));
      }
    });
  }

  if (confusedPairs.length > 0) {
    confusedPairs.slice(0, 2).forEach(item => {
      const priority = item.count >= 3 ? PRIORITY.HIGH : PRIORITY.MEDIUM;
      const label = item.label || `${instruments[item.instr1]?.name || "未知"} ↔ ${instruments[item.instr2]?.name || "未知"}`;
      tasks.push(makePracticeTask({
        category: "diagnosis",
        priority,
        title: `区分易混淆乐器：${label}（混淆${item.count}次）`,
        description: `诊断练习中「${label}」出现了 ${item.count} 次混淆，建议对比两种乐器的音色特征，单独听辨练习。`,
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
  const curSteps = getSectionSteps(curSection);
  const histSteps = getSectionSteps(histSection);
  const maxSteps = Math.max(curSteps, histSteps);
  for (let row = 0; row < instruments.length; row++) {
    for (let step = 0; step < maxSteps; step++) {
      const curExists = step < curSteps;
      const histExists = step < histSteps;
      const curVal = (curExists && curPattern[row] && curPattern[row][step]) || "";
      const histVal = (histExists && histPattern[row] && histPattern[row][step]) || "";
      if (curVal !== histVal || curExists !== histExists) {
        diff.gridDiff.push({
          row,
          step,
          instrument: instruments[row].name,
          curVal,
          histVal,
          status: curExists && !histExists ? "added" : (!curExists && histExists ? "removed" : "modified")
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
        for (let step = 0; step < getSectionSteps(hist); step++) {
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

      const vcRefSection = diff.histSection || diff.curSection;
      const vcCurSteps = getSectionSteps(diff.curSection || { measureCount: 4, beatsPerMeasure: 4 });
      const vcHistSteps = getSectionSteps(diff.histSection || { measureCount: 4, beatsPerMeasure: 4 });
      const vcMaxSteps = Math.max(vcCurSteps, vcHistSteps);

      html += `<tr><th></th>`;
      for (let s = 0; s < vcMaxSteps; s++) {
        html += `<th>${beatLabel(s, vcRefSection)}</th>`;
      }
      html += `</tr>`;

      const changedSteps = new Set(diff.gridDiff.map(d => d.step));

      for (let row = 0; row < instruments.length; row++) {
        html += `<tr><td class="inst-label">${instruments[row].name}</td>`;
        for (let s = 0; s < vcMaxSteps; s++) {
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
        for (let s = 0; s < vcMaxSteps; s++) {
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
        const histSteps = getSectionSteps(histSection);
        const curSteps = getSectionSteps(curSection);
        for (let row = 0; row < instruments.length; row++) {
          for (const step of beatsToRestore) {
            if (step < histSteps && step < curSteps && histSection.pattern[row] && histSection.pattern[row][step] !== undefined) {
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
        const curSteps2 = getSectionSteps(curSection);
        const histSteps2 = getSectionSteps(histSection);
        if (step < curSteps2 && step < histSteps2 && histSection.pattern[row] && histSection.pattern[row][step] !== undefined) {
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

const mergeOverlay = document.getElementById("mergeOverlay");
const mergeCloseBtn = document.getElementById("mergeCloseBtn");
const mergeCancelBtn = document.getElementById("mergeCancelBtn");
const mergeAutoMergeBtn = document.getElementById("mergeAutoMergeBtn");
const mergePreviewBtn = document.getElementById("mergePreviewBtn");
const mergeExportBtn = document.getElementById("mergeExportBtn");
const mergeApplyBtn = document.getElementById("mergeApplyBtn");
const schemeMergeFileInput = document.getElementById("schemeMergeFileInput");
const mergeTotalDiffsEl = document.getElementById("mergeTotalDiffs");
const mergeAutoDiffsEl = document.getElementById("mergeAutoDiffs");
const mergeConflictDiffsEl = document.getElementById("mergeConflictDiffs");
const mergeResolvedDiffsEl = document.getElementById("mergeResolvedDiffs");
const mergeSectionListEl = document.getElementById("mergeSectionList");
const mergeGridSectionSelect = document.getElementById("mergeGridSectionSelect");
const mergeGridCompareEl = document.getElementById("mergeGridCompare");
const mergeSectionsListEl = document.getElementById("mergeSectionsList");
const mergeVoiceSectionSelect = document.getElementById("mergeVoiceSectionSelect");
const mergeVoiceCompareEl = document.getElementById("mergeVoiceCompare");
const mergeNoteSectionSelect = document.getElementById("mergeNoteSectionSelect");
const mergeNotesCompareEl = document.getElementById("mergeNotesCompare");
const mergePracticeCompareEl = document.getElementById("mergePracticeCompare");
const mergeConflictListEl = document.getElementById("mergeConflictList");
const mergeConflictProgressEl = document.getElementById("mergeConflictProgress");
const mergePrevConflictBtn = document.getElementById("mergePrevConflictBtn");
const mergeNextConflictBtn = document.getElementById("mergeNextConflictBtn");
const mergePreviewBar = document.getElementById("mergePreviewBar");
const mergeExitPreviewBtn = document.getElementById("mergeExitPreviewBtn");

let mergeState = null;
let originalStateBackup = null;
let originalRehearsalLogBackup = null;
let mergePreviewActive = false;
let currentConflictIndex = 0;

function initMergeState() {
  mergeState = {
    collabData: null,
    collabRehearsalLog: [],
    baseData: null,
    baseRehearsalLog: [],
    baseInfo: {
      available: false,
      sameScheme: false,
      relation: "unknown",
      oursVersion: null,
      theirsVersion: null,
      baseVersion: null
    },
    diffs: {
      sections: [],
      grid: {},
      bpm: {},
      voices: {},
      notes: {},
      practice: []
    },
    threeWayDiffs: {
      sections: [],
      grid: {},
      bpm: {},
      voices: {},
      notes: {},
      practice: []
    },
    conflicts: [],
    resolvedConflicts: {},
    autoMergeable: [],
    mergedData: null,
    mergedRehearsalLog: [],
    autoMerged: false
  };
  mergePreviewActive = false;
  currentConflictIndex = 0;
}

function openMergeModal() {
  initMergeState();
  originalStateBackup = JSON.parse(JSON.stringify(state));
  originalRehearsalLogBackup = JSON.parse(JSON.stringify(rehearsalLog));
  mergeOverlay.style.display = "flex";
  updateMergeStats();
  renderMergeOverview();
}

function closeMergeModal() {
  if (mergePreviewActive) {
    exitMergePreview();
  }
  mergeOverlay.style.display = "none";
  mergeState = null;
  originalStateBackup = null;
  originalRehearsalLogBackup = null;
  schemeMergeFileInput.value = "";
}

function updateMergeStats() {
  if (!mergeState) {
    mergeTotalDiffsEl.textContent = "0";
    mergeAutoDiffsEl.textContent = "0";
    mergeConflictDiffsEl.textContent = "0";
    mergeResolvedDiffsEl.textContent = "0";
    return;
  }

  const baseAvailable = mergeState.baseInfo.available && mergeState.threeWayDiffs;

  let totalDiffs, autoCount, conflictCount;

  if (baseAvailable) {
    const autoMergeableCount = mergeState.autoMergeable?.length || 0;
    conflictCount = mergeState.conflicts?.length || 0;
    totalDiffs = autoMergeableCount + conflictCount;
    autoCount = autoMergeableCount;
  } else {
    totalDiffs = countTotalDiffs();
    conflictCount = mergeState.conflicts.length;
    autoCount = totalDiffs - conflictCount;
  }

  const resolvedCount = Object.keys(mergeState.resolvedConflicts).length;

  mergeTotalDiffsEl.textContent = totalDiffs;
  mergeAutoDiffsEl.textContent = Math.max(0, autoCount);
  mergeConflictDiffsEl.textContent = conflictCount;
  mergeResolvedDiffsEl.textContent = resolvedCount;

  const hasData = mergeState.collabData !== null;
  mergeAutoMergeBtn.disabled = !hasData || mergeState.autoMerged;
  mergePreviewBtn.disabled = !hasData || !mergeState.autoMerged;
  mergeExportBtn.disabled = !hasData || !mergeState.autoMerged;
  mergeApplyBtn.disabled = !hasData || !mergeState.autoMerged || (conflictCount > 0 && resolvedCount < conflictCount);
}

function countTotalDiffs() {
  if (!mergeState || !mergeState.diffs) return 0;
  let count = 0;

  if (mergeState.diffs.sections) {
    count += mergeState.diffs.sections.filter(s => s.type !== "same").length;
  }

  if (mergeState.diffs.practice) {
    count += mergeState.diffs.practice.filter(p => p.type !== "same").length;
  }

  count += mergeState.conflicts.length;

  return Math.max(0, count);
}

async function handleMergeFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const rawData = await parseSchemeFile(file);
    const { data } = validateAndMigrateScheme(rawData);
    mergeState.collabData = data;

    if (data.rehearsalLog && Array.isArray(data.rehearsalLog)) {
      mergeState.collabRehearsalLog = data.rehearsalLog;
    }

    extractBaseAndAnalyze(data);

    computeAllDiffs();
    computeThreeWayDiffs();
    detectConflictsThreeWay();
    updateMergeStats();
    renderMergeOverview();
    renderAllMergeTabs();
  } catch (error) {
    alert("协作文件解析失败：" + error.message);
    schemeMergeFileInput.value = "";
  }
}

function extractBaseAndAnalyze(collabData) {
  ensureSchemeIds();

  const oursSchemeId = state.schemeId;
  const theirsSchemeId = collabData.schemeId;
  const sameScheme = oursSchemeId && theirsSchemeId && oursSchemeId === theirsSchemeId;

  let baseData = null;
  let baseRehearsalLog = [];
  let baseAvailable = false;
  let relation = "unknown";
  let baseVersionId = null;

  if (sameScheme) {
    if (collabData.baseSnapshot && collabData.baseSnapshot.sections) {
      baseData = collabData.baseSnapshot;
      baseVersionId = collabData.baseSnapshot.versionId;
      baseAvailable = true;
      relation = "has_base_from_theirs";
    } else if (state.baseSnapshot && state.baseSnapshot.sections) {
      baseData = state.baseSnapshot;
      baseVersionId = state.baseSnapshot.versionId;
      baseAvailable = true;
      relation = "has_base_from_ours";
    }

    if (baseAvailable) {
      if (state.versionId && collabData.parentVersionId &&
          state.versionId === collabData.parentVersionId) {
        relation = "theirs_forked_from_ours";
      } else if (collabData.versionId && state.parentVersionId &&
                 collabData.versionId === state.parentVersionId) {
        relation = "ours_forked_from_theirs";
      } else if (state.versionId && collabData.versionId &&
                 state.versionId === collabData.versionId) {
        relation = "same_version";
      }
    }
  } else {
    relation = "different_scheme";
  }

  mergeState.baseData = baseData;
  mergeState.baseRehearsalLog = baseData?.rehearsalLog || [];
  mergeState.baseInfo = {
    available: baseAvailable,
    sameScheme,
    relation,
    oursVersion: state.versionId,
    theirsVersion: collabData.versionId,
    baseVersion: baseVersionId,
    oursExportedAt: state.baseSnapshot?.snapshotAt || null,
    theirsExportedAt: collabData.exportedAt || null
  };
}

function computeAllDiffs() {
  if (!mergeState || !mergeState.collabData) return;

  const ourSections = state.sections || [];
  const theirSections = mergeState.collabData.sections || [];

  mergeState.diffs.sections = compareSectionLists(ourSections, theirSections);
  mergeState.diffs.grid = {};
  mergeState.diffs.bpm = {};
  mergeState.diffs.voices = {};
  mergeState.diffs.notes = {};

  const ourSectionMap = new Map(ourSections.map(s => [s.id, s]));
  const theirSectionMap = new Map(theirSections.map(s => [s.id, s]));

  const allSectionIds = new Set([...ourSectionMap.keys(), ...theirSectionMap.keys()]);

  allSectionIds.forEach(sectionId => {
    const ours = ourSectionMap.get(sectionId);
    const theirs = theirSectionMap.get(sectionId);

    if (ours && theirs) {
      mergeState.diffs.grid[sectionId] = compareGrid(ours, theirs);
      mergeState.diffs.bpm[sectionId] = compareBPM(ours, theirs);
      mergeState.diffs.voices[sectionId] = compareVoices(ours, theirs);
      mergeState.diffs.notes[sectionId] = compareNotes(ours, theirs);
    }
  });

  mergeState.diffs.practice = comparePracticeLogs();
  detectConflicts();
}

function compareSectionLists(ours, theirs) {
  const ourIds = new Set(ours.map(s => s.id));
  const theirIds = new Set(theirs.map(s => s.id));
  const result = [];

  ours.forEach(s => {
    if (theirIds.has(s.id)) {
      result.push({ id: s.id, name: s.name, type: "same" });
    } else {
      result.push({ id: s.id, name: s.name, type: "del" });
    }
  });

  theirs.forEach(s => {
    if (!ourIds.has(s.id)) {
      result.push({ id: s.id, name: s.name, type: "add" });
    }
  });

  return result;
}

function compareGrid(ours, theirs) {
  const ourPattern = ours.pattern || [];
  const theirPattern = theirs.pattern || [];
  const rows = Math.max(ourPattern.length, theirPattern.length, 4);
  const cols = Math.max(
    ourPattern[0]?.length || 0,
    theirPattern[0]?.length || 0,
    getSectionSteps(ours),
    getSectionSteps(theirs)
  );

  const diffs = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ourVal = ourPattern[row]?.[col] || "";
      const theirVal = theirPattern[row]?.[col] || "";

      if (ourVal !== theirVal) {
        let type;
        if (!ourVal && theirVal) type = "add";
        else if (ourVal && !theirVal) type = "del";
        else type = "mod";

        diffs.push({
          row,
          col,
          ours: ourVal,
          theirs: theirVal,
          type
        });
      }
    }
  }

  return diffs;
}

function compareBPM(ours, theirs) {
  const fields = ["bpm", "name", "measureCount", "beatsPerMeasure", "loop"];
  const diffs = [];

  fields.forEach(field => {
    const ourVal = ours[field];
    const theirVal = theirs[field];

    if (ourVal !== theirVal) {
      diffs.push({
        field,
        ours: ourVal,
        theirs: theirVal,
        type: "mod"
      });
    }
  });

  return diffs;
}

function compareVoices(ours, theirs) {
  const ourVoices = ours.enabledInstruments || [true, true, true, true];
  const theirVoices = theirs.enabledInstruments || [true, true, true, true];
  const diffs = [];

  for (let i = 0; i < 4; i++) {
    if (ourVoices[i] !== theirVoices[i]) {
      diffs.push({
        index: i,
        name: instruments[i]?.name || `声部${i + 1}`,
        ours: ourVoices[i],
        theirs: theirVoices[i],
        type: "mod"
      });
    }
  }

  return diffs;
}

function compareNotes(ours, theirs) {
  const ourNotes = ours.collabNotes || [];
  const theirNotes = theirs.collabNotes || [];
  const diffs = [];

  const ourMap = new Map(ourNotes.map(n => [n.id, n]));
  const theirMap = new Map(theirNotes.map(n => [n.id, n]));

  const allIds = new Set([...ourMap.keys(), ...theirMap.keys()]);

  allIds.forEach(id => {
    const oursNote = ourMap.get(id);
    const theirsNote = theirMap.get(id);

    if (oursNote && theirsNote) {
      const hasDiff = oursNote.text !== theirsNote.text ||
        oursNote.type !== theirsNote.type ||
        oursNote.done !== theirsNote.done;
      if (hasDiff) {
        diffs.push({ id, type: "mod", ours: oursNote, theirs: theirsNote });
      } else {
        diffs.push({ id, type: "same", ours: oursNote, theirs: theirsNote });
      }
    } else if (theirsNote) {
      diffs.push({ id, type: "add", theirs: theirsNote });
    } else {
      diffs.push({ id, type: "del", ours: oursNote });
    }
  });

  return diffs;
}

function comparePracticeLogs() {
  const ourLog = rehearsalLog || [];
  const theirLog = mergeState.collabRehearsalLog || [];
  const diffs = [];

  const ourMap = new Map(ourLog.map(r => [r.id, r]));
  const theirMap = new Map(theirLog.map(r => [r.id, r]));

  const allIds = new Set([...ourMap.keys(), ...theirMap.keys()]);

  allIds.forEach(id => {
    const ours = ourMap.get(id);
    const theirs = theirMap.get(id);

    if (ours && theirs) {
      diffs.push({ id, type: "same", ours, theirs });
    } else if (theirs) {
      diffs.push({ id, type: "add", theirs });
    } else {
      diffs.push({ id, type: "del", ours });
    }
  });

  return diffs;
}

function computeThreeWayDiffs() {
  if (!mergeState || !mergeState.collabData) return;

  const baseAvailable = mergeState.baseInfo.available && mergeState.baseData;

  if (!baseAvailable) {
    mergeState.threeWayDiffs = null;
    return;
  }

  const baseSections = mergeState.baseData.sections || [];
  const ourSections = state.sections || [];
  const theirSections = mergeState.collabData.sections || [];

  mergeState.threeWayDiffs = {
    sections: compareSectionListsThreeWay(baseSections, ourSections, theirSections),
    grid: {},
    bpm: {},
    voices: {},
    notes: {},
    practice: comparePracticeLogsThreeWay()
  };

  const baseSectionMap = new Map(baseSections.map(s => [s.id, s]));
  const ourSectionMap = new Map(ourSections.map(s => [s.id, s]));
  const theirSectionMap = new Map(theirSections.map(s => [s.id, s]));

  const allSectionIds = new Set([
    ...baseSectionMap.keys(),
    ...ourSectionMap.keys(),
    ...theirSectionMap.keys()
  ]);

  allSectionIds.forEach(sectionId => {
    const base = baseSectionMap.get(sectionId);
    const ours = ourSectionMap.get(sectionId);
    const theirs = theirSectionMap.get(sectionId);

    if (base && ours && theirs) {
      mergeState.threeWayDiffs.grid[sectionId] = compareGridThreeWay(base, ours, theirs);
      mergeState.threeWayDiffs.bpm[sectionId] = compareBPMThreeWay(base, ours, theirs);
      mergeState.threeWayDiffs.voices[sectionId] = compareVoicesThreeWay(base, ours, theirs);
      mergeState.threeWayDiffs.notes[sectionId] = compareNotesThreeWay(base, ours, theirs);
    }
  });
}

function classifyThreeWay(baseVal, ourVal, theirVal) {
  const baseEqOur = baseVal === ourVal;
  const baseEqTheirs = baseVal === theirVal;
  const ourEqTheirs = ourVal === theirVal;

  if (baseEqOur && baseEqTheirs) {
    return "same";
  } else if (!baseEqOur && baseEqTheirs) {
    return "ours_only";
  } else if (baseEqOur && !baseEqTheirs) {
    return "theirs_only";
  } else if (!baseEqOur && !baseEqTheirs && ourEqTheirs) {
    return "both_same";
  } else {
    return "conflict";
  }
}

function compareSectionListsThreeWay(base, ours, theirs) {
  const baseIds = new Set(base.map(s => s.id));
  const ourIds = new Set(ours.map(s => s.id));
  const theirIds = new Set(theirs.map(s => s.id));
  const allIds = new Set([...baseIds, ...ourIds, ...theirIds]);
  const result = [];

  allIds.forEach(id => {
    const baseSec = base.find(s => s.id === id);
    const ourSec = ours.find(s => s.id === id);
    const theirSec = theirs.find(s => s.id === id);
    const name = (ourSec || theirSec || baseSec)?.name || "未知段落";

    let type;
    if (baseSec && ourSec && theirSec) {
      type = "exists";
    } else if (!baseSec && ourSec && theirSec) {
      type = "both_added_same";
    } else if (!baseSec && ourSec && !theirSec) {
      type = "ours_added";
    } else if (!baseSec && !ourSec && theirSec) {
      type = "theirs_added";
    } else if (baseSec && ourSec && !theirSec) {
      type = "theirs_deleted";
    } else if (baseSec && !ourSec && theirSec) {
      type = "ours_deleted";
    } else {
      type = "both_deleted";
    }

    result.push({
      id,
      name,
      type,
      base: baseSec,
      ours: ourSec,
      theirs: theirSec
    });
  });

  return result;
}

function compareGridThreeWay(base, ours, theirs) {
  const basePattern = base.pattern || [];
  const ourPattern = ours.pattern || [];
  const theirPattern = theirs.pattern || [];

  const rows = Math.max(
    basePattern.length, ourPattern.length, theirPattern.length, 4
  );
  const cols = Math.max(
    getSectionSteps(base),
    getSectionSteps(ours),
    getSectionSteps(theirs)
  );

  const diffs = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const baseVal = basePattern[row]?.[col] || "";
      const ourVal = ourPattern[row]?.[col] || "";
      const theirVal = theirPattern[row]?.[col] || "";

      const type = classifyThreeWay(baseVal, ourVal, theirVal);

      if (type !== "same") {
        diffs.push({
          row,
          col,
          base: baseVal,
          ours: ourVal,
          theirs: theirVal,
          type
        });
      }
    }
  }

  return diffs;
}

function compareBPMThreeWay(base, ours, theirs) {
  const fields = ["bpm", "name", "measureCount", "beatsPerMeasure", "loop"];
  const diffs = [];

  fields.forEach(field => {
    const baseVal = base[field];
    const ourVal = ours[field];
    const theirVal = theirs[field];

    const type = classifyThreeWay(baseVal, ourVal, theirVal);

    if (type !== "same") {
      diffs.push({
        field,
        base: baseVal,
        ours: ourVal,
        theirs: theirVal,
        type
      });
    }
  });

  return diffs;
}

function compareVoicesThreeWay(base, ours, theirs) {
  const baseVoices = base.enabledInstruments || [true, true, true, true];
  const ourVoices = ours.enabledInstruments || [true, true, true, true];
  const theirVoices = theirs.enabledInstruments || [true, true, true, true];
  const diffs = [];

  for (let i = 0; i < 4; i++) {
    const type = classifyThreeWay(baseVoices[i], ourVoices[i], theirVoices[i]);

    if (type !== "same") {
      diffs.push({
        index: i,
        name: instruments[i]?.name || `声部${i + 1}`,
        base: baseVoices[i],
        ours: ourVoices[i],
        theirs: theirVoices[i],
        type
      });
    }
  }

  return diffs;
}

function compareNotesThreeWay(base, ours, theirs) {
  const baseNotes = base.collabNotes || [];
  const ourNotes = ours.collabNotes || [];
  const theirNotes = theirs.collabNotes || [];

  const baseMap = new Map(baseNotes.map(n => [n.id, n]));
  const ourMap = new Map(ourNotes.map(n => [n.id, n]));
  const theirMap = new Map(theirNotes.map(n => [n.id, n]));

  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const diffs = [];

  allIds.forEach(id => {
    const baseNote = baseMap.get(id);
    const ourNote = ourMap.get(id);
    const theirNote = theirMap.get(id);

    let type;
    if (baseNote && ourNote && theirNote) {
      const ourChanged = baseNote.text !== ourNote.text ||
        baseNote.type !== ourNote.type ||
        baseNote.done !== ourNote.done;
      const theirChanged = baseNote.text !== theirNote.text ||
        baseNote.type !== theirNote.type ||
        baseNote.done !== theirNote.done;
      const ourEqTheirs = ourNote.text === theirNote.text &&
        ourNote.type === theirNote.type &&
        ourNote.done === theirNote.done;

      if (!ourChanged && !theirChanged) {
        type = "same";
      } else if (ourChanged && !theirChanged) {
        type = "ours_only";
      } else if (!ourChanged && theirChanged) {
        type = "theirs_only";
      } else if (ourChanged && theirChanged && ourEqTheirs) {
        type = "both_same";
      } else {
        type = "conflict";
      }
    } else if (!baseNote && ourNote && theirNote) {
      const ourEqTheirs = ourNote.text === theirNote.text &&
        ourNote.type === theirNote.type &&
        ourNote.done === theirNote.done;
      type = ourEqTheirs ? "both_added_same" : "both_added_diff";
    } else if (!baseNote && ourNote && !theirNote) {
      type = "ours_added";
    } else if (!baseNote && !ourNote && theirNote) {
      type = "theirs_added";
    } else if (baseNote && ourNote && !theirNote) {
      type = "theirs_deleted";
    } else if (baseNote && !ourNote && theirNote) {
      type = "ours_deleted";
    } else {
      type = "both_deleted";
    }

    diffs.push({
      id,
      type,
      base: baseNote,
      ours: ourNote,
      theirs: theirNote
    });
  });

  return diffs;
}

function comparePracticeLogsThreeWay() {
  const baseLog = mergeState.baseRehearsalLog || [];
  const ourLog = rehearsalLog || [];
  const theirLog = mergeState.collabRehearsalLog || [];

  const baseMap = new Map(baseLog.map(r => [r.id, r]));
  const ourMap = new Map(ourLog.map(r => [r.id, r]));
  const theirMap = new Map(theirLog.map(r => [r.id, r]));

  const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
  const diffs = [];

  allIds.forEach(id => {
    const baseEntry = baseMap.get(id);
    const ourEntry = ourMap.get(id);
    const theirEntry = theirMap.get(id);

    let type;
    if (baseEntry && ourEntry && theirEntry) {
      type = "same";
    } else if (!baseEntry && ourEntry && theirEntry) {
      type = "both_added";
    } else if (!baseEntry && ourEntry && !theirEntry) {
      type = "ours_added";
    } else if (!baseEntry && !ourEntry && theirEntry) {
      type = "theirs_added";
    } else if (baseEntry && ourEntry && !theirEntry) {
      type = "theirs_deleted";
    } else if (baseEntry && !ourEntry && theirEntry) {
      type = "ours_deleted";
    } else {
      type = "both_deleted";
    }

    diffs.push({
      id,
      type,
      base: baseEntry,
      ours: ourEntry,
      theirs: theirEntry
    });
  });

  return diffs;
}

function detectConflictsThreeWay() {
  mergeState.conflicts = [];
  mergeState.autoMergeable = [];

  const baseAvailable = mergeState.baseInfo.available && mergeState.threeWayDiffs;

  if (!baseAvailable) {
    detectConflicts();
    return;
  }

  const sectionDiffs = mergeState.threeWayDiffs.sections || [];
  sectionDiffs.forEach(s => {
    if (s.type === "ours_added") {
      mergeState.autoMergeable.push({
        id: `section_ours_added_${s.id}`,
        type: "section_ours_added",
        sectionId: s.id,
        sectionName: s.name,
        description: `当前版本新增段落「${s.name}」`,
        autoResolution: "keep_ours",
        ours: s.ours,
        theirs: null
      });
    } else if (s.type === "theirs_added") {
      mergeState.autoMergeable.push({
        id: `section_theirs_added_${s.id}`,
        type: "section_theirs_added",
        sectionId: s.id,
        sectionName: s.name,
        description: `协作版本新增段落「${s.name}」`,
        autoResolution: "accept_theirs",
        ours: null,
        theirs: s.theirs
      });
    } else if (s.type === "both_added_same") {
      mergeState.autoMergeable.push({
        id: `section_both_added_${s.id}`,
        type: "section_both_added_same",
        sectionId: s.id,
        sectionName: s.name,
        description: `双方都新增了相同段落「${s.name}」`,
        autoResolution: "keep_either",
        ours: s.ours,
        theirs: s.theirs
      });
    } else if (s.type === "ours_deleted") {
      mergeState.autoMergeable.push({
        id: `section_ours_deleted_${s.id}`,
        type: "section_ours_deleted",
        sectionId: s.id,
        sectionName: s.name,
        description: `当前版本删除了段落「${s.name}」`,
        autoResolution: "keep_ours_deleted",
        ours: null,
        theirs: s.theirs
      });
    } else if (s.type === "theirs_deleted") {
      mergeState.autoMergeable.push({
        id: `section_theirs_deleted_${s.id}`,
        type: "section_theirs_deleted",
        sectionId: s.id,
        sectionName: s.name,
        description: `协作版本删除了段落「${s.name}」`,
        autoResolution: "accept_theirs_deleted",
        ours: s.ours,
        theirs: null
      });
    }
  });

  const practiceDiffs = mergeState.threeWayDiffs.practice || [];
  practiceDiffs.forEach(p => {
    if (p.type === "theirs_added") {
      mergeState.autoMergeable.push({
        id: `practice_theirs_added_${p.id}`,
        type: "practice_theirs_added",
        practiceId: p.id,
        description: `协作版本新增练习记录（${p.theirs?.sectionName || "未知段落"}）`,
        autoResolution: "accept_theirs",
        ours: null,
        theirs: p.theirs
      });
    } else if (p.type === "ours_added") {
      mergeState.autoMergeable.push({
        id: `practice_ours_added_${p.id}`,
        type: "practice_ours_added",
        practiceId: p.id,
        description: `当前版本新增练习记录（${p.ours?.sectionName || "未知段落"}）`,
        autoResolution: "keep_ours",
        ours: p.ours,
        theirs: null
      });
    } else if (p.type === "both_added") {
      mergeState.autoMergeable.push({
        id: `practice_both_added_${p.id}`,
        type: "practice_both_added",
        practiceId: p.id,
        description: `双方都有练习记录（${p.ours?.sectionName || "未知段落"}）`,
        autoResolution: "keep_both",
        ours: p.ours,
        theirs: p.theirs
      });
    }
  });

  Object.keys(mergeState.threeWayDiffs.grid || {}).forEach(sectionId => {
    const gridDiffs = mergeState.threeWayDiffs.grid[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    const conflictDiffs = gridDiffs.filter(d => d.type === "conflict");
    const oursOnlyDiffs = gridDiffs.filter(d => d.type === "ours_only");
    const theirsOnlyDiffs = gridDiffs.filter(d => d.type === "theirs_only");
    const bothSameDiffs = gridDiffs.filter(d => d.type === "both_same");

    if (conflictDiffs.length > 0) {
      mergeState.conflicts.push({
        id: `grid_${sectionId}`,
        type: "grid",
        sectionId,
        sectionName,
        description: `谱面格子冲突（${conflictDiffs.length}处）`,
        gridDiffs: conflictDiffs,
        allGridDiffs: gridDiffs,
        autoResolve: null,
        threeWay: true
      });
    }

    if (theirsOnlyDiffs.length > 0 || oursOnlyDiffs.length > 0 || bothSameDiffs.length > 0) {
      mergeState.autoMergeable.push({
        id: `grid_auto_${sectionId}`,
        type: "grid_auto",
        sectionId,
        sectionName,
        description: `谱面格子自动合并（${theirsOnlyDiffs.length + oursOnlyDiffs.length + bothSameDiffs.length}处）`,
        oursOnlyCount: oursOnlyDiffs.length,
        theirsOnlyCount: theirsOnlyDiffs.length,
        bothSameCount: bothSameDiffs.length,
        autoResolution: "auto_merge",
        threeWay: true
      });
    }
  });

  Object.keys(mergeState.threeWayDiffs.bpm || {}).forEach(sectionId => {
    const bpmDiffs = mergeState.threeWayDiffs.bpm[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    bpmDiffs.forEach(diff => {
      if (diff.type === "conflict") {
        mergeState.conflicts.push({
          id: `bpm_${sectionId}_${diff.field}`,
          type: "bpm",
          sectionId,
          sectionName,
          field: diff.field,
          description: `${sectionName} - ${getBPMFieldLabel(diff.field)} 冲突`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolve: null,
          threeWay: true
        });
      } else if (diff.type === "theirs_only") {
        mergeState.autoMergeable.push({
          id: `bpm_theirs_${sectionId}_${diff.field}`,
          type: "bpm_theirs",
          sectionId,
          sectionName,
          field: diff.field,
          description: `${sectionName} - ${getBPMFieldLabel(diff.field)}（协作修改）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "accept_theirs",
          threeWay: true
        });
      } else if (diff.type === "ours_only") {
        mergeState.autoMergeable.push({
          id: `bpm_ours_${sectionId}_${diff.field}`,
          type: "bpm_ours",
          sectionId,
          sectionName,
          field: diff.field,
          description: `${sectionName} - ${getBPMFieldLabel(diff.field)}（当前修改）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "keep_ours",
          threeWay: true
        });
      } else if (diff.type === "both_same") {
        mergeState.autoMergeable.push({
          id: `bpm_both_${sectionId}_${diff.field}`,
          type: "bpm_both_same",
          sectionId,
          sectionName,
          field: diff.field,
          description: `${sectionName} - ${getBPMFieldLabel(diff.field)}（双方相同修改）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "keep_either",
          threeWay: true
        });
      }
    });
  });

  Object.keys(mergeState.threeWayDiffs.voices || {}).forEach(sectionId => {
    const voiceDiffs = mergeState.threeWayDiffs.voices[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    const conflictDiffs = voiceDiffs.filter(d => d.type === "conflict");
    const autoDiffs = voiceDiffs.filter(d => d.type !== "conflict" && d.type !== "same");

    if (conflictDiffs.length > 0) {
      mergeState.conflicts.push({
        id: `voices_${sectionId}`,
        type: "voices",
        sectionId,
        sectionName,
        voiceDiffs: conflictDiffs,
        allVoiceDiffs: voiceDiffs,
        description: `${sectionName} - 声部开关冲突（${conflictDiffs.length}处）`,
        autoResolve: null,
        threeWay: true
      });
    }

    if (autoDiffs.length > 0) {
      mergeState.autoMergeable.push({
        id: `voices_auto_${sectionId}`,
        type: "voices_auto",
        sectionId,
        sectionName,
        voiceDiffs: autoDiffs,
        description: `${sectionName} - 声部开关自动合并（${autoDiffs.length}处）`,
        autoResolution: "auto_merge",
        threeWay: true
      });
    }
  });

  Object.keys(mergeState.threeWayDiffs.notes || {}).forEach(sectionId => {
    const noteDiffs = mergeState.threeWayDiffs.notes[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    noteDiffs.forEach(diff => {
      if (diff.type === "conflict" || diff.type === "both_added_diff") {
        mergeState.conflicts.push({
          id: `note_${sectionId}_${diff.id}`,
          type: diff.type === "conflict" ? "note_mod" : "note_add_conflict",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注冲突`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolve: null,
          threeWay: true
        });
      } else if (diff.type === "theirs_only" || diff.type === "theirs_added") {
        mergeState.autoMergeable.push({
          id: `note_theirs_${sectionId}_${diff.id}`,
          type: "note_theirs",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注（协作新增/修改）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "accept_theirs",
          threeWay: true
        });
      } else if (diff.type === "ours_only" || diff.type === "ours_added") {
        mergeState.autoMergeable.push({
          id: `note_ours_${sectionId}_${diff.id}`,
          type: "note_ours",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注（当前新增/修改）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "keep_ours",
          threeWay: true
        });
      } else if (diff.type === "both_same" || diff.type === "both_added_same") {
        mergeState.autoMergeable.push({
          id: `note_both_${sectionId}_${diff.id}`,
          type: "note_both_same",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注（双方相同）`,
          base: diff.base,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolution: "keep_either",
          threeWay: true
        });
      } else if (diff.type === "ours_deleted") {
        mergeState.autoMergeable.push({
          id: `note_ours_del_${sectionId}_${diff.id}`,
          type: "note_ours_deleted",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注删除（当前版本）`,
          base: diff.base,
          ours: null,
          theirs: diff.theirs,
          autoResolution: "keep_ours_deleted",
          threeWay: true
        });
      } else if (diff.type === "theirs_deleted") {
        mergeState.autoMergeable.push({
          id: `note_theirs_del_${sectionId}_${diff.id}`,
          type: "note_theirs_deleted",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注删除（协作版本）`,
          base: diff.base,
          ours: diff.ours,
          theirs: null,
          autoResolution: "accept_theirs_deleted",
          threeWay: true
        });
      }
    });
  });
}

function detectConflicts() {
  mergeState.conflicts = [];

  const sectionDiffs = mergeState.diffs.sections || [];
  sectionDiffs.forEach(s => {
    if (s.type === "add") {
      mergeState.conflicts.push({
        id: `section_add_${s.id}`,
        type: "section_add",
        sectionId: s.id,
        sectionName: s.name,
        description: `新增段落「${s.name}」`,
        ours: null,
        theirs: s,
        autoResolve: "accept"
      });
    } else if (s.type === "del") {
      mergeState.conflicts.push({
        id: `section_del_${s.id}`,
        type: "section_del",
        sectionId: s.id,
        sectionName: s.name,
        description: `删除段落「${s.name}」`,
        ours: s,
        theirs: null,
        autoResolve: "reject"
      });
    }
  });

  const practiceDiffs = mergeState.diffs.practice || [];
  practiceDiffs.forEach(p => {
    if (p.type === "add") {
      mergeState.conflicts.push({
        id: `practice_add_${p.id}`,
        type: "practice_add",
        practiceId: p.id,
        description: `新增练习记录（${p.theirs?.sectionName || "未知段落"}）`,
        ours: null,
        theirs: p.theirs,
        autoResolve: "accept"
      });
    }
  });

  Object.keys(mergeState.diffs.grid || {}).forEach(sectionId => {
    const gridDiffs = mergeState.diffs.grid[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    if (gridDiffs.length > 0) {
      const hasMod = gridDiffs.some(d => d.type === "mod");
      if (hasMod) {
        mergeState.conflicts.push({
          id: `grid_${sectionId}`,
          type: "grid",
          sectionId,
          sectionName,
          description: `谱面格子改动（${gridDiffs.length}处）`,
          gridDiffs,
          autoResolve: null
        });
      }
    }
  });

  Object.keys(mergeState.diffs.bpm || {}).forEach(sectionId => {
    const bpmDiffs = mergeState.diffs.bpm[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    bpmDiffs.forEach(diff => {
      mergeState.conflicts.push({
        id: `bpm_${sectionId}_${diff.field}`,
        type: "bpm",
        sectionId,
        sectionName,
        field: diff.field,
        description: `${sectionName} - ${getBPMFieldLabel(diff.field)}`,
        ours: diff.ours,
        theirs: diff.theirs,
        autoResolve: null
      });
    });
  });

  Object.keys(mergeState.diffs.voices || {}).forEach(sectionId => {
    const voiceDiffs = mergeState.diffs.voices[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    if (voiceDiffs.length > 0) {
      mergeState.conflicts.push({
        id: `voices_${sectionId}`,
        type: "voices",
        sectionId,
        sectionName,
        voiceDiffs,
        description: `${sectionName} - 声部开关`,
        autoResolve: null
      });
    }
  });

  Object.keys(mergeState.diffs.notes || {}).forEach(sectionId => {
    const noteDiffs = mergeState.diffs.notes[sectionId] || [];
    const section = state.sections.find(s => s.id === sectionId) ||
      mergeState.collabData.sections.find(s => s.id === sectionId);
    const sectionName = section?.name || "未知段落";

    noteDiffs.forEach(diff => {
      if (diff.type === "mod") {
        mergeState.conflicts.push({
          id: `note_${sectionId}_${diff.id}`,
          type: "note_mod",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 批注改动`,
          ours: diff.ours,
          theirs: diff.theirs,
          autoResolve: null
        });
      } else if (diff.type === "add") {
        mergeState.conflicts.push({
          id: `note_add_${sectionId}_${diff.id}`,
          type: "note_add",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 新增批注`,
          ours: null,
          theirs: diff.theirs,
          autoResolve: "accept"
        });
      } else if (diff.type === "del") {
        mergeState.conflicts.push({
          id: `note_del_${sectionId}_${diff.id}`,
          type: "note_del",
          sectionId,
          sectionName,
          noteId: diff.id,
          description: `${sectionName} - 删除批注`,
          ours: diff.ours,
          theirs: null,
          autoResolve: "reject"
        });
      }
    });
  });
}

function getBPMFieldLabel(field) {
  const labels = {
    bpm: "BPM 速度",
    name: "段落名称",
    measureCount: "小节数",
    beatsPerMeasure: "每小节拍数",
    loop: "循环标签"
  };
  return labels[field] || field;
}

function autoMerge() {
  if (!mergeState || !mergeState.collabData) return;

  const ourSections = deepCloneSections(state.sections);
  const theirSections = deepCloneSections(mergeState.collabData.sections);
  const ourSectionMap = new Map(ourSections.map(s => [s.id, s]));
  const theirSectionMap = new Map(theirSections.map(s => [s.id, s]));

  const allSectionIds = new Set([...ourSectionMap.keys(), ...theirSectionMap.keys()]);

  const mergedSections = [];

  allSectionIds.forEach(sectionId => {
    const ours = ourSectionMap.get(sectionId);
    const theirs = theirSectionMap.get(sectionId);

    if (ours && theirs) {
      const merged = deepCloneSection(ours);

      const gridDiffs = mergeState.diffs.grid[sectionId] || [];
      gridDiffs.forEach(diff => {
        const conflictId = `grid_${sectionId}`;
        const resolution = mergeState.resolvedConflicts[conflictId];

        if (resolution === "theirs" || (!resolution && diff.type !== "mod")) {
          if (!merged.pattern) merged.pattern = [];
          if (!merged.pattern[diff.row]) merged.pattern[diff.row] = [];
          merged.pattern[diff.row][diff.col] = diff.theirs;
        }
      });

      const bpmDiffs = mergeState.diffs.bpm[sectionId] || [];
      bpmDiffs.forEach(diff => {
        const conflictId = `bpm_${sectionId}_${diff.field}`;
        const resolution = mergeState.resolvedConflicts[conflictId];

        if (resolution === "theirs") {
          merged[diff.field] = diff.theirs;
        }
      });

      const voiceConflictId = `voices_${sectionId}`;
      const voiceResolution = mergeState.resolvedConflicts[voiceConflictId];
      if (voiceResolution === "theirs") {
        merged.enabledInstruments = [...theirs.enabledInstruments];
      }

      const noteDiffs = mergeState.diffs.notes[sectionId] || [];
      const mergedNotes = [];
      const ourNoteMap = new Map((ours.collabNotes || []).map(n => [n.id, n]));
      const theirNoteMap = new Map((theirs.collabNotes || []).map(n => [n.id, n]));

      const allNoteIds = new Set([...ourNoteMap.keys(), ...theirNoteMap.keys()]);
      allNoteIds.forEach(noteId => {
        const ourNote = ourNoteMap.get(noteId);
        const theirNote = theirNoteMap.get(noteId);

        if (ourNote && theirNote) {
          const conflictId = `note_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution === "theirs") {
            mergedNotes.push({ ...theirNote });
          } else {
            mergedNotes.push({ ...ourNote });
          }
        } else if (theirNote) {
          const conflictId = `note_add_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution !== "reject") {
            mergedNotes.push({ ...theirNote });
          }
        } else if (ourNote) {
          const conflictId = `note_del_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution !== "accept") {
            mergedNotes.push({ ...ourNote });
          }
        }
      });
      merged.collabNotes = mergedNotes;

      mergedSections.push(merged);
    } else if (theirs) {
      const conflictId = `section_add_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "reject") {
        mergedSections.push(deepCloneSection(theirs));
      }
    } else if (ours) {
      const conflictId = `section_del_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "accept") {
        mergedSections.push(deepCloneSection(ours));
      }
    }
  });

  const sectionDiffList = mergeState.diffs.sections || [];
  const orderedIds = [];
  sectionDiffList.forEach(s => {
    if (!orderedIds.includes(s.id)) orderedIds.push(s.id);
  });
  theirSections.forEach(s => {
    if (!orderedIds.includes(s.id)) orderedIds.push(s.id);
  });

  const orderedMergedSections = orderedIds
    .map(id => mergedSections.find(s => s.id === id))
    .filter(Boolean);

  const mergedRehearsalLog = [...rehearsalLog];
  const practiceDiffs = mergeState.diffs.practice || [];
  practiceDiffs.forEach(p => {
    if (p.type === "add") {
      const conflictId = `practice_add_${p.id}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "reject") {
        if (!mergedRehearsalLog.find(r => r.id === p.id)) {
          mergedRehearsalLog.push({ ...p.theirs });
        }
      }
    }
  });

  mergedRehearsalLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const mergedBaseSnapshot = deepCloneBaseSnapshot(mergeState.baseData)
    || deepCloneBaseSnapshot(state.baseSnapshot)
    || deepCloneBaseSnapshot(mergeState.collabData.baseSnapshot);

  mergeState.mergedData = {
    ...state,
    pieceName: mergeState.collabData.pieceName || state.pieceName,
    sections: orderedMergedSections,
    continuousPlay: state.continuousPlay,
    currentSectionId: state.currentSectionId || orderedMergedSections[0]?.id,
    saved: state.saved,
    schemeId: state.schemeId,
    versionId: crypto.randomUUID(),
    parentVersionId: state.versionId,
    baseSnapshot: mergedBaseSnapshot
  };
  mergeState.mergedRehearsalLog = mergedRehearsalLog;
  mergeState.autoMerged = true;

  updateMergeStats();
}

function applyAutoMerge() {
  if (!mergeState || !mergeState.collabData) return;

  const baseAvailable = mergeState.baseInfo.available && mergeState.threeWayDiffs;

  if (baseAvailable) {
    applyAutoMergeThreeWay();
  } else {
    mergeState.conflicts.forEach(conflict => {
      if (conflict.autoResolve && !mergeState.resolvedConflicts[conflict.id]) {
        if (conflict.autoResolve === "accept") {
          mergeState.resolvedConflicts[conflict.id] = "theirs";
        } else if (conflict.autoResolve === "reject") {
          mergeState.resolvedConflicts[conflict.id] = "ours";
        }
      }
    });

    autoMerge();
    renderMergeConflicts();
  }
}

function applyAutoMergeThreeWay() {
  if (!mergeState || !mergeState.autoMergeable) return;

  mergeState.autoMergeable.forEach(item => {
    if (!mergeState.resolvedConflicts[item.id]) {
      let resolution;
      switch (item.autoResolution) {
        case "keep_ours":
        case "keep_ours_deleted":
          resolution = "ours";
          break;
        case "accept_theirs":
        case "accept_theirs_deleted":
          resolution = "theirs";
          break;
        case "keep_either":
        case "keep_both":
        case "auto_merge":
          resolution = "auto";
          break;
        default:
          resolution = "theirs";
      }
      mergeState.resolvedConflicts[item.id] = resolution;
    }
  });

  autoMergeThreeWay();
  renderMergeConflicts();
}

function autoMergeThreeWay() {
  if (!mergeState || !mergeState.collabData || !mergeState.threeWayDiffs) return;

  const ourSections = deepCloneSections(state.sections);
  const theirSections = deepCloneSections(mergeState.collabData.sections);
  const ourSectionMap = new Map(ourSections.map(s => [s.id, s]));
  const theirSectionMap = new Map(theirSections.map(s => [s.id, s]));

  const sectionDiffs = mergeState.threeWayDiffs.sections || [];
  const mergedSections = [];

  sectionDiffs.forEach(s => {
    const sectionId = s.id;
    const ours = ourSectionMap.get(sectionId);
    const theirs = theirSectionMap.get(sectionId);

    if (s.type === "exists") {
      const merged = deepCloneSection(ours);

      const gridDiffs = mergeState.threeWayDiffs.grid[sectionId] || [];
      const gridConflictId = `grid_${sectionId}`;
      const gridResolution = mergeState.resolvedConflicts[gridConflictId];

      gridDiffs.forEach(diff => {
        if (!merged.pattern) merged.pattern = [];
        if (!merged.pattern[diff.row]) merged.pattern[diff.row] = [];

        if (diff.type === "ours_only") {
          merged.pattern[diff.row][diff.col] = diff.ours;
        } else if (diff.type === "theirs_only") {
          merged.pattern[diff.row][diff.col] = diff.theirs;
        } else if (diff.type === "both_same") {
          merged.pattern[diff.row][diff.col] = diff.ours;
        } else if (diff.type === "conflict") {
          if (gridResolution === "theirs") {
            merged.pattern[diff.row][diff.col] = diff.theirs;
          } else {
            merged.pattern[diff.row][diff.col] = diff.ours;
          }
        }
      });

      const bpmDiffs = mergeState.threeWayDiffs.bpm[sectionId] || [];
      bpmDiffs.forEach(diff => {
        const conflictId = `bpm_${sectionId}_${diff.field}`;
        const resolution = mergeState.resolvedConflicts[conflictId];

        if (diff.type === "ours_only") {
          merged[diff.field] = diff.ours;
        } else if (diff.type === "theirs_only") {
          merged[diff.field] = diff.theirs;
        } else if (diff.type === "both_same") {
          merged[diff.field] = diff.ours;
        } else if (diff.type === "conflict") {
          if (resolution === "theirs") {
            merged[diff.field] = diff.theirs;
          } else {
            merged[diff.field] = diff.ours;
          }
        }
      });

      const voiceConflictId = `voices_${sectionId}`;
      const voiceResolution = mergeState.resolvedConflicts[voiceConflictId];
      const voiceDiffs = mergeState.threeWayDiffs.voices[sectionId] || [];

      if (voiceDiffs.length > 0) {
        const mergedVoices = [...ours.enabledInstruments];
        voiceDiffs.forEach(diff => {
          if (diff.type === "ours_only") {
            mergedVoices[diff.index] = diff.ours;
          } else if (diff.type === "theirs_only") {
            mergedVoices[diff.index] = diff.theirs;
          } else if (diff.type === "both_same") {
            mergedVoices[diff.index] = diff.ours;
          } else if (diff.type === "conflict") {
            if (voiceResolution === "theirs") {
              mergedVoices[diff.index] = diff.theirs;
            } else {
              mergedVoices[diff.index] = diff.ours;
            }
          }
        });
        merged.enabledInstruments = mergedVoices;
      }

      const noteDiffs = mergeState.threeWayDiffs.notes[sectionId] || [];
      const mergedNotes = [];

      noteDiffs.forEach(diff => {
        const noteId = diff.id;

        if (diff.type === "same" || diff.type === "both_same" || diff.type === "both_added_same") {
          if (diff.ours) {
            mergedNotes.push({ ...diff.ours });
          }
        } else if (diff.type === "ours_only" || diff.type === "ours_added") {
          if (diff.ours) {
            mergedNotes.push({ ...diff.ours });
          }
        } else if (diff.type === "theirs_only" || diff.type === "theirs_added") {
          if (diff.theirs) {
            mergedNotes.push({ ...diff.theirs });
          }
        } else if (diff.type === "conflict" || diff.type === "both_added_diff") {
          const conflictId = `note_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution === "theirs" && diff.theirs) {
            mergedNotes.push({ ...diff.theirs });
          } else if (diff.ours) {
            mergedNotes.push({ ...diff.ours });
          }
        } else if (diff.type === "ours_deleted") {
          const conflictId = `note_ours_del_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution === "ours" || resolution === "keep_ours_deleted") {
          } else if (diff.theirs) {
            mergedNotes.push({ ...diff.theirs });
          }
        } else if (diff.type === "theirs_deleted") {
          const conflictId = `note_theirs_del_${sectionId}_${noteId}`;
          const resolution = mergeState.resolvedConflicts[conflictId];
          if (resolution === "theirs" || resolution === "accept_theirs_deleted") {
          } else if (diff.ours) {
            mergedNotes.push({ ...diff.ours });
          }
        }
      });

      merged.collabNotes = mergedNotes;

      mergedSections.push(merged);
    } else if (s.type === "theirs_added") {
      const conflictId = `section_theirs_added_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "ours" && theirs) {
        mergedSections.push(deepCloneSection(theirs));
      }
    } else if (s.type === "ours_added") {
      const conflictId = `section_ours_added_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "theirs" && ours) {
        mergedSections.push(deepCloneSection(ours));
      }
    } else if (s.type === "both_added_same") {
      if (ours) {
        mergedSections.push(deepCloneSection(ours));
      }
    } else if (s.type === "ours_deleted") {
      const conflictId = `section_ours_deleted_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution === "theirs" && theirs) {
        mergedSections.push(deepCloneSection(theirs));
      }
    } else if (s.type === "theirs_deleted") {
      const conflictId = `section_theirs_deleted_${sectionId}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution === "ours" && ours) {
        mergedSections.push(deepCloneSection(ours));
      }
    }
  });

  const practiceDiffs = mergeState.threeWayDiffs.practice || [];
  const mergedRehearsalLog = [];
  const addedIds = new Set();

  practiceDiffs.forEach(p => {
    if (p.type === "same" || p.type === "both_added") {
      if (p.ours && !addedIds.has(p.id)) {
        mergedRehearsalLog.push({ ...p.ours });
        addedIds.add(p.id);
      }
      if (p.theirs && !addedIds.has(p.id)) {
        mergedRehearsalLog.push({ ...p.theirs });
        addedIds.add(p.id);
      }
    } else if (p.type === "ours_added") {
      if (p.ours && !addedIds.has(p.id)) {
        mergedRehearsalLog.push({ ...p.ours });
        addedIds.add(p.id);
      }
    } else if (p.type === "theirs_added") {
      const conflictId = `practice_theirs_added_${p.id}`;
      const resolution = mergeState.resolvedConflicts[conflictId];
      if (resolution !== "ours" && p.theirs && !addedIds.has(p.id)) {
        mergedRehearsalLog.push({ ...p.theirs });
        addedIds.add(p.id);
      }
    }
  });

  mergedRehearsalLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const ourPieceName = state.pieceName;
  const theirPieceName = mergeState.collabData.pieceName;
  const basePieceName = mergeState.baseData?.pieceName || ourPieceName;

  let mergedPieceName = ourPieceName;
  if (ourPieceName === basePieceName && theirPieceName !== basePieceName) {
    mergedPieceName = theirPieceName;
  }

  const mergedBaseSnapshot = deepCloneBaseSnapshot(mergeState.baseData)
    || deepCloneBaseSnapshot(state.baseSnapshot)
    || deepCloneBaseSnapshot(mergeState.collabData.baseSnapshot);

  mergeState.mergedData = {
    ...state,
    pieceName: mergedPieceName,
    sections: mergedSections,
    continuousPlay: state.continuousPlay,
    currentSectionId: state.currentSectionId || mergedSections[0]?.id,
    saved: state.saved,
    schemeId: state.schemeId,
    versionId: crypto.randomUUID(),
    parentVersionId: state.versionId,
    baseSnapshot: mergedBaseSnapshot
  };
  mergeState.mergedRehearsalLog = mergedRehearsalLog;
  mergeState.autoMerged = true;

  updateMergeStats();
}

function resolveConflict(conflictId, resolution) {
  mergeState.resolvedConflicts[conflictId] = resolution;

  const baseAvailable = mergeState.baseInfo.available && mergeState.threeWayDiffs;
  if (baseAvailable) {
    autoMergeThreeWay();
  } else {
    autoMerge();
  }

  renderMergeConflicts();
  updateMergeStats();
}

function enterMergePreview() {
  if (!mergeState || !mergeState.mergedData) return;

  originalStateBackup = JSON.parse(JSON.stringify(state));
  originalRehearsalLogBackup = JSON.parse(JSON.stringify(rehearsalLog));

  state.pieceName = mergeState.mergedData.pieceName;
  state.sections = deepCloneSections(mergeState.mergedData.sections);
  state.currentSectionId = mergeState.mergedData.currentSectionId;
  state.continuousPlay = mergeState.mergedData.continuousPlay;

  rehearsalLog = [...mergeState.mergedRehearsalLog];

  mergePreviewActive = true;
  mergePreviewBar.style.display = "flex";

  render();
}

function exitMergePreview() {
  if (!originalStateBackup) return;

  state.pieceName = originalStateBackup.pieceName;
  state.sections = deepCloneSections(originalStateBackup.sections);
  state.currentSectionId = originalStateBackup.currentSectionId;
  state.continuousPlay = originalStateBackup.continuousPlay;

  rehearsalLog = [...originalRehearsalLogBackup];

  mergePreviewActive = false;
  mergePreviewBar.style.display = "none";

  render();
}

function applyMergeResult() {
  if (!mergeState || !mergeState.mergedData) return;

  const conflictCount = mergeState.conflicts.length;
  const resolvedCount = Object.keys(mergeState.resolvedConflicts).length;
  if (conflictCount > 0 && resolvedCount < conflictCount) {
    alert("请先处理所有冲突项后再应用合并。");
    return;
  }

  if (mergePreviewActive) {
    exitMergePreview();
  }

  state.pieceName = mergeState.mergedData.pieceName;
  state.sections = deepCloneSections(mergeState.mergedData.sections);
  state.currentSectionId = mergeState.mergedData.currentSectionId;
  state.continuousPlay = mergeState.mergedData.continuousPlay;
  state.schemeId = mergeState.mergedData.schemeId || state.schemeId;
  state.versionId = mergeState.mergedData.versionId || state.versionId;
  state.parentVersionId = mergeState.mergedData.parentVersionId || state.parentVersionId;
  state.baseSnapshot = deepCloneBaseSnapshot(mergeState.mergedData.baseSnapshot);

  rehearsalLog = [...mergeState.mergedRehearsalLog];
  saveRehearsalLog();
  save();
  render();
  closeMergeModal();
  alert("合并成功！协作版本的改动已应用到当前方案。");
}

function exportMergeResult() {
  if (!mergeState || !mergeState.mergedData) return;

  try {
    const exportData = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      schemeId: mergeState.mergedData.schemeId || state.schemeId,
      versionId: mergeState.mergedData.versionId || crypto.randomUUID(),
      parentVersionId: mergeState.mergedData.parentVersionId || state.versionId || null,
      pieceName: mergeState.mergedData.pieceName,
      sections: deepCloneSections(mergeState.mergedData.sections),
      currentSectionId: mergeState.mergedData.currentSectionId,
      continuousPlay: mergeState.mergedData.continuousPlay,
      saved: deepCloneSavedList(mergeState.mergedData.saved || []),
      rehearsalLog: mergeState.mergedRehearsalLog,
      baseSnapshot: deepCloneBaseSnapshot(mergeState.mergedData.baseSnapshot),
      appInfo: {
        name: "传统戏曲锣鼓经排练可视化",
        version: "1.0.0",
        feature: "3-way-merge",
        note: "协作合并结果"
      }
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (mergeState.mergedData.pieceName || "合并方案").replace(/[<>:"/\\|?*]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${safeName}_合并_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("导出失败：" + error.message);
  }
}

function renderAllMergeTabs() {
  renderMergeOverview();
  renderMergeGridSelects();
  renderMergeGrid();
  renderMergeSections();
  renderMergeVoiceSelects();
  renderMergeVoices();
  renderMergeNoteSelects();
  renderMergeNotes();
  renderMergePractice();
  renderMergeConflicts();
}

function renderMergeOverview() {
  if (!mergeState || !mergeState.collabData) {
    mergeSectionListEl.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">📁</div>
        <p style="margin: 0 0 8px; font-weight: 600;">请选择协作版本文件</p>
        <p style="margin: 0; font-size: 12px;">点击顶部「协作合并导入」按钮选择对方导出的 JSON 文件</p>
      </div>
    `;
    return;
  }

  const baseAvailable = mergeState.baseInfo.available && mergeState.threeWayDiffs;
  const info = mergeState.baseInfo;

  let versionInfoHtml = "";

  if (baseAvailable) {
    const relationLabels = {
      "theirs_forked_from_ours": "协作版本基于当前版本修改",
      "ours_forked_from_theirs": "当前版本基于协作版本修改",
      "has_base_from_theirs": "检测到共同基线（来自协作文件）",
      "has_base_from_ours": "检测到共同基线（来自当前版本）",
      "same_version": "同一版本"
    };

    const relationLabel = relationLabels[info.relation] || "检测到共同基线";
    const theirsDate = info.theirsExportedAt ? new Date(info.theirsExportedAt).toLocaleString("zh-CN") : "未知";

    versionInfoHtml = `
      <div style="margin-bottom: 16px; padding: 14px 16px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; border-radius: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">🔗</span>
          <strong style="color: #166534; font-size: 14px;">基线合并模式</strong>
          <span class="merge-badge" style="background: #bbf7d0; color: #166534; border-color: #86efac;">3-way</span>
        </div>
        <p style="margin: 0 0 6px; font-size: 12px; color: #15803d;">
          ${relationLabel}，可智能区分各自修改，大幅减少冲突
        </p>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; color: #166534;">
          <div>
            <span style="font-weight: 600;">协作版本导出时间：</span>
            <span>${theirsDate}</span>
          </div>
          <div>
            <span style="font-weight: 600;">自动合并项：</span>
            <span>${mergeState.autoMergeable?.length || 0} 项</span>
          </div>
        </div>
      </div>
    `;
  } else if (info.sameScheme) {
    versionInfoHtml = `
      <div style="margin-bottom: 16px; padding: 14px 16px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">⚠️</span>
          <strong style="color: #92400e; font-size: 14px;">同一方案，无基线信息</strong>
        </div>
        <p style="margin: 0; font-size: 12px; color: #b45309;">
          两个版本来自同一方案，但缺少基线快照，将使用普通两方对比模式。建议从同一导出文件分支修改以获得更好的合并效果。
        </p>
      </div>
    `;
  } else {
    versionInfoHtml = `
      <div style="margin-bottom: 16px; padding: 14px 16px; background: linear-gradient(135deg, #fef2f2, #fecaca); border: 1px solid #fca5a5; border-radius: 10px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 20px;">⚠️</span>
          <strong style="color: #991b1b; font-size: 14px;">不同方案</strong>
        </div>
        <p style="margin: 0; font-size: 12px; color: #b91c1c;">
          当前方案与协作方案ID不同，可能不是同一个方案的不同版本。请确认是否继续合并。
        </p>
      </div>
    `;
  }

  const sections = (baseAvailable && mergeState.threeWayDiffs?.sections)
    ? mergeState.threeWayDiffs.sections
    : mergeState.diffs.sections || [];

  const sectionItemsHtml = sections.map((s, idx) => {
    const section = state.sections.find(sec => sec.id === s.id) ||
      mergeState.collabData.sections.find(sec => sec.id === s.id);
    const bpm = section?.bpm || "-";

    let gridDiffs, bpmDiffs, voiceDiffs, noteDiffs;
    if (baseAvailable) {
      gridDiffs = mergeState.threeWayDiffs.grid[s.id] || [];
      bpmDiffs = mergeState.threeWayDiffs.bpm[s.id] || [];
      voiceDiffs = mergeState.threeWayDiffs.voices[s.id] || [];
      noteDiffs = mergeState.threeWayDiffs.notes[s.id] || [];
    } else {
      gridDiffs = mergeState.diffs.grid[s.id] || [];
      bpmDiffs = mergeState.diffs.bpm[s.id] || [];
      voiceDiffs = mergeState.diffs.voices[s.id] || [];
      noteDiffs = mergeState.diffs.notes[s.id] || [];
    }

    const hasGridDiff = gridDiffs.length > 0;
    const hasBpmDiff = bpmDiffs.length > 0;
    const hasVoiceDiff = voiceDiffs.length > 0;
    const hasNoteDiff = noteDiffs.some(n => n.type !== "same" && n.type !== "exists");

    let typeLabel = "";
    if (baseAvailable) {
      const threeWayLabels = {
        "exists": `<span class="merge-badge merge-badge-mod">存在</span>`,
        "ours_added": `<span class="merge-badge merge-badge-add">我方新增</span>`,
        "theirs_added": `<span class="merge-badge merge-badge-add">协作新增</span>`,
        "both_added_same": `<span class="merge-badge merge-badge-conflict">双方新增</span>`,
        "ours_deleted": `<span class="merge-badge merge-badge-del">我方删除</span>`,
        "theirs_deleted": `<span class="merge-badge merge-badge-del">协作删除</span>`,
        "both_deleted": `<span class="merge-badge merge-badge-del">双方删除</span>`
      };
      typeLabel = threeWayLabels[s.type] || "";
    } else {
      const typeLabels = {
        add: `<span class="merge-badge merge-badge-add">新增</span>`,
        del: `<span class="merge-badge merge-badge-del">删除</span>`,
        same: `<span class="merge-badge merge-badge-mod">相同</span>`
      };
      typeLabel = typeLabels[s.type] || "";
    }

    let tags = "";
    if (s.type === "same" || s.type === "exists") {
      if (hasGridDiff) {
        const conflictCount = gridDiffs.filter(d => d.type === "conflict").length;
        const autoCount = gridDiffs.length - conflictCount;
        const label = baseAvailable && conflictCount > 0
          ? `谱面 ${autoCount}自动 / ${conflictCount}冲突`
          : `谱面 ${gridDiffs.length}`;
        tags += `<span class="merge-section-diff-tag diff-tag-grid">${label}</span>`;
      }
      if (hasBpmDiff) {
        const conflictCount = bpmDiffs.filter(d => d.type === "conflict").length;
        const label = baseAvailable && conflictCount > 0
          ? `BPM ${bpmDiffs.length - conflictCount}自动 / ${conflictCount}冲突`
          : `BPM ${bpmDiffs.length}`;
        tags += `<span class="merge-section-diff-tag diff-tag-bpm">${label}</span>`;
      }
      if (hasVoiceDiff) {
        const conflictCount = voiceDiffs.filter(d => d.type === "conflict").length;
        const label = baseAvailable && conflictCount > 0
          ? `声部 ${voiceDiffs.length - conflictCount}自动 / ${conflictCount}冲突`
          : `声部 ${voiceDiffs.length}`;
        tags += `<span class="merge-section-diff-tag diff-tag-voice">${label}</span>`;
      }
      if (hasNoteDiff) {
        const diffCount = noteDiffs.filter(n => n.type !== "same" && n.type !== "exists").length;
        tags += `<span class="merge-section-diff-tag diff-tag-note">批注 ${diffCount}</span>`;
      }
      if (!hasGridDiff && !hasBpmDiff && !hasVoiceDiff && !hasNoteDiff) {
        tags = `<span class="merge-section-diff-tag diff-tag-same">无差异</span>`;
      }
    }

    return `
      <div class="merge-section-item">
        <div class="merge-section-index">${idx + 1}</div>
        <div class="merge-section-info">
          <div class="merge-section-name">${typeLabel} ${s.name}</div>
          <div class="merge-section-meta">
            <span>BPM: ${bpm}</span>
            <div class="merge-section-diff-tags">${tags}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  mergeSectionListEl.innerHTML = versionInfoHtml + sectionItemsHtml;
}

function renderMergeGridSelects() {
  const sections = state.sections || [];
  const options = sections.map((s, i) =>
    `<option value="${s.id}">${i + 1}. ${s.name}</option>`
  ).join("");

  mergeGridSectionSelect.innerHTML = options;
}

function renderMergeGrid() {
  if (!mergeState || !mergeState.collabData) {
    mergeGridCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    return;
  }

  const sectionId = mergeGridSectionSelect.value;
  if (!sectionId) {
    mergeGridCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请选择段落</p>`;
    return;
  }

  const ours = state.sections.find(s => s.id === sectionId);
  const theirs = mergeState.collabData.sections.find(s => s.id === sectionId);

  if (!ours && !theirs) {
    mergeGridCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">段落不存在</p>`;
    return;
  }

  const section = ours || theirs;
  const rows = 4;
  const cols = getSectionSteps(section);

  const ourPattern = ours?.pattern || [];
  const theirPattern = theirs?.pattern || [];

  const gridDiffs = mergeState.diffs.grid[sectionId] || [];
  const diffMap = new Map();
  gridDiffs.forEach(d => {
    diffMap.set(`${d.row}_${d.col}`, d);
  });

  let html = `<div class="merge-compare-header">
    <div class="merge-compare-side current">当前版本</div>
    <div class="merge-compare-arrow">↔</div>
    <div class="merge-compare-side collab">协作版本</div>
  </div>`;

  html += `<table class="merge-grid-table"><thead><tr><th class="label-cell">声部</th>`;
  for (let c = 0; c < cols; c++) {
    html += `<th>${c + 1}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let r = 0; r < rows; r++) {
    const instName = instruments[r]?.name || `声部${r + 1}`;
    html += `<tr><td class="merge-grid-row-label">${instName}</td>`;

    for (let c = 0; c < cols; c++) {
      const ourVal = ourPattern[r]?.[c] || "";
      const theirVal = theirPattern[r]?.[c] || "";
      const diff = diffMap.get(`${r}_${c}`);

      let cellClass = "grid-diff-same";
      let displayVal = ourVal;

      if (diff) {
        if (diff.type === "add") {
          cellClass = "grid-diff-add";
          displayVal = theirVal;
        } else if (diff.type === "del") {
          cellClass = "grid-diff-del";
          displayVal = ourVal;
        } else if (diff.type === "mod") {
          cellClass = "grid-diff-both";
          displayVal = `${ourVal}→${theirVal}`;
        }
      }

      html += `<td class="${cellClass}" title="当前: ${ourVal || '(空)'} | 协作: ${theirVal || '(空)'}">${displayVal || "&nbsp;"}</td>`;
    }

    html += `</tr>`;
  }

  html += `</tbody></table>`;

  if (gridDiffs.length > 0) {
    html += `<div style="margin-top: 12px; padding: 10px; background: var(--panel); border-radius: 6px; font-size: 12px; color: var(--muted);">
      <strong>差异说明：</strong> 共 ${gridDiffs.length} 处差异
      <span style="margin-left: 12px;"><span class="merge-badge merge-badge-add">绿色</span> 协作新增</span>
      <span style="margin-left: 8px;"><span class="merge-badge merge-badge-del">红色</span> 当前独有</span>
      <span style="margin-left: 8px;"><span class="merge-badge merge-badge-conflict">黄色</span> 冲突</span>
    </div>`;
  }

  mergeGridCompareEl.innerHTML = html;
}

function renderMergeSections() {
  if (!mergeState || !mergeState.collabData) {
    mergeSectionsListEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    return;
  }

  const sections = state.sections || [];

  mergeSectionsListEl.innerHTML = sections.map((section, idx) => {
    const bpmDiffs = mergeState.diffs.bpm[section.id] || [];
    const hasDiff = bpmDiffs.length > 0;

    const diffFields = bpmDiffs.map(d => `
      <div class="merge-field-diff">
        <span class="merge-field-label">${getBPMFieldLabel(d.field)}</span>
        <span class="merge-field-val current">${d.ours ?? '(空)'}</span>
        <span style="color: var(--muted);">→</span>
        <span class="merge-field-val collab">${d.theirs ?? '(空)'}</span>
      </div>
    `).join("");

    return `
      <div class="merge-section-diff-card">
        <div class="merge-section-diff-card-header">
          <span class="merge-section-diff-title">${idx + 1}. ${section.name}</span>
          ${hasDiff
            ? `<span class="merge-badge merge-badge-mod">${bpmDiffs.length} 处改动</span>`
            : `<span class="merge-badge merge-badge-add" style="background:#f3f4f6;color:#6b7280;border-color:#d1d5db;">无差异</span>`
          }
        </div>
        <div class="merge-section-diff-body">
          ${hasDiff ? diffFields : `<p style="margin:0;color:var(--muted);font-size:13px;">该段落的所有配置完全一致</p>`}
        </div>
      </div>
    `;
  }).join("");
}

function renderMergeVoiceSelects() {
  const sections = state.sections || [];
  const options = sections.map((s, i) =>
    `<option value="${s.id}">${i + 1}. ${s.name}</option>`
  ).join("");
  mergeVoiceSectionSelect.innerHTML = options;
}

function renderMergeVoices() {
  if (!mergeState || !mergeState.collabData) {
    mergeVoiceCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    return;
  }

  const sectionId = mergeVoiceSectionSelect.value;
  if (!sectionId) {
    mergeVoiceCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请选择段落</p>`;
    return;
  }

  const ours = state.sections.find(s => s.id === sectionId);
  const theirs = mergeState.collabData.sections.find(s => s.id === sectionId);

  if (!ours || !theirs) {
    mergeVoiceCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">段落不存在</p>`;
    return;
  }

  const ourVoices = ours.enabledInstruments || [true, true, true, true];
  const theirVoices = theirs.enabledInstruments || [true, true, true, true];

  let html = `<div class="merge-compare-header">
    <div class="merge-compare-side current">当前版本</div>
    <div class="merge-compare-arrow">↔</div>
    <div class="merge-compare-side collab">协作版本</div>
  </div>`;

  for (let i = 0; i < 4; i++) {
    const inst = instruments[i];
    const ourOn = ourVoices[i];
    const theirOn = theirVoices[i];
    const hasDiff = ourOn !== theirOn;

    const voiceIcons = ["🔔", "🥁", "🎺", "🎵"];
    html += `
      <div class="merge-voice-row" style="${hasDiff ? 'border-color: #fde68a; background: #fffbeb;' : ''}">
        <span class="merge-voice-name">${voiceIcons[i] || ""} ${inst.name}</span>
        <span class="merge-voice-state ${ourOn ? 'on' : 'off'}">${ourOn ? '开启' : '关闭'}</span>
        <span style="color: var(--muted);">${hasDiff ? '⚡' : '='}</span>
        <span class="merge-voice-state ${theirOn ? 'on' : 'off'}">${theirOn ? '开启' : '关闭'}</span>
      </div>
    `;
  }

  const voiceDiffs = mergeState.diffs.voices[sectionId] || [];
  if (voiceDiffs.length > 0) {
    html += `<div style="margin-top: 12px; padding: 10px; background: var(--panel); border-radius: 6px; font-size: 12px; color: var(--muted);">
      共 ${voiceDiffs.length} 个声部的开关状态不同
    </div>`;
  }

  mergeVoiceCompareEl.innerHTML = html;
}

function renderMergeNoteSelects() {
  const sections = state.sections || [];
  const options = sections.map((s, i) =>
    `<option value="${s.id}">${i + 1}. ${s.name}</option>`
  ).join("");
  mergeNoteSectionSelect.innerHTML = options;
}

function renderMergeNotes() {
  if (!mergeState || !mergeState.collabData) {
    mergeNotesCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    return;
  }

  const sectionId = mergeNoteSectionSelect.value;
  if (!sectionId) {
    mergeNotesCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请选择段落</p>`;
    return;
  }

  const noteDiffs = mergeState.diffs.notes[sectionId] || [];

  if (noteDiffs.length === 0) {
    mergeNotesCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">暂无批注</p>`;
    return;
  }

  const typeLabels = {
    add: `<span class="merge-note-type-badge add">新增</span>`,
    del: `<span class="merge-note-type-badge del">删除</span>`,
    same: `<span class="merge-note-type-badge same">相同</span>`,
    mod: `<span class="merge-note-type-badge conflict">冲突</span>`
  };

  mergeNotesCompareEl.innerHTML = noteDiffs.map(diff => {
    const ourText = diff.ours?.text || "";
    const theirText = diff.theirs?.text || "";

    return `
      <div class="merge-note-item">
        <div class="merge-note-side current ${!ourText ? 'empty' : ''}">
          ${ourText || '(空)'}
        </div>
        <div class="merge-note-action">
          ${typeLabels[diff.type] || ''}
        </div>
        <div class="merge-note-side collab ${!theirText ? 'empty' : ''}">
          ${theirText || '(空)'}
        </div>
      </div>
    `;
  }).join("");
}

function renderMergePractice() {
  if (!mergeState || !mergeState.collabData) {
    mergePracticeCompareEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    return;
  }

  const practiceDiffs = mergeState.diffs.practice || [];

  const ourCount = rehearsalLog?.length || 0;
  const theirCount = mergeState.collabRehearsalLog?.length || 0;
  const addCount = practiceDiffs.filter(p => p.type === "add").length;
  const sameCount = practiceDiffs.filter(p => p.type === "same").length;

  let html = `
    <div class="merge-practice-section">
      <h4>📊 练习记录统计</h4>
      <div class="merge-practice-stats">
        <div class="merge-practice-stat">
          <div class="merge-practice-stat-label">当前版本</div>
          <div class="merge-practice-stat-value">${ourCount}</div>
        </div>
        <div class="merge-practice-stat">
          <div class="merge-practice-stat-label">协作版本</div>
          <div class="merge-practice-stat-value">${theirCount}</div>
        </div>
        <div class="merge-practice-stat">
          <div class="merge-practice-stat-label">协作新增</div>
          <div class="merge-practice-stat-value" style="color: var(--active);">${addCount}</div>
        </div>
      </div>
      <p style="margin: 0; font-size: 12px; color: var(--muted);">
        相同记录: ${sameCount} 条 | 
        <span class="merge-badge merge-badge-add">绿色</span> 协作版本新增的记录
      </p>
    </div>
  `;

  const addItems = practiceDiffs.filter(p => p.type === "add");
  if (addItems.length > 0) {
    html += `
      <div class="merge-practice-section">
        <h4>➕ 协作版本新增的练习记录</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    addItems.slice(0, 10).forEach(item => {
      const entry = item.theirs;
      const date = entry.timestamp ? new Date(entry.timestamp).toLocaleString("zh-CN") : "未知时间";
      html += `
        <div style="padding: 8px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 12px;">
          <strong style="color: #047857;">${entry.sectionName || "未知段落"}</strong>
          <span style="color: var(--muted); margin-left: 8px;">${date}</span>
        </div>
      `;
    });

    if (addItems.length > 10) {
      html += `<p style="margin: 0; font-size: 12px; color: var(--muted); text-align: center;">还有 ${addItems.length - 10} 条...</p>`;
    }

    html += `</div></div>`;
  }

  mergePracticeCompareEl.innerHTML = html;
}

function renderMergeConflicts() {
  if (!mergeState || !mergeState.collabData) {
    mergeConflictListEl.innerHTML = `<p style="color: var(--muted); text-align: center; padding: 20px;">请先选择协作文件</p>`;
    mergeConflictProgressEl.textContent = "0 / 0";
    return;
  }

  const conflicts = mergeState.conflicts || [];

  if (conflicts.length === 0) {
    mergeConflictListEl.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <p style="margin: 0 0 8px; font-weight: 600; color: #047857;">太棒了！没有冲突</p>
        <p style="margin: 0; font-size: 12px;">两个版本没有需要人工处理的冲突，可直接自动合并</p>
      </div>
    `;
    mergeConflictProgressEl.textContent = "0 / 0";
    return;
  }

  const resolvedCount = Object.keys(mergeState.resolvedConflicts).length;
  mergeConflictProgressEl.textContent = `${resolvedCount} / ${conflicts.length}`;

  mergePrevConflictBtn.disabled = currentConflictIndex <= 0;
  mergeNextConflictBtn.disabled = currentConflictIndex >= conflicts.length - 1;

  mergeConflictListEl.innerHTML = conflicts.map((conflict, idx) => {
    const resolved = !!mergeState.resolvedConflicts[conflict.id];
    const resolution = mergeState.resolvedConflicts[conflict.id];

    let conflictContent = "";

    if (conflict.type === "section_add") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div style="color: var(--muted); font-style: italic;">（无此段落）</div>
          </div>
          <div class="merge-conflict-arrow">➕</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div><strong>${conflict.sectionName || '新段落'}</strong></div>
          </div>
        </div>
      `;
    } else if (conflict.type === "section_del") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div><strong>${conflict.sectionName || '段落'}</strong></div>
          </div>
          <div class="merge-conflict-arrow">🗑️</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div style="color: var(--muted); font-style: italic;">（已删除）</div>
          </div>
        </div>
      `;
    } else if (conflict.type === "bpm") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div style="font-size: 18px; font-weight: 700;">${conflict.ours ?? '(空)'}</div>
          </div>
          <div class="merge-conflict-arrow">⚡</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div style="font-size: 18px; font-weight: 700;">${conflict.theirs ?? '(空)'}</div>
          </div>
        </div>
      `;
    } else if (conflict.type === "grid") {
      const diffs = conflict.gridDiffs || [];
      conflictContent = `
        <div style="margin-bottom: 12px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: var(--muted);">
            共 ${diffs.length} 处谱面格子差异
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px;">
            <span class="merge-badge merge-badge-add">新增 ${diffs.filter(d => d.type === 'add').length}</span>
            <span class="merge-badge merge-badge-del">删除 ${diffs.filter(d => d.type === 'del').length}</span>
            <span class="merge-badge merge-badge-conflict">改动 ${diffs.filter(d => d.type === 'mod').length}</span>
          </div>
        </div>
      `;
    } else if (conflict.type === "voices") {
      const diffs = conflict.voiceDiffs || [];
      conflictContent = `
        <div style="margin-bottom: 12px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: var(--muted);">
            共 ${diffs.length} 个声部开关不同
          </p>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
            ${diffs.map(d => `
              <div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--panel); border-radius: 4px;">
                <span>${d.name}</span>
                <span>
                  <span style="color: #1d4ed8;">${d.ours ? '开' : '关'}</span>
                  →
                  <span style="color: #047857;">${d.theirs ? '开' : '关'}</span>
                </span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    } else if (conflict.type === "note_mod") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div>${conflict.ours?.text || '(空)'}</div>
          </div>
          <div class="merge-conflict-arrow">⚡</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div>${conflict.theirs?.text || '(空)'}</div>
          </div>
        </div>
      `;
    } else if (conflict.type === "note_add") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div style="color: var(--muted); font-style: italic;">（无此批注）</div>
          </div>
          <div class="merge-conflict-arrow">➕</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div>${conflict.theirs?.text || '(空)'}</div>
          </div>
        </div>
      `;
    } else if (conflict.type === "note_del") {
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div>${conflict.ours?.text || '(空)'}</div>
          </div>
          <div class="merge-conflict-arrow">🗑️</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div style="color: var(--muted); font-style: italic;">（已删除）</div>
          </div>
        </div>
      `;
    } else if (conflict.type === "practice_add") {
      const entry = conflict.theirs || {};
      const date = entry.timestamp ? new Date(entry.timestamp).toLocaleString("zh-CN") : "未知时间";
      conflictContent = `
        <div class="merge-conflict-compare">
          <div class="merge-conflict-side current">
            <div class="merge-conflict-side-label">当前版本</div>
            <div style="color: var(--muted); font-style: italic;">（无此记录）</div>
          </div>
          <div class="merge-conflict-arrow">➕</div>
          <div class="merge-conflict-side collab">
            <div class="merge-conflict-side-label">协作版本</div>
            <div><strong>${entry.sectionName || "未知段落"}</strong></div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">${date}</div>
          </div>
        </div>
      `;
    }

    const isSelectedOurs = resolution === "ours";
    const isSelectedTheirs = resolution === "theirs";

    return `
      <div class="merge-conflict-item ${resolved ? 'resolved' : ''}" data-conflict-idx="${idx}">
        <div class="merge-conflict-item-header">
          <span class="merge-conflict-type">
            <span class="merge-diff-icon">${resolved ? '✅' : '⚠️'}</span>
            冲突 ${idx + 1}: ${conflict.description}
          </span>
          <span class="merge-conflict-status">${resolved ? '已解决' : '待处理'}</span>
        </div>
        <div class="merge-conflict-body">
          ${conflictContent}
          <div class="merge-conflict-choices">
            <button type="button" class="merge-conflict-choice keep-current ${isSelectedOurs ? 'selected' : ''}"
              onclick="resolveConflict('${conflict.id}', 'ours')">
              保留当前版本
            </button>
            <button type="button" class="merge-conflict-choice keep-collab ${isSelectedTheirs ? 'selected' : ''}"
              onclick="resolveConflict('${conflict.id}', 'theirs')">
              采用协作版本
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function scrollToConflict(idx) {
  const el = mergeConflictListEl.querySelector(`[data-conflict-idx="${idx}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.3)";
    setTimeout(() => {
      el.style.boxShadow = "";
    }, 1500);
  }
}

mergeCloseBtn.addEventListener("click", closeMergeModal);
mergeCancelBtn.addEventListener("click", closeMergeModal);

mergeOverlay.addEventListener("click", (e) => {
  if (e.target === mergeOverlay) {
    closeMergeModal();
  }
});

schemeMergeFileInput.addEventListener("change", handleMergeFileSelect);

document.getElementById("schemeMergeBtn").addEventListener("click", () => {
  openMergeModal();
  setTimeout(() => schemeMergeFileInput.click(), 300);
});

document.querySelectorAll(".merge-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const tabName = tab.dataset.mergeTab;

    document.querySelectorAll(".merge-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".merge-tab-content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    const content = document.querySelector(`[data-merge-tab-content="${tabName}"]`);
    if (content) content.classList.add("active");
  });
});

mergeGridSectionSelect.addEventListener("change", renderMergeGrid);
mergeVoiceSectionSelect.addEventListener("change", renderMergeVoices);
mergeNoteSectionSelect.addEventListener("change", renderMergeNotes);

mergeAutoMergeBtn.addEventListener("click", () => {
  if (!mergeState || !mergeState.collabData) {
    alert("请先选择协作文件");
    return;
  }
  applyAutoMerge();
  alert("自动合并完成！请检查冲突项，然后可预览或应用合并结果。");
});

mergePreviewBtn.addEventListener("click", () => {
  if (mergePreviewActive) {
    exitMergePreview();
  } else {
    enterMergePreview();
  }
});

mergeExitPreviewBtn.addEventListener("click", exitMergePreview);

mergeApplyBtn.addEventListener("click", () => {
  if (confirm("确定要应用合并结果吗？此操作会覆盖当前方案，建议先导出备份。")) {
    applyMergeResult();
  }
});

mergeExportBtn.addEventListener("click", exportMergeResult);

mergePrevConflictBtn.addEventListener("click", () => {
  if (currentConflictIndex > 0) {
    currentConflictIndex--;
    scrollToConflict(currentConflictIndex);
    mergeConflictProgressEl.textContent = `${currentConflictIndex + 1} / ${mergeState.conflicts.length}`;
    mergePrevConflictBtn.disabled = currentConflictIndex <= 0;
    mergeNextConflictBtn.disabled = currentConflictIndex >= mergeState.conflicts.length - 1;
  }
});

mergeNextConflictBtn.addEventListener("click", () => {
  if (mergeState && mergeState.conflicts && currentConflictIndex < mergeState.conflicts.length - 1) {
    currentConflictIndex++;
    scrollToConflict(currentConflictIndex);
    mergeConflictProgressEl.textContent = `${currentConflictIndex + 1} / ${mergeState.conflicts.length}`;
    mergePrevConflictBtn.disabled = currentConflictIndex <= 0;
    mergeNextConflictBtn.disabled = currentConflictIndex >= mergeState.conflicts.length - 1;
  }
});

/* ==================== 排练复盘视图 UI 和交互 ==================== */

const reviewOverlay = document.querySelector("#reviewOverlay");
const reviewCloseBtn = document.querySelector("#reviewCloseBtn");
const reviewCancelBtn = document.querySelector("#reviewCancelBtn");
const reviewReviewBtn = document.querySelector("#rehearsalReviewBtn");
const reviewRecordList = document.querySelector("#reviewRecordList");
const reviewEmptyState = document.querySelector("#reviewEmptyState");
const reviewContent = document.querySelector("#reviewContent");
const reviewStorageInfo = document.querySelector("#reviewStorageInfo");
const reviewPieceName = document.querySelector("#reviewPieceName");
const reviewSectionName = document.querySelector("#reviewSectionName");
const reviewBpmEl = document.querySelector("#reviewBpm");
const reviewDurationEl = document.querySelector("#reviewDuration");
const reviewPauseLabelEl = document.querySelector("#reviewPauseLabel");
const reviewModeEl = document.querySelector("#reviewMode");
const timelineRuler = document.querySelector("#timelineRuler");
const timelineTrack = document.querySelector("#timelineTrack");
const timelineCursor = document.querySelector("#timelineCursor");
const timelinePosition = document.querySelector("#timelinePosition");
const timelinePrevBtn = document.querySelector("#timelinePrevBtn");
const timelineNextBtn = document.querySelector("#timelineNextBtn");
const reviewEventList = document.querySelector("#reviewEventList");
const reviewSnapshotMini = document.querySelector("#reviewSnapshotMini");
const reviewSnapshotDetail = document.querySelector("#reviewSnapshotDetail");
const reviewWeaknessContent = document.querySelector("#reviewWeaknessContent");
const reviewNotesList = document.querySelector("#reviewNotesList");
const reviewVoicesEl = document.querySelector("#reviewVoices");
const reviewLoopEl = document.querySelector("#reviewLoop");
const reviewMixEl = document.querySelector("#reviewMix");
const reviewBpmChangesRow = document.querySelector("#reviewBpmChangesRow");
const reviewBpmChangesEl = document.querySelector("#reviewBpmChanges");
const reviewJumpBtn = document.querySelector("#reviewJumpBtn");
const reviewCreateNoteBtn = document.querySelector("#reviewCreateNoteBtn");
const reviewDiagnoseBtn = document.querySelector("#reviewDiagnoseBtn");
const reviewExportBtn = document.querySelector("#reviewExportBtn");

const createNoteFromReviewOverlay = document.querySelector("#createNoteFromReviewOverlay");
const createNoteFromReviewCloseBtn = document.querySelector("#createNoteFromReviewCloseBtn");
const createNoteFromReviewCancelBtn = document.querySelector("#createNoteFromReviewCancelBtn");
const createNoteFromReviewConfirmBtn = document.querySelector("#createNoteFromReviewConfirmBtn");
const createNoteFromReviewInfo = document.querySelector("#createNoteFromReviewInfo");
const createNoteFromReviewContentEl = document.querySelector("#createNoteFromReviewContent");
const createNoteFromReviewTypeEl = document.querySelector("#createNoteFromReviewType");
const createNoteFromReviewTargetEl = document.querySelector("#createNoteFromReviewTarget");
const createNoteFromReviewAssigneeEl = document.querySelector("#createNoteFromReviewAssignee");
const createNoteFromReviewPriorityEl = document.querySelector("#createNoteFromReviewPriority");
const createNoteFromReviewGoalEl = document.querySelector("#createNoteFromReviewGoal");

let currentReviewDetail = null;
let currentReviewRehearsalEntry = null;

function formatDuration(ms) {
  if (ms == null || isNaN(ms)) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return ts;
  }
}

function formatElapsed(ms) {
  if (ms == null) return "0s";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

function getEventIcon(type) {
  const map = {
    start: "▶",
    end: "⏹",
    pause: "⏸",
    bpm: "⚡",
    section: "📑",
    loop: "🔁",
    voice: "🎚️",
    mix: "🎛️",
    snapshot: "📷",
    round: "🔄"
  };
  return map[type] || "•";
}

function getEventTitle(e) {
  switch (e.type) {
    case "start": return "开始播放";
    case "end": return "播放结束";
    case "pause": return e.data?.completed ? "播放完成" : "暂停";
    case "bpm": return `BPM变化 ${e.data?.from} → ${e.data?.to}`;
    case "section": return `切换段落: ${e.data?.toName || "未知"}`;
    case "loop": return `循环变化 (第${e.data?.iteration || 0}次)`;
    case "voice": return `声部开关变更`;
    case "mix": return `混音配置变更`;
    case "snapshot": return `谱面快照`;
    case "round": return `完成轮次 ${e.data?.currentRound || 0}`;
    default: return e.type;
  }
}

function getEventDetail(e) {
  switch (e.type) {
    case "start":
      return `模式: ${e.data?.mode === "tempo" ? "变速训练" : e.data?.mode === "continuous" ? "连续播放" : "普通播放"}, 初始BPM: ${e.data?.initialBpm}`;
    case "bpm":
      return `${e.data?.delta > 0 ? "↑" : "↓"} ${Math.abs(e.data?.delta || 0)} BPM${e.data?.tempoStep ? " (变速阶梯)" : ""}`;
    case "loop":
      return `范围: ${e.data?.to === "" ? "全段" : "第" + (Number(e.data?.to) + 1) + "小节"}`;
    case "voice":
      const ch = (e.data?.changes || []).map(c => `${c.name}: ${c.from ? "开" : "关"}→${c.to ? "开" : "关"}`).join(", ");
      return ch || "声部配置变化";
    case "round":
      return `BPM: ${e.data?.bpm}, 子轮: ${e.data?.currentSubRound || 0}`;
    case "snapshot":
      return `每${SNAPSHOT_INTERVAL_BEATS}拍自动采集`;
    default:
      return "";
  }
}

function openReviewOverlay(rehearsalId) {
  if (rehearsalLog.length === 0) {
    alert("暂无排练记录，播放一次后即可使用复盘功能。");
    return;
  }
  reviewState.active = true;
  reviewState.selectedEventIndex = -1;
  currentReviewDetail = null;
  currentReviewRehearsalEntry = null;
  updateStorageInfo();
  renderReviewRecordList();
  if (rehearsalId) {
    selectReviewRecord(rehearsalId);
  } else {
    reviewEmptyState.style.display = "flex";
    reviewContent.style.display = "none";
    reviewJumpBtn.disabled = true;
    reviewCreateNoteBtn.disabled = true;
  }
  reviewOverlay.style.display = "flex";
}

function closeReviewOverlay() {
  reviewState.active = false;
  reviewState.selectedRehearsalId = null;
  reviewState.selectedEventIndex = -1;
  currentReviewDetail = null;
  currentReviewRehearsalEntry = null;
  reviewOverlay.style.display = "none";
  createNoteFromReviewOverlay.style.display = "none";
}

function updateStorageInfo() {
  try {
    const size = getReviewDetailStoreSize();
    const rehearsalCount = rehearsalLog.length;
    const detailStore = loadReviewDetailStore();
    const fullCount = Object.values(detailStore).filter(d => !d.summaryOnly).length;
    const summaryCount = Object.values(detailStore).filter(d => d.summaryOnly).length;
    const sizeKB = Math.round(size / 1024);
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    const sizeStr = sizeKB > 1024 ? `${sizeMB}MB` : `${sizeKB}KB`;
    const limitMB = (REVIEW_STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0);
    reviewStorageInfo.textContent = `排练:${rehearsalCount}条 | 复盘数据:${sizeStr}/${limitMB}MB (完整:${fullCount} 摘要:${summaryCount})`;
  } catch {
    reviewStorageInfo.textContent = "";
  }
}

function renderReviewRecordList() {
  if (rehearsalLog.length === 0) {
    reviewRecordList.innerHTML = `<div class="review-empty">暂无排练记录</div>`;
    return;
  }
  const detailStore = loadReviewDetailStore();
  reviewRecordList.innerHTML = rehearsalLog.map((entry, idx) => {
    const detail = detailStore[entry.id];
    const hasEvents = detail && !detail.summaryOnly && Array.isArray(detail.events) && detail.events.length > 0;
    const isSummaryOnly = detail && detail.summaryOnly;
    const modeClass = entry.snapshot?.continuousPlay ? "mode-continuous" :
      (detail && detail.mode === "tempo") ? "mode-tempo" : "mode-normal";
    const modeLabel = entry.snapshot?.continuousPlay ? "连续" :
      (detail && detail.mode === "tempo") ? "变速" : "普通";
    const tags = [
      `<span class="record-item-tag ${modeClass}">${modeLabel}</span>`,
      `<span class="record-item-tag">${entry.bpm}BPM</span>`
    ];
    if (hasEvents) tags.push(`<span class="record-item-tag has-events">${detail.events.length}事件</span>`);
    if (isSummaryOnly) tags.push(`<span class="record-item-tag">仅摘要</span>`);
    const isActive = reviewState.selectedRehearsalId === entry.id;
    return `
      <div class="review-record-item ${isActive ? "active" : ""}" data-review-record="${entry.id}">
        <div class="record-item-title">${idx + 1}. ${entry.sectionName || "未命名段落"}</div>
        <div class="record-item-meta">
          <span>${formatTimestamp(entry.timestamp)}</span>
          <span>${entry.durationMs ? formatDuration(entry.durationMs) : "未完成"}</span>
          ${tags.join("")}
        </div>
      </div>
    `;
  }).join("");
  reviewRecordList.querySelectorAll("[data-review-record]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.reviewRecord;
      selectReviewRecord(id);
    });
  });
}

function selectReviewRecord(rehearsalId) {
  const entry = rehearsalLog.find(r => r.id === rehearsalId);
  if (!entry) return;
  reviewState.selectedRehearsalId = rehearsalId;
  reviewState.selectedEventIndex = -1;
  currentReviewRehearsalEntry = entry;
  currentReviewDetail = getReviewDetailForRehearsal(rehearsalId);
  reviewEmptyState.style.display = "none";
  reviewContent.style.display = "block";
  renderReviewSummary(entry, currentReviewDetail);
  renderReviewTimeline(entry, currentReviewDetail);
  renderReviewEventList(entry, currentReviewDetail);
  renderReviewConfig(entry, currentReviewDetail);
  renderReviewRelatedNotes(entry, currentReviewDetail);
  if (currentReviewDetail && currentReviewDetail.weakness) {
    renderReviewWeakness(currentReviewDetail.weakness);
  } else {
    reviewWeaknessContent.innerHTML = `<div class="review-empty">尚未分析，点击「诊断薄弱点」开始分析</div>`;
  }
  reviewSnapshotMini.innerHTML = `<div class="review-empty">从左侧选择事件查看快照</div>`;
  reviewSnapshotDetail.style.display = "none";
  reviewJumpBtn.disabled = true;
  reviewCreateNoteBtn.disabled = true;
  renderReviewRecordList();
}

function renderReviewSummary(entry, detail) {
  reviewPieceName.textContent = entry.pieceName || state.pieceName || "未命名";
  reviewSectionName.textContent = entry.sectionName || "未命名段落";
  reviewBpmEl.textContent = `${entry.bpm} BPM`;
  reviewDurationEl.textContent = formatDuration(entry.durationMs || (detail && detail.durationMs));
  reviewPauseLabelEl.textContent = entry.pauseLabel || "—";
  const mode = detail?.mode || (entry.snapshot?.continuousPlay ? "continuous" : "normal");
  const modeMap = {
    normal: "🎵 普通播放",
    continuous: "🔗 连续播放",
    tempo: "⏱️ 变速训练"
  };
  reviewModeEl.textContent = modeMap[mode] || mode;
}

function renderReviewTimeline(entry, detail) {
  const section = (entry.snapshot && entry.snapshot.sections && entry.snapshot.sections[0]) ||
    state.sections.find(s => s.id === entry.sectionId) ||
    getCurrentSection();
  if (!section) {
    timelineRuler.innerHTML = "";
    timelineTrack.innerHTML = "";
    return;
  }
  const beatsPerMeasure = section.beatsPerMeasure || 4;
  const measureCount = section.measureCount || 4;
  const totalSteps = getSectionSteps(section);
  let rulerHtml = "";
  for (let i = 0; i < totalSteps; i++) {
    const measure = Math.floor(i / beatsPerMeasure);
    const beat = (i % beatsPerMeasure) + 1;
    const isMeasureStart = beat === 1;
    rulerHtml += `<div class="timeline-ruler-segment ${isMeasureStart ? "is-measure-start" : ""}">${isMeasureStart ? `M${measure + 1}` : beat}</div>`;
  }
  timelineRuler.innerHTML = rulerHtml;
  const events = detail && Array.isArray(detail.events) ? detail.events : [];
  if (events.length === 0) {
    timelineTrack.innerHTML = `<div class="review-empty" style="height:64px;display:flex;align-items:center;">无事件数据（可能为摘要记录）</div>`;
    timelineCursor.style.display = "none";
    timelinePosition.textContent = `—`;
    return;
  }
  let trackHtml = "";
  events.forEach((evt, idx) => {
    const beat = Math.max(0, Math.min(typeof evt.beat === "number" ? evt.beat : 0, totalSteps - 1));
    const leftPct = (beat / Math.max(1, totalSteps - 1)) * 100;
    const isActive = idx === reviewState.selectedEventIndex;
    trackHtml += `<div class="timeline-event event-${evt.type} ${isActive ? "active" : ""}" 
      title="${getEventTitle(evt)} - ${evt.beatLabel}" 
      style="left: ${leftPct}%;"
      data-timeline-event="${idx}">${getEventIcon(evt.type)}</div>`;
  });
  timelineTrack.innerHTML = trackHtml;
  timelineTrack.querySelectorAll("[data-timeline-event]").forEach(el => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.timelineEvent);
      selectReviewEvent(idx);
    });
  });
  timelineCursor.style.display = "none";
  updateTimelineNav();
}

function updateTimelineNav() {
  const events = currentReviewDetail?.events || [];
  const hasEvents = events.length > 0;
  timelinePrevBtn.disabled = !hasEvents || reviewState.selectedEventIndex <= 0;
  timelineNextBtn.disabled = !hasEvents || reviewState.selectedEventIndex >= events.length - 1;
  if (reviewState.selectedEventIndex >= 0 && hasEvents && events[reviewState.selectedEventIndex]) {
    const evt = events[reviewState.selectedEventIndex];
    timelinePosition.textContent = `${evt.beatLabel} · ${getEventTitle(evt)} · ${formatElapsed(evt.elapsedMs)}`;
  } else {
    timelinePosition.textContent = hasEvents ? `${events.length} 个事件 · 选择查看` : "无事件数据";
  }
}

function renderReviewEventList(entry, detail) {
  const events = detail && Array.isArray(detail.events) ? detail.events : [];
  if (events.length === 0) {
    reviewEventList.innerHTML = `<div class="review-empty">暂无事件数据（可能为摘要记录）</div>`;
    return;
  }
  reviewEventList.innerHTML = events.map((evt, idx) => {
    const isActive = idx === reviewState.selectedEventIndex;
    return `
      <div class="event-item ${isActive ? "active" : ""}" data-event-index="${idx}">
        <div class="event-icon ${evt.type}">${getEventIcon(evt.type)}</div>
        <div class="event-content">
          <div class="event-title">${getEventTitle(evt)}</div>
          <div class="event-detail">${evt.beatLabel} · ${getEventDetail(evt)}</div>
        </div>
        <div class="event-time">${formatElapsed(evt.elapsedMs)}</div>
      </div>
    `;
  }).join("");
  reviewEventList.querySelectorAll("[data-event-index]").forEach(el => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.eventIndex);
      selectReviewEvent(idx);
    });
  });
}

function selectReviewEvent(idx) {
  const events = currentReviewDetail?.events || [];
  if (idx < 0 || idx >= events.length) return;
  reviewState.selectedEventIndex = idx;
  const evt = events[idx];
  renderReviewEventList(currentReviewRehearsalEntry, currentReviewDetail);
  renderReviewTimeline(currentReviewRehearsalEntry, currentReviewDetail);
  const section = (currentReviewRehearsalEntry?.snapshot?.sections?.[0]) ||
    state.sections.find(s => s.id === currentReviewRehearsalEntry?.sectionId) ||
    getCurrentSection();
  if (section && typeof evt.beat === "number") {
    const totalSteps = getSectionSteps(section);
    const beat = Math.max(0, Math.min(evt.beat, totalSteps - 1));
    const leftPct = (beat / Math.max(1, totalSteps - 1)) * 100;
    timelineCursor.style.left = `calc(${leftPct}% + 0px)`;
    timelineCursor.style.display = "block";
  }
  renderReviewSnapshot(evt, section);
  reviewJumpBtn.disabled = false;
  reviewCreateNoteBtn.disabled = false;
  updateTimelineNav();
}

function renderReviewSnapshot(evt, section) {
  const snap = evt?.miniSnapshot;
  const sec = section ||
    (currentReviewRehearsalEntry?.snapshot?.sections?.[0]) ||
    state.sections.find(s => s.id === currentReviewRehearsalEntry?.sectionId) ||
    getCurrentSection();
  if (!snap && !sec) {
    reviewSnapshotMini.innerHTML = `<div class="review-empty">无快照数据</div>`;
    reviewSnapshotDetail.style.display = "none";
    return;
  }
  const pattern = snap?.pattern || (sec?.pattern || []).map(row => row.map(v => v ? 1 : 0));
  const enabledInstruments = snap?.enabledInstruments || sec?.enabledInstruments || [true, true, true, true];
  const bpm = snap?.beatsPerMeasure || sec?.beatsPerMeasure || 4;
  const totalSteps = snap?.totalSteps || getSectionSteps(sec);
  const currentBeat = snap?.currentBeat ?? (typeof evt?.beat === "number" ? evt.beat : -1);
  let gridHtml = "";
  const cols = totalSteps + 1;
  let miniHtml = `<div class="snapshot-mini-grid" style="grid-template-columns: 60px repeat(${totalSteps}, 1fr);">`;
  for (let r = -1; r < instruments.length; r++) {
    for (let c = 0; c <= totalSteps; c++) {
      if (c === 0) {
        if (r === -1) {
          miniHtml += `<div class="snapshot-mini-cell label"></div>`;
        } else {
          miniHtml += `<div class="snapshot-mini-cell label ${!enabledInstruments[r] ? "muted" : ""}">${instruments[r].token}</div>`;
        }
      } else {
        const step = c - 1;
        const isMeasureStart = step % bpm === 0;
        if (r === -1) {
          const beatLabel = Math.floor(step / bpm) + 1;
          miniHtml += `<div class="snapshot-mini-cell label ${isMeasureStart ? "measure-start" : ""}">${isMeasureStart ? beatLabel : (step % bpm) + 1}</div>`;
        } else {
          const filled = pattern[r] && pattern[r][step] === 1;
          const playing = step === currentBeat;
          miniHtml += `<div class="snapshot-mini-cell ${filled ? "filled" : ""} ${playing ? "playing" : ""} ${!enabledInstruments[r] ? "muted" : ""} ${isMeasureStart ? "measure-start" : ""}">${filled ? instruments[r].token : ""}</div>`;
        }
      }
    }
  }
  miniHtml += `</div>`;
  const snapInfo = snap || {};
  const infoHtml = `
    <div class="snapshot-info">
      <div class="snapshot-info-item"><span class="snapshot-info-label">BPM:</span><span class="snapshot-info-value">${snapInfo.bpm || sec?.bpm || "-"}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">当前拍:</span><span class="snapshot-info-value">${evt?.beatLabel || "-"}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">总步数:</span><span class="snapshot-info-value">${totalSteps}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">小节:</span><span class="snapshot-info-value">${snapInfo.measureCount || sec?.measureCount || 4} × ${bpm}/4</span></div>
    </div>
  `;
  reviewSnapshotMini.innerHTML = miniHtml + infoHtml;
  reviewSnapshotDetail.style.display = "none";
}

function renderReviewConfig(entry, detail) {
  const section = (entry.snapshot?.sections?.[0]) || state.sections.find(s => s.id === entry.sectionId);
  if (!section) {
    reviewVoicesEl.textContent = "—";
    reviewLoopEl.textContent = "—";
    reviewMixEl.textContent = "—";
    reviewBpmChangesRow.style.display = "none";
    return;
  }
  const voiceChips = instruments.map((inst, idx) => {
    const on = entry.enabledInstruments ? entry.enabledInstruments[idx] : true;
    return `<span class="config-chip ${on ? "enabled" : "disabled"}">${inst.token} ${inst.name}</span>`;
  }).join("");
  reviewVoicesEl.innerHTML = voiceChips;
  const loopLabel = entry.loop === "" || entry.loop == null ? "全段" : `第${Number(entry.loop) + 1}小节`;
  reviewLoopEl.textContent = `${entry.loopLabel || loopLabel}`;
  const mix = entry.mixConfig || section.mixConfig || createDefaultMixConfig();
  const mixSummaries = instruments.map((inst, idx) => {
    const vol = mix.volume?.[idx] ?? 100;
    const accent = mix.accent?.[idx] ? " ⭐" : "";
    return `${inst.token}${vol !== 100 ? `(${vol}%)` : ""}${accent}`;
  }).filter(Boolean);
  reviewMixEl.textContent = mixSummaries.join("  ·  ");
  const events = detail?.events || [];
  const bpmChanges = events.filter(e => e.type === "bpm");
  if (bpmChanges.length > 0) {
    const bpmPairs = bpmChanges.map(e => `${e.data?.from}→${e.data?.to}`).join(", ");
    reviewBpmChangesEl.textContent = `${bpmChanges.length}次: ${bpmPairs}`;
    reviewBpmChangesRow.style.display = "flex";
  } else {
    reviewBpmChangesRow.style.display = "none";
  }
}

function renderReviewRelatedNotes(entry, detail) {
  const section = (entry.snapshot?.sections?.[0]) || state.sections.find(s => s.id === entry.sectionId);
  const notes = section?.collabNotes || section?.notes || [];
  if (!Array.isArray(notes) || notes.length === 0) {
    reviewNotesList.innerHTML = `<div class="review-empty">暂无相关批注</div>`;
    return;
  }
  const formatNote = (n, idx) => {
    if (typeof n === "string") {
      return `
        <div class="review-note-item">
          <div class="review-note-header">
            <span class="review-note-type teacher">老师批注</span>
          </div>
          <div class="review-note-content">${n}</div>
        </div>
      `;
    }
    const targetLabel = n.target === "all" || n.target == null ? "全段" : `第${Number(n.target) + 1}小节`;
    const priorityIcon = { high: "🔴", medium: "🟡", low: "🟢" }[n.priority || "medium"] || "";
    return `
      <div class="review-note-item">
        <div class="review-note-header">
          <span class="review-note-type ${n.type || "teacher"}">${n.type === "student" ? "👨‍🎓 学生反馈" : "👨‍🏫 老师批注"}</span>
          <span class="review-note-meta">${priorityIcon} ${targetLabel} · ${getAssigneeLabel(n.assignee)}</span>
        </div>
        <div class="review-note-content">${n.content || ""}</div>
        <div class="review-note-footer">
          <span class="review-note-assignee">📋 练习目标: ${n.practiceGoal || 0}次</span>
          <span class="review-note-status ${n.resolved ? "resolved" : "pending"}">${n.resolved ? "✅ 已解决" : "⏳ 待解决"}</span>
        </div>
      </div>
    `;
  };
  reviewNotesList.innerHTML = notes.map(formatNote).join("");
}

function renderReviewWeakness(weakness) {
  if (!weakness) {
    reviewWeaknessContent.innerHTML = `<div class="review-empty">诊断失败</div>`;
    return;
  }
  const score = weakness.stabilityScore || 0;
  const scoreColor = score >= 90 ? "var(--active)" : score >= 70 ? "var(--gold)" : "var(--accent)";
  const scoreDeg = (score / 100) * 360;
  const levelIcon = {
    excellent: "🌟",
    good: "✅",
    fair: "📈",
    poor: "⚠️"
  }[weakness.level || "good"];
  const weakPoints = weakness.weakPoints || [];
  const weakListHtml = weakPoints.length > 0 ? `
    <div class="weakness-section-title">🎯 薄弱点 TOP ${weakPoints.length}</div>
    <div class="weakness-list">
      ${weakPoints.map(w => `
        <div class="weakness-item severity-${w.severity}">
          <div class="weakness-beat">${w.beatLabel || "—"}</div>
          <div class="weakness-desc">
            <strong>${w.reason || "原因"}：</strong>${w.description || ""}
          </div>
          <span class="weakness-severity">${{high: "高", medium: "中", low: "低"}[w.severity] || ""}</span>
        </div>
      `).join("")}
    </div>
  ` : `<div class="review-empty" style="margin-top:10px;">未发现明显薄弱点，继续保持！</div>`;
  const stats = weakness.stats || {};
  const statsHtml = `
    <div class="snapshot-info" style="margin-top:14px;">
      <div class="snapshot-info-item"><span class="snapshot-info-label">暂停次数:</span><span class="snapshot-info-value">${stats.pauseCount || 0}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">BPM变化:</span><span class="snapshot-info-value">${stats.bpmChangeCount || 0}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">循环次数:</span><span class="snapshot-info-value">${stats.loopCount || 0}</span></div>
      <div class="snapshot-info-item"><span class="snapshot-info-label">声部切换:</span><span class="snapshot-info-value">${stats.voiceChangeCount || 0}</span></div>
    </div>
  `;
  reviewWeaknessContent.innerHTML = `
    <div class="weakness-overall-score">
      <div class="weakness-score-ring" style="background: conic-gradient(${scoreColor} 0deg ${scoreDeg}deg, #e8dfce ${scoreDeg}deg 360deg);">
        <span class="weakness-score-text">${score}</span>
      </div>
      <div>
        <div class="weakness-score-label">排练稳定度评分</div>
        <div class="weakness-score-desc">${levelIcon} ${weakness.description || ""}</div>
      </div>
    </div>
    ${weakListHtml}
    ${statsHtml}
  `;
}

function jumpFromReviewToBeat() {
  if (!currentReviewRehearsalEntry || !currentReviewDetail) return;
  const events = currentReviewDetail.events || [];
  const evt = events[reviewState.selectedEventIndex];
  if (!evt || typeof evt.beat !== "number") {
    alert("请先选择一个事件");
    return;
  }
  const entrySectionId = currentReviewRehearsalEntry.sectionId;
  const targetSection = state.sections.find(s => s.id === entrySectionId) || state.sections[0];
  if (!targetSection) {
    alert("找不到对应段落");
    return;
  }
  const beat = Math.max(0, Math.min(evt.beat, getSectionSteps(targetSection) - 1));
  if (timer) stopPlayback();
  state.currentSectionId = targetSection.id;
  playhead = beat;
  pendingRehearsalResume = {
    sectionId: targetSection.id,
    playhead: beat
  };
  syncFields();
  render();
  renderGrid();
  highlight(beat);
  closeReviewOverlay();
  setTimeout(() => {
    alert(`已跳转至 ${targetSection.name} · ${evt.beatLabel}`);
  }, 100);
}

function openCreateNoteFromReview() {
  if (!currentReviewRehearsalEntry || !currentReviewDetail) return;
  const events = currentReviewDetail.events || [];
  const evt = events[reviewState.selectedEventIndex];
  if (!evt) {
    alert("请先选择一个事件");
    return;
  }
  const section = state.sections.find(s => s.id === currentReviewRehearsalEntry.sectionId) || getCurrentSection();
  if (!section) return;
  createNoteFromReviewInfo.innerHTML = `
    <p>基于复盘事件创建批注任务：<strong>${evt.beatLabel} - ${getEventTitle(evt)}</strong></p>
    <p style="margin-top:4px;">段落：<strong>${section.name}</strong> · 时间：<strong>${formatTimestamp(evt.timestamp)}</strong></p>
  `;
  const mc = section.measureCount || 4;
  const evtMeasure = typeof evt.measure === "number" ? evt.measure : Math.floor(evt.beat / (section.beatsPerMeasure || 4));
  let optsHtml = '<option value="all">全段</option>';
  for (let i = 0; i < mc; i++) {
    optsHtml += `<option value="${i}" ${i === evtMeasure ? "selected" : ""}>第${i + 1}小节</option>`;
  }
  createNoteFromReviewTargetEl.innerHTML = optsHtml;
  const autoContent = `[复盘 ${evt.beatLabel}] ${getEventTitle(evt)}`;
  createNoteFromReviewContentEl.value = autoContent;
  createNoteFromReviewOverlay.style.display = "flex";
}

function closeCreateNoteFromReview() {
  createNoteFromReviewOverlay.style.display = "none";
}

function confirmCreateNoteFromReview() {
  if (!currentReviewRehearsalEntry) return;
  const content = createNoteFromReviewContentEl.value.trim();
  if (!content) {
    alert("请输入批注内容");
    return;
  }
  const section = state.sections.find(s => s.id === currentReviewRehearsalEntry.sectionId) || getCurrentSection();
  if (!section) {
    alert("找不到对应段落");
    return;
  }
  const originalSectionId = state.currentSectionId;
  state.currentSectionId = section.id;
  const type = createNoteFromReviewTypeEl.value;
  const target = createNoteFromReviewTargetEl.value;
  const assignee = createNoteFromReviewAssigneeEl.value;
  const priority = createNoteFromReviewPriorityEl.value;
  const practiceGoal = Number(createNoteFromReviewGoalEl.value) || 0;
  createCollabNote(content, type, target, assignee, priority, practiceGoal);
  state.currentSectionId = originalSectionId;
  save();
  render();
  if (currentReviewDetail) {
    renderReviewRelatedNotes(currentReviewRehearsalEntry, currentReviewDetail);
  }
  closeCreateNoteFromReview();
  alert("✅ 批注任务已创建！");
}

function diagnoseWeaknessFromCurrentReview() {
  if (!currentReviewDetail) return;
  if (!Array.isArray(currentReviewDetail.events) || currentReviewDetail.events.length === 0) {
    alert("当前复盘记录无事件数据，无法进行诊断（可能为摘要记录）");
    return;
  }
  const weakness = diagnoseWeaknessFromEvents(currentReviewDetail.events);
  currentReviewDetail.weakness = weakness;
  setReviewDetailForRehearsal(currentReviewDetail.id, currentReviewDetail);
  renderReviewWeakness(weakness);
  updateStorageInfo();
}

function exportReviewData() {
  if (!currentReviewRehearsalEntry || !currentReviewDetail) {
    alert("请先选择一条排练记录");
    return;
  }
  const exportData = {
    exportAt: new Date().toISOString(),
    version: 1,
    rehearsalEntry: currentReviewRehearsalEntry,
    reviewDetail: currentReviewDetail
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (currentReviewRehearsalEntry.sectionName || "复盘").replace(/[^\w\u4e00-\u9fa5]/g, "_");
  a.href = url;
  a.download = `复盘_${safeName}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function navigateTimelineEvent(direction) {
  const events = currentReviewDetail?.events || [];
  if (events.length === 0) return;
  let next = reviewState.selectedEventIndex;
  if (next < 0) {
    next = direction > 0 ? 0 : events.length - 1;
  } else {
    next = next + direction;
  }
  if (next >= 0 && next < events.length) {
    selectReviewEvent(next);
  }
}

if (reviewReviewBtn) {
  reviewReviewBtn.addEventListener("click", () => openReviewOverlay(null));
}
if (reviewCloseBtn) reviewCloseBtn.addEventListener("click", closeReviewOverlay);
if (reviewCancelBtn) reviewCancelBtn.addEventListener("click", closeReviewOverlay);
if (reviewJumpBtn) reviewJumpBtn.addEventListener("click", jumpFromReviewToBeat);
if (reviewCreateNoteBtn) reviewCreateNoteBtn.addEventListener("click", openCreateNoteFromReview);
if (reviewDiagnoseBtn) reviewDiagnoseBtn.addEventListener("click", diagnoseWeaknessFromCurrentReview);
if (reviewExportBtn) reviewExportBtn.addEventListener("click", exportReviewData);
if (timelinePrevBtn) timelinePrevBtn.addEventListener("click", () => navigateTimelineEvent(-1));
if (timelineNextBtn) timelineNextBtn.addEventListener("click", () => navigateTimelineEvent(1));
if (createNoteFromReviewCloseBtn) createNoteFromReviewCloseBtn.addEventListener("click", closeCreateNoteFromReview);
if (createNoteFromReviewCancelBtn) createNoteFromReviewCancelBtn.addEventListener("click", closeCreateNoteFromReview);
if (createNoteFromReviewConfirmBtn) createNoteFromReviewConfirmBtn.addEventListener("click", confirmCreateNoteFromReview);

reviewOverlay.addEventListener("click", (e) => {
  if (e.target === reviewOverlay) closeReviewOverlay();
});
createNoteFromReviewOverlay.addEventListener("click", (e) => {
  if (e.target === createNoteFromReviewOverlay) closeCreateNoteFromReview();
});

document.addEventListener("keydown", (e) => {
  if (!reviewState.active) return;
  if (e.key === "Escape") {
    if (createNoteFromReviewOverlay.style.display !== "none") {
      closeCreateNoteFromReview();
    } else {
      closeReviewOverlay();
    }
    e.preventDefault();
  }
  if (reviewContent.style.display !== "none" && reviewState.selectedRehearsalId) {
    if (e.key === "ArrowLeft") {
      navigateTimelineEvent(-1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      navigateTimelineEvent(1);
      e.preventDefault();
    } else if (e.key === "Enter" && !reviewJumpBtn.disabled) {
      jumpFromReviewToBeat();
      e.preventDefault();
    }
  }
});
