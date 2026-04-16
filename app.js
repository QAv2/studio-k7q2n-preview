/* ---------- State ---------- */

const state = {
  theme: localStorage.getItem('theme') || 'blue',
  property: localStorage.getItem('property') || 'Oak Ridge Apartments',
  inspector: localStorage.getItem('inspector') || 'J. Smith',
  company: localStorage.getItem('company') || 'Your Management Co.',
  units: [],
  editingUnit: null,
  editingItem: null,
};

/* ---------- Sample note sets ---------- */

const SAMPLES = {
  small: `304B - kitchen faucet dripping, also blinds in LR busted, 2 slats

305 - all good

306A - smoke det chirping, needs battery. carpet stain by front door looks old

307 - toilet running, prob flapper. also garbage disposal jammed

308B - nothing to report

309 - tenant complaining re: neighbor noise (not a WO)`,

  large: `201 - hvac filter overdue, changed last quarter
202A - all good
203 - electrical outlet in kitchen not working, looks burnt
204 - ceiling fan LR wobbles, bearings prob shot. also paint scuff in hallway
205 - no issues
206B - toilet seat cracked, replace
207 - dryer vent clogged, lint everywhere outside. URGENT fire risk
208 - tenant asking about lease renewal, not a WO
209A - fridge not cooling, may need coil clean or new compressor
210 - nothing to report
211 - front door latch sticking, won't close right
212 - water heater leaking at base, puddle. URGENT
213 - bedroom window screen torn
214B - all clear`,

  messy: `Unit 101 -- mold on bathroom ceiling around vent, fan prob not venting right. also grout cracked in shower
102: fine
103 - kid drew on the wall w permanent marker lmao. also one of the burners on stove wont light clicker ok just no flame
104, nothing
105. stairs railing loose at top landing, safety concern
106 tenant wants early lease termination, call back
107: back porch light out, bulb or fixture idk
108b garage door opener remote dead, prob just battery but check`,

  clear: ``,
};

/* ---------- Parser ---------- */

const CATEGORY_RULES = [
  { cat: 'Plumbing', re: /\b(faucet|sink|toilet|drain|leak|drip|plumb|water heater|flapper|garbage disposal|shower|grout|pipe|clog|flush|tap)\b/i },
  { cat: 'Electrical', re: /\b(outlet|wiring|circuit|electric|breaker|switch|bulb|light(?:bulb)?|lamp|fan(?:\s|$)|ceiling fan|burnt)\b/i },
  { cat: 'Safety', re: /\b(smoke det|carbon monox|alarm|co2|co detector|extinguisher|railing|safety|fire risk|hazard)\b/i },
  { cat: 'HVAC', re: /\b(hvac|\bac\b|a\/c|heat|furnace|filter|thermostat|vent(?!ing right)|air cond|heating)\b/i },
  { cat: 'Appliance', re: /\b(fridge|refriger|oven|stove|dishwasher|microwave|washer|dryer|appliance|burner|compressor|coil|garage door opener)\b/i },
  { cat: 'Interior', re: /\b(blind|carpet|paint|wall|floor|door|window|trim|screen|scuff|marker|drew|ceiling(?!\s+fan))\b/i },
  { cat: 'Exterior', re: /\b(roof|siding|fence|gutter|driveway|walkway|porch|deck|yard)\b/i },
  { cat: 'Cleaning', re: /\b(stain|dirty|mold|odor|smell|trash|mildew|lint|dust)\b/i },
];

const URGENT_RE = /\b(urgent|asap|immediately|emergency|dangerous|flood|no hot water|no heat|fire risk|hazard|leak(?:ing)?\s+(?:at|everywhere)|puddle)\b/i;
const PRIORITY_RE = /\b(soon|overdue|broken|not working|won't|wont|doesn't|doesnt|dead|cracked|damaged|torn|loose)\b/i;
const COMMS_RE = /\b(complain|complaint|tenant (?:issue|asking|wants|wanting)|neighbor|noise|lease|renewal|not a wo|not a work order|termination|call back)\b/i;
const CLEAN_RE = /\b(all good|all clear|no issue|no problems|nothing to report|fine|okay|ok)\b/i;

function parseNotes(text) {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const units = [];
  let current = null;
  const unitPattern = /^\s*(?:unit\s+)?(\d{2,4}[A-Za-z]?)\s*[-:,\.]?\s*(.*)$/i;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const m = line.match(unitPattern);
    if (m) {
      if (current) units.push(finalizeUnit(current));
      current = { unit: m[1].toUpperCase(), rawText: m[2] };
    } else if (current) {
      current.rawText += ' ' + line;
    }
  }
  if (current) units.push(finalizeUnit(current));

  return units;
}

function finalizeUnit(u) {
  const text = u.rawText.trim();

  if (!text || CLEAN_RE.test(text)) {
    return { unit: u.unit, status: 'clean', items: [], rawText: text };
  }

  const parts = splitItems(text);
  const items = parts.map((p) => classifyItem(p)).filter(Boolean);

  if (items.length === 0) {
    return { unit: u.unit, status: 'clean', items: [], rawText: text };
  }

  const hasNonWO = items.some((i) => i.type !== 'work_order');
  const allNonWO = items.every((i) => i.type !== 'work_order');

  let status;
  if (allNonWO) status = 'flagged';
  else if (hasNonWO) status = 'mixed';
  else status = 'orders';

  return { unit: u.unit, status, items, rawText: text };
}

function splitItems(text) {
  const normalized = text
    .replace(/\.\s+(also|and|plus)\s+/gi, ' $1 ')
    .replace(/,\s*(also|and|plus)\s+/gi, ' $1 ');

  const parts = normalized
    .split(/(?:\.\s+|,\s*|\s+also\s+|\s+and\s+(?=[a-z])|\s+plus\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  return parts.length ? parts : [text];
}

function classifyItem(text) {
  const clean = text.replace(/^\W+|\W+$/g, '').trim();
  if (!clean) return null;

  let type = 'work_order';
  if (COMMS_RE.test(clean)) type = 'comms';

  let priority = 'Routine';
  if (URGENT_RE.test(clean)) priority = 'Urgent';
  else if (PRIORITY_RE.test(clean)) priority = 'Priority';

  let category = 'Other';
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(clean)) {
      category = rule.cat;
      break;
    }
  }

  const display = clean
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\burgent\b/gi, '')
    .replace(/\basap\b/gi, '')
    .trim();

  return {
    text: display || clean,
    category,
    priority,
    type,
  };
}

/* ---------- Rendering ---------- */

function render() {
  renderPhone1();
  renderPhone2();
  renderPhone3();
  renderHeaders();
}

function renderHeaders() {
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  document.getElementById('appSub1').textContent = `${state.property} · ${today}`;

  const unitCount = state.units.length;
  const orderCount = state.units.reduce((n, u) => n + u.items.filter((i) => i.type === 'work_order').length, 0);
  document.getElementById('importHint').textContent = unitCount
    ? `Imported from Notes · ${unitCount} unit${unitCount === 1 ? '' : 's'}`
    : `Paste or type notes below`;

  if (unitCount === 0) {
    document.getElementById('appSub2').textContent = 'No notes parsed yet';
  } else {
    const clean = state.units.filter((u) => u.status === 'clean').length;
    const flagged = state.units.filter((u) => u.status === 'flagged' || u.status === 'mixed').length;
    document.getElementById('appSub2').textContent = `${orderCount} work order${orderCount === 1 ? '' : 's'} · ${clean} clean · ${flagged} flagged`;
  }

  if (orderCount === 0) {
    document.getElementById('pdfTitle').textContent = 'No PDFs yet';
    document.getElementById('appSub3').textContent = 'Confirm orders in step 2 first';
  } else {
    document.getElementById('pdfTitle').textContent = `${orderCount} PDF${orderCount === 1 ? '' : 's'} Ready`;
    document.getElementById('appSub3').textContent = `${state.property} · ${today}`;
  }
}

function renderPhone1() {
  document.getElementById('notesInput').value = state.notesText ?? '';
}

function renderPhone2() {
  const container = document.getElementById('reviewContent');

  if (state.units.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Notes haven't been read yet.
        <div class="hint">Tap "Read My Notes" on the left.</div>
      </div>`;
    return;
  }

  const parts = [];
  parts.push(`<div class="summary-pill">Tap any card to <strong>edit</strong> before generating</div>`);

  const orderUnits = state.units.filter((u) => u.status !== 'clean');
  const cleanUnits = state.units.filter((u) => u.status === 'clean');

  for (const u of orderUnits) {
    const itemCount = u.items.length;
    const flagged = u.status === 'flagged' || u.status === 'mixed';
    const statusClass = flagged ? 'wo-flagged' : '';
    const statusText = u.status === 'flagged' ? 'not a WO?' : `${itemCount} item${itemCount === 1 ? '' : 's'}`;

    const itemsHtml = u.items
      .map((item, idx) => {
        const typeLabel = item.type === 'comms' ? 'Comms' : item.type === 'note' ? 'Note' : item.category;
        return `
          <div class="wo-issue" data-unit="${u.unit}" data-item="${idx}">${escapeHtml(item.text)}</div>
          <div class="wo-meta" data-unit="${u.unit}" data-item="${idx}">
            <span>${typeLabel}</span><span>${item.priority}</span>
          </div>`;
      })
      .join('');

    parts.push(`
      <div class="work-order ${statusClass}" data-unit="${u.unit}">
        <div class="wo-header">
          <div class="wo-unit">${u.unit}</div>
          <div class="wo-status">${statusText}</div>
        </div>
        ${itemsHtml}
        <div class="wo-edit">Edit &rarr;</div>
      </div>`);
  }

  if (cleanUnits.length) {
    const names = cleanUnits.map((u) => u.unit).join(' · ');
    parts.push(`
      <div class="work-order wo-clean">
        <div class="wo-header">
          <div class="wo-unit">${names}</div>
          <div class="wo-status">No issues</div>
        </div>
      </div>`);
  }

  const orderCount = state.units.reduce((n, u) => n + u.items.filter((i) => i.type === 'work_order').length, 0);
  parts.push(`<button class="btn-primary" id="generateBtn">Generate ${orderCount} PDF${orderCount === 1 ? '' : 's'}</button>`);

  container.innerHTML = parts.join('');

  container.querySelectorAll('.work-order[data-unit]:not(.wo-clean)').forEach((el) => {
    el.addEventListener('click', (e) => {
      const unit = el.dataset.unit;
      const issueEl = e.target.closest('[data-item]');
      const idx = issueEl ? parseInt(issueEl.dataset.item, 10) : 0;
      openEditModal(unit, idx);
    });
  });

  const genBtn = document.getElementById('generateBtn');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      renderPhone3();
      showToast(`Generated ${orderCount} PDF${orderCount === 1 ? '' : 's'}`);
      document.getElementById('phone3').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

function renderPhone3() {
  const container = document.getElementById('pdfContent');
  const workOrders = [];
  state.units.forEach((u) => {
    u.items.forEach((item) => {
      if (item.type === 'work_order') {
        workOrders.push({ unit: u.unit, ...item });
      }
    });
  });

  if (workOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Nothing to print yet.
        <div class="hint">Complete step 2 to generate PDFs.</div>
      </div>`;
    return;
  }

  const first = workOrders[0];
  const today = new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });

  container.innerHTML = `
    <div class="pdf-card">
      <div class="pdf-preview">
        <div class="pdf-title">WORK ORDER #2041</div>
        <div class="pdf-row"><span>Unit</span><span>${first.unit}</span></div>
        <div class="pdf-row"><span>Date</span><span>${today}</span></div>
        <div class="pdf-row"><span>Category</span><span>${first.category}</span></div>
        <div class="pdf-row"><span>Priority</span><span>${first.priority}</span></div>
        <div class="pdf-row"><span>Inspector</span><span>${escapeHtml(state.inspector)}</span></div>
        <div class="pdf-body">${escapeHtml(first.text)}</div>
        <div class="pdf-footer">${escapeHtml(state.company)}</div>
      </div>
      <div class="pdf-count">${workOrders.length} work order${workOrders.length === 1 ? '' : 's'}</div>
      <div class="pdf-sub">${escapeHtml(state.property)}</div>
    </div>
    <div class="actions-grid">
      <button class="action-btn" id="printBtn">
        <span class="action-label">Output</span>
        Print All
      </button>
      <button class="action-btn" id="emailBtn">
        <span class="action-label">Send</span>
        Email
      </button>
      <button class="action-btn primary" id="saveBtn">
        <span class="action-label">Archive</span>
        Save to Files
      </button>
    </div>`;

  document.getElementById('printBtn').addEventListener('click', () => printAll(workOrders));
  document.getElementById('emailBtn').addEventListener('click', () => showToast('Email flow (real app would open mail client)'));
  document.getElementById('saveBtn').addEventListener('click', () => downloadJSON(workOrders));
}

/* ---------- Edit modal ---------- */

function openEditModal(unitId, itemIdx) {
  const unit = state.units.find((u) => u.unit === unitId);
  if (!unit) return;
  const item = unit.items[itemIdx];
  if (!item) return;

  state.editingUnit = unitId;
  state.editingItem = itemIdx;

  document.getElementById('modalSub').textContent = `Unit ${unitId}`;
  document.getElementById('editIssue').value = item.text;
  document.getElementById('editCategory').value = item.category;
  document.getElementById('editPriority').value = item.priority;
  document.getElementById('editType').value = item.type;

  document.getElementById('modalBackdrop').classList.add('open');
}

function closeEditModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  state.editingUnit = null;
  state.editingItem = null;
}

function saveEdit() {
  const unit = state.units.find((u) => u.unit === state.editingUnit);
  if (!unit) return closeEditModal();
  const item = unit.items[state.editingItem];
  if (!item) return closeEditModal();

  item.text = document.getElementById('editIssue').value.trim();
  item.category = document.getElementById('editCategory').value;
  item.priority = document.getElementById('editPriority').value;
  item.type = document.getElementById('editType').value;

  const hasNonWO = unit.items.some((i) => i.type !== 'work_order');
  const allNonWO = unit.items.every((i) => i.type !== 'work_order');
  if (unit.items.length === 0) unit.status = 'clean';
  else if (allNonWO) unit.status = 'flagged';
  else if (hasNonWO) unit.status = 'mixed';
  else unit.status = 'orders';

  closeEditModal();
  renderPhone2();
  renderHeaders();
  showToast('Saved');
}

function deleteItem() {
  const unit = state.units.find((u) => u.unit === state.editingUnit);
  if (!unit) return closeEditModal();

  unit.items.splice(state.editingItem, 1);

  if (unit.items.length === 0) unit.status = 'clean';
  else {
    const hasNonWO = unit.items.some((i) => i.type !== 'work_order');
    const allNonWO = unit.items.every((i) => i.type !== 'work_order');
    unit.status = allNonWO ? 'flagged' : hasNonWO ? 'mixed' : 'orders';
  }

  closeEditModal();
  renderPhone2();
  renderHeaders();
  showToast('Deleted');
}

/* ---------- Print ---------- */

function printAll(workOrders) {
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const pages = workOrders.map((wo, idx) => `
    <div class="print-page">
      <header>
        <h1>WORK ORDER</h1>
        <div class="wo-num">#${2040 + idx + 1}</div>
      </header>
      <table>
        <tr><th>Unit</th><td>${wo.unit}</td><th>Date</th><td>${today}</td></tr>
        <tr><th>Property</th><td colspan="3">${escapeHtml(state.property)}</td></tr>
        <tr><th>Category</th><td>${wo.category}</td><th>Priority</th><td>${wo.priority}</td></tr>
        <tr><th>Inspector</th><td colspan="3">${escapeHtml(state.inspector)}</td></tr>
      </table>
      <h2>Issue</h2>
      <div class="issue-box">${escapeHtml(wo.text)}</div>
      <h2>Action Taken / Follow-up</h2>
      <div class="blank-box"></div>
      <footer>${escapeHtml(state.company)} &middot; Generated from inspection notes</footer>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><head><title>Work Orders</title>
    <style>
      @page { size: letter; margin: 0.75in; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; color: #1d1d1f; margin: 0; }
      .print-page { page-break-after: always; padding: 0; }
      .print-page:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1d1d1f; padding-bottom: 10px; margin-bottom: 20px; }
      header h1 { font-size: 22px; letter-spacing: 2px; margin: 0; }
      .wo-num { font-size: 14px; color: #6e6e73; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { text-align: left; padding: 8px 12px; border: 1px solid #c7c7cc; font-size: 13px; }
      th { background: #f5f5f7; font-weight: 600; width: 18%; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #6e6e73; margin: 20px 0 8px; }
      .issue-box { border: 1px solid #c7c7cc; padding: 14px; min-height: 60px; font-size: 14px; line-height: 1.5; background: #fafafa; }
      .blank-box { border: 1px solid #c7c7cc; padding: 14px; min-height: 140px; background: repeating-linear-gradient(180deg, transparent 0 26px, #e5e5ea 26px 27px); }
      footer { margin-top: 40px; font-size: 11px; color: #8e8e93; text-align: center; border-top: 1px solid #e5e5ea; padding-top: 12px; }
    </style></head><body>${pages}</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}

/* ---------- Download ---------- */

function downloadJSON(workOrders) {
  const batch = {
    property: state.property,
    inspector: state.inspector,
    company: state.company,
    generated: new Date().toISOString(),
    work_orders: workOrders,
    units: state.units,
  };
  const blob = new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inspection-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Saved to Files');
}

/* ---------- Toast ---------- */

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

/* ---------- Theme ---------- */

const THEME_NAMES = {
  blue: 'Classic',
  green: 'Forest',
  sepia: 'Paper',
  midnight: 'Midnight',
  cyber: 'Cyber',
};

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.querySelectorAll('.theme-swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.theme === theme);
  });
  document.getElementById('themeName').textContent = THEME_NAMES[theme] || '';
}

/* ---------- Utils ---------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Splash ---------- */

function showSplash() {
  const splash = document.getElementById('splash');
  splash.classList.remove('dismissed');
  splash.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function dismissSplash() {
  const splash = document.getElementById('splash');
  splash.classList.remove('visible');
  splash.classList.add('dismissed');
  localStorage.setItem('splash_seen_v2', '1');
  document.body.style.overflow = '';
}

function initSplash() {
  const splash = document.getElementById('splash');
  const params = new URLSearchParams(window.location.search);
  const forceShow = params.has('intro') || window.location.hash === '#intro';
  const seen = localStorage.getItem('splash_seen_v2');

  if (forceShow || !seen) {
    showSplash();
  } else {
    splash.classList.remove('visible');
    splash.classList.add('dismissed');
    document.body.style.overflow = '';
  }

  document.getElementById('splashCta').addEventListener('click', dismissSplash);
  document.getElementById('splashClose').addEventListener('click', dismissSplash);
  splash.addEventListener('click', (e) => {
    if (e.target === splash) dismissSplash();
  });

  const reopenBtn = document.getElementById('reopenIntro');
  if (reopenBtn) reopenBtn.addEventListener('click', showSplash);
}

/* ---------- Wire up ---------- */

function init() {
  setTheme(state.theme);
  initSplash();

  document.getElementById('propertyName').value = state.property;
  document.getElementById('inspectorName').value = state.inspector;
  document.getElementById('companyName').value = state.company;

  const initialSample = SAMPLES.small;
  state.notesText = initialSample;
  document.getElementById('notesInput').value = initialSample;

  state.units = parseNotes(initialSample);
  render();

  document.querySelectorAll('.theme-swatch').forEach((el) => {
    el.addEventListener('click', () => setTheme(el.dataset.theme));
  });

  document.getElementById('propertyName').addEventListener('input', (e) => {
    state.property = e.target.value || 'Property';
    localStorage.setItem('property', state.property);
    renderHeaders();
    renderPhone3();
  });
  document.getElementById('inspectorName').addEventListener('input', (e) => {
    state.inspector = e.target.value || 'Inspector';
    localStorage.setItem('inspector', state.inspector);
    renderPhone3();
  });
  document.getElementById('companyName').addEventListener('input', (e) => {
    state.company = e.target.value || 'Company';
    localStorage.setItem('company', state.company);
    renderPhone3();
  });

  document.querySelectorAll('.sample-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sample = SAMPLES[btn.dataset.sample] ?? '';
      state.notesText = sample;
      document.getElementById('notesInput').value = sample;
      state.units = parseNotes(sample);
      render();
      showToast(sample ? 'Sample loaded' : 'Cleared');
    });
  });

  document.getElementById('notesInput').addEventListener('input', (e) => {
    state.notesText = e.target.value;
  });

  document.getElementById('parseBtn').addEventListener('click', () => {
    state.notesText = document.getElementById('notesInput').value;
    state.units = parseNotes(state.notesText);
    render();
    if (state.units.length === 0) {
      showToast('No units found in notes');
    } else {
      showToast(`Read ${state.units.length} unit${state.units.length === 1 ? '' : 's'}`);
      document.getElementById('phone2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    state.notesText = '';
    state.units = [];
    document.getElementById('notesInput').value = '';
    render();
  });

  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', saveEdit);
  document.getElementById('deleteEdit').addEventListener('click', deleteItem);
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeEditModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const splash = document.getElementById('splash');
    if (splash.classList.contains('visible')) {
      dismissSplash();
    } else {
      closeEditModal();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
