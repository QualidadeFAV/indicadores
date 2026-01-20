const API_URL = "https://script.google.com/macros/s/AKfycbw_bHMpDh_8hUZvr0LbWA-IGfPrMmfEbkKN0he_n1FSkRdZRXOfFiGdNv_5G8rOq-bs/exec";

lucide.createIcons();
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let fullDB = { "2025": [], "2026": [] };
let isNewSectorMode = false;
let chartInstance = null;
let currentMetricId = null;
let CURRENT_YEAR = '2025';
let DEADLINE_DAY = parseInt(localStorage.getItem('fav_deadline')) || 15;

const iconMap = {
    "Atendimento": "users",
    "Centro Cirúrgico": "scissors",
    "TI": "monitor",
    "DGG": "building",
    "SCIH": "shield-alert",
    "POA": "file-bar-chart",
    "Comunicação": "megaphone",
    "Hotelaria": "bed",
    "Manutenção": "wrench",
    "Farmácia": "pill",
    "Laboratório": "flask-conical",
    "Engenharia Clínica": "activity",
    "Horários Médicos": "clock",
    "Marcação": "calendar-check",
    "Projetos Externos": "globe"
};

window.onload = () => { loadFromDrive(); };

function setYear(year) {
    CURRENT_YEAR = year;
    document.getElementById('year-label').innerText = year;
    document.querySelectorAll('.year-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${year}`).classList.add('active');
    renderApp(document.querySelector('.nav-item.active') ? document.querySelector('.nav-item.active').innerText.trim() : 'Todos');
}

function importFrom2025() {
    if (confirm("Copiar estrutura de 2025 para 2026?")) {
        const baseData = fullDB['2025'];
        const newData = baseData.map(item => ({
            id: Date.now() + Math.random(),
            sector: item.sector,
            name: item.name,
            logic: item.logic,
            meta: item.meta,
            format: item.format,
            data: Array(12).fill(null),
            dates: Array(12).fill(null),
            meta_history: []
        }));
        fullDB['2026'] = newData;
        saveToDrive();
        renderApp();
    }
}

function getDataForCurrentYear() { return fullDB[CURRENT_YEAR] || []; }

async function loadFromDrive() {
    document.getElementById('loading-overlay').style.display = 'flex';
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        fullDB = Array.isArray(data) ? { "2025": data, "2026": [] } : data;
        if (!fullDB["2025"]) fullDB["2025"] = [];
        if (!fullDB["2026"]) fullDB["2026"] = [];
        renderApp();
    } catch (err) { alert("Erro de conexão."); } finally { document.getElementById('loading-overlay').style.display = 'none'; }
}

async function saveToDrive() {
    showToast("Salvando...");
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify(fullDB) });
        showToast("Sincronizado!");
    } catch (err) { showToast("Erro ao salvar!"); }
}

function renderApp(filter = 'Todos') {
    updateSidebar(filter);
    renderTable(filter);
}

function updateSidebar(activeFilter) {
    const currentData = getDataForCurrentYear();
    const menu = document.getElementById('sidebar-menu');
    const uniqueSectors = currentData.length > 0 ? [...new Set(currentData.map(i => i.sector))].sort() : [];
    let html = `<button class="nav-item ${activeFilter === 'Todos' ? 'active' : ''}" onclick="renderApp('Todos')"><i data-lucide="layout-grid" size="16"></i> <span>Todos</span></button>`;
    uniqueSectors.forEach(sec => {
        const icon = iconMap[sec] || "folder";
        html += `<button class="nav-item ${activeFilter === sec ? 'active' : ''}" onclick="renderApp('${sec}')"><i data-lucide="${icon}" size="16"></i> <span>${sec}</span></button>`;
    });
    menu.innerHTML = html;
    lucide.createIcons();
}

function renderTable(filter) {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const tableElement = document.querySelector('table');
    tbody.innerHTML = '';

    const currentData = getDataForCurrentYear();
    if (currentData.length === 0) {
        tableElement.style.display = 'none';
        emptyState.style.display = 'flex';
        document.getElementById('empty-year').innerText = CURRENT_YEAR;
        if (CURRENT_YEAR === '2026' && fullDB['2025'].length > 0) document.querySelector('.btn-import').style.display = 'flex';
        else document.querySelector('.btn-import').style.display = 'none';
        return;
    } else {
        tableElement.style.display = 'table';
        emptyState.style.display = 'none';
    }

    const sectors = filter === 'Todos' ? [...new Set(currentData.map(i => i.sector))].sort() : [filter];

    sectors.forEach(sec => {
        const items = currentData.filter(i => i.sector === sec);
        if (items.length === 0) return;
        const header = document.createElement('tr');
        header.className = 'sector-row';
        header.innerHTML = `<td colspan="14">${sec}</td>`;
        tbody.appendChild(header);

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.onclick = () => openDetails(item.id);
            let html = `<td class="sticky-col col-name" title="${item.name}">${item.name}</td>`;
            html += `<td class="sticky-col col-meta">${formatVal(item.meta, item.format)}</td>`;
            for (let i = 0; i < 12; i++) {
                const val = item.data[i];
                const cls = getStatus(val, item.meta, item.logic, item.format);
                let arrow = "";
                if (item.format !== 'time' && i > 0 && item.data[i] !== null && item.data[i - 1] !== null) {
                    const diff = item.data[i] - item.data[i - 1];
                    if (diff > 0) arrow = "▲";
                    else if (diff < 0) arrow = "▼";
                }
                html += `<td class="${cls}">${formatVal(val, item.format)}<span class="trend-arrow">${arrow}</span></td>`;
            }
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    });
}

function openDetails(id) {
    currentMetricId = id;
    const item = getDataForCurrentYear().find(i => i.id === id);
    if (!item) return;

    document.getElementById('modalTitle').innerText = `${item.name}`;

    // POPULA A META E O BADGE DE LÓGICA
    document.getElementById('viewMetaDisplay').innerText = formatVal(item.meta, item.format);
    const logicText = item.logic === 'maior' ? 'Maior Melhor ↑' : 'Menor Melhor ↓';
    document.getElementById('viewLogicBadge').innerText = logicText;

    const valid = item.data.filter(v => v !== null && v !== "");

    if (valid.length > 0) {
        const last = valid[valid.length - 1];
        let hits = 0;
        valid.forEach(v => { if (getStatus(v, item.meta, item.logic, item.format) === 'good') hits++; });

        document.getElementById('viewLast').innerText = formatVal(last, item.format);
        if (item.format === 'time') document.getElementById('viewAvg').innerText = "-";
        else {
            const avg = valid.reduce((a, b) => a + parseFloat(b), 0) / valid.length;
            document.getElementById('viewAvg').innerText = formatVal(avg, item.format);
        }
        document.getElementById('viewTarget').innerText = Math.round((hits / valid.length) * 100) + '%';
    } else {
        document.getElementById('viewLast').innerText = "-";
        document.getElementById('viewAvg').innerText = "-";
        document.getElementById('viewTarget').innerText = "-";
    }

    const dates = item.dates || Array(12).fill(null);
    let onTimeCount = 0;
    let totalDeliveries = 0;
    let timelineHTML = "";

    dates.forEach((dateStr, idx) => {
        const monthName = months[idx].substring(0, 3);
        let statusClass = "empty";
        let tooltip = "Pendente";
        if (item.data[idx] !== null && item.data[idx] !== "") {
            totalDeliveries++;
            if (dateStr) {
                const day = parseInt(dateStr.split('-')[2]);
                if (day <= DEADLINE_DAY) {
                    onTimeCount++;
                    statusClass = "ok";
                    tooltip = `No prazo: ${dateStr}`;
                } else {
                    statusClass = "late";
                    tooltip = `Atrasado: ${dateStr}`;
                }
            } else {
                statusClass = "empty";
                tooltip = "Sem data de entrega";
            }
        }
        timelineHTML += `<div class="timeline-item" title="${tooltip}"><div class="timeline-dot ${statusClass}"></div><div class="timeline-label">${monthName}</div></div>`;
    });
    document.getElementById('deliveryTimeline').innerHTML = timelineHTML;

    const puncRate = totalDeliveries > 0 ? Math.round((onTimeCount / totalDeliveries) * 100) : 0;
    document.getElementById('viewPunc').innerText = puncRate + "%";
    const badgeEl = document.getElementById('puncBadge');
    if (totalDeliveries === 0) badgeEl.innerHTML = '<span class="badge badge-warn">Sem dados</span>';
    else if (puncRate === 100) badgeEl.innerHTML = '<span class="badge badge-good">Impecável</span>';
    else if (puncRate >= 70) badgeEl.innerHTML = '<span class="badge badge-warn">Atenção</span>';
    else badgeEl.innerHTML = '<span class="badge badge-bad">Crítico</span>';

    renderChart(item, item.data);
    switchToView();
    document.getElementById('modalOverlay').classList.add('open');
}

// ... [FUNÇÕES MODAIS E DE SALVAMENTO] ...
function openCreateModal() {
    currentMetricId = null;
    document.getElementById('modalOverlay').classList.add('open');
    switchToEdit(true);
}

function switchToView() {
    document.getElementById('viewMode').style.display = 'block';
    document.getElementById('viewFooter').style.display = 'flex';
    document.getElementById('editMode').style.display = 'none';
    document.getElementById('editFooter').style.display = 'none';
    const item = getDataForCurrentYear().find(i => i.id === currentMetricId);
    if (item) document.getElementById('modalTitle').innerText = `${item.name}`;
}

function switchToEdit(isNew = false) {
    document.getElementById('viewMode').style.display = 'none';
    document.getElementById('viewFooter').style.display = 'none';
    document.getElementById('editMode').style.display = 'block';
    document.getElementById('editFooter').style.display = 'flex';
    const inputs = document.getElementById('monthInputsContainer');
    inputs.innerHTML = '';
    populateSectorSelect();
    isNewSectorMode = false;
    document.getElementById('inp-sector').style.display = 'block';
    document.getElementById('inp-new-sector').style.display = 'none';
    document.getElementById('meta-history-container').style.display = 'none';
    document.getElementById('lbl-monthly-values').innerText = `Valores (${CURRENT_YEAR})`;
    const yearGroup = document.getElementById('year-selector-group');
    if (isNew) {
        document.getElementById('modalTitle').innerText = `Novo Indicador`;
        yearGroup.style.display = 'block';
        document.getElementById('inp-year').value = CURRENT_YEAR;
        document.getElementById('inp-id').value = "";
        document.getElementById('inp-name').value = "";
        document.getElementById('inp-meta').value = "";
        document.getElementById('btn-delete').style.display = 'none';
        months.forEach((m, i) => inputs.innerHTML += createMonthInput(i, m, '', ''));
    } else {
        yearGroup.style.display = 'none';
        const item = getDataForCurrentYear().find(i => i.id === currentMetricId);
        document.getElementById('modalTitle').innerText = "Editar";
        document.getElementById('inp-id').value = item.id;
        document.getElementById('inp-name').value = item.name;
        document.getElementById('inp-sector').value = item.sector;
        document.getElementById('inp-logic').value = item.logic;
        document.getElementById('inp-meta').value = item.meta;
        document.getElementById('inp-format').value = item.format;
        document.getElementById('btn-delete').style.display = 'block';
        const dates = item.dates || Array(12).fill(null);
        months.forEach((m, i) => inputs.innerHTML += createMonthInput(i, m, item.data[i], dates[i]));
        renderMetaHistory(item.meta_history);
    }
}

function createMonthInput(i, m, val, dateVal) {
    const v = val !== null && val !== undefined ? val : '';
    const d = dateVal || '';
    let borderClass = "";
    if (d) {
        const day = parseInt(d.split('-')[2]);
        borderClass = day > DEADLINE_DAY ? "late" : "ontime";
    }
    return `<div class="month-item"><div class="month-label"><span>${m}</span>${d ? (borderClass==='late'?'<span style="color:var(--punc-bad)">⏱️</span>':'<span style="color:var(--punc-good)">✓</span>') : ''}</div><input type="text" id="m-${i}" class="month-input-val" value="${v}" placeholder="-"><input type="date" id="d-${i}" class="date-mini ${borderClass}" value="${d}"></div>`;
}

function saveMetric() {
    const id = document.getElementById('inp-id').value;
    const name = document.getElementById('inp-name').value;
    let sector = isNewSectorMode ? document.getElementById('inp-new-sector').value : document.getElementById('inp-sector').value;
    const logic = document.getElementById('inp-logic').value;
    const fmt = document.getElementById('inp-format').value;
    const chosenYear = document.getElementById('inp-year').value;
    const rawMeta = document.getElementById('inp-meta').value;
    let meta = rawMeta;
    if (fmt !== 'time' && rawMeta !== "") { meta = parseFloat(rawMeta); if (isNaN(meta)) meta = 0; }
    if (!name || !sector) { alert("Preencha Nome e Setor."); return; }
    const dataArr = [];
    const datesArr = [];
    for (let i = 0; i < 12; i++) {
        const val = document.getElementById(`m-${i}`).value;
        const date = document.getElementById(`d-${i}`).value;
        if (fmt === 'time') dataArr.push(val === "" ? null : val);
        else dataArr.push(val === "" ? null : parseFloat(val));
        datesArr.push(date === "" ? null : date);
    }
    let history = [];
    if (id) { const oldItem = fullDB[CURRENT_YEAR].find(i => i.id == parseInt(id)); if (oldItem) { history = oldItem.meta_history || []; if (oldItem.meta != meta) history.push({ date: new Date().toLocaleDateString('pt-BR'), value: oldItem.meta }); } }
    const createObj = (d, dt, hist) => ({ id: id ? parseInt(id) : Date.now() + Math.random(), name, sector, logic, meta: meta, format: fmt, data: d, dates: dt, meta_history: hist || [] });
    if (id) {
        const idx = fullDB[CURRENT_YEAR].findIndex(i => i.id == parseInt(id));
        if (idx !== -1) fullDB[CURRENT_YEAR][idx] = createObj(dataArr, datesArr, history);
        currentMetricId = fullDB[CURRENT_YEAR][idx].id;
        openDetails(currentMetricId);
    } else {
        if (chosenYear === '2025') {
            fullDB['2025'].push(createObj(dataArr, datesArr, []));
            fullDB['2026'].push(createObj(Array(12).fill(null), Array(12).fill(null), []));
        } else { fullDB['2026'].push(createObj(dataArr, datesArr, [])); }
        closeModal();
    }
    if (!id && CURRENT_YEAR !== chosenYear) setYear(chosenYear);
    else renderApp('Todos');
    saveToDrive();
}

function timeToDecimal(t) { if (!t || typeof t !== 'string' || !t.includes(':')) return 0; const parts = t.split(':'); return parseFloat(parts[0]) + (parseFloat(parts[1]) / 60); }

function renderChart(item, dataArr) {
    const ctx = document.getElementById('detailsChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const cData = dataArr.map(v => { if (item.format === 'time') return timeToDecimal(v); if (item.format === 'percent' && Math.abs(v) <= 1 && v !== 0) return v * 100; return v; });
    let cMeta = item.meta;
    if (item.format === 'time') cMeta = timeToDecimal(item.meta);
    else if (item.format === 'percent' && Math.abs(item.meta) <= 1 && item.meta !== 0) cMeta = item.meta * 100;
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    chartInstance = new Chart(ctx, { type: 'line', data: { labels: months, datasets: [{ label: 'Real', data: cData, borderColor: '#3b82f6', backgroundColor: gradient, borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 }, { label: 'Meta', data: Array(12).fill(cMeta), borderColor: '#ef4444', borderWidth: 2, borderDash: [4, 4], pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#27272a' }, ticks: { color: '#555', font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: '#555', font: { size: 10 } } } }, plugins: { legend: { display: false } } } });
}

function populateSectorSelect() {
    const sel = document.getElementById('inp-sector');
    const unique = [...new Set(getDataForCurrentYear().map(i => i.sector))].sort();
    sel.innerHTML = '';
    if (unique.length === 0) sel.innerHTML = '<option value="Geral">Geral</option>';
    unique.forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
}

function toggleNewSector() {
    isNewSectorMode = !isNewSectorMode;
    document.getElementById('inp-sector').style.display = isNewSectorMode ? 'none' : 'block';
    document.getElementById('inp-new-sector').style.display = isNewSectorMode ? 'block' : 'none';
}

function renderMetaHistory(history) {
    const c = document.getElementById('meta-history-container');
    if (!history || !history.length) { c.innerHTML = '<div style="font-size:0.7rem; color:#555; padding:5px">Sem histórico</div>'; return; }
    let h = '';
    history.forEach(x => h += `<div class="meta-history-item"><span>${x.date}</span><span>${x.value}</span></div>`);
    c.innerHTML = h;
}

function toggleMetaHistory() {
    const el = document.getElementById('meta-history-container');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function deleteMetric() {
    if (confirm("Excluir?")) {
        fullDB[CURRENT_YEAR] = fullDB[CURRENT_YEAR].filter(i => i.id !== currentMetricId);
        closeModal();
        renderApp('Todos');
        saveToDrive();
    }
}

function changeDeadlineConfig() {
    const n = prompt("Novo dia limite:", DEADLINE_DAY);
    if (n && !isNaN(n)) {
        DEADLINE_DAY = parseInt(n);
        localStorage.setItem('fav_deadline', DEADLINE_DAY);
        renderApp(document.querySelector('.nav-item.active') ? document.querySelector('.nav-item.active').innerText.trim() : 'Todos');
    }
}

function formatVal(val, fmt) { if (val === null || val === "") return ""; if (fmt === 'time') return val; const num = parseFloat(val); if (fmt === 'percent') { const p = (Math.abs(num) <= 1 && num !== 0) ? num * 100 : num; return parseFloat(p.toFixed(2)).toLocaleString('pt-BR') + '%'; } return num.toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }

function getStatus(val, meta, logic, fmt) {
    if (val === null || val === "") return "";
    let v = val;
    let m = meta;
    if (fmt === 'time') {
        v = timeToDecimal(val);
        m = timeToDecimal(meta);
    } else {
        v = parseFloat(val);
        m = parseFloat(meta);
        if (fmt === 'percent' && Math.abs(m) <= 1 && Math.abs(v) > 1) m = m * 100;
    }
    if (logic === 'maior') return v >= m ? 'good' : 'bad';
    return v <= m ? 'good' : 'bad';
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerHTML = `<i data-lucide="check-circle"></i> <span>${msg}</span>`;
    lucide.createIcons();
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}