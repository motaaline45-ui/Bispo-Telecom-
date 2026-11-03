import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  createCompany, DEFAULT_SETTINGS, KEYS, loadActiveCompanyId, loadCompanies, loadRecords,
  loadSettings, restoreCompanies, saveRecords, saveSettings, setActiveCompanyId,
} from '../js/db.js';
import { buildPayload } from '../js/drive.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test('migrates existing records and settings into a default company without deleting legacy data', () => {
  const record = { date: '2026-10-12', client: 'Cliente legado' };
  localStorage.setItem(KEYS.records, JSON.stringify([record]));
  localStorage.setItem(KEYS.settings, JSON.stringify({ company: 'Empresa legada', installUnit: 175 }));

  const companies = loadCompanies();

  assert.equal(companies.length, 1);
  assert.equal(companies[0].name, 'Empresa legada');
  assert.deepEqual(loadRecords().map((entry) => entry.client), ['Cliente legado']);
  assert.equal(loadSettings().installUnit, 175);
  assert.notEqual(localStorage.getItem(KEYS.records), null);
});

test('new companies have isolated records and settings', () => {
  const first = loadCompanies()[0];
  saveRecords([{ date: '2026-10-12', client: 'Empresa um' }]);
  const second = createCompany('Empresa dois');

  assert.equal(loadActiveCompanyId(), second.id);
  assert.deepEqual(loadRecords(), []);
  assert.equal(loadSettings().company, 'Empresa dois');

  saveRecords([{ date: '2026-10-13', client: 'Empresa dois' }]);
  saveSettings({ ...DEFAULT_SETTINGS, company: 'Empresa dois', installUnit: 200 });
  setActiveCompanyId(first.id);

  assert.deepEqual(loadRecords().map((entry) => entry.client), ['Empresa um']);
  assert.equal(loadSettings().company, first.name);
  setActiveCompanyId(second.id);
  assert.deepEqual(loadRecords().map((entry) => entry.client), ['Empresa dois']);
  assert.equal(loadSettings().installUnit, 200);
  assert.deepEqual(loadCompanies().map((company) => company.name), ['Bispo Telecom', 'Empresa dois']);
});

test('restores all companies and selects the backed-up active company', () => {
  const restored = restoreCompanies([
    {
      id: 'company-a',
      name: 'Empresa A',
      settings: { ...DEFAULT_SETTINGS, installUnit: 140 },
      records: [{ date: '2026-10-14', client: 'Registro A' }],
    },
    {
      id: 'company-b',
      name: 'Empresa B',
      settings: { ...DEFAULT_SETTINGS, installUnit: 210 },
      records: [{ date: '2026-10-15', client: 'Registro B' }],
    },
  ], 'company-b');

  assert.equal(restored.activeCompanyId, 'company-b');
  assert.equal(loadActiveCompanyId(), 'company-b');
  assert.equal(loadSettings().company, 'Empresa B');
  assert.equal(loadSettings().installUnit, 210);
  assert.deepEqual(loadRecords().map((entry) => entry.client), ['Registro B']);

  setActiveCompanyId('company-a');
  assert.equal(loadSettings().installUnit, 140);
  assert.deepEqual(loadRecords().map((entry) => entry.client), ['Registro A']);
});

test('multi-company backups retain legacy fields and identify the active company', () => {
  const payload = buildPayload({
    records: [{ date: '2026-10-15', client: 'Registro B' }],
    settings: { ...DEFAULT_SETTINGS, company: 'Empresa B' },
    companies: [{ id: 'company-b', name: 'Empresa B', records: [], settings: DEFAULT_SETTINGS }],
    activeCompanyId: 'company-b',
    updatedAt: '2026-10-15T12:00:00.000Z',
  });

  assert.equal(payload.version, 2);
  assert.deepEqual(payload.records, [{ date: '2026-10-15', client: 'Registro B' }]);
  assert.equal(payload.activeCompanyId, 'company-b');
  assert.equal(payload.companies.length, 1);
});
