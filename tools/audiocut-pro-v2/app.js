/**
 * AudioCut Pro v2 — Engine
 * 100% client-side audio cutting & export
 */

// ====== STATE ======
const state = {
    files: [],
    currentIndex: -1,
    isPlaying: false,
    isPreviewing: false,
    audioCtx: null,
    sourceNode: null,
    startTime: 0,
    pauseOffset: 0,
    zoom: { scale: 1, offset: 0 },
    drag: null,
    lastExportResults: [],
    canvasSize: { cssW: 0, cssH: 0, dpr: 1 },
    peakCache: new WeakMap(), // AudioBuffer -> Float32Array
    waveformDirty: true,
    playheadTimer: null,
};

let rafId = null;

// ====== DOM REFS ======
const $ = id => document.getElementById(id);

const dom = {
    uploadView: $('uploadView'),
    editorView: $('editorView'),
    dropZone: $('dropZone'),
    fileInput: $('fileInput'),
    addFileInput: $('addFileInput'),
    addMoreBtn: $('addMoreBtn'),
    exportAllBtn: $('exportAllBtn'),
    exportSelectedBtn: $('exportSelectedBtn'),
    exportThisBtn: $('exportThisBtn'),
    fileCounter: $('fileCounter'),
    fileListCount: $('fileListCount'),
    fileListItems: $('fileListItems'),
    selectAllCheckbox: $('selectAllCheckbox'),
    currentFileName: $('currentFileName'),
    resetSelectionBtn: $('resetSelectionBtn'),
    undoBtn: $('undoBtn'),
    redoBtn: $('redoBtn'),
    removeFileBtn: $('removeFileBtn'),
    zoomOutBtn: $('zoomOutBtn'),
    zoomInBtn: $('zoomInBtn'),
    zoomFitBtn: $('zoomFitBtn'),
    zoomIndicator: $('zoomIndicator'),
    loadingIndicator: $('loadingIndicator'),
    waveformContainer: $('waveformContainer'),
    waveformCanvas: $('waveformCanvas'),
    seekTooltip: $('seekTooltip'),
    startTimeInput: $('startTimeInput'),
    endTimeInput: $('endTimeInput'),
    currentTimeDisplay: $('currentTimeDisplay'),
    durationDisplay: $('durationDisplay'),
    setStartBtn: $('setStartBtn'),
    setEndBtn: $('setEndBtn'),
    previewCutBtn: $('previewCutBtn'),
    playPauseBtn: $('playPauseBtn'),
    playIcon: $('playIcon'),
    pauseIcon: $('pauseIcon'),
    stopBtn: $('stopBtn'),
    seekBackBtn: $('seekBackBtn'),
    seekForwardBtn: $('seekForwardBtn'),
    prevBtn: $('prevBtn'),
    nextBtn: $('nextBtn'),
    navIndicators: $('navIndicators'),
    exportModal: $('exportModal'),
    exportStatus: $('exportStatus'),
    exportProgress: $('exportProgress'),
    exportDetail: $('exportDetail'),
    exportResults: $('exportResults'),
    exportCloseBtn: $('exportCloseBtn'),
    helpModal: $('helpModal'),
    helpCloseBtn: $('helpCloseBtn'),
    notification: $('notification'),
};

// ====== UTILS ======
function fmtTime(sec) {
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    if (h > 0) {
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
    }
    return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
function parseTime(str) {
    // Aceita: HH:MM:SS.mmm, MM:SS.mmm, SS.mmm, ou número simples
    const cleaned = str.trim().replace(',', '.');
    const parts = cleaned.split(':');
    if (parts.length === 1) return parseFloat(parts[0]) || 0;
    if (parts.length === 2) {
        const [m, s] = parts;
        return (parseFloat(m)||0)*60 + (parseFloat(s)||0);
    }
    if (parts.length === 3) {
        const [h, m, s] = parts;
        return (parseFloat(h)||0)*3600 + (parseFloat(m)||0)*60 + (parseFloat(s)||0);
    }
    return 0;
}
function notify(msg, type='info', duration=2500) {
    dom.notification.textContent = msg;
    dom.notification.className = `notification ${type}`;
    requestAnimationFrame(() => dom.notification.classList.add('show'));
    setTimeout(() => dom.notification.classList.remove('show'), duration);
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ====== AUDIO ENGINE ======
function ensureAudioCtx() {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
}

function stopPlayback() {
    if (state.sourceNode) { try { state.sourceNode.stop(); } catch(e){} state.sourceNode.disconnect(); state.sourceNode = null; }
    state.isPlaying = false; state.isPreviewing = false;
    state.pauseOffset = 0;
    if (state.playheadTimer) { clearTimeout(state.playheadTimer); state.playheadTimer = null; }
    updatePlayIcon();
    dom.previewCutBtn.classList.remove('preview-active');
}

function playRegion(startSec, endSec, loop=false) {
    ensureAudioCtx();
    stopPlayback();
    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) return;
    const dur = f.buffer.duration;
    const s = clamp(startSec, 0, dur);
    const e = clamp(endSec, s, dur);
    if (e - s < 0.01) { notify('Seleção muito curta para tocar', 'error'); return; }

    const src = state.audioCtx.createBufferSource();
    src.buffer = f.buffer;
    src.connect(state.audioCtx.destination);
    if (loop) {
        src.loop = true;
        src.loopStart = s;
        src.loopEnd = e;
    }
    src.start(0, s, e - s);
    state.sourceNode = src;
    state.startTime = state.audioCtx.currentTime - s;
    state.pauseOffset = s;
    state.isPlaying = true;
    state.isPreviewing = loop;
    updatePlayIcon();
    if (loop) dom.previewCutBtn.classList.add('preview-active');

    src.onended = () => {
        if (state.isPlaying && !loop) {
            state.isPlaying = false; state.pauseOffset = 0;
            updatePlayIcon();
        }
    };
}

function togglePlayPause() {
    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) return;
    if (state.isPlaying) {
        state.pauseOffset = getCurrentPlayTime();
        stopPlayback();
    } else {
        playRegion(state.pauseOffset || 0, f.buffer.duration, false);
    }
}

function getCurrentPlayTime() {
    if (!state.isPlaying || !state.audioCtx) return state.pauseOffset || 0;
    return state.audioCtx.currentTime - state.startTime;
}

function updatePlayIcon() {
    dom.playIcon.style.display = state.isPlaying ? 'none' : 'block';
    dom.pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
}

function updateTimeDisplay() {
    const f = state.files[state.currentIndex];
    if (!f) return;
    const t = getCurrentPlayTime();
    dom.currentTimeDisplay.textContent = fmtTime(clamp(t, 0, f.buffer?.duration||0));
    dom.startTimeInput.value = fmtTime(f.start);
    dom.endTimeInput.value = fmtTime(f.end);
    dom.durationDisplay.textContent = fmtTime(Math.max(0, f.end - f.start));
}

// ====== WAVEFORM RENDERING ======
// ====== CANVAS RESIZE (único, via ResizeObserver) ======
let resizeObs = null;
function initCanvasResize() {
    resizeObs = new ResizeObserver(entries => {
        for (const entry of entries) {
            const cr = entry.contentRect;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            if (state.canvasSize.cssW !== cr.width || state.canvasSize.cssH !== cr.height || state.canvasSize.dpr !== dpr) {
                state.canvasSize = { cssW: cr.width, cssH: cr.height, dpr };
                const canvas = dom.waveformCanvas;
                canvas.width = Math.round(cr.width * dpr);
                canvas.height = Math.round(cr.height * dpr);
                state.waveformDirty = true;
                scheduleDraw();
            }
        }
    });
    resizeObs.observe(dom.waveformContainer);
}

// ====== PEAK CACHE ======
function getCachedPeaks(buffer) {
    if (state.peakCache.has(buffer)) return state.peakCache.get(buffer);
    const ch = buffer.getChannelData(0);
    const width = 2000; // suficiente para zoom até 200x
    const samplesPerPixel = ch.length / width;
    const peaks = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
        let min = 0, max = 0;
        const from = Math.floor(x * samplesPerPixel);
        const to = Math.min(Math.floor((x + 1) * samplesPerPixel), ch.length);
        for (let i = from; i < to; i++) {
            const v = ch[i];
            if (v < min) min = v;
            if (v > max) max = v;
        }
        peaks[x * 2] = min;
        peaks[x * 2 + 1] = max;
    }
    state.peakCache.set(buffer, peaks);
    return peaks;
}

function getWaveformData(buffer, width, startSample, endSample) {
    const cached = getCachedPeaks(buffer);
    const chLen = buffer.getChannelData(0).length;
    const out = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
        const cx0 = (startSample + (x / width) * (endSample - startSample)) / chLen * (cached.length / 2);
        const cx1 = (startSample + ((x + 1) / width) * (endSample - startSample)) / chLen * (cached.length / 2);
        let min = 0, max = 0;
        const from = Math.floor(cx0);
        const to = Math.min(Math.ceil(cx1), cached.length / 2);
        for (let i = from; i < to; i++) {
            if (cached[i * 2] < min) min = cached[i * 2];
            if (cached[i * 2 + 1] > max) max = cached[i * 2 + 1];
        }
        out[x * 2] = min;
        out[x * 2 + 1] = max;
    }
    return out;
}

function amplitudeColor(ctx, amp) {
    const a = Math.abs(amp);
    if (a > 0.7) return '#f87171';      // high — red
    if (a > 0.35) return '#a3e635';     // mid — lime
    return '#22d3ee';                    // low — cyan
}

function drawWaveform(forceRedraw = false) {
    const canvas = dom.waveformCanvas;
    const ctx = canvas.getContext('2d');
    const cssW = state.canvasSize.cssW || canvas.clientWidth;
    const cssH = state.canvasSize.cssH || canvas.clientHeight;
    const dpr = state.canvasSize.dpr || 1;

    if (!cssW || !cssH) return;

    // Only resize canvas when dimensions actually changed (handled by ResizeObserver)
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        state.waveformDirty = true;
    }

    // Reset transform and scale once
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum áudio carregado', cssW / 2, cssH / 2);
        return;
    }

    const sr = f.buffer.sampleRate;
    const totalSamples = f.buffer.duration * sr;
    const viewSamples = totalSamples / state.zoom.scale;
    const maxOffset = Math.max(0, totalSamples - viewSamples);
    state.zoom.offset = clamp(state.zoom.offset, 0, maxOffset);

    const s0 = Math.floor(state.zoom.offset);
    const s1 = Math.min(totalSamples, Math.ceil(state.zoom.offset + viewSamples));

    const dirty = forceRedraw || state.waveformDirty;

    if (dirty) {
        state.waveformDirty = false;

        // Background grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
            const y = (cssH / 4) * i;
            ctx.moveTo(0, y);
            ctx.lineTo(cssW, y);
        }
        ctx.stroke();

        // Time grid
        const viewDur = (s1 - s0) / sr;
        const step = viewDur > 60 ? 10 : viewDur > 20 ? 5 : viewDur > 5 ? 1 : 0.5;
        const startSec = s0 / sr;
        const firstMark = Math.ceil(startSec / step) * step;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'left';
        for (let t = firstMark; t < startSec + viewDur; t += step) {
            const x = ((t - startSec) / viewDur) * cssW;
            if (x >= 0 && x <= cssW) {
                ctx.fillRect(x, 0, 1, cssH);
                ctx.fillText(fmtTime(t), x + 4, cssH - 6);
            }
        }

        // Peaks
        const peaks = getWaveformData(f.buffer, Math.floor(cssW), s0, s1);
        const centerY = cssH / 2;
        const ampScale = centerY * 0.9;
        const barW = Math.max(1, cssW / (peaks.length / 2) - 1);

        for (let x = 0; x < peaks.length / 2; x++) {
            const min = peaks[x * 2];
            const max = peaks[x * 2 + 1];
            const y0 = centerY - Math.abs(min) * ampScale;
            const y1 = centerY + Math.abs(max) * ampScale;
            const avgAmp = (Math.abs(min) + Math.abs(max)) / 2;
            ctx.fillStyle = amplitudeColor(ctx, avgAmp);
            ctx.globalAlpha = 0.65;
            ctx.fillRect(x * (cssW / (peaks.length / 2)), y0, barW, Math.max(1, y1 - y0));
            ctx.globalAlpha = 1;
        }

        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(cssW, centerY);
        ctx.stroke();
    }

    // Selection area (always draw on top)
    const startX = ((f.start * sr - s0) / viewSamples) * cssW;
    const endX = ((f.end * sr - s0) / viewSamples) * cssW;
    const selX0 = clamp(Math.min(startX, endX), 0, cssW);
    const selX1 = clamp(Math.max(startX, endX), 0, cssW);

    // Dim outside selection
    ctx.fillStyle = 'rgba(5, 8, 16, 0.45)';
    ctx.fillRect(0, 0, selX0, cssH);
    ctx.fillRect(selX1, 0, cssW - selX1, cssH);

    // Selection glow
    if (selX1 > selX0) {
        const grad = ctx.createLinearGradient(selX0, 0, selX1, 0);
        grad.addColorStop(0, 'rgba(34,211,238,0.08)');
        grad.addColorStop(0.5, 'rgba(129,140,248,0.06)');
        grad.addColorStop(1, 'rgba(192,132,252,0.08)');
        ctx.fillStyle = grad;
        ctx.fillRect(selX0, 0, selX1 - selX0, cssH);
    }

    // Handles
    drawHandle(ctx, selX0, cssH, '#22d3ee', 'INÍCIO');
    drawHandle(ctx, selX1, cssH, '#c084fc', 'FIM');

    // Playhead (overlay, always drawn)
    const curT = getCurrentPlayTime();
    const curX = ((curT * sr - s0) / viewSamples) * cssW;
    if (curX >= 0 && curX <= cssW) {
        ctx.save();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(curX, 0);
        ctx.lineTo(curX, cssH);
        ctx.stroke();
        ctx.restore();
    }
}

function drawHandle(ctx, x, h, color, label) {
    const handleW = 10;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillRect(x - handleW/2, 0, handleW, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, 14);
}

function scheduleDraw() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        drawWaveform();
        updateTimeDisplay();
        if (state.isPlaying) {
            if (state.playheadTimer) clearTimeout(state.playheadTimer);
            state.playheadTimer = setTimeout(() => drawWaveform(false), 50);
        }
    });
}

// ====== FILE MANAGEMENT ======
async function addFiles(fileList) {
    ensureAudioCtx();
    const newFiles = [];
    for (const file of fileList) {
        if (!file.type.startsWith('audio/')) continue;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await state.audioCtx.decodeAudioData(arrayBuffer);
            const id = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
            const f = {
                id, name: file.name, buffer: audioBuffer,
                sampleRate: audioBuffer.sampleRate,
                duration: audioBuffer.duration,
                start: 0, end: audioBuffer.duration,
                status: 'pending',
                history: [{ start: 0, end: audioBuffer.duration }],
                historyIndex: 0,
                selected: true,
            };
            newFiles.push(f);
        } catch (e) {
            notify(`Falha ao carregar "${file.name}": ${e.message}`, 'error', 4000);
        }
    }
    if (newFiles.length === 0) return;
    state.files.push(...newFiles);
    renderFileList();
    if (state.currentIndex === -1) switchToFile(0);
    else {
        updateFileCounter();
        updateNavDots();
    }
    dom.uploadView.classList.remove('active');
    dom.editorView.classList.add('active');
    notify(`${newFiles.length} arquivo(s) carregado(s)`);
}

function switchToFile(idx) {
    if (idx < 0 || idx >= state.files.length) return;
    stopPlayback();
    state.currentIndex = idx;
    state.zoom = { scale: 1, offset: 0 };
    state.waveformDirty = true;
    dom.currentFileName.textContent = state.files[idx].name;
    updateFileCounter();
    updateNavDots();
    renderFileList();
    updateUndoRedoButtons();
    scheduleDraw();
}

function removeCurrentFile() {
    if (state.currentIndex < 0) return;
    state.files.splice(state.currentIndex, 1);
    if (state.files.length === 0) {
        state.currentIndex = -1;
        dom.editorView.classList.remove('active');
        dom.uploadView.classList.add('active');
    } else {
        switchToFile(Math.min(state.currentIndex, state.files.length - 1));
    }
    renderFileList();
    updateNavDots();
}

function updateFileCounter() {
    const total = state.files.length;
    dom.fileCounter.textContent = total > 0 ? `Arquivo ${state.currentIndex + 1} de ${total}` : '';
    dom.fileListCount.textContent = total;
}

// ====== FILE LIST RENDERING ======
function renderFileList() {
    dom.fileListItems.innerHTML = '';
    state.files.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = `file-item ${i === state.currentIndex ? 'active' : ''}`;
        item.dataset.index = i;

        const statusClass = f.status === 'exported' ? 'exported' : (f.start !== 0 || f.end !== f.duration) ? 'cut' : 'pending';

        // Mini waveform bars
        let barsHtml = '';
        if (f.buffer) {
            const ch = f.buffer.getChannelData(0);
            const step = Math.floor(ch.length / 24);
            for (let b=0; b<24; b++) {
                let sum=0; const from=b*step, to=Math.min(from+step, ch.length);
                for (let s=from; s<to; s++) sum += Math.abs(ch[s]);
                const h = Math.max(2, (sum/(to-from)) * 24);
                barsHtml += `<div class="fi-bar" style="height:${h}px;opacity:${i===state.currentIndex?0.9:0.5}"></div>`;
            }
        }

        const cutDuration = Math.max(0, f.end - f.start);
        const meta = `${fmtTime(cutDuration)} / ${fmtTime(f.duration)}`;

        item.innerHTML = `
            <div class="fi-checkbox"><input type="checkbox" ${f.selected ? 'checked' : ''}></div>
            <div class="fi-thumb">${barsHtml}</div>
            <div class="fi-info">
                <div class="fi-name">${f.name}</div>
                <div class="fi-meta">${meta}</div>
            </div>
            <div class="fi-status ${statusClass}"></div>
        `;

        item.addEventListener('click', e => {
            if (e.target.type === 'checkbox') {
                f.selected = e.target.checked;
            } else {
                switchToFile(i);
            }
        });

        dom.fileListItems.appendChild(item);
    });
    dom.selectAllCheckbox.checked = state.files.length > 0 && state.files.every(f => f.selected);
}

function updateNavDots() {
    dom.navIndicators.innerHTML = '';
    state.files.forEach((f, i) => {
        const dot = document.createElement('div');
        dot.className = 'nav-dot' + (i === state.currentIndex ? ' active' : '');
        if (f.status === 'exported') dot.classList.add('exported');
        else if (f.start !== 0 || f.end !== f.duration) dot.classList.add('cut');
        dot.title = `${i+1}. ${f.name}`;
        dot.addEventListener('click', () => switchToFile(i));
        dom.navIndicators.appendChild(dot);
    });
}

// ====== UNDO / REDO ======
function pushHistory() {
    const f = state.files[state.currentIndex];
    if (!f) return;
    // Remove redo entries
    f.history = f.history.slice(0, f.historyIndex + 1);
    f.history.push({ start: f.start, end: f.end });
    f.historyIndex++;
    if (f.history.length > 50) { f.history.shift(); f.historyIndex--; }
    updateUndoRedoButtons();
}
function undo() {
    const f = state.files[state.currentIndex];
    if (!f || f.historyIndex <= 0) return;
    f.historyIndex--;
    const h = f.history[f.historyIndex];
    f.start = h.start; f.end = h.end;
    updateUndoRedoButtons();
    scheduleDraw();
    notify('Desfeito');
}
function redo() {
    const f = state.files[state.currentIndex];
    if (!f || f.historyIndex >= f.history.length - 1) return;
    f.historyIndex++;
    const h = f.history[f.historyIndex];
    f.start = h.start; f.end = h.end;
    updateUndoRedoButtons();
    scheduleDraw();
    notify('Refeito');
}
function updateUndoRedoButtons() {
    const f = state.files[state.currentIndex];
    dom.undoBtn.disabled = !f || f.historyIndex <= 0;
    dom.redoBtn.disabled = !f || f.historyIndex >= (f?.history?.length||0) - 1;
}

// ====== SELECTION LOGIC ======
function timeAtX(x, rect) {
    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) return 0;
    const sr = f.buffer.sampleRate;
    const totalSamples = f.buffer.duration * sr;
    const viewSamples = totalSamples / state.zoom.scale;
    const s0 = state.zoom.offset;
    return ((s0 + (x / rect.width) * viewSamples) / sr);
}
function xAtTime(t, rect) {
    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) return 0;
    const sr = f.buffer.sampleRate;
    const totalSamples = f.buffer.duration * sr;
    const viewSamples = totalSamples / state.zoom.scale;
    const s0 = state.zoom.offset;
    return ((t * sr - s0) / viewSamples) * rect.width;
}

function getHandleAtX(x, rect) {
    const f = state.files[state.currentIndex];
    if (!f) return null;
    const sx = xAtTime(f.start, rect);
    const ex = xAtTime(f.end, rect);
    const handleRadius = 14;
    if (Math.abs(x - sx) < handleRadius) return 'start';
    if (Math.abs(x - ex) < handleRadius) return 'end';
    return null;
}

function onWaveformPointerDown(e) {
    const rect = dom.waveformCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;

    const handle = getHandleAtX(x, rect);
    if (handle) {
        state.drag = { type: handle, x0: x, t0: handle==='start' ? state.files[state.currentIndex].start : state.files[state.currentIndex].end };
        return;
    }
    // Click on waveform = seek
    if (y > 0 && y < rect.height) {
        const t = timeAtX(x, rect);
        state.pauseOffset = clamp(t, 0, state.files[state.currentIndex]?.buffer?.duration || 0);
        if (state.isPlaying) playRegion(state.pauseOffset, state.files[state.currentIndex].buffer.duration);
        scheduleDraw();
        state.drag = { type: 'seek' };
    }
}
function onWaveformPointerMove(e) {
    const rect = dom.waveformCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const f = state.files[state.currentIndex];
    if (!f) return;

    // Tooltip
    const t = timeAtX(x, rect);
    dom.seekTooltip.textContent = fmtTime(clamp(t, 0, f.buffer?.duration||0));
    dom.seekTooltip.style.left = clamp(x, 30, rect.width-30) + 'px';
    dom.seekTooltip.classList.add('visible');

    if (!state.drag) {
        const handle = getHandleAtX(x, rect);
        dom.waveformContainer.style.cursor = handle ? 'ew-resize' : 'crosshair';
        return;
    }

    const newT = clamp(timeAtX(x, rect), 0, f.buffer?.duration || 0);
    if (state.drag.type === 'start') {
        f.start = Math.min(newT, f.end - 0.01);
    } else if (state.drag.type === 'end') {
        f.end = Math.max(newT, f.start + 0.01);
    } else if (state.drag.type === 'seek') {
        state.pauseOffset = newT;
    }
    scheduleDraw();
}
function onWaveformPointerUp() {
    if (state.drag && (state.drag.type === 'start' || state.drag.type === 'end')) {
        pushHistory();
    }
    state.drag = null;
    dom.seekTooltip.classList.remove('visible');
}

function zoomIn() {
    state.zoom.scale = Math.min(state.zoom.scale * 1.5, 200);
    state.waveformDirty = true;
    updateZoomIndicator();
    scheduleDraw();
}
function zoomOut() {
    state.zoom.scale = Math.max(state.zoom.scale / 1.5, 1);
    state.waveformDirty = true;
    updateZoomIndicator();
    scheduleDraw();
}
function zoomFit() {
    state.zoom = { scale: 1, offset: 0 };
    state.waveformDirty = true;
    updateZoomIndicator();
    scheduleDraw();
}
function updateZoomIndicator() {
    const pct = Math.min(100, (Math.log(state.zoom.scale) / Math.log(200)) * 100);
    dom.zoomIndicator.style.width = pct + '%';
}

// ====== EXPORT ======
function bufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * numChannels * bytesPerSample;
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    const offset = 44;
    const chData = [];
    for (let c = 0; c < numChannels; c++) chData.push(buffer.getChannelData(c));

    for (let i = 0; i < buffer.length; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = Math.max(-1, Math.min(1, chData[c][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset + (i * numChannels + c) * bytesPerSample, intSample, true);
        }
    }
    return arrayBuffer;
}

function encodeMp3(audioBuffer, kbps=192) {
    if (typeof lamejs === 'undefined') throw new Error('lamejs não carregado');
    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.numberOfChannels;
    const samples = audioBuffer.length;

    const mp3encoder = new lamejs.Mp3Encoder(ch, sr, kbps);
    const blockSize = 1152;
    const mp3Data = [];

    const left = audioBuffer.getChannelData(0);
    const right = ch > 1 ? audioBuffer.getChannelData(1) : left;

    for (let i = 0; i < samples; i += blockSize) {
        const len = Math.min(blockSize, samples - i);
        const l = new Int16Array(len);
        const r = new Int16Array(len);
        for (let j = 0; j < len; j++) {
            l[j] = Math.max(-32768, Math.min(32767, left[i+j] * 32767));
            r[j] = ch > 1 ? Math.max(-32768, Math.min(32767, right[i+j] * 32767)) : l[j];
        }
        const mp3buf = mp3encoder.encodeBuffer(l, r);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const end = mp3encoder.flush();
    if (end.length > 0) mp3Data.push(end);

    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    return blob;
}

function makeId3Tag(title, artist, comment) {
    // Simple ID3 v2.3 tag
    const encoder = new TextEncoder();
    const frames = [];
    const addFrame = (id, text) => {
        const data = encoder.encode(text);
        const size = data.length + 1; // +1 for BOM/encoding byte
        const header = new Uint8Array(10);
        for (let i=0; i<4; i++) header[i] = id.charCodeAt(i);
        header[4] = (size >> 24) & 0xFF; header[5] = (size >> 16) & 0xFF;
        header[6] = (size >> 8) & 0xFF; header[7] = size & 0xFF;
        const body = new Uint8Array(size);
        body[0] = 1; // UTF-16 with BOM encoding
        body.set(data, 1);
        frames.push(header, body);
    };
    if (title) addFrame('TIT2', title);
    if (artist) addFrame('TPE1', artist);
    if (comment) addFrame('COMM', comment);

    let total = 10; // header
    frames.forEach(f => total += f.length);
    const tag = new Uint8Array(total);
    tag.set(encoder.encode('ID3'));
    tag[3] = 3; tag[4] = 0; // version 2.3
    tag[6] = 0; // flags
    const sz = total - 10;
    tag[7] = (sz >> 21) & 0x7F; tag[8] = (sz >> 14) & 0x7F;
    tag[9] = (sz >> 7) & 0x7F; tag[10] = sz & 0x7F;
    let off = 10;
    frames.forEach(f => { tag.set(f, off); off += f.length; });
    return tag;
}

async function exportFiles(indices) {
    const targets = indices.map(i => state.files[i]).filter(Boolean);
    if (targets.length === 0) { notify('Nenhum arquivo selecionado', 'error'); return; }

    dom.exportModal.style.display = 'flex';
    dom.exportProgress.style.width = '0%';
    dom.exportResults.innerHTML = '';
    dom.exportCloseBtn.style.display = 'none';
    dom.exportStatus.textContent = `Exportando 0 de ${targets.length}…`;
    state.lastExportResults = [];

    let done = 0;
    for (let ti = 0; ti < targets.length; ti++) {
        const f = targets[ti];
        dom.exportDetail.textContent = f.name;
        try {
            const sr = f.buffer.sampleRate;
            const ch = f.buffer.numberOfChannels;
            const startSample = Math.floor(f.start * sr);
            const endSample = Math.floor(f.end * sr);
            const len = endSample - startSample;

            const sliced = state.audioCtx.createBuffer(ch, len, sr);
            for (let c = 0; c < ch; c++) {
                sliced.getChannelData(c).set(f.buffer.getChannelData(c).subarray(startSample, endSample));
            }

            const mp3Blob = encodeMp3(sliced, 192);
            // Prepend simple ID3 tag
            const tag = makeId3Tag(
                f.name.replace(/\.[^.]+$/, '') + '_cut',
                'AudioCut Pro v2',
                `Corte de ${fmtTime(f.start)} a ${fmtTime(f.end)}`
            );
            const finalBlob = new Blob([tag, mp3Blob], { type: 'audio/mpeg' });

            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = f.name.replace(/\.[^.]+$/, '') + '_cut.mp3';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            f.status = 'exported';
            state.lastExportResults.push({ name: f.name, ok: true });
        } catch (e) {
            state.lastExportResults.push({ name: f.name, ok: false, error: e.message });
        }
        done++;
        dom.exportProgress.style.width = (done / targets.length * 100) + '%';
        dom.exportStatus.textContent = `Exportando ${done} de ${targets.length}…`;
    }

    // Show results
    dom.exportResults.innerHTML = state.lastExportResults.map(r =>
        `<div class="export-result-item">
            <span>${r.name}</span>
            <span class="${r.ok ? 'success' : 'error'}">${r.ok ? '✓ OK' : '✗ ' + r.error}</span>
        </div>`
    ).join('');
    dom.exportStatus.textContent = `Exportação concluída — ${state.lastExportResults.filter(r=>r.ok).length}/${targets.length} sucesso`;
    dom.exportCloseBtn.style.display = 'inline-flex';
    renderFileList();
    updateNavDots();
}

// ====== EVENTS ======
// Upload
dom.dropZone.addEventListener('click', () => dom.fileInput.click());
dom.fileInput.addEventListener('change', e => addFiles(e.target.files));
dom.addMoreBtn.addEventListener('click', () => dom.addFileInput.click());
dom.addFileInput.addEventListener('change', e => addFiles(e.target.files));

// Drag & drop
dom.dropZone.addEventListener('dragover', e => { e.preventDefault(); dom.dropZone.classList.add('dragover'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('dragover'));
dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.dropZone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
});

// Prevent drops on editor
dom.editorView.addEventListener('dragover', e => e.preventDefault());
dom.editorView.addEventListener('drop', e => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
});

// Controls
dom.playPauseBtn.addEventListener('click', togglePlayPause);
dom.stopBtn.addEventListener('click', () => { stopPlayback(); state.pauseOffset = 0; scheduleDraw(); });
dom.seekBackBtn.addEventListener('click', () => { state.pauseOffset = Math.max(0, (state.pauseOffset||0) - 5); if (state.isPlaying) playRegion(state.pauseOffset, state.files[state.currentIndex]?.buffer?.duration||0); scheduleDraw(); });
dom.seekForwardBtn.addEventListener('click', () => { const d = state.files[state.currentIndex]?.buffer?.duration||0; state.pauseOffset = Math.min(d, (state.pauseOffset||0) + 5); if (state.isPlaying) playRegion(state.pauseOffset, d); scheduleDraw(); });

dom.setStartBtn.addEventListener('click', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    f.start = clamp(state.pauseOffset || 0, 0, f.end - 0.01);
    pushHistory(); scheduleDraw(); notify('Início definido: ' + fmtTime(f.start));
});
dom.setEndBtn.addEventListener('click', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    f.end = clamp(state.pauseOffset || 0, f.start + 0.01, f.duration);
    pushHistory(); scheduleDraw(); notify('Fim definido: ' + fmtTime(f.end));
});
dom.resetSelectionBtn.addEventListener('click', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    f.start = 0; f.end = f.duration;
    pushHistory(); scheduleDraw(); notify('Seleção resetada');
});

dom.previewCutBtn.addEventListener('click', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    if (state.isPreviewing) { stopPlayback(); return; }
    playRegion(f.start, f.end, true);
    notify('Preview do corte em loop');
});

dom.exportThisBtn.addEventListener('click', () => exportFiles([state.currentIndex]));
dom.exportAllBtn.addEventListener('click', () => exportFiles(state.files.map((_,i)=>i)));
dom.exportSelectedBtn.addEventListener('click', () => {
    const sel = state.files.map((f,i) => f.selected ? i : -1).filter(i => i >= 0);
    if (sel.length === 0) { notify('Nenhum arquivo selecionado', 'error'); return; }
    exportFiles(sel);
});

dom.exportCloseBtn.addEventListener('click', () => dom.exportModal.style.display = 'none');

// Undo/redo
dom.undoBtn.addEventListener('click', undo);
dom.redoBtn.addEventListener('click', redo);

// Remove file
dom.removeFileBtn.addEventListener('click', () => {
    const f = state.files[state.currentIndex];
    if (confirm(`Remover "${f?.name}" da fila?`)) removeCurrentFile();
});

// Nav
dom.prevBtn.addEventListener('click', () => switchToFile(state.currentIndex - 1));
dom.nextBtn.addEventListener('click', () => switchToFile(state.currentIndex + 1));

// Zoom
dom.zoomInBtn.addEventListener('click', zoomIn);
dom.zoomOutBtn.addEventListener('click', zoomOut);
dom.zoomFitBtn.addEventListener('click', zoomFit);

// Time inputs
dom.startTimeInput.addEventListener('change', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    const t = parseTime(dom.startTimeInput.value);
    f.start = clamp(t, 0, f.end - 0.01);
    pushHistory(); scheduleDraw();
});
dom.endTimeInput.addEventListener('change', () => {
    const f = state.files[state.currentIndex]; if (!f) return;
    const t = parseTime(dom.endTimeInput.value);
    f.end = clamp(t, f.start + 0.01, f.duration);
    pushHistory(); scheduleDraw();
});

// Select all
dom.selectAllCheckbox.addEventListener('change', () => {
    const v = dom.selectAllCheckbox.checked;
    state.files.forEach(f => f.selected = v);
    renderFileList();
});

// Waveform interaction
dom.waveformCanvas.addEventListener('mousedown', onWaveformPointerDown);
dom.waveformCanvas.addEventListener('mousemove', onWaveformPointerMove);
window.addEventListener('mouseup', onWaveformPointerUp);
dom.waveformCanvas.addEventListener('touchstart', e => { e.preventDefault(); onWaveformPointerDown(e); }, {passive:false});
dom.waveformCanvas.addEventListener('touchmove', e => { e.preventDefault(); onWaveformPointerMove(e); }, {passive:false});
window.addEventListener('touchend', onWaveformPointerUp);

// Wheel zoom + pan
dom.waveformContainer.addEventListener('wheel', e => {
    e.preventDefault();
    const f = state.files[state.currentIndex];
    if (!f || !f.buffer) return;
    const rect = dom.waveformCanvas.getBoundingClientRect();
    const hoverTime = timeAtX(e.clientX - rect.left, rect);
    const totalSamples = f.buffer.duration * f.buffer.sampleRate;

    if (e.ctrlKey || e.metaKey) {
        // Pan
        const viewSamples = totalSamples / state.zoom.scale;
        state.zoom.offset = clamp(state.zoom.offset + (e.deltaY > 0 ? 1 : -1) * viewSamples * 0.05, 0, Math.max(0, totalSamples - viewSamples));
    } else {
        // Zoom
        const oldScale = state.zoom.scale;
        state.zoom.scale = clamp(oldScale * (e.deltaY > 0 ? 0.85 : 1.18), 1, 200);
        // Zoom towards cursor
        const newView = totalSamples / state.zoom.scale;
        const oldView = totalSamples / oldScale;
        const ratio = hoverTime / f.buffer.duration;
        state.zoom.offset = clamp(state.zoom.offset + ratio * (oldView - newView), 0, Math.max(0, totalSamples - newView));
    }
    state.waveformDirty = true;
    updateZoomIndicator();
    scheduleDraw();
}, { passive: false });

// Keyboard
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') {
        if (e.key === 'Escape') e.target.blur();
        return;
    }

    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (k === ' ' && !ctrl) { e.preventDefault(); togglePlayPause(); }
    else if (k === 's' || k === 'S') { e.preventDefault(); stopPlayback(); state.pauseOffset = 0; scheduleDraw(); }
    else if (k === '[') { e.preventDefault(); dom.setStartBtn.click(); }
    else if (k === ']') { e.preventDefault(); dom.setEndBtn.click(); }
    else if (k === 'ArrowLeft') {
        e.preventDefault();
        const d = state.files[state.currentIndex]?.buffer?.duration||0;
        const step = e.shiftKey ? 0.01 : 5;
        state.pauseOffset = Math.max(0, (state.pauseOffset||0) - step);
        if (state.isPlaying) playRegion(state.pauseOffset, d);
        scheduleDraw();
    }
    else if (k === 'ArrowRight') {
        e.preventDefault();
        const d = state.files[state.currentIndex]?.buffer?.duration||0;
        const step = e.shiftKey ? 0.01 : 5;
        state.pauseOffset = Math.min(d, (state.pauseOffset||0) + step);
        if (state.isPlaying) playRegion(state.pauseOffset, d);
        scheduleDraw();
    }
    else if (k === 'c' || k === 'C') { e.preventDefault(); dom.previewCutBtn.click(); }
    else if (ctrl && k === 's') { e.preventDefault(); dom.exportThisBtn.click(); }
    else if (ctrl && k === 'z') { e.preventDefault(); undo(); }
    else if (ctrl && k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'Delete') { e.preventDefault(); dom.removeFileBtn.click(); }
    else if (k === 'n' || k === 'N') { e.preventDefault(); switchToFile(state.currentIndex + 1); }
    else if (k === 'p' || k === 'P') { e.preventDefault(); switchToFile(state.currentIndex - 1); }
    else if (k === 'a' || k === 'A') { e.preventDefault(); dom.addFileInput.click(); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); zoomFit(); }
    else if (k === '+' || k === '=') { e.preventDefault(); zoomIn(); }
    else if (k === '-' || k === '_') { e.preventDefault(); zoomOut(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); dom.resetSelectionBtn.click(); }
    else if (k === '?') { e.preventDefault(); dom.helpModal.style.display = 'flex'; }
    else if (k === 'Escape') {
        dom.exportModal.style.display = 'none';
        dom.helpModal.style.display = 'none';
        if (state.isPreviewing) stopPlayback();
    }
});

// Help
dom.helpCloseBtn.addEventListener('click', () => dom.helpModal.style.display = 'none');

// Resize
window.addEventListener('resize', () => scheduleDraw());

// ====== INIT ======
updateZoomIndicator();
initCanvasResize();
scheduleDraw();

// Add help button dynamically to header
const helpBtn = document.createElement('button');
helpBtn.id = 'helpBtn';
helpBtn.className = 'btn btn-ghost';
helpBtn.innerHTML = '?';
helpBtn.title = 'Atalhos (?)';
helpBtn.addEventListener('click', () => dom.helpModal.style.display = 'flex');
document.querySelector('.header-right').appendChild(helpBtn);
