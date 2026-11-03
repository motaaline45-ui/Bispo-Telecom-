import {
  addDays, createCompany, currency, currentMonthISO, DEFAULT_SETTINGS, endOfMonth, formatDateBR,
  isValidRecord, lastMonthISO, loadActiveCompanyId, loadAllCompanyData, loadCompanies, loadRecords,
  loadSettings, makeRecord, numberBR, recordTotals, restoreCompanies, saveRecords, saveSettings,
  setActiveCompanyId, startOfMonth, startOfWeek, todayISO, toNumber, weekdayShort, weekInputValue,
  weekStartFromInput,
} from './db.js';
import {
  buildReport, emailSubject, reportFileName, reportToCSV, reportToText,
} from './reports.js';
import {
  copyText, downloadFile, shareEmail, shareNative, shareWhatsApp,
} from './share.js';
import { importSpreadsheet } from './import.js';
import {
  buildPayload, connect as googleConnect, DEFAULT_DRIVE_CLIENT_ID, downloadBackup, findBackupFile,
  getUserInfo, isCloudNewer, isValidGoogleClientId, preloadGis, resolveDriveClientConfiguration,
  revoke, uploadBackup,
} from './drive.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DRIVE_KEY = 'bispo-telecom.drive.v1';
const META_KEY = 'bispo-telecom.meta.v1';
const AUTO_SYNC_DELAY = 5000;

const state = {
  companies: [],
  activeCompanyId: null,
  records: [],
  settings: { ...DEFAULT_SETTINGS },
  filterMonth: currentMonthISO(),
  search: '',
  editingId: null,
  periodType: 'week',
  lastReport: null,
  deferredInstall: null,
  drive: {
    clientId: '', linked: false, email: '', autoSync: false, lastSyncAt: null,
  },
  meta: { updatedAt: null, lastSyncAt: null, fileId: null },
  driveToken: null,
  syncing: false,
  driveNotice: '',
  autoSyncTimer: null,
  clientIdTimer: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  state.companies = loadCompanies();
  state.activeCompanyId = loadActiveCompanyId();
  state.records = loadRecords();
  state.settings = loadSettings();
  state.drive = loadDriveState();
  els.driveAdvanced.open = !state.drive.clientIdConfigured;
  updateDriveClientHelp();
  state.meta = loadMeta();

  if (state.records.length && !state.meta.updatedAt) {
    state.meta.updatedAt = new Date().toISOString();
    saveMeta();
  }

  state.filterMonth = pickInitialMonth();

  setFormDefaults();
  setReportDefaults();
  fillSettingsForm();
  bindEvents();
  renderAll();
  registerServiceWorker();
  setupInstallPrompt();

  if (state.drive.clientId) preloadGis();
}

function cacheElements() {
  els.form = $('#record-form');
  els.formTitle = $('#form-title');
  els.formHint = $('#form-hint');
  els.recordId = $('#record-id');
  els.date = $('#f-date');
  els.clientId = $('#f-client-id');
  els.client = $('#f-client');
  els.installQty = $('#f-install-qty');
  els.installUnit = $('#f-install-unit');
  els.cameraQty = $('#f-camera-qty');
  els.cameraUnit = $('#f-camera-unit');
  els.status = $('#f-status');
  els.note = $('#f-note');
  els.saveBtn = $('#btn-save');
  els.cancelEdit = $('#btn-cancel-edit');

  els.filterMonth = $('#filter-month');
  els.search = $('#filter-search');
  els.recordsList = $('#records-list');
  els.recordsEmpty = $('#records-empty');
  els.recordsSummary = $('#records-summary');
  els.kpiInstall = $('#kpi-install');
  els.kpiCamera = $('#kpi-camera');
  els.kpiTotal = $('#kpi-total');

  els.brandName = $('#brand-name');
  els.companySelect = $('#company-select');
  els.addCompany = $('#btn-add-company');
  els.addCompanyDialog = $('#add-company-dialog');
  els.addCompanyForm = $('#add-company-form');
  els.newCompanyName = $('#new-company-name');
  els.companyNameError = $('#company-name-error');
  els.cancelAddCompany = $('#btn-cancel-add-company');
  els.reportWeek = $('#report-week');
  els.reportMonth = $('#report-month');
  els.reportStart = $('#report-start');
  els.reportEnd = $('#report-end');
  els.reportClients = $('#report-clients');
  els.reportOutput = $('#report-output');
  els.reportActions = $('#report-actions');

  els.settingsForm = $('#settings-form');
  els.sCompany = $('#s-company');
  els.sInstall = $('#s-install-unit');
  els.sCamera = $('#s-camera-unit');
  els.sFooter = $('#s-footer');
  els.storageInfo = $('#storage-info');
  els.importFile = $('#import-file');
  els.restoreFile = $('#restore-file');
  els.toast = $('#toast');
  els.installBtn = $('#btn-install');
  els.shareBackup = $('#btn-share-backup');

  els.driveClient = $('#drive-client');
  els.driveClientField = $('#drive-client-field');
  els.driveAdvanced = $('#drive-advanced');
  els.driveClientHelp = $('#drive-client-help');
  els.drivePaste = $('#btn-drive-paste');
  els.btnDriveEditClient = $('#btn-drive-edit-client');
  els.driveStatus = $('#drive-status');
  els.driveEmail = $('#drive-email');
  els.driveAuto = $('#drive-auto');
  els.driveAutoWrap = $('#drive-auto-wrap');
  els.btnDriveConnect = $('#btn-drive-connect');
  els.btnDriveSync = $('#btn-drive-sync');
  els.btnDriveRestore = $('#btn-drive-restore');
  els.btnDriveDisconnect = $('#btn-drive-disconnect');
}

/* ---------------- inicialização ---------------- */

function pickInitialMonth() {
  const months = [...new Set(state.records.map((r) => r.date.slice(0, 7)))];
  const current = currentMonthISO();
  if (months.includes(current)) return current;
  return months.sort().at(-1) || current;
}

function setFormDefaults() {
  els.date.value = todayISO();
  els.installQty.value = 1;
  els.cameraQty.value = 0;
  els.installUnit.value = state.settings.installUnit;
  els.cameraUnit.value = state.settings.cameraUnit;
  els.status.value = 'ok';
  els.note.value = '';
  els.client.value = '';
  els.clientId.value = '';
  els.recordId.value = '';
  els.formTitle.textContent = 'Novo lançamento';
  els.formHint.textContent = 'Preencha e salve. Tudo fica salvo neste aparelho.';
  els.saveBtn.textContent = 'Salvar lançamento';
  els.cancelEdit.hidden = true;
  state.editingId = null;
}

function setReportDefaults() {
  const today = todayISO();
  els.reportWeek.value = weekInputValue(today);
  els.reportMonth.value = currentMonthISO();
  els.reportStart.value = startOfWeek(today);
  els.reportEnd.value = today;
  els.filterMonth.value = state.filterMonth;
  els.reportClients.checked = false;
}

/* ---------------- eventos ---------------- */

function bindEvents() {
  $$('[data-tab]').forEach((btn) => btn.addEventListener('click', () => goToTab(btn.dataset.tab)));
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => goToTab(btn.dataset.goto)));
  els.companySelect.addEventListener('change', onCompanyChange);
  els.addCompany.addEventListener('click', onAddCompany);
  els.addCompanyForm.addEventListener('submit', onCreateCompany);
  els.cancelAddCompany.addEventListener('click', () => els.addCompanyDialog.close());
  els.newCompanyName.addEventListener('input', () => {
    els.companyNameError.hidden = true;
    els.companyNameError.textContent = '';
  });

  els.form.addEventListener('submit', onSaveRecord);
  els.cancelEdit.addEventListener('click', (e) => { e.preventDefault(); setFormDefaults(); });
  els.recordsList.addEventListener('click', onRecordAction);

  els.filterMonth.addEventListener('change', () => {
    state.filterMonth = els.filterMonth.value || currentMonthISO();
    renderRecords();
    renderKpis();
  });
  els.search.addEventListener('input', () => {
    state.search = els.search.value.trim().toLowerCase();
    renderRecords();
  });

  $$('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => setPeriodType(btn.dataset.period));
  });
  $$('[data-quick]').forEach((btn) => btn.addEventListener('click', () => applyQuickRange(btn.dataset.quick)));
  $('#btn-generate').addEventListener('click', generateReport);
  $$('#report-actions [data-share]').forEach((btn) => {
    btn.addEventListener('click', () => onShare(btn.dataset.share));
  });
  els.reportClients.addEventListener('change', () => {
    if (state.lastReport) renderReport(state.lastReport);
  });

  els.settingsForm.addEventListener('submit', onSaveSettings);
  els.importFile.addEventListener('change', onImportFile);
  els.restoreFile.addEventListener('change', onRestoreFile);
  $('#btn-export').addEventListener('click', onExportBackup);
  els.shareBackup.addEventListener('click', onShareBackup);
  $('#btn-clear').addEventListener('click', onClearData);

  els.btnDriveConnect.addEventListener('click', onDriveConnect);
  els.btnDriveSync.addEventListener('click', () => syncNow({ auto: false }));
  els.btnDriveRestore.addEventListener('click', onDriveRestore);
  els.btnDriveDisconnect.addEventListener('click', onDriveDisconnect);
  els.driveAuto.addEventListener('change', () => {
    state.drive.autoSync = els.driveAuto.checked;
    saveDriveState();
    if (state.drive.autoSync && !state.drive.linked) {
      toast('Entre com o Google para ativar a sincronização automática.');
    }
  });
  els.driveClient.addEventListener('input', () => {
    setClientFieldError(false);
    if (state.driveNotice) {
      state.driveNotice = '';
      renderDrive();
    }
    clearTimeout(state.clientIdTimer);
    state.clientIdTimer = setTimeout(persistClientId, 400);
  });
  els.driveClient.addEventListener('change', persistClientId);
  els.drivePaste.addEventListener('click', onPasteClientId);
  els.btnDriveEditClient.addEventListener('click', () => {
    els.driveAdvanced.open = true;
    state.driveNotice = 'Confira ou substitua o Client ID salvo neste aparelho.';
    renderDrive();
    els.driveClient.focus();
  });

  window.addEventListener('online', () => {
    toast('Conexão restabelecida.');
    if (state.drive.autoSync && state.drive.linked) scheduleAutoSync(500);
  });
  window.addEventListener('offline', () => toast('Você está offline — o app continua funcionando.'));
}

/* ---------------- navegação ---------------- */

function onCompanyChange() {
  const companyId = els.companySelect.value;
  if (companyId === state.activeCompanyId) return;
  if (hasUnsavedCompanyChanges() && !window.confirm('Descartar as alterações não salvas antes de trocar de empresa?')) {
    els.companySelect.value = state.activeCompanyId;
    return;
  }
  activateCompany(companyId);
}

function onAddCompany() {
  if (hasUnsavedCompanyChanges() && !window.confirm('Descartar as alterações não salvas antes de cadastrar outra empresa?')) {
    return;
  }
  els.addCompanyForm.reset();
  els.companyNameError.hidden = true;
  els.companyNameError.textContent = '';
  els.addCompanyDialog.showModal();
  els.newCompanyName.focus({ preventScroll: true });
}

function onCreateCompany(event) {
  event.preventDefault();
  const name = els.newCompanyName.value.trim();
  if (!name) {
    els.companyNameError.textContent = 'Informe o nome da empresa.';
    els.companyNameError.hidden = false;
    els.newCompanyName.focus();
    return;
  }

  try {
    const company = createCompany(name);
    state.companies = loadCompanies();
    els.addCompanyDialog.close();
    activateCompany(company.id);
    touchData();
    toast(`Empresa "${company.name}" cadastrada.`);
  } catch (err) {
    els.companyNameError.textContent = err.message || 'Não foi possível cadastrar a empresa.';
    els.companyNameError.hidden = false;
    els.newCompanyName.focus();
  }
}

function hasUnsavedCompanyChanges() {
  const hasRecordDraft = Boolean(
    state.editingId || els.client.value.trim() || els.clientId.value.trim() || els.note.value.trim()
    || els.date.value !== todayISO() || Number(els.installQty.value) !== 1
    || Number(els.installUnit.value) !== state.settings.installUnit
    || Number(els.cameraQty.value) !== 0
    || Number(els.cameraUnit.value) !== state.settings.cameraUnit
    || els.status.value !== 'ok',
  );
  const hasSettingsDraft = els.sCompany.value.trim() !== state.settings.company
    || Number(els.sInstall.value) !== state.settings.installUnit
    || Number(els.sCamera.value) !== state.settings.cameraUnit
    || els.sFooter.value.trim() !== state.settings.footer;
  return hasRecordDraft || hasSettingsDraft;
}

function activateCompany(companyId) {
  setActiveCompanyId(companyId);
  state.companies = loadCompanies();
  state.activeCompanyId = loadActiveCompanyId();
  state.records = loadRecords();
  state.settings = loadSettings();
  state.search = '';
  els.search.value = '';
  state.filterMonth = pickInitialMonth();
  state.lastReport = null;
  els.reportOutput.hidden = true;
  els.reportActions.hidden = true;
  fillSettingsForm();
  setFormDefaults();
  setReportDefaults();
  renderAll();
  toast(`Empresa ativa: ${state.settings.company}.`);
}

function renderCompanySwitcher() {
  els.companySelect.innerHTML = state.companies.map((company) => (
    `<option value="${esc(company.id)}">${esc(company.name)}</option>`
  )).join('');
  els.companySelect.value = state.activeCompanyId;
  els.companySelect.setAttribute('aria-label', `Empresa ativa: ${state.settings.company}`);
}

function goToTab(tab) {
  $$('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `tab-${tab}`; });
  $$('.tabbar__btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- lançamentos ---------------- */

function readForm() {
  return {
    id: els.recordId.value || undefined,
    date: els.date.value,
    clientId: els.clientId.value,
    client: els.client.value,
    installQty: toNumber(els.installQty.value, 1),
    installUnit: toNumber(els.installUnit.value, state.settings.installUnit),
    cameraQty: toNumber(els.cameraQty.value, 0),
    cameraUnit: toNumber(els.cameraUnit.value, state.settings.cameraUnit),
    status: els.status.value,
    note: els.note.value,
  };
}

function onSaveRecord(event) {
  event.preventDefault();
  const input = readForm();

  if (!input.date) return toast('Informe a data.');
  if (!input.client.trim()) {
    els.client.focus();
    return toast('Informe o nome do cliente.');
  }

  const record = makeRecord(input, state.settings);
  const wasEditing = Boolean(state.editingId);

  if (state.editingId) {
    state.records = state.records.map((r) => (r.id === state.editingId ? record : r));
  } else {
    state.records.push(record);
  }

  persistRecords();
  state.filterMonth = record.date.slice(0, 7);
  els.filterMonth.value = state.filterMonth;
  setFormDefaults();
  renderAll();
  toast(wasEditing ? 'Lançamento atualizado.' : 'Lançamento salvo.');
}

function onRecordAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const article = button.closest('[data-id]');
  const id = article?.dataset.id;
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  if (button.dataset.action === 'edit') startEdit(record);
  if (button.dataset.action === 'delete') deleteRecord(record);
}

function startEdit(record) {
  state.editingId = record.id;
  els.recordId.value = record.id;
  els.date.value = record.date;
  els.clientId.value = record.clientId || '';
  els.client.value = record.client;
  els.installQty.value = record.installQty;
  els.installUnit.value = record.installUnit;
  els.cameraQty.value = record.cameraQty;
  els.cameraUnit.value = record.cameraUnit;
  els.status.value = record.status;
  els.note.value = record.note || '';
  els.formTitle.textContent = 'Editar lançamento';
  els.formHint.textContent = 'Altere os campos e salve.';
  els.saveBtn.textContent = 'Salvar alterações';
  els.cancelEdit.hidden = false;
  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteRecord(record) {
  const ok = window.confirm(`Apagar o lançamento de ${record.client} (${formatDateBR(record.date)})?`);
  if (!ok) return;
  state.records = state.records.filter((r) => r.id !== record.id);
  persistRecords();
  if (state.editingId === record.id) setFormDefaults();
  renderAll();
  toast('Lançamento apagado.');
}

function filteredRecords() {
  return state.records
    .filter((r) => !state.filterMonth || r.date.startsWith(state.filterMonth))
    .filter((r) => {
      if (!state.search) return true;
      return r.client.toLowerCase().includes(state.search)
        || String(r.clientId || '').toLowerCase().includes(state.search);
    })
    .sort((a, b) => (a.date === b.date ? a.client.localeCompare(b.client, 'pt-BR') : b.date.localeCompare(a.date)));
}

function renderRecords() {
  const records = filteredRecords();
  els.recordsList.innerHTML = records.map(recordHtml).join('');
  els.recordsEmpty.hidden = records.length > 0;

  const total = records.reduce((sum, r) => sum + recordTotals(r).total, 0);
  els.recordsSummary.textContent = records.length
    ? `${numberBR(records.length)} lançamento(s) · ${currency(total)}`
    : '';
}

function recordHtml(record) {
  const t = recordTotals(record);
  const tags = [];
  if (t.installQty) tags.push(`<span class="tag">${numberBR(t.installQty)} inst.</span>`);
  if (t.cameraQty) tags.push(`<span class="tag tag--cam">${numberBR(t.cameraQty)} câm.</span>`);
  if (record.status === 'pendente') tags.push('<span class="tag tag--pending">Pendente</span>');
  if (record.note) tags.push(`<span class="tag" title="${esc(record.note)}">obs.</span>`);

  return `
    <article class="record" data-id="${esc(record.id)}">
      <div class="record__main">
        <span class="record__client">${esc(record.client)}</span>
        <span class="record__meta">
          ${formatDateBR(record.date)} · ${weekdayShort(record.date)}
          ${record.clientId ? ` · ID ${esc(record.clientId)}` : ''}
        </span>
        <div class="record__tags">${tags.join('')}</div>
      </div>
      <div class="record__value">${currency(t.total)}</div>
      <div class="record__actions">
        <button class="iconbtn" type="button" data-action="edit" aria-label="Editar ${esc(record.client)}" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="iconbtn iconbtn--danger" type="button" data-action="delete" aria-label="Apagar ${esc(record.client)}" title="Apagar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>
        </button>
      </div>
    </article>`;
}

function renderKpis() {
  const records = state.records.filter((r) => r.date.startsWith(state.filterMonth));
  let installs = 0;
  let cameras = 0;
  let total = 0;
  for (const r of records) {
    const t = recordTotals(r);
    installs += t.installQty;
    cameras += t.cameraQty;
    total += t.total;
  }
  els.kpiInstall.textContent = numberBR(installs);
  els.kpiCamera.textContent = numberBR(cameras);
  els.kpiTotal.textContent = currency(total);
}

function persistRecords({ touch = true } = {}) {
  state.records.sort((a, b) => a.date.localeCompare(b.date));
  saveRecords(state.records);
  if (touch) touchData();
}

/* ---------------- relatórios ---------------- */

function setPeriodType(type) {
  state.periodType = type;
  $$('.segmented__btn').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.period === type));
  $('#period-week').hidden = type !== 'week';
  $('#period-month').hidden = type !== 'month';
  $('#period-custom').hidden = type !== 'custom';
}

function applyQuickRange(quick) {
  const today = todayISO();
  if (quick === 'today') {
    setPeriodType('custom');
    els.reportStart.value = today;
    els.reportEnd.value = today;
  } else if (quick === '7d') {
    setPeriodType('custom');
    els.reportStart.value = addDays(today, -6);
    els.reportEnd.value = today;
  } else if (quick === 'week') {
    setPeriodType('week');
    els.reportWeek.value = weekInputValue(today);
  } else if (quick === 'month') {
    setPeriodType('month');
    els.reportMonth.value = currentMonthISO();
  } else if (quick === 'lastmonth') {
    setPeriodType('month');
    els.reportMonth.value = lastMonthISO();
  }
  generateReport();
}

function resolveRange() {
  if (state.periodType === 'week') {
    const start = weekStartFromInput(els.reportWeek.value);
    return { start, end: addDays(start, 6), type: 'week' };
  }
  if (state.periodType === 'month') {
    const ym = els.reportMonth.value || currentMonthISO();
    return { start: startOfMonth(ym), end: endOfMonth(ym), type: 'month' };
  }
  let start = els.reportStart.value;
  let end = els.reportEnd.value;
  if (!start || !end) return null;
  if (start > end) [start, end] = [end, start];
  const type = start === end ? 'day' : 'custom';
  return { start, end, type };
}

function generateReport() {
  const range = resolveRange();
  if (!range) return toast('Escolha as datas do período.');

  const report = buildReport(state.records, { ...range, settings: state.settings });
  state.lastReport = report;
  renderReport(report);
  els.reportOutput.hidden = false;
  els.reportActions.hidden = false;
  els.reportOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (report.totals.count === 0) toast('Nenhum lançamento nesse período.');
}

function renderReport(report) {
  const includeClients = els.reportClients.checked;
  const { totals } = report;

  const dayRows = report.days.map((day) => `
    <tr>
      <td>${formatDateBR(day.date)} <span class="hint">(${weekdayShort(day.date)})</span></td>
      <td class="num">${numberBR(day.installQty)}</td>
      <td class="num">${numberBR(day.cameraQty)}</td>
      <td class="num">${currency(day.total)}</td>
    </tr>`).join('');

  const clientRows = includeClients && report.records.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Cliente</th><th>ID</th><th class="num">Inst.</th><th class="num">Câm.</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${report.records.map((r) => {
            const t = recordTotals(r);
            return `<tr>
              <td>${formatDateBR(r.date)}</td>
              <td>${esc(r.client)}${r.status === 'pendente' ? ' <span class="tag tag--pending">Pendente</span>' : ''}</td>
              <td>${esc(r.clientId || '—')}</td>
              <td class="num">${numberBR(t.installQty)}</td>
              <td class="num">${numberBR(t.cameraQty)}</td>
              <td class="num">${currency(t.total)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '';

  const daysTable = totals.count === 0
    ? '<p class="hint">Nenhum lançamento no período selecionado.</p>'
    : `<div class="table-wrap">
        <table>
          <thead><tr><th>Dia</th><th class="num">Instalações</th><th class="num">Câmeras</th><th class="num">Total</th></tr></thead>
          <tbody>${dayRows}</tbody>
          <tfoot><tr>
            <td>Total (${numberBR(totals.days)} dia${totals.days === 1 ? '' : 's'})</td>
            <td class="num">${numberBR(totals.installQty)}</td>
            <td class="num">${numberBR(totals.cameraQty)}</td>
            <td class="num">${currency(totals.total)}</td>
          </tr></tfoot>
        </table>
      </div>`;

  els.reportOutput.innerHTML = `
    <div class="report__head">
      <span class="report__company">${esc(report.settings.company || 'Bispo Telecom')}</span>
      <h2 class="report__title">${esc(report.typeLabel)}</h2>
      <span class="report__period">${report.periodText}</span>
    </div>

    <div class="report__kpis">
      <div class="report__kpi"><span>Instalações</span><strong>${numberBR(totals.installQty)}</strong></div>
      <div class="report__kpi"><span>Câmeras</span><strong>${numberBR(totals.cameraQty)}</strong></div>
      <div class="report__kpi"><span>Média por dia</span><strong>${currency(totals.averagePerDay)}</strong></div>
      <div class="report__kpi report__kpi--total"><span>Total</span><strong>${currency(totals.total)}</strong></div>
    </div>

    ${daysTable}
    ${clientRows}

    <div class="report__foot">
      <span>${numberBR(totals.count)} lançamento(s) · ${numberBR(totals.days)} dia(s) com movimento</span>
      <span>Gerado em ${report.generatedAt.toLocaleString('pt-BR')}</span>
      ${report.settings.footer ? `<span>${esc(report.settings.footer)}</span>` : ''}
    </div>`;
}

async function onShare(kind) {
  const report = state.lastReport;
  if (!report) return toast('Gere um relatório primeiro.');

  const includeClients = els.reportClients.checked;
  const plain = reportToText(report, { includeClients, style: 'plain' });
  const whatsappText = reportToText(report, { includeClients, style: 'whatsapp' });

  if (kind === 'whatsapp') {
    if (whatsappText.length > 6000) return toast('Relatório muito longo. Desmarque a lista de clientes ou envie o CSV.');
    shareWhatsApp(whatsappText);
    return;
  }

  if (kind === 'email') {
    if (plain.length > 1800) {
      const subject = emailSubject(report);
      const shorter = reportToText(report, { includeClients: false, style: 'plain' });
      shareEmail(subject, shorter);
      toast('E-mail aberto sem a lista de clientes (limite de tamanho). Use o CSV para a lista completa.');
      return;
    }
    shareEmail(emailSubject(report), plain);
    return;
  }

  if (kind === 'native') {
    const ok = await shareNative({ title: report.typeLabel, text: whatsappText });
    if (!ok) {
      const copied = await copyText(whatsappText);
      toast(copied ? 'Texto copiado — cole onde quiser compartilhar.' : 'Compartilhamento indisponível.');
    }
    return;
  }

  if (kind === 'copy') {
    const ok = await copyText(whatsappText);
    toast(ok ? 'Relatório copiado.' : 'Não foi possível copiar.');
    return;
  }

  if (kind === 'csv') {
    downloadFile(reportFileName(report, 'csv'), reportToCSV(report), 'text/csv;charset=utf-8');
    toast('CSV gerado.');
    return;
  }

  if (kind === 'print') {
    window.print();
  }
}

/* ---------------- ajustes ---------------- */

function fillSettingsForm() {
  els.sCompany.value = state.settings.company;
  els.sInstall.value = state.settings.installUnit;
  els.sCamera.value = state.settings.cameraUnit;
  els.sFooter.value = state.settings.footer;
}

function onSaveSettings(event) {
  event.preventDefault();
  const settings = {
    company: els.sCompany.value.trim() || DEFAULT_SETTINGS.company,
    installUnit: Math.max(0, toNumber(els.sInstall.value, DEFAULT_SETTINGS.installUnit)),
    cameraUnit: Math.max(0, toNumber(els.sCamera.value, DEFAULT_SETTINGS.cameraUnit)),
    footer: els.sFooter.value.trim(),
  };
  state.settings = settings;
  saveSettings(settings);
  state.companies = loadCompanies();
  touchData();
  renderCompanySwitcher();
  els.brandName.textContent = settings.company;
  if (!state.editingId) {
    els.installUnit.value = settings.installUnit;
    els.cameraUnit.value = settings.cameraUnit;
  }
  renderStorageInfo();
  toast('Ajustes salvos.');
}

/* ---------------- dados ---------------- */

function dedupeKey(record) {
  return `${record.date}|${record.clientId || ''}|${record.client.toLowerCase()}`;
}

async function onImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const result = await importSpreadsheet(file, state.settings);
    if (!result.records.length) {
      toast('Nenhum lançamento encontrado na planilha.');
      return;
    }

    const merge = window.confirm(
      `Encontrados ${result.records.length} lançamento(s) em "${file.name}".\n\n`
      + 'OK = adicionar aos lançamentos desta empresa\nCancelar = substituir os lançamentos desta empresa pelos dados da planilha',
    );

    const base = merge ? state.records : [];
    const seen = new Set(base.map(dedupeKey));
    let duplicates = 0;
    const added = [];

    for (const record of result.records) {
      const key = dedupeKey(record);
      if (seen.has(key)) { duplicates += 1; continue; }
      seen.add(key);
      added.push(record);
    }

    state.records = [...base, ...added];
    persistRecords();
    if (state.records.length) state.filterMonth = pickInitialMonth();
    els.filterMonth.value = state.filterMonth;
    renderAll();
    setReportDefaults();

    toast(`${added.length} importado(s)${duplicates ? ` · ${duplicates} duplicado(s)` : ''}${result.ignored ? ` · ${result.ignored} linha(s) ignorada(s)` : ''}.`);
  } catch (err) {
    console.error(err);
    toast(`Falha ao importar: ${err.message}`);
  }
}

function onExportBackup() {
  const payload = buildCurrentBackup();
  downloadFile(`backup-bispo-telecom-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup gerado.');
}

async function onShareBackup() {
  const payload = buildCurrentBackup();
  const text = JSON.stringify(payload, null, 2);
  const filename = `backup-bispo-telecom-${todayISO()}.json`;
  const file = new File([text], filename, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Backup — Bispo Telecom',
        text: 'Backup dos dados do app.',
      });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }

  downloadFile(filename, text, 'application/json');
  toast('Compartilhamento indisponível neste navegador — backup baixado.');
}

async function onRestoreFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (Array.isArray(data?.companies)) {
      const count = data.companies.reduce(
        (sum, company) => sum + (Array.isArray(company.records) ? company.records.length : 0),
        0,
      );
      const ok = window.confirm(
        `Restaurar ${data.companies.length} empresa(s) e ${count} lançamento(s)?\n`
        + 'As empresas e os dados atuais deste aparelho serão substituídos.',
      );
      if (!ok) return;
      const restored = restoreCompanies(data.companies, data.activeCompanyId);
      state.companies = restored.companies;
      state.activeCompanyId = restored.activeCompanyId;
      state.records = loadRecords();
      state.settings = loadSettings();
      state.meta.updatedAt = data.updatedAt || new Date().toISOString();
      saveMeta();
      finishRestore();
      toast('Backup das empresas restaurado.');
      return;
    }

    const records = Array.isArray(data) ? data : data.records;
    if (!Array.isArray(records)) throw new Error('Arquivo de backup inválido.');

    const valid = records.filter(isValidRecord);
    const ok = window.confirm(`Restaurar ${valid.length} lançamento(s)? Os dados atuais serão substituídos.`);
    if (!ok) return;

    state.records = valid.map((r) => makeRecord(r, state.settings));
    if (data.settings) {
      state.settings = { ...state.settings, ...data.settings };
      saveSettings(state.settings);
      fillSettingsForm();
      els.brandName.textContent = state.settings.company;
    }
    persistRecords();
    state.filterMonth = pickInitialMonth();
    els.filterMonth.value = state.filterMonth;
    renderAll();
    setReportDefaults();
    toast('Backup restaurado.');
  } catch (err) {
    toast(`Falha ao restaurar: ${err.message}`);
  }
}

function buildCurrentBackup() {
  return buildPayload({
    records: state.records,
    settings: state.settings,
    companies: loadAllCompanyData(),
    activeCompanyId: state.activeCompanyId,
    updatedAt: state.meta.updatedAt,
  });
}

function finishRestore() {
  fillSettingsForm();
  state.filterMonth = pickInitialMonth();
  els.filterMonth.value = state.filterMonth;
  state.lastReport = null;
  els.reportOutput.hidden = true;
  els.reportActions.hidden = true;
  setFormDefaults();
  renderAll();
  setReportDefaults();
}

function onClearData() {
  const companyName = state.settings.company || 'esta empresa';
  const ok = window.confirm(`Apagar todos os lançamentos de ${companyName}? Essa ação não pode ser desfeita.`);
  if (!ok) return;
  state.records = [];
  persistRecords();
  state.lastReport = null;
  els.reportOutput.hidden = true;
  els.reportActions.hidden = true;
  setFormDefaults();
  renderAll();
  toast('Dados apagados.');
}

function renderStorageInfo() {
  const records = state.records.length;
  const bytes = new Blob([JSON.stringify(state.records)]).size;
  els.storageInfo.textContent = `${numberBR(records)} lançamento(s) de ${state.settings.company} · ${(bytes / 1024).toFixed(1)} KB · armazenamento local do navegador.`;
}

/* ---------------- Google Drive ---------------- */

function loadDriveState() {
  const base = { clientId: DEFAULT_DRIVE_CLIENT_ID, clientIdConfigured: false, linked: false, email: '', autoSync: false, lastSyncAt: null };
  try {
    const saved = JSON.parse(localStorage.getItem(DRIVE_KEY) || '{}');
    return {
      ...base,
      ...saved,
      ...resolveDriveClientConfiguration(saved),
    };
  } catch {
    return base;
  }
}

function saveDriveState() {
  localStorage.setItem(DRIVE_KEY, JSON.stringify(state.drive));
}

function loadMeta() {
  const base = { updatedAt: null, lastSyncAt: null, fileId: null };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') };
  } catch {
    return base;
  }
}

function saveMeta() {
  localStorage.setItem(META_KEY, JSON.stringify(state.meta));
}

function touchData() {
  state.meta.updatedAt = new Date().toISOString();
  saveMeta();
  scheduleAutoSync();
}

function renderDrive() {
  const d = state.drive;
  if (document.activeElement !== els.driveClient) {
    els.driveClient.value = d.clientId || '';
  }
  els.btnDriveEditClient.hidden = !d.clientIdConfigured;
  updateDriveClientHelp();

  els.driveEmail.hidden = !d.linked;
  els.driveEmail.textContent = d.linked ? `Conectado como ${d.email || 'sua conta Google'}` : '';
  els.driveEmail.classList.toggle('pill--ok', Boolean(d.linked));

  if (state.syncing) {
    els.driveStatus.textContent = 'Sincronizando com o Google Drive…';
  } else if (state.driveNotice) {
    els.driveStatus.textContent = state.driveNotice;
  } else if (d.linked && d.lastSyncAt) {
    els.driveStatus.textContent = `Última sincronização: ${new Date(d.lastSyncAt).toLocaleString('pt-BR')}`;
  } else if (d.linked) {
    els.driveStatus.textContent = 'Conta conectada. Toque em "Sincronizar agora".';
  } else {
    els.driveStatus.textContent = 'Nenhuma conta conectada.';
  }

  els.btnDriveConnect.hidden = d.linked;
  els.btnDriveSync.hidden = !d.linked;
  els.btnDriveRestore.hidden = !d.linked;
  els.btnDriveDisconnect.hidden = !d.linked;
  els.driveAutoWrap.hidden = !d.linked;
  els.driveAuto.checked = Boolean(d.autoSync);

  const busy = state.syncing;
  [els.btnDriveConnect, els.btnDriveSync, els.btnDriveRestore, els.btnDriveDisconnect]
    .forEach((btn) => { btn.disabled = busy; });
}

function updateDriveClientHelp() {
  if (!state.drive.clientIdConfigured && state.driveNotice) {
    els.driveClientHelp.textContent = state.driveNotice;
  } else if (state.drive.clientIdConfigured) {
    els.driveClientHelp.textContent = 'Este Client ID fica salvo apenas neste aparelho. Se os dados do navegador forem apagados, o app pedirá a configuração novamente. Client IDs são públicos; não informe um Client Secret.';
  } else if (isValidGoogleClientId(state.drive.clientId)) {
    els.driveClientHelp.textContent = 'Confira o Client ID sugerido ou substitua-o. Toque em “Entrar com Google” para confirmar e salvar neste aparelho.';
  } else {
    els.driveClientHelp.textContent = 'Informe um Client ID válido do Google. Ele será salvo apenas neste aparelho; se os dados do navegador forem apagados, o app pedirá novamente.';
  }
}

function setSyncing(value) {
  state.syncing = value;
  renderDrive();
}

function setClientFieldError(on) {
  els.driveClientField.classList.toggle('field--error', Boolean(on));
  if (on) els.driveClient.setAttribute('aria-invalid', 'true');
  else els.driveClient.removeAttribute('aria-invalid');
}

function persistClientId() {
  clearTimeout(state.clientIdTimer);
  const value = (els.driveClient.value || '').trim();
  if (value === state.drive.clientId) return;
  state.drive.clientId = value;
  state.drive.clientIdConfigured = false;
  saveDriveState();
  renderDrive();
}

async function onPasteClientId() {
  try {
    if (!navigator.clipboard?.readText) throw new Error('clipboard indisponível');
    const text = (await navigator.clipboard.readText() || '').trim();
    if (!text) {
      toast('A área de transferência está vazia.');
      return;
    }
    els.driveClient.value = text;
    persistClientId();
    const valid = isValidGoogleClientId(text);
    setClientFieldError(!valid);
    renderDrive();
    toast(valid
      ? 'Client ID colado. Agora toque em "Entrar com Google".'
      : 'O texto colado não parece um Client ID (deve terminar em .apps.googleusercontent.com).', 4500);
  } catch {
    els.driveClient.focus();
    toast('Não consegui ler a área de transferência. Mantenha pressionado o campo e escolha "Colar".', 5000);
  }
}

async function ensureDriveToken({ clientId, force = false } = {}) {
  const id = String(clientId ?? state.drive.clientId ?? '').trim();
  if (!state.drive.clientIdConfigured || !isValidGoogleClientId(id)) {
    const message = isValidGoogleClientId(id)
      ? 'Confirme o Client ID na configuração avançada para usar o Google Drive.'
      : 'Informe um Client ID válido para usar o Google Drive.';
    requestDriveClientId(message, !isValidGoogleClientId(id));
    const error = new Error(message);
    error.code = 'CLIENT_ID';
    throw error;
  }

  if (!force && state.driveToken && state.driveToken.expiresAt > Date.now() + 30000) {
    return state.driveToken;
  }

  const token = await googleConnect(id);
  state.driveToken = token;
  state.drive.clientId = id;
  state.drive.clientIdConfigured = true;
  saveDriveState();
  return token;
}

function requestDriveClientId(message, invalid = false) {
  state.driveNotice = message;
  els.driveAdvanced.open = true;
  els.driveClientHelp.textContent = message;
  setClientFieldError(invalid);
  renderDrive();
  els.driveClient.focus();
}

async function onDriveConnect() {
  if (state.syncing) return;

  const typed = (els.driveClient.value || '').trim();
  persistClientId();
  if (!typed) {
    requestDriveClientId('Informe seu Client ID do Google para conectar.');
    toast(state.driveNotice, 5000);
    return;
  }
  if (!isValidGoogleClientId(els.driveClient.value)) {
    requestDriveClientId('O Client ID não parece válido — ele termina com .apps.googleusercontent.com.', true);
    toast('Client ID inválido. Confira se copiou o valor completo.', 4500);
    return;
  }

  setSyncing(true);
  state.driveNotice = '';
  setClientFieldError(false);
  state.drive.clientIdConfigured = true;
  saveDriveState();
  try {
    const token = await ensureDriveToken({ force: true });
    const info = await getUserInfo(token.accessToken);
    state.drive = {
      ...state.drive,
      linked: true,
      email: info?.email || 'sua conta Google',
      autoSync: state.drive.autoSync,
    };
    saveDriveState();
    els.driveAdvanced.open = false;
    renderDrive();
    toast('Conectado ao Google Drive. Toque em "Sincronizar agora".');
  } catch (err) {
    handleDriveError(err);
  } finally {
    setSyncing(false);
  }
}

async function syncNow({ auto = false } = {}) {
  if (state.syncing) return;
  if (!auto) state.driveNotice = '';
  setSyncing(true);

  try {
    const token = await ensureDriveToken();
    const file = await findBackupFile(token.accessToken);
    if (file) {
      state.meta.fileId = file.id;
      saveMeta();
    }
    let cloud = null;
    if (file) cloud = await downloadBackup(token.accessToken, file.id);

    const cloudIsNewer = cloud && isCloudNewer(cloud.updatedAt, state.meta.updatedAt);

    if (cloudIsNewer && !auto) {
      const stamp = cloud.updatedAt
        ? new Date(cloud.updatedAt).toLocaleString('pt-BR')
        : 'data desconhecida';
      const restore = window.confirm(
        `A nuvem tem dados mais recentes (${stamp}).\n\n`
        + 'OK = restaurar do Drive\nCancelar = enviar deste aparelho',
      );
      if (restore) {
        applyCloud(cloud);
        return;
      }
    }

    if (cloudIsNewer && auto) {
      state.driveNotice = 'A nuvem está mais recente. Use "Restaurar do Drive" para baixar.';
      return;
    }

    await pushToDrive(token, file);
    if (!auto) toast('Dados sincronizados com o Google Drive.');
  } catch (err) {
    if (auto) handleAutoSyncError(err);
    else handleDriveError(err);
  } finally {
    setSyncing(false);
  }
}

async function pushToDrive(token, file) {
  const payload = buildCurrentBackup();
  payload.updatedAt = state.meta.updatedAt || new Date().toISOString();

  const saved = await uploadBackup(token.accessToken, file?.id || state.meta.fileId || null, payload);
  const now = new Date().toISOString();
  state.meta.fileId = saved.id;
  state.meta.lastSyncAt = now;
  saveMeta();
  state.drive.lastSyncAt = now;
  saveDriveState();
  state.driveNotice = '';
  renderDrive();
}

async function onDriveRestore() {
  if (state.syncing) return;
  setSyncing(true);
  state.driveNotice = '';
  try {
    const token = await ensureDriveToken();
    const file = await findBackupFile(token.accessToken);
    if (!file) {
      toast('Nenhum backup no Google Drive ainda. Sincronize primeiro.');
      return;
    }
    const cloud = await downloadBackup(token.accessToken, file.id);
    state.meta.fileId = file.id;
    saveMeta();
    const companyCount = Array.isArray(cloud.companies) ? cloud.companies.length : 1;
    const recordCount = Array.isArray(cloud.companies)
      ? cloud.companies.reduce((sum, company) => sum + (Array.isArray(company.records) ? company.records.length : 0), 0)
      : cloud.records.length;
    const ok = window.confirm(
      `Restaurar ${companyCount} empresa(s) e ${recordCount} lançamento(s) do Google Drive?\n`
      + 'Os dados atuais deste aparelho serão substituídos.',
    );
    if (!ok) return;
    applyCloud(cloud);
  } catch (err) {
    handleDriveError(err);
  } finally {
    setSyncing(false);
  }
}

function applyCloud(cloud) {
  if (Array.isArray(cloud.companies)) {
    const restored = restoreCompanies(cloud.companies, cloud.activeCompanyId);
    state.companies = restored.companies;
    state.activeCompanyId = restored.activeCompanyId;
    state.records = loadRecords();
    state.settings = loadSettings();
  } else {
    state.records = cloud.records
      .filter(isValidRecord)
      .map((r) => makeRecord(r, state.settings));
    saveRecords(state.records);

    if (cloud.settings && typeof cloud.settings === 'object') {
      state.settings = { ...state.settings, ...cloud.settings };
      saveSettings(state.settings);
      state.companies = loadCompanies();
    }
  }

  state.meta.updatedAt = cloud.updatedAt || new Date().toISOString();
  state.meta.lastSyncAt = new Date().toISOString();
  saveMeta();

  state.drive.linked = true;
  state.drive.lastSyncAt = state.meta.lastSyncAt;
  saveDriveState();

  finishRestore();
  toast(`Dados restaurados do Google Drive (${numberBR(state.records.length)} lançamentos).`);
}

function onDriveDisconnect() {
  const ok = window.confirm('Desconectar a conta Google? Os dados continuam salvos neste aparelho.');
  if (!ok) return;

  revoke(state.driveToken?.accessToken);
  state.driveToken = null;
  state.drive = { ...state.drive, linked: false, email: '', autoSync: false };
  saveDriveState();
  state.driveNotice = '';
  renderDrive();
  toast('Conta Google desconectada.');
}

function scheduleAutoSync(delay = AUTO_SYNC_DELAY) {
  if (!state.drive.autoSync || !state.drive.linked) return;
  clearTimeout(state.autoSyncTimer);
  state.autoSyncTimer = setTimeout(() => {
    if (!navigator.onLine) return;
    if (!state.driveToken || state.driveToken.expiresAt <= Date.now()) return;
    syncNow({ auto: true });
  }, delay);
}

function handleDriveError(err) {
  console.warn('Google Drive:', err);
  if (err?.code === 'AUTH') state.driveToken = null;
  const message = err?.message || 'Falha ao acessar o Google Drive.';

  if (err?.code === 'CLIENT_ID') {
    toast(message, 5000);
  } else if (/popup_closed|cancelad/i.test(message)) {
    toast('Login cancelado.');
  } else if (/redirect_uri_mismatch|origin|origem/i.test(message)) {
    state.driveNotice = `Origem não autorizada: adicione ${window.location.origin} nas origens JavaScript autorizadas do cliente OAuth.`;
    toast(state.driveNotice, 9000);
  } else if (/access_denied|acesso negado|bloqueado/i.test(message)) {
    state.driveNotice = 'Acesso negado. Adicione seu e-mail em “Usuários de teste” na tela de consentimento.';
    toast(state.driveNotice, 8000);
  } else if (/invalid_client|client_id|unknown client/i.test(message)) {
    state.drive.clientIdConfigured = false;
    saveDriveState();
    requestDriveClientId('Client ID não reconhecido pelo Google. Confira ou substitua o valor.', true);
    toast(state.driveNotice, 7000);
  } else {
    toast(message);
  }
  renderDrive();
}

function handleAutoSyncError(err) {
  console.warn('Auto-sync:', err);
  if (err?.code === 'AUTH') state.driveToken = null;
  if (err?.code === 'CLIENT_ID') {
    toast(err.message, 5000);
  } else {
    state.driveNotice = 'Sincronização automática pendente. Toque em "Sincronizar agora".';
    renderDrive();
  }
}

/* ---------------- utilidades ---------------- */

function renderAll() {
  els.brandName.textContent = state.settings.company || DEFAULT_SETTINGS.company;
  renderCompanySwitcher();
  renderKpis();
  renderRecords();
  renderStorageInfo();
  renderDrive();
}

function toast(message, ms = 3000) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => els.toast.classList.remove('is-visible'), ms);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* ---------------- PWA ---------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register(new URL('./sw.js', location.href), { scope: './' }).catch((err) => {
    console.warn('Service worker não registrado:', err);
  });
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstall = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    els.installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    els.installBtn.hidden = true;
    toast('App instalado!');
  });
}
