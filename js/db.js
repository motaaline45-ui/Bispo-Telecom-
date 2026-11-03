// Armazenamento local e utilitários de data/valor.

export const KEYS = {
  records: 'bispo-telecom.records.v1',
  settings: 'bispo-telecom.settings.v1',
  companies: 'bispo-telecom.companies.v1',
  activeCompanyId: 'bispo-telecom.active-company.v1',
};

export const DEFAULT_SETTINGS = {
  company: 'Bispo Telecom',
  installUnit: 120,
  cameraUnit: 50,
  footer: '',
};

/* ---------------- dados ---------------- */

function companyRecordsKey(companyId) {
  return `bispo-telecom.company.${companyId}.records.v1`;
}

function companySettingsKey(companyId) {
  return `bispo-telecom.company.${companyId}.settings.v1`;
}

function readLegacyRecords() {
  try {
    const raw = localStorage.getItem(KEYS.records);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isValidRecord) : [];
  } catch (err) {
    console.warn('Falha ao ler lançamentos:', err);
    return [];
  }
}

function readLegacySettings() {
  try {
    const raw = localStorage.getItem(KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    if (settings.company === 'Relatório de Instalações') settings.company = DEFAULT_SETTINGS.company;
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function normalizeCompany(company) {
  if (!company || typeof company.id !== 'string' || !/^[\w-]{1,100}$/.test(company.id)) return null;
  return {
    id: company.id,
    name: String(company.name || DEFAULT_SETTINGS.company).trim().slice(0, 80) || DEFAULT_SETTINGS.company,
  };
}

function readCompanyRecords(companyId) {
  try {
    const data = JSON.parse(localStorage.getItem(companyRecordsKey(companyId)) || '[]');
    return Array.isArray(data) ? data.filter(isValidRecord) : [];
  } catch (err) {
    console.warn('Falha ao ler lançamentos:', err);
    return [];
  }
}

function readCompanySettings(companyId, companyName) {
  try {
    const saved = JSON.parse(localStorage.getItem(companySettingsKey(companyId)) || '{}');
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved, company: companyName || saved.company });
  } catch {
    return normalizeSettings({ ...DEFAULT_SETTINGS, company: companyName });
  }
}

function saveCompanyList(companies) {
  localStorage.setItem(KEYS.companies, JSON.stringify(companies));
}

export function loadCompanies() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.companies) || 'null');
    if (Array.isArray(saved)) {
      const companies = [];
      const seen = new Set();
      for (const entry of saved) {
        const company = normalizeCompany(entry);
        if (company && !seen.has(company.id)) {
          seen.add(company.id);
          companies.push(company);
        }
      }
      if (companies.length) {
        if (companies.length !== saved.length) saveCompanyList(companies);
        const activeId = localStorage.getItem(KEYS.activeCompanyId);
        if (!companies.some((company) => company.id === activeId)) {
          localStorage.setItem(KEYS.activeCompanyId, companies[0].id);
        }
        return companies;
      }
    }
  } catch (err) {
    console.warn('Falha ao ler empresas:', err);
  }

  const settings = readLegacySettings();
  const company = { id: `c-${uid()}`, name: settings.company };
  const records = readLegacyRecords().map((record) => makeRecord(record, settings));
  localStorage.setItem(companyRecordsKey(company.id), JSON.stringify(records));
  localStorage.setItem(companySettingsKey(company.id), JSON.stringify(settings));
  localStorage.setItem(KEYS.activeCompanyId, company.id);
  saveCompanyList([company]);
  return [company];
}

export function loadActiveCompanyId() {
  const companies = loadCompanies();
  const activeId = localStorage.getItem(KEYS.activeCompanyId);
  return companies.some((company) => company.id === activeId) ? activeId : companies[0].id;
}

export function setActiveCompanyId(companyId) {
  const companies = loadCompanies();
  if (!companies.some((company) => company.id === companyId)) {
    throw new Error('Empresa selecionada não encontrada.');
  }
  localStorage.setItem(KEYS.activeCompanyId, companyId);
  return companyId;
}

export function createCompany(name) {
  const companyName = String(name || '').trim().slice(0, 80);
  if (!companyName) throw new Error('Informe o nome da empresa.');
  const companies = loadCompanies();
  const company = { id: `c-${uid()}`, name: companyName };
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, company: companyName });
  localStorage.setItem(companyRecordsKey(company.id), '[]');
  localStorage.setItem(companySettingsKey(company.id), JSON.stringify(settings));
  saveCompanyList([...companies, company]);
  setActiveCompanyId(company.id);
  return company;
}

export function loadAllCompanyData() {
  return loadCompanies().map((company) => ({
    ...company,
    settings: readCompanySettings(company.id, company.name),
    records: readCompanyRecords(company.id),
  }));
}

export function restoreCompanies(companyData, activeCompanyId) {
  if (!Array.isArray(companyData)) throw new Error('Backup de empresas inválido.');
  const previous = loadCompanies();
  const companies = [];
  const seen = new Set();
  const dataById = new Map();
  for (const entry of companyData) {
    const company = normalizeCompany(entry);
    if (!company || seen.has(company.id) || !Array.isArray(entry.records)) {
      throw new Error('O backup contém uma empresa inválida.');
    }
    seen.add(company.id);
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...(entry.settings && typeof entry.settings === 'object' ? entry.settings : {}),
      company: company.name,
    });
    const records = entry.records.filter(isValidRecord).map((record) => makeRecord(record, settings));
    companies.push(company);
    dataById.set(company.id, { settings, records });
  }
  if (!companies.length) throw new Error('O backup não contém empresas válidas.');

  for (const company of companies) {
    const data = dataById.get(company.id);
    localStorage.setItem(companyRecordsKey(company.id), JSON.stringify(data.records));
    localStorage.setItem(companySettingsKey(company.id), JSON.stringify(data.settings));
  }
  for (const company of previous) {
    if (!seen.has(company.id)) {
      localStorage.removeItem(companyRecordsKey(company.id));
      localStorage.removeItem(companySettingsKey(company.id));
    }
  }
  saveCompanyList(companies);
  const selectedId = companies.some((company) => company.id === activeCompanyId)
    ? activeCompanyId
    : companies[0].id;
  localStorage.setItem(KEYS.activeCompanyId, selectedId);
  return { companies, activeCompanyId: selectedId };
}

export function loadRecords() {
  return readCompanyRecords(loadActiveCompanyId());
}

export function saveRecords(records) {
  localStorage.setItem(companyRecordsKey(loadActiveCompanyId()), JSON.stringify(records));
}

export function loadSettings() {
  const company = loadCompanies().find((entry) => entry.id === loadActiveCompanyId());
  return readCompanySettings(company.id, company.name);
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  const activeId = loadActiveCompanyId();
  localStorage.setItem(companySettingsKey(activeId), JSON.stringify(normalized));
  const companies = loadCompanies().map((company) => (
    company.id === activeId ? { ...company, name: normalized.company } : company
  ));
  saveCompanyList(companies);
}

function normalizeSettings(s) {
  return {
    company: String(s.company || DEFAULT_SETTINGS.company).slice(0, 80),
    installUnit: toNumber(s.installUnit, DEFAULT_SETTINGS.installUnit),
    cameraUnit: toNumber(s.cameraUnit, DEFAULT_SETTINGS.cameraUnit),
    footer: String(s.footer || '').slice(0, 160),
  };
}

export function isValidRecord(r) {
  return r && typeof r === 'object' && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && typeof r.client === 'string' && r.client.trim() !== '';
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeRecord(input, settings) {
  return {
    id: input.id || uid(),
    date: input.date,
    clientId: String(input.clientId ?? '').trim(),
    client: String(input.client ?? '').trim(),
    installQty: Math.max(0, toNumber(input.installQty, 1)),
    installUnit: Math.max(0, toNumber(input.installUnit, settings.installUnit)),
    cameraQty: Math.max(0, toNumber(input.cameraQty, 0)),
    cameraUnit: Math.max(0, toNumber(input.cameraUnit, settings.cameraUnit)),
    status: input.status === 'pendente' ? 'pendente' : 'ok',
    note: String(input.note ?? '').trim().slice(0, 200),
  };
}

export function recordTotals(r) {
  const installQty = toNumber(r.installQty, 0);
  const cameraQty = toNumber(r.cameraQty, 0);
  const installUnit = toNumber(r.installUnit, 0);
  const cameraUnit = toNumber(r.cameraUnit, 0);
  const installTotal = rnd(installQty * installUnit);
  const cameraTotal = rnd(cameraQty * cameraUnit);
  return { installQty, cameraQty, installTotal, cameraTotal, total: rnd(installTotal + cameraTotal) };
}

/* ---------------- números / texto ---------------- */

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function rnd(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function currency(n) {
  return brl.format(Number(n) || 0);
}

export function numberBR(n, digits = 0) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n) || 0);
}

/* ---------------- datas (sempre locais) ---------------- */

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function currentMonthISO() {
  return todayISO().slice(0, 7);
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Segunda-feira da semana da data informada. */
export function startOfWeek(iso) {
  const d = parseISO(iso);
  const offset = (d.getDay() + 6) % 7; // domingo=0 -> 6
  d.setDate(d.getDate() - offset);
  return toISO(d);
}

export function endOfWeek(iso) {
  return addDays(startOfWeek(iso), 6);
}

export function startOfMonth(ym) {
  return `${ym}-01`;
}

export function endOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return toISO(new Date(y, m, 0));
}

export function lastMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isoWeekOf(iso) {
  const d = parseISO(iso);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: target.getFullYear(), week };
}

export function weekInputValue(iso) {
  const { year, week } = isoWeekOf(iso);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekStartFromInput(value) {
  if (!value || !/^\d{4}-W\d{2}$/.test(value)) return startOfWeek(todayISO());
  const [yearStr, weekStr] = value.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setDate(jan4.getDate() - jan4Day);
  const monday = new Date(mondayOfWeek1);
  monday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7);
  return toISO(monday);
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function weekdayName(iso) {
  return WEEKDAYS[parseISO(iso).getDay()];
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[parseISO(iso).getDay()];
}

export function formatDateBR(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

export function formatMonthBR(ym) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
