const storageKey = "wxyy-4-luogujing-grid";
const instruments = [
  { name: "大锣", token: "仓", freq: 180 },
  { name: "鼓", token: "冬", freq: 120 },
  { name: "钹", token: "才", freq: 360 },
  { name: "小锣", token: "台", freq: 520 }
];
const steps = 16;

const defaultState = {
  pieceName: "出场锣鼓-慢起",
  bpm: 96,
  loop: "",
  notes: [],
  pattern: instruments.map((instrument) => Array.from({ length: steps }, (_, index) => index % 4 === 0 ? instrument.token : "")),
  enabledInstruments: [true, true, true, true],
  saved: [],
  playCount: 0,
  lastPlayedAt: null,
  recentPlayedSection: ""
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

function getMeasureData() {
  return [0, 1, 2, 3].map((measure) => {
    const start = measure * 4;
    const cells = state.pattern.flatMap((row) => row.slice(start, start + 4));
    const filled = cells.filter(Boolean).length;
    const total = cells.length;
    const notesForMeasure = state.notes.filter((n) =>
      /第\s*([一二三四\d]+)\s*小节/.test(n) &&
      (parseInt(RegExp.$1) === measure + 1 ||
       ["一", "二", "三", "四"][measure] === RegExp.$1)
    );
    const instrumentCoverage = state.pattern.filter((row, idx) =>
      state.enabledInstruments[idx] && row.slice(start, start + 4).some(Boolean)
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
  const suggestions = [];
  const measures = getMeasureData();
  const focus = getFocusMeasures();
  const incomplete = measures.filter((m) => m.ratio < 1);
  const totalFilled = measures.reduce((s, m) => s + m.filled, 0);
  const totalCells = measures.reduce((s, m) => s + m.total, 0);
  const totalRatio = totalCells ? totalFilled / totalCells : 0;

  if (totalRatio < 0.3) {
    suggestions.push({ icon: "1", html: `建议先<strong>完善谱面</strong>，当前完成度不足三成。可从<strong>第1小节</strong>开始逐拍填入口令。` });
  } else if (focus.length > 0) {
    const topFocus = focus[0];
    const focusNames = focus.map((f) => `第${f.measure}小节`).join("、");
    suggestions.push({ icon: "2", html: `优先练<strong>${focusNames}</strong>，这${focus.length > 1 ? "几" : ""}处${topFocus.hasNotes ? "有批注标注且" : ""}密度/复杂度较高。` });
  }

  if (state.loop) {
    const loopNum = Number(state.loop) + 1;
    suggestions.push({ icon: "3", html: `当前循环设置为<strong>第${loopNum}小节</strong>，可使用"停止"切换范围后对比练习。` });
  } else if (state.notes.length > 0) {
    const matchedMeasures = [];
    state.notes.forEach((n) => {
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

  if (state.enabledInstruments.filter(Boolean).length < instruments.length) {
    const muted = instruments.filter((_, i) => !state.enabledInstruments[i]).map((i) => i.name).join("、");
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
  const now = new Date();
  dashboardTime.textContent = `${now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })} ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;

  const totalCells = instruments.length * steps;
  const filledCells = state.pattern.flat().filter(Boolean).length;
  const percent = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;
  completionBar.style.width = `${percent}%`;
  completionPercent.textContent = `${percent}%`;
  completionDetail.textContent = `${filledCells}/${totalCells} 个口令`;

  difficultyCount.textContent = state.notes.length;
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
  syncFields();
  renderGrid();
  renderVoicePanel();
  renderSidebars();
  renderDashboard();
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
  render();
});

document.querySelector("#playBtn").addEventListener("click", () => {
  if (timer) clearInterval(timer);
  playhead = currentRange()[0];
  state.playCount = (state.playCount || 0) + 1;
  state.lastPlayedAt = new Date().toISOString();
  state.recentPlayedSection = state.loop === "" ? "全段播放" : `第${Number(state.loop) + 1}小节循环`;
  save();
  tick();
  timer = setInterval(tick, 60000 / state.bpm);
  renderDashboard();
});

document.querySelector("#stopBtn").addEventListener("click", () => {
  clearInterval(timer);
  timer = null;
  document.querySelectorAll(".cell.playing").forEach((cell) => cell.classList.remove("playing"));
  renderDashboard();
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
  render();
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
