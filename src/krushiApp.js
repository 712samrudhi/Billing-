// This is the ORIGINAL Krushi Bill application logic, unchanged in
// structure and behavior — only the outer wrapper was converted from an
// immediately-invoked function into an exported function so React can
// call it once, after the app's HTML markup has been mounted to the DOM.
// Every function, every render*() call, every Supabase call below is
// exactly as it was in the original single-file HTML app.

import { createDbClient } from './dbClient.js';

export function initKrushiApp(){
  // MySQL-backed replacement for the Supabase client — same .from()/.auth
  // interface, so nothing below this line needed to change.
  const sb = createDbClient();

  // ---------- MULTI-COMPANY (account switcher) ----------
  // Every row in products/invoices/customers/settings now carries a
  // company_id column. Existing data keeps working exactly as before —
  // it was migrated to company_id = DEFAULT_COMPANY_ID, nothing was
  // deleted or moved. Adding a company just means a new company_id
  // value; all reads/writes are filtered to the currently active one.
  const ACTIVE_COMPANY_KEY = 'krushi_active_company_id';
  const DEFAULT_COMPANY_ID = 'company_1';

  function getActiveCompanyId(){
    return localStorage.getItem(ACTIVE_COMPANY_KEY) || DEFAULT_COMPANY_ID;
  }
  function setActiveCompanyId(id){
    localStorage.setItem(ACTIVE_COMPANY_KEY, id);
  }
  function newCompanyId(){
    return 'company_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }

  const root = document.getElementById('krushi-root');
  const contentEl = document.getElementById('krushi-content');
  const titleEl = document.getElementById('krushi-title');
  const subtitleEl = document.getElementById('krushi-subtitle');
  const topbarActionEl = document.getElementById('krushi-topbar-action');
  const toastEl = document.getElementById('krushi-toast');

  let state = {
    view: 'dashboard',
    companyId: getActiveCompanyId(),
    companies: [],
    products: [],
    invoices: [],
    customers: [],
    counter: 0,
    loaded: false,
    editingInvoiceId: null,
    billItems: [{ productId: '', qty: 1 }],
    billCustomer: { name: '', phone: '' },
    billCustomerId: '',
    billSalespersonId: '',
    billType: 'Retail',
    billGst: 0,
    billGstManual: false,
    billDiscountType: 'percent',
    billDiscountValue: 0,
    billPayment: 'Cash',
    billBuyer: { address: '', gstin: '', stateName: '', placeOfSupply: '' },
    billShipSame: true,
    billConsignee: { name: '', address: '', gstin: '', stateName: '' },
    billMeta: { modeOfPayment: '', buyersOrderNo: '', buyersOrderDate: '', dispatchedThrough: '', destination: '', vehicleNo: '', driverName: '', paymentTerms: '', creditDays: 45 },
    accountsTab: 'dashboard',
    accTxns: [],
    accBanks: [],
    accSuppliers: [],
    accStockOpening: {},
    settings: { shopName: 'Krushi Seva Kendra', tagline: 'Fertilizer & Agri Inputs', address: '', gstin: '', phone: '', logoDataUrl: '', thankYou: 'Thank you for shopping with us!', email: '', stateName: '', stateCode: '', pan: '', bankName: '', accountNo: '', ifscBranch: '', jurisdiction: '', upiId: '', qrDataUrl: '', salespersons: [] }
  };

  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(()=> toastEl.classList.remove('show'), 2200);
  }

  function fmt(n){
    return '₹' + Number(n||0).toLocaleString('en-IN', {maximumFractionDigits: 2});
  }

  function todayStr(){
    return new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }

  // ---- DB <-> app field mappers ----
  function productFromDb(r){
    const extra = r.extra || {};
    return {
      id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock), lowStock: Number(r.low_stock),
      code: r.product_code || '', batch: r.batch_no || '',
      mrp: Number(r.mrp||0), dealerPrice: Number(r.dealer_price||0), retailPrice: Number(r.retail_price||0),
      gstPercent: Number(r.gst_percent||0), hsn: extra.hsn || ''
    };
  }
  function productToDb(p){
    return {
      name: p.name, unit: p.unit, stock: p.stock, low_stock: p.lowStock,
      product_code: p.code || null, batch_no: p.batch || null,
      mrp: p.mrp||0, dealer_price: p.dealerPrice||0, retail_price: p.retailPrice||0,
      gst_percent: p.gstPercent||0, extra: { hsn: p.hsn || '' },
      company_id: state.companyId
    };
  }
  function customerFromDb(r){
    const extra = r.extra || {};
    return { id: r.id, name: r.name, type: r.type, phone: r.phone||'', address: r.address||'', outstanding: Number(r.outstanding||0), payments: extra.payments || [], gstin: extra.gstin || '', stateName: extra.stateName || '' };
  }
  function customerToDb(c){
    return { name: c.name, type: c.type, phone: c.phone||null, address: c.address||null, outstanding: c.outstanding||0, extra: { payments: c.payments || [], gstin: c.gstin||'', stateName: c.stateName||'' }, company_id: state.companyId };
  }
  function invoiceFromDb(r){
    const extra = r.extra || {};
    const disc = extra.discount || {};
    const salesperson = extra.salesperson || {};
    return { id: r.id, invoiceNo: r.invoice_no, date: r.created_at, customerName: r.customer_name, customerPhone: r.customer_phone, customerId: r.customer_id || '', billType: r.bill_type || 'Retail', items: r.items, subtotal: Number(r.subtotal), discountType: disc.type || 'percent', discountValue: Number(disc.value || 0), discountAmount: Number(disc.amount || 0), gstPercent: Number(r.gst_percent), gstAmount: Number(r.gst_amount), total: Number(r.total), paymentMethod: r.payment_method,
      salespersonId: salesperson.id || '', salespersonName: salesperson.name || '',
      buyer: extra.buyer || { address:'', gstin:'', stateName:'', placeOfSupply:'' },
      consignee: extra.consignee || { sameAsBuyer: true, name:'', address:'', gstin:'', stateName:'' },
      meta: extra.meta || { modeOfPayment:'', buyersOrderNo:'', buyersOrderDate:'', dispatchedThrough:'', destination:'', vehicleNo:'', driverName:'', paymentTerms:'', creditDays: null }
    };
  }
  function invoiceToDb(inv){
    return { invoice_no: inv.invoiceNo, customer_name: inv.customerName || null, customer_phone: inv.customerPhone || null, customer_id: inv.customerId || null, bill_type: inv.billType || 'Retail', items: inv.items, subtotal: inv.subtotal, gst_percent: inv.gstPercent, gst_amount: inv.gstAmount, total: inv.total, payment_method: inv.paymentMethod,
      extra: { buyer: inv.buyer || {}, consignee: inv.consignee || {}, meta: inv.meta || {}, discount: { type: inv.discountType || 'percent', value: inv.discountValue || 0, amount: inv.discountAmount || 0 }, salesperson: { id: inv.salespersonId || '', name: inv.salespersonName || '' } },
      company_id: state.companyId
    };
  }
  function settingsFromDb(r){
    const extra = r.extra || {};
    return { shopName: r.shop_name, tagline: r.tagline || '', address: r.address || '', gstin: r.gstin || '', phone: r.phone || '', logoDataUrl: r.logo_data_url || '', thankYou: r.thank_you || '',
      email: extra.email || '', stateName: extra.stateName || '', stateCode: extra.stateCode || '', pan: extra.pan || '', bankName: extra.bankName || '', accountNo: extra.accountNo || '', ifscBranch: extra.ifscBranch || '', jurisdiction: extra.jurisdiction || '',
      upiId: extra.upiId || '', qrDataUrl: extra.qrDataUrl || '',
      salespersons: extra.salespersons || []
    };
  }
  function settingsToDb(s){
    // Keyed by company_id (not the old fixed id=1) so each company gets
    // its own settings row. upsert() below targets company_id on conflict.
    return { company_id: state.companyId, shop_name: s.shopName, tagline: s.tagline, address: s.address, gstin: s.gstin, phone: s.phone, logo_data_url: s.logoDataUrl, thank_you: s.thankYou,
      extra: { email: s.email||'', stateName: s.stateName||'', stateCode: s.stateCode||'', pan: s.pan||'', bankName: s.bankName||'', accountNo: s.accountNo||'', ifscBranch: s.ifscBranch||'', jurisdiction: s.jurisdiction||'', upiId: s.upiId||'', qrDataUrl: s.qrDataUrl||'', salespersons: s.salespersons||[] }
    };
  }

  // Persists the salespersons list (kept inside settings.extra — no schema
  // change needed) back to Supabase.
  async function saveSalespersons(){
    const { error } = await sb.from('settings').upsert(settingsToDb(state.settings), { onConflict: 'company_id' });
    if (error) throw error;
  }

  async function loadData(){
    try {
      const [{ data: products, error: pErr }, { data: invoices, error: iErr }, { data: settingsRow, error: sErr }, { data: customers, error: cErr }, { data: allCompanies, error: coErr }] = await Promise.all([
        sb.from('products').select('*').eq('company_id', state.companyId).order('name'),
        sb.from('invoices').select('*').eq('company_id', state.companyId).order('created_at', { ascending: false }),
        sb.from('settings').select('*').eq('company_id', state.companyId).maybeSingle(),
        sb.from('customers').select('*').eq('company_id', state.companyId).order('name'),
        sb.from('settings').select('company_id, shop_name, logo_data_url').order('id')
      ]);
      if (pErr) throw pErr;
      if (iErr) throw iErr;
      if (cErr) throw cErr;
      if (coErr) throw coErr;
      state.products = (products || []).map(productFromDb);
      state.invoices = (invoices || []).map(invoiceFromDb);
      state.customers = (customers || []).map(customerFromDb);
      state.counter = state.invoices.length;
      state.companies = allCompanies || [];
      if (settingsRow){
        state.settings = settingsFromDb(settingsRow);
      } else {
        // First time this company has no settings row yet (e.g. a brand
        // new company just added) — start with blank-ish defaults instead
        // of leaking the previous company's name into a fresh account.
        state.settings = { shopName: 'New Company', tagline: '', address: '', gstin: '', phone: '', logoDataUrl: '', thankYou: 'Thank you for shopping with us!', email: '', stateName: '', stateCode: '', pan: '', bankName: '', accountNo: '', ifscBranch: '', jurisdiction: '', upiId: '', qrDataUrl: '', salespersons: [] };
      }
    } catch(e){
      console.error('load error', e);
      toast('Data load nahi zala — internet check kara');
      state.products = []; state.invoices = []; state.customers = [];
    }
    loadAccountsData();
    state.loaded = true;
    updateSidebarBrand();
    renderCompanySwitcher();
    render();
  }

  function updateSidebarBrand(){
    const nameEl = document.getElementById('sidebar-brand-name');
    const subEl = document.getElementById('sidebar-brand-sub');
    const iconEl = document.getElementById('sidebar-brand-icon');
    if (nameEl) nameEl.textContent = state.settings.shopName || 'Krushi Bill';
    if (subEl) subEl.textContent = state.settings.tagline || 'Billing & Stock Management';
    if (iconEl){
      if (state.settings.logoDataUrl){
        iconEl.innerHTML = '<img src="'+state.settings.logoDataUrl+'" style="width:100%;height:100%;object-fit:contain;border-radius:4px">';
      } else {
        iconEl.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2C12 2 7 6 7 11C7 14 9 16 12 16C15 16 17 14 17 11C17 6 12 2 12 2Z" fill="#C98A3B"/><path d="M12 16V22" stroke="#4A7C59" stroke-width="1.5"/><path d="M12 19C12 19 9 18 8 20" stroke="#4A7C59" stroke-width="1.5" stroke-linecap="round"/><path d="M12 19C12 19 15 18 16 20" stroke="#4A7C59" stroke-width="1.5" stroke-linecap="round"/></svg>';
      }
    }
  }

  // ---------- COMPANY SWITCHER (Instagram-style "switch account") ----------
  function companyInitial(name){
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function renderCompanySwitcher(){
    const panel = document.getElementById('switcher-panel');
    if (!panel) return;
    let list = state.companies.slice();
    // Make sure the currently active company always shows up even before
    // it has a settings row saved (brand new company just created).
    if (!list.find(c => c.company_id === state.companyId)){
      list.unshift({ company_id: state.companyId, shop_name: state.settings.shopName || 'New Company', logo_data_url: state.settings.logoDataUrl || '' });
    }
    let html = '';
    list.forEach(c => {
      const active = c.company_id === state.companyId;
      const avatar = c.logo_data_url
        ? '<img src="'+c.logo_data_url+'">'
        : companyInitial(c.shop_name);
      html += '<div class="switcher-item" data-company-id="'+esc(c.company_id)+'">'
        + '<div class="switcher-avatar">'+avatar+'</div>'
        + '<div class="switcher-name">'+esc(c.shop_name || 'Unnamed Company')+(active ? '<div class="s-sub">Current account</div>' : '')+'</div>'
        + (active ? '<svg class="switcher-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' : '')
        + '</div>';
    });
    html += '<div class="switcher-divider"></div>';
    html += '<div class="switcher-add" id="switcher-add-btn"><div class="plus-circle">+</div> Add Company</div>';
    panel.innerHTML = html;

    panel.querySelectorAll('.switcher-item').forEach(el => {
      el.addEventListener('click', () => switchCompany(el.dataset.companyId));
    });
    const addBtn = document.getElementById('switcher-add-btn');
    if (addBtn) addBtn.addEventListener('click', openAddCompanyModal);
  }

  function closeSwitcherPanel(){
    document.getElementById('switcher-panel').classList.remove('open');
    document.getElementById('brand-chevron').classList.remove('open');
  }

  document.getElementById('brand-switcher-toggle').addEventListener('click', (e) => {
    const panel = document.getElementById('switcher-panel');
    const chevron = document.getElementById('brand-chevron');
    const willOpen = !panel.classList.contains('open');
    panel.classList.toggle('open', willOpen);
    chevron.classList.toggle('open', willOpen);
    e.stopPropagation();
  });
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('brand-switcher-toggle');
    if (wrap && !wrap.contains(e.target)) closeSwitcherPanel();
  });

  async function switchCompany(companyId){
    if (companyId === state.companyId){ closeSwitcherPanel(); return; }
    state.companyId = companyId;
    setActiveCompanyId(companyId);
    closeSwitcherPanel();
    state.view = 'dashboard';
    toast('Switching company...');
    await loadData();
    toast('Switched to ' + (state.settings.shopName || 'company'));
  }

  function openAddCompanyModal(){
    closeSwitcherPanel();
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3>Add New Company</h3>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px">Ha ekdum navin, doosaryapasun independent account asel — swatahche products, customers ani bills. Tumcha sध्याचa data la kahihi dhakka lagnar nahi.</div>
        <div class="field"><label>Company Name</label><input id="ac-name" placeholder="e.g. Bharat Agro Farmers Producers Company Ltd" autofocus></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="ac-cancel">Cancel</button>
          <button class="btn-primary" id="ac-save">Create &amp; Switch</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('ac-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('ac-save').addEventListener('click', async () => {
      const name = document.getElementById('ac-name').value.trim();
      if (!name){ toast('Company name takaa'); return; }
      const btn = document.getElementById('ac-save');
      btn.textContent = 'Creating...'; btn.disabled = true;
      try {
        const companyId = newCompanyId();
        const { error } = await sb.from('settings').insert({
          company_id: companyId, shop_name: name, tagline: '', address: '', gstin: '', phone: '', logo_data_url: '', thank_you: 'Thank you for shopping with us!',
          extra: { email: '', stateName: '', stateCode: '', pan: '', bankName: '', accountNo: '', ifscBranch: '', jurisdiction: '' }
        });
        if (error) throw error;
        overlay.remove();
        await switchCompany(companyId);
        toast('New company created: ' + name);
      } catch(e){
        console.error(e);
        toast('Company create failed: ' + (e.message || 'unknown error'));
        btn.textContent = 'Create & Switch'; btn.disabled = false;
      }
    });
  }

  async function saveSettings(){
    try {
      const { error } = await sb.from('settings').upsert(settingsToDb(state.settings), { onConflict: 'company_id' });
      if (error) throw error;
      updateSidebarBrand();
      const { data: allCompanies } = await sb.from('settings').select('company_id, shop_name, logo_data_url').order('id');
      state.companies = allCompanies || [];
      renderCompanySwitcher();
      return true;
    } catch(e){
      console.error(e);
      toast('Save failed: ' + (e.message || 'unknown error'));
      return false;
    }
  }

  // ---- Product Unit helpers (Kg / Litre / ml with free quantity) ----
  // Stored `unit` is still a plain string (e.g. "2.5 Kg", "500 ml", "Bag") —
  // no database/schema change, just a friendlier way to build/parse it.
  const UNIT_TYPES = ['Kg','Gm','Litre','ml','Bag','Piece','Packet','Other'];
  function parseProductUnit(u){
    u = (u==null ? '' : String(u)).trim();
    let m = u.match(/^([\d.]+)\s*(kg|gm|gram|grams|litre|liter|ml)$/i);
    if (m){
      let t = m[2].toLowerCase();
      t = (t === 'kg') ? 'Kg' : ((t === 'gm' || t === 'gram' || t === 'grams') ? 'Gm' : (t === 'litre' || t === 'liter') ? 'Litre' : 'ml');
      return { type: t, value: m[1] };
    }
    let m2 = u.match(/^(.+)\s+(Bag|Piece|Packet)$/i);
    if (m2) return { type: m2[2].charAt(0).toUpperCase() + m2[2].slice(1).toLowerCase(), value: m2[1].trim() };
    if (u === 'Bag' || u === 'Piece' || u === 'Packet') return { type: u, value: '' };
    if (/^kg$/i.test(u)) return { type: 'Kg', value: '1' };
    if (/^(gm|gram|grams)$/i.test(u)) return { type: 'Gm', value: '1' };
    if (/^(litre|liter)$/i.test(u)) return { type: 'Litre', value: '1' };
    if (/^ml$/i.test(u)) return { type: 'ml', value: '1' };
    if (u === '') return { type: 'Kg', value: '' };
    return { type: 'Other', value: u };
  }
  function composeProductUnit(type, value){
    if (type === 'Bag' || type === 'Piece' || type === 'Packet'){
      const v = (value==null ? '' : String(value)).trim();
      return v ? (v + ' ' + type) : type;
    }
    if (type === 'Other') return (value==null ? '' : String(value)).trim();
    const v = (value==null ? '' : String(value)).trim();
    return (v ? v : '1') + ' ' + type;
  }

  // When a product's unit already carries its packing size (e.g. "1 Litre",
  // "500 ml", "25 Kg"), simply printing qty + unit produced confusing output
  // like "1 1 Litre" (the qty "1" followed by the packing size "1 Litre").
  // These two helpers split that into two separate, correct pieces:
  //   formatAltQty   -> the packing size itself, e.g. "1 Litre" (Alt. Qty column)
  //   formatQtyCount -> how many of that pack were sold, e.g. "2 Nos" (Quantity column)
  // Bag/Piece/Packet/Other units aren't packing sizes in this sense, so they
  // keep the old behaviour (qty + unit, e.g. "2 Bag") and Alt. Qty stays blank.
  // No stored data (item.qty, item.unit) is changed — this only affects display.
  function formatAltQty(unit){
    const u = parseProductUnit(unit);
    if (u.type === 'Kg' || u.type === 'Gm' || u.type === 'Litre' || u.type === 'ml'){
      return composeProductUnit(u.type, u.value);
    }
    return '';
  }
  function formatQtyCount(qty, unit){
    const u = parseProductUnit(unit);
    if (u.type === 'Kg' || u.type === 'Gm' || u.type === 'Litre' || u.type === 'ml'){
      return qty + ' Nos';
    }
    return qty + ' ' + unit;
  }

  function uid(){ return Math.random().toString(36).slice(2,10); }

  function lowStockProducts(){
    return state.products.filter(p => Number(p.stock) <= Number(p.lowStock||0));
  }

  function setView(v){
    state.view = v;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === v);
    });
    if (v === 'newbill' && !state.editingInvoiceId) { state.billItems = [{ productId: '', qty: 1 }]; state.billCustomer = {name:'', phone:''}; state.billCustomerId = ''; state.billSalespersonId = ''; state.billType = 'Retail'; state.billGst = 0; state.billGstManual = false; state.billDiscountType = 'percent'; state.billDiscountValue = 0; state.billPayment = 'Cash'; state.billBuyer = {address:'',gstin:'',stateName:'',placeOfSupply:''}; state.billShipSame = true; state.billConsignee = {name:'',address:'',gstin:'',stateName:''}; state.billMeta = {modeOfPayment:'',buyersOrderNo:'',buyersOrderDate:'',dispatchedThrough:'',destination:'',vehicleNo:'',driverName:'',paymentTerms:'',creditDays:45}; }
    if (v !== 'newbill') { state.editingInvoiceId = null; }
    render();
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.view));
  });

  function render(){
    if (!state.loaded){
      contentEl.innerHTML = '<div class="loading-wrap">Loading data...</div>';
      return;
    }
    topbarActionEl.innerHTML = '';
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'newbill') renderNewBill();
    else if (state.view === 'stock') renderStock();
    else if (state.view === 'invoices') renderInvoices();
    else if (state.view === 'settings') renderSettings();
    else if (state.view === 'customers') renderCustomers();
    else if (state.view === 'salespersons') renderSalespersons();
    else if (state.view === 'reports') renderReports();
    else if (state.view === 'accounts') renderAccounts();
  }

  // ---------- DASHBOARD ----------
  function renderDashboard(){
    titleEl.textContent = 'Dashboard';
    subtitleEl.textContent = todayStr() + ' — sales and stock overview';

    const todayKey = new Date().toDateString();
    const todaysInvoices = state.invoices.filter(i => new Date(i.date).toDateString() === todayKey);
    const todaysSales = todaysInvoices.reduce((s,i)=> s + i.total, 0);
    const todaysCollection = todaysInvoices.filter(i => i.paymentMethod !== 'Credit').reduce((s,i)=> s + i.total, 0);
    const pendingPayments = state.customers.reduce((s,c)=> s + Number(c.outstanding||0), 0);
    const low = lowStockProducts();
    const outOfStock = state.products.filter(p => Number(p.stock) <= 0);

    let html = '<div class="stat-grid">';
    html += statCard("Today's Sales", fmt(todaysSales), false);
    html += statCard("Today's Collection", fmt(todaysCollection), false);
    html += statCard('Pending Payments', fmt(pendingPayments), pendingPayments > 0);
    html += statCard('Low Stock Alert', low.length, low.length > 0);
    html += '</div>';
    html += '<div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-top:-8px">';
    html += statCard('Out of Stock Products', outOfStock.length, outOfStock.length > 0);
    html += statCard('Total Products', state.products.length, false);
    html += '</div>';

    html += '<div class="panel"><h2>Low Stock Items <span class="count-badge">' + low.length + '</span></h2>';
    if (low.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>All products have sufficient stock</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Product</th><th>Stock</th><th>Reorder Level</th></tr></thead><tbody>';
      low.forEach(p => {
        html += '<tr><td>' + esc(p.name) + '</td><td class="mono">' + p.stock + ' ' + esc(p.unit) + '</td><td><span class="tag low">Low</span></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Recent Bills <span class="count-badge">' + state.invoices.length + '</span></h2>';
    const recent = [...state.invoices].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,5);
    if (recent.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No bills yet. Click "New Bill" to create one.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Bill No</th><th>Customer</th><th>Date</th><th style="text-align:right">Amount</th></tr></thead><tbody>';
      recent.forEach(i => {
        html += '<tr><td class="mono">' + esc(i.invoiceNo) + '</td><td>' + esc(i.customerName || '—') + '</td><td>' + new Date(i.date).toLocaleDateString('en-IN') + '</td><td class="mono" style="text-align:right">' + fmt(i.total) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Customer History <span class="count-badge">' + state.customers.length + '</span></h2>';
    html += '<input id="dash-cust-search" placeholder="Type a customer name to see their history..." style="margin-bottom:10px">';
    const custWithStats = state.customers.map(c => {
      const custInv = state.invoices.filter(i => i.customerId === c.id);
      const lastInv = custInv.slice().sort((a,b) => new Date(b.date) - new Date(a.date))[0];
      return { c, bills: custInv.length, lastDate: lastInv ? new Date(lastInv.date) : null };
    }).sort((a,b) => (b.c.outstanding||0) - (a.c.outstanding||0) || b.bills - a.bills);
    html += '<div id="dash-cust-list">';
    if (custWithStats.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No customers yet. Add one from the Customers page.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Name</th><th class="num">Bills</th><th>Last Bill</th><th style="text-align:right">Outstanding</th></tr></thead><tbody>';
      custWithStats.slice(0,6).forEach(x => {
        html += '<tr class="dash-cust-row" data-id="'+x.c.id+'" style="cursor:pointer">';
        html += '<td style="font-weight:600;color:var(--soil)">'+esc(x.c.name)+'</td>';
        html += '<td class="num">'+x.bills+'</td>';
        html += '<td>'+(x.lastDate ? x.lastDate.toLocaleDateString('en-IN') : '—')+'</td>';
        html += '<td class="mono" style="text-align:right;'+(x.c.outstanding>0?'color:var(--rust);font-weight:600':'')+'">'+fmt(x.c.outstanding)+'</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div></div>';

    contentEl.innerHTML = html;

    const searchEl = document.getElementById('dash-cust-search');
    if (searchEl){
      searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        const filtered = q ? custWithStats.filter(x => x.c.name.toLowerCase().includes(q)) : custWithStats.slice(0,6);
        const listEl = document.getElementById('dash-cust-list');
        if (filtered.length === 0){
          listEl.innerHTML = '<table><tbody><tr class="empty-row"><td>No matching customer found.</td></tr></tbody></table>';
        } else {
          let t = '<table><thead><tr><th>Name</th><th class="num">Bills</th><th>Last Bill</th><th style="text-align:right">Outstanding</th></tr></thead><tbody>';
          filtered.forEach(x => {
            t += '<tr class="dash-cust-row" data-id="'+x.c.id+'" style="cursor:pointer">';
            t += '<td style="font-weight:600;color:var(--soil)">'+esc(x.c.name)+'</td>';
            t += '<td class="num">'+x.bills+'</td>';
            t += '<td>'+(x.lastDate ? x.lastDate.toLocaleDateString('en-IN') : '—')+'</td>';
            t += '<td class="mono" style="text-align:right;'+(x.c.outstanding>0?'color:var(--rust);font-weight:600':'')+'">'+fmt(x.c.outstanding)+'</td>';
            t += '</tr>';
          });
          t += '</tbody></table>';
          listEl.innerHTML = t;
          bindDashCustRows();
        }
      });
    }
    bindDashCustRows();
  }

  function bindDashCustRows(){
    document.querySelectorAll('.dash-cust-row').forEach(r => {
      r.addEventListener('click', () => renderCustomerLedger(r.dataset.id));
    });
  }

  function statCard(label, val, alert){
    return '<div class="stat-card' + (alert ? ' alert' : ' leaf-accent') + '"><div class="stat-label">' + label + '</div><div class="stat-val">' + val + '</div></div>';
  }

  // Re-renders a view without the page jumping to the top and without
  // losing keyboard focus — used for inputs (like item Qty) that need
  // to re-render totals live on every keystroke.
  function rerenderPreserving(renderFn){
    const active = document.activeElement;
    const id = active && active.id ? active.id : null;
    const cls = (!id && active && active.classList && active.classList.length) ? active.classList[0] : null;
    const rowEl = active ? active.closest('.item-row') : null;
    const rowIdx = rowEl ? rowEl.dataset.idx : null;
    const scrollY = window.scrollY;
    renderFn();
    window.scrollTo(0, scrollY);
    let target = null;
    if (rowIdx !== null && cls){
      const newRow = document.querySelector('.item-row[data-idx="'+rowIdx+'"]');
      target = newRow ? newRow.querySelector('.'+cls) : null;
    } else if (id){
      target = document.getElementById(id);
    }
    if (target) {
      target.focus();
      // Number inputs don't support setSelectionRange directly in most
      // browsers — flip to text briefly to put the caret at the END
      // instead of the start, otherwise every re-render (which happens on
      // every keystroke here) jams the next digit typed BEFORE the
      // existing ones (typing "20" would land as "02").
      if (target.tagName === 'INPUT' && target.type === 'number'){
        const len = String(target.value).length;
        target.type = 'text';
        try { target.setSelectionRange(len, len); } catch(e){}
        target.type = 'number';
      } else if (typeof target.setSelectionRange === 'function' && typeof target.value === 'string'){
        const len = target.value.length;
        try { target.setSelectionRange(len, len); } catch(e){}
      }
    }
  }

  function esc(s){
    return (s==null?'':String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Converts a rupee amount to words in the Indian numbering system
  // (Crore/Lakh/Thousand), e.g. 34942 -> "Thirty Four Thousand Nine Hundred Forty Two"
  function numberToWordsIndian(num){
    num = Math.round(Number(num)||0);
    if (num === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function twoDigits(n){
      if (n < 20) return ones[n];
      return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
    }
    function threeDigits(n){
      let s = '';
      if (n >= 100){ s += ones[Math.floor(n/100)] + ' Hundred'; n = n % 100; if (n) s += ' '; }
      if (n > 0) s += twoDigits(n);
      return s;
    }
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thousand = Math.floor(num / 1000); num %= 1000;
    const hundred = num;
    let parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));
    return parts.join(' ');
  }
  function amountInWords(amount){
    return 'INR ' + numberToWordsIndian(amount) + ' Only';
  }

  // ---------- NEW BILL ----------
  function priceFor(prod){
    if (!prod) return 0;
    if (state.billType === 'Dealer') return Number(prod.dealerPrice||0) || Number(prod.retailPrice||0);
    return Number(prod.retailPrice||0) || Number(prod.dealerPrice||0);
  }

  // Weighted-average GST% derived from each selected product's own GST%
  // (set in Stock/Add Product). Keeps the bill's tax automatically in sync
  // with product master, even when items have different GST rates.
  function computeAutoGstPercent(){
    let subtotal = 0, gstSum = 0;
    state.billItems.forEach(row => {
      const prod = state.products.find(p => p.id === row.productId);
      if (!prod) return;
      const lineTotal = priceFor(prod) * (Number(row.qty) || 0);
      subtotal += lineTotal;
      gstSum += lineTotal * (Number(prod.gstPercent) || 0) / 100;
    });
    if (subtotal <= 0) return 0;
    return Math.round((gstSum / subtotal * 100) * 100) / 100;
  }

  function renderNewBill(){
    const editInv = state.editingInvoiceId ? state.invoices.find(i => i.id === state.editingInvoiceId) : null;
    titleEl.textContent = editInv ? ('Edit Bill — ' + editInv.invoiceNo) : 'New Bill';
    subtitleEl.textContent = editInv ? 'Change items or details, then update the bill' : 'Select products to create a bill';

    if (state.products.length === 0){
      contentEl.innerHTML = '<div class="panel"><h2>No products yet</h2><p style="color:var(--ink-soft);font-size:13px;margin:0 0 12px 0">Add products in "Stock" first to create a bill.</p><button class="btn-primary" id="goto-stock">Go to Stock</button></div>';
      document.getElementById('goto-stock').addEventListener('click', ()=> setView('stock'));
      return;
    }

    const productOptions = (selId) => state.products.map(p =>
      '<option value="'+p.id+'" '+(p.id===selId?'selected':'')+'>'+esc(p.name)+' ('+p.stock+' '+esc(p.unit)+' in stock)</option>'
    ).join('');

    const customerOptions = state.customers.map(c =>
      '<option value="'+c.id+'" '+(state.billCustomerId===c.id?'selected':'')+'>'+esc(c.name)+' \u2014 '+esc(c.type)+(c.outstanding>0?' (Due '+fmt(c.outstanding)+')':'')+'</option>'
    ).join('');

    const salespersonOptions = (state.settings.salespersons||[]).map(sp =>
      '<option value="'+sp.id+'" '+(state.billSalespersonId===sp.id?'selected':'')+'>'+esc(sp.name)+'</option>'
    ).join('');

    let itemsHtml = '';
    state.billItems.forEach((row, idx) => {
      const prod = state.products.find(p => p.id === row.productId);
      const rate = priceFor(prod);
      const lineTotal = prod ? (rate * (Number(row.qty)||0)) : 0;
      itemsHtml += '<div class="item-row" data-idx="'+idx+'">';
      itemsHtml += '<div class="field"><label>' + (idx===0?'Product':'') + '</label><select class="bi-product">'+
        '<option value="">-- select --</option>' + productOptions(row.productId) + '</select></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'HSN':'') + '</label><input class="mono" value="'+ (prod && prod.hsn ? esc(prod.hsn) : '\u2014') +'" disabled style="background:var(--paper)"></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'Batch':'') + '</label><input class="mono" value="'+ (prod && prod.batch ? esc(prod.batch) : '\u2014') +'" disabled style="background:var(--paper)"></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'Qty':'') + '</label><input class="bi-qty" type="number" min="0.01" step="0.01" value="'+row.qty+'"></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'Rate':'') + '</label><input class="mono" value="'+ (prod ? fmt(rate) : '\u2014') +'" disabled style="background:var(--paper)"></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'GST%':'') + '</label><input class="mono" value="'+ (prod && prod.gstPercent ? prod.gstPercent : '\u2014') +'" disabled style="background:var(--paper)"></div>';
      itemsHtml += '<div class="field"><label>' + (idx===0?'Total':'') + '</label><div class="line-total">'+fmt(lineTotal)+'</div></div>';
      itemsHtml += '<button class="btn-icon bi-remove" title="Remove" style="margin-bottom:8px">\u2715</button>';
      itemsHtml += '</div>';
    });

    const subtotal = state.billItems.reduce((s,row) => {
      const prod = state.products.find(p => p.id === row.productId);
      return s + (prod ? priceFor(prod) * (Number(row.qty)||0) : 0);
    }, 0);
    const discountValue = Number(state.billDiscountValue) || 0;
    let discountAmount = state.billDiscountType === 'percent' ? (subtotal * discountValue / 100) : discountValue;
    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
    const taxableAmount = subtotal - discountAmount;
    if (!state.billGstManual){
      state.billGst = computeAutoGstPercent();
    }
    const gstPct = Number(state.billGst) || 0;
    const gstAmount = taxableAmount * gstPct / 100;
    const grandTotal = taxableAmount + gstAmount;

    let html = '<div class="bill-layout">';
    html += '<div>';
    html += '<div class="panel"><h2>Billing Type &amp; Customer</h2>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Billing Type</label><select id="bill-type">' +
      ['Retail','Dealer'].map(t => '<option value="'+t+'" '+(state.billType===t?'selected':'')+'>'+t+' ('+(t==='Retail'?'B2C':'B2B')+')</option>').join('') + '</select></div>';
    html += '<div class="field"><label>Customer (optional)</label><select id="bill-customer-id"><option value="">-- Walk-in / manual --</option>' + customerOptions + '</select></div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Name</label><input id="cust-name" value="'+esc(state.billCustomer.name)+'" placeholder="Customer name" '+(state.billCustomerId?'disabled':'')+'></div>';
    html += '<div class="field"><label>Phone</label><input id="cust-phone" value="'+esc(state.billCustomer.phone)+'" placeholder="10 digit number" '+(state.billCustomerId?'disabled':'')+'></div>';
    html += '</div>';
    html += '<div class="field"><label>Salesperson (optional)</label><select id="bill-salesperson-id"><option value="">-- None --</option>' + salespersonOptions + '</select></div>';
    if ((state.settings.salespersons||[]).length === 0){
      html += '<div style="font-size:11.5px;color:var(--ink-soft);margin:-4px 0 6px">No salespersons added yet — add them from "Sales Team" in the sidebar.</div>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Buyer (Bill To) — GST Details <span class="count-badge">optional</span></h2>';
    html += '<div class="field"><label>Buyer Address</label><textarea id="buyer-address" rows="2" placeholder="Full address">'+esc(state.billBuyer.address)+'</textarea></div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr 1fr">';
    html += '<div class="field"><label>GSTIN/UIN</label><input id="buyer-gstin" value="'+esc(state.billBuyer.gstin)+'" placeholder="27ABCDE1234F1Z5"></div>';
    html += '<div class="field"><label>State Name</label><input id="buyer-state" value="'+esc(state.billBuyer.stateName)+'" placeholder="e.g. Maharashtra"></div>';
    html += '<div class="field"><label>Place of Supply</label><input id="buyer-pos" value="'+esc(state.billBuyer.placeOfSupply)+'" placeholder="e.g. Maharashtra"></div>';
    html += '</div>';
    html += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--ink);margin:6px 0 4px"><input type="checkbox" id="ship-same" '+(state.billShipSame?'checked':'')+' style="width:auto"> Consignee (Ship To) is same as Buyer</label>';
    if (!state.billShipSame){
      html += '<div class="field"><label>Consignee Name</label><input id="ship-name" value="'+esc(state.billConsignee.name)+'" placeholder="Ship-to party name"></div>';
      html += '<div class="field"><label>Consignee Address</label><textarea id="ship-address" rows="2" placeholder="Full address">'+esc(state.billConsignee.address)+'</textarea></div>';
      html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
      html += '<div class="field"><label>GSTIN/UIN</label><input id="ship-gstin" value="'+esc(state.billConsignee.gstin)+'" placeholder="27ABCDE1234F1Z5"></div>';
      html += '<div class="field"><label>State Name</label><input id="ship-state" value="'+esc(state.billConsignee.stateName)+'" placeholder="e.g. Maharashtra"></div>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Transport &amp; Delivery Challan Details <span class="count-badge">optional</span></h2>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Transporter Name (Dispatched through)</label><input id="meta-dispatched" value="'+esc(state.billMeta.dispatchedThrough||'')+'" placeholder="e.g. ABC Transport / By Road"></div>';
    html += '<div class="field"><label>Destination</label><input id="meta-destination" value="'+esc(state.billMeta.destination||'')+'" placeholder="e.g. Pune"></div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Vehicle No.</label><input id="meta-vehicle" value="'+esc(state.billMeta.vehicleNo||'')+'" placeholder="e.g. MH10AB1234"></div>';
    html += '<div class="field"><label>Driver Name</label><input id="meta-driver" value="'+esc(state.billMeta.driverName||'')+'" placeholder="Driver name"></div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Buyer\'s Order No.</label><input id="meta-order-no" value="'+esc(state.billMeta.buyersOrderNo||'')+'" placeholder="e.g. PO-2026-045"></div>';
    html += '<div class="field"><label>Buyer\'s Order Date</label><input id="meta-order-date" type="date" value="'+esc(state.billMeta.buyersOrderDate||'')+'"></div>';
    html += '</div>';
    html += '<div class="field"><label>Payment Terms</label><input id="meta-terms" value="'+esc(state.billMeta.paymentTerms||'')+'" placeholder="e.g. On Bills / 15 days from receiving date"></div>';
    html += '</div>';

    html += '<div class="panel"><h2>Items</h2>' + itemsHtml;
    html += '<button class="btn-secondary" id="add-item" style="margin-top:4px">+ Add Item</button>';
    html += '</div>';

    html += '<div class="panel"><h2>Payment &amp; GST</h2>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Discount</label><div style="display:flex;gap:6px"><input id="bill-discount-value" type="number" min="0" step="0.01" value="'+state.billDiscountValue+'" placeholder="e.g. 5" style="flex:1"><select id="bill-discount-type" style="width:70px"><option value="percent" '+(state.billDiscountType==='percent'?'selected':'')+'>%</option><option value="amount" '+(state.billDiscountType==='amount'?'selected':'')+'>\u20b9</option></select></div></div>';
    html += '<div class="field"><label>GST % ' + (state.billGstManual ? '<span style="font-weight:400;color:var(--ink-soft)">(manual override)</span>' : '<span style="font-weight:400;color:var(--ink-soft)">(auto from product GST)</span>') + '</label><input id="bill-gst" type="number" min="0" step="0.1" value="'+state.billGst+'" placeholder="e.g. 5">' + (state.billGstManual ? '<a href="javascript:void(0)" id="bill-gst-reset" style="font-size:11.5px">Reset to auto</a>' : '') + '</div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Payment Method</label><select id="bill-payment">' +
      ['Cash','UPI','Card','Credit'].map(m => '<option value="'+m+'" '+(state.billPayment===m?'selected':'')+'>'+(m==='Credit'?'Credit (Udhaar)':m)+'</option>').join('') + '</select></div>';
    html += '<div></div>';
    html += '</div>';
    if (state.billPayment === 'Credit'){
      html += '<div class="field"><label>Payment Due In (days)</label><input id="bill-credit-days" type="number" min="1" value="'+(state.billMeta.creditDays||45)+'" placeholder="e.g. 45"></div>';
    }
    if (state.billPayment === 'Credit' && !state.billCustomerId){
      html += '<div style="font-size:12px;color:var(--rust);margin-top:-4px">Select a customer above for Credit sales (to track outstanding).</div>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div>';
    html += '<div class="receipt">';
    if (state.settings.logoDataUrl) html += '<div style="text-align:center;margin-bottom:6px"><img src="'+state.settings.logoDataUrl+'" style="height:36px;object-fit:contain"></div>';
    html += '<div class="receipt-head"><div class="shop-name">'+esc(state.settings.shopName)+'</div><div class="shop-tag">'+esc(state.settings.tagline)+'</div>';
    if (state.settings.gstin) html += '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:2px">GSTIN: '+esc(state.settings.gstin)+'</div>';
    html += '</div>';
    html += '<div class="receipt-meta"><span>' + todayStr() + '</span><span class="mono">' + (editInv ? esc(editInv.invoiceNo) : ('#' + String(state.counter+1).padStart(4,'0'))) + '</span></div>';
    html += '<div style="font-size:10.5px;color:var(--ink-soft);margin-bottom:6px">'+state.billType+' Bill</div>';

    const validItems = state.billItems.filter(r => r.productId && Number(r.qty) > 0);
    if (validItems.length === 0){
      html += '<div class="receipt-empty">Select items \u2014 the bill will appear here and can be printed/saved.</div>';
    } else {
      validItems.forEach(row => {
        const prod = state.products.find(p => p.id === row.productId);
        if (!prod) return;
        const rate = priceFor(prod);
        html += '<div class="receipt-line"><span class="item-name">'+esc(prod.name)+(prod.batch ? ' <span style="color:var(--ink-soft);font-size:10.5px">(Batch: '+esc(prod.batch)+')</span>' : '')+'</span><span class="item-qty">'+esc(formatQtyCount(row.qty, prod.unit))+'</span><span class="item-amt">'+fmt(rate*row.qty)+'</span></div>';
      });
    }
    if (discountAmount > 0 || gstPct > 0){
      html += '<div class="receipt-line"><span class="item-name">Subtotal</span><span class="item-amt">'+fmt(subtotal)+'</span></div>';
    }
    if (discountAmount > 0){
      html += '<div class="receipt-line"><span class="item-name">Discount' + (state.billDiscountType==='percent' && discountValue ? ' ('+discountValue+'%)' : '') + '</span><span class="item-amt">-'+fmt(discountAmount)+'</span></div>';
    }
    if (gstPct > 0){
      html += '<div class="receipt-line"><span class="item-name">GST ('+gstPct+'%)</span><span class="item-amt">'+fmt(gstAmount)+'</span></div>';
    }
    html += '<div class="receipt-total"><span>Total</span><span class="mono">'+fmt(grandTotal)+'</span></div>';
    html += '<div style="font-size:11px;color:var(--ink-soft);margin-top:6px">Payment: '+esc(state.billPayment)+'</div>';
    html += '</div>';

    html += '<button class="btn-primary" id="generate-bill" style="width:100%;margin-top:14px;padding:11px">'+(editInv ? 'Update Bill' : 'Generate Bill')+'</button>';
    if (editInv){
      html += '<button class="btn-secondary" id="cancel-edit-bill" style="width:100%;margin-top:8px;padding:10px">Cancel Edit</button>';
    }
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById('add-item').addEventListener('click', () => {
      state.billItems.push({ productId: '', qty: 1 });
      renderNewBill();
    });
    document.getElementById('bill-type').addEventListener('change', e => { state.billType = e.target.value; renderNewBill(); });
    document.getElementById('bill-customer-id').addEventListener('change', e => {
      state.billCustomerId = e.target.value;
      const c = state.customers.find(x => x.id === state.billCustomerId);
      if (c){
        state.billCustomer = { name: c.name, phone: c.phone };
        state.billBuyer = { address: c.address||'', gstin: c.gstin||'', stateName: c.stateName||'', placeOfSupply: c.stateName||'' };
      }
      renderNewBill();
    });
    const spSelectEl = document.getElementById('bill-salesperson-id');
    if (spSelectEl) spSelectEl.addEventListener('change', e => { state.billSalespersonId = e.target.value; });
    document.getElementById('cust-name').addEventListener('input', e => state.billCustomer.name = e.target.value);
    document.getElementById('cust-phone').addEventListener('input', e => state.billCustomer.phone = e.target.value);
    document.getElementById('buyer-address').addEventListener('input', e => state.billBuyer.address = e.target.value);
    document.getElementById('buyer-gstin').addEventListener('input', e => state.billBuyer.gstin = e.target.value);
    document.getElementById('buyer-state').addEventListener('input', e => state.billBuyer.stateName = e.target.value);
    document.getElementById('buyer-pos').addEventListener('input', e => state.billBuyer.placeOfSupply = e.target.value);
    document.getElementById('ship-same').addEventListener('change', e => { state.billShipSame = e.target.checked; renderNewBill(); });
    const shipNameEl = document.getElementById('ship-name');
    if (shipNameEl) shipNameEl.addEventListener('input', e => state.billConsignee.name = e.target.value);
    const shipAddrEl = document.getElementById('ship-address');
    if (shipAddrEl) shipAddrEl.addEventListener('input', e => state.billConsignee.address = e.target.value);
    const shipGstinEl = document.getElementById('ship-gstin');
    if (shipGstinEl) shipGstinEl.addEventListener('input', e => state.billConsignee.gstin = e.target.value);
    const shipStateEl = document.getElementById('ship-state');
    if (shipStateEl) shipStateEl.addEventListener('input', e => state.billConsignee.stateName = e.target.value);
    document.getElementById('meta-dispatched').addEventListener('input', e => state.billMeta.dispatchedThrough = e.target.value);
    document.getElementById('meta-destination').addEventListener('input', e => state.billMeta.destination = e.target.value);
    document.getElementById('meta-vehicle').addEventListener('input', e => state.billMeta.vehicleNo = e.target.value);
    document.getElementById('meta-driver').addEventListener('input', e => state.billMeta.driverName = e.target.value);
    document.getElementById('meta-order-no').addEventListener('input', e => state.billMeta.buyersOrderNo = e.target.value);
    document.getElementById('meta-order-date').addEventListener('input', e => state.billMeta.buyersOrderDate = e.target.value);
    document.getElementById('meta-terms').addEventListener('input', e => state.billMeta.paymentTerms = e.target.value);
    document.getElementById('bill-discount-value').addEventListener('input', e => { state.billDiscountValue = e.target.value; rerenderPreserving(renderNewBill); });
    document.getElementById('bill-discount-type').addEventListener('change', e => { state.billDiscountType = e.target.value; renderNewBill(); });
    document.getElementById('bill-gst').addEventListener('input', e => { state.billGst = e.target.value; state.billGstManual = true; rerenderPreserving(renderNewBill); });
    const gstResetBtn = document.getElementById('bill-gst-reset');
    if (gstResetBtn) gstResetBtn.addEventListener('click', () => { state.billGstManual = false; renderNewBill(); });
    document.getElementById('bill-payment').addEventListener('change', e => { state.billPayment = e.target.value; renderNewBill(); });
    const creditDaysEl = document.getElementById('bill-credit-days');
    if (creditDaysEl) creditDaysEl.addEventListener('input', e => state.billMeta.creditDays = Number(e.target.value) || 45);

    document.querySelectorAll('.item-row').forEach(rowEl => {
      const idx = Number(rowEl.dataset.idx);
      rowEl.querySelector('.bi-product').addEventListener('change', e => {
        state.billItems[idx].productId = e.target.value;
        renderNewBill();
      });
      rowEl.querySelector('.bi-qty').addEventListener('input', e => {
        state.billItems[idx].qty = e.target.value;
        rerenderPreserving(renderNewBill);
      });
      const rmBtn = rowEl.querySelector('.bi-remove');
      if (rmBtn) rmBtn.addEventListener('click', () => {
        if (state.billItems.length > 1) state.billItems.splice(idx,1);
        else state.billItems = [{productId:'', qty:1}];
        renderNewBill();
      });
    });

    document.getElementById('generate-bill').addEventListener('click', generateBill);
    const cancelEditBtn = document.getElementById('cancel-edit-bill');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEditInvoice);
  }


  async function generateBill(){
    const editId = state.editingInvoiceId;
    const oldInv = editId ? state.invoices.find(i => i.id === editId) : null;
    if (editId && !oldInv){ state.editingInvoiceId = null; toast('Original bill not found'); setView('invoices'); return; }

    // Qty already "used" by this same bill for each product, before this edit — so we can
    // restore it back to available stock when checking the new quantities.
    const oldQtyByProduct = {};
    if (oldInv){
      oldInv.items.forEach(it => { oldQtyByProduct[it.productId] = (oldQtyByProduct[it.productId]||0) + Number(it.qty); });
    }

    const validItems = state.billItems.filter(r => r.productId && Number(r.qty) > 0);
    if (validItems.length === 0){ toast('Select at least one item'); return; }

    for (const row of validItems){
      const prod = state.products.find(p => p.id === row.productId);
      if (!prod) continue;
      const availableStock = Number(prod.stock) + Number(oldQtyByProduct[row.productId] || 0);
      if (Number(row.qty) > availableStock){
        toast(prod.name + ' has insufficient stock (' + availableStock + ' ' + prod.unit + ' available)');
        return;
      }
    }

    const items = validItems.map(row => {
      const prod = state.products.find(p => p.id === row.productId);
      const rate = priceFor(prod);
      return { productId: prod.id, name: prod.name, unit: prod.unit, batch: prod.batch || '', qty: Number(row.qty), price: rate, total: rate * Number(row.qty), gstPercent: Number(prod.gstPercent) || 0, hsn: prod.hsn || '' };
    });
    const subtotal = items.reduce((s,i)=> s+i.total, 0);
    const discountType = state.billDiscountType === 'amount' ? 'amount' : 'percent';
    const discountValue = Number(state.billDiscountValue) || 0;
    let discountAmount = discountType === 'percent' ? (subtotal * discountValue / 100) : discountValue;
    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
    const taxableAmount = subtotal - discountAmount;
    const gstPercent = Number(state.billGst) || 0;
    const gstAmount = taxableAmount * gstPercent / 100;
    const total = taxableAmount + gstAmount;

    if (state.billPayment === 'Credit' && !state.billCustomerId){
      toast('Select a customer for Credit sales');
      return;
    }

    const invoice = {
      invoiceNo: oldInv ? oldInv.invoiceNo : ('INV-' + String(state.counter + 1).padStart(4,'0')),
      customerName: state.billCustomer.name,
      customerPhone: state.billCustomer.phone,
      customerId: state.billCustomerId || '',
      salespersonId: state.billSalespersonId || '',
      salespersonName: (state.settings.salespersons||[]).find(sp => sp.id === state.billSalespersonId)?.name || '',
      billType: state.billType,
      items, subtotal, discountType, discountValue, discountAmount, gstPercent, gstAmount, total,
      paymentMethod: state.billPayment,
      buyer: { address: state.billBuyer.address, gstin: state.billBuyer.gstin, stateName: state.billBuyer.stateName, placeOfSupply: state.billBuyer.placeOfSupply },
      consignee: state.billShipSame
        ? { sameAsBuyer: true, name: state.billCustomer.name, address: state.billBuyer.address, gstin: state.billBuyer.gstin, stateName: state.billBuyer.stateName }
        : { sameAsBuyer: false, name: state.billConsignee.name, address: state.billConsignee.address, gstin: state.billConsignee.gstin, stateName: state.billConsignee.stateName },
      meta: { dispatchedThrough: state.billMeta.dispatchedThrough||'', destination: state.billMeta.destination||'', vehicleNo: state.billMeta.vehicleNo||'', driverName: state.billMeta.driverName||'', buyersOrderNo: state.billMeta.buyersOrderNo||'', buyersOrderDate: state.billMeta.buyersOrderDate||'', paymentTerms: state.billMeta.paymentTerms||'', creditDays: state.billPayment === 'Credit' ? (Number(state.billMeta.creditDays)||45) : null }
    };

    const genBtn = document.getElementById('generate-bill');
    if (genBtn){ genBtn.textContent = 'Saving...'; genBtn.disabled = true; }

    let fullInvoice;
    try {
      if (oldInv){
        // ---- EDIT MODE: update existing invoice ----
        const { data: updated, error: updErr } = await sb.from('invoices').update(invoiceToDb(invoice)).eq('id', oldInv.id).select().single();
        if (updErr) throw updErr;

        // Reconcile stock: restore old quantities, then deduct new quantities.
        const stockDelta = {}; // productId -> net change to apply to stock
        oldInv.items.forEach(it => { stockDelta[it.productId] = (stockDelta[it.productId]||0) + Number(it.qty); });
        items.forEach(it => { stockDelta[it.productId] = (stockDelta[it.productId]||0) - Number(it.qty); });

        for (const productId of Object.keys(stockDelta)){
          const delta = stockDelta[productId];
          if (!delta) continue;
          const prod = state.products.find(p => p.id === productId);
          if (!prod) continue;
          const newStock = Number(prod.stock) + delta;
          const { error: stErr } = await sb.from('products').update({ stock: newStock }).eq('id', prod.id);
          if (stErr) throw stErr;
          prod.stock = newStock;
        }

        // Reconcile customer outstanding: reverse old credit effect, apply new credit effect.
        const custDelta = {}; // customerId -> net change to outstanding
        if (oldInv.paymentMethod === 'Credit' && oldInv.customerId){
          custDelta[oldInv.customerId] = (custDelta[oldInv.customerId]||0) - Number(oldInv.total);
        }
        if (state.billPayment === 'Credit' && state.billCustomerId){
          custDelta[state.billCustomerId] = (custDelta[state.billCustomerId]||0) + Number(total);
        }
        for (const custId of Object.keys(custDelta)){
          const delta = custDelta[custId];
          if (!delta) continue;
          const cust = state.customers.find(c => c.id === custId);
          if (!cust) continue;
          const newOutstanding = Number(cust.outstanding||0) + delta;
          const { error: custErr } = await sb.from('customers').update({ outstanding: newOutstanding }).eq('id', cust.id);
          if (custErr) throw custErr;
          cust.outstanding = newOutstanding;
        }

        fullInvoice = invoiceFromDb(updated);
        state.invoices = state.invoices.map(i => i.id === fullInvoice.id ? fullInvoice : i);
        state.editingInvoiceId = null;

        toast('Bill ' + fullInvoice.invoiceNo + ' updated');
      } else {
        // ---- CREATE MODE: insert new invoice ----
        const { data: inserted, error: invErr } = await sb.from('invoices').insert(invoiceToDb(invoice)).select().single();
        if (invErr) throw invErr;

        // The invoice itself is now safely saved — reflect it in the app
        // immediately. Everything below (stock/outstanding sync) is
        // best-effort follow-up: if any of it fails, the bill must still
        // show up in "All Bills" instead of silently vanishing.
        fullInvoice = invoiceFromDb(inserted);
        state.invoices.unshift(fullInvoice);
        state.counter += 1;

        let syncWarning = false;
        for (const it of items){
          const prod = state.products.find(p => p.id === it.productId);
          if (!prod) continue;
          try {
            const newStock = Number(prod.stock) - it.qty;
            const { error: stErr } = await sb.from('products').update({ stock: newStock }).eq('id', prod.id);
            if (stErr) throw stErr;
            prod.stock = newStock;
          } catch (stockErr){
            console.error('stock sync failed for', prod.name, stockErr);
            syncWarning = true;
          }
        }

        if (state.billPayment === 'Credit' && state.billCustomerId){
          const cust = state.customers.find(c => c.id === state.billCustomerId);
          if (cust){
            try {
              const newOutstanding = Number(cust.outstanding||0) + total;
              const { error: custErr } = await sb.from('customers').update({ outstanding: newOutstanding }).eq('id', cust.id);
              if (custErr) throw custErr;
              cust.outstanding = newOutstanding;
            } catch (custErr){
              console.error('customer outstanding sync failed', custErr);
              syncWarning = true;
            }
          }
        }

        toast(syncWarning
          ? 'Bill ' + fullInvoice.invoiceNo + ' created (stock/due update ne aadchan ali — Stock tapasa)'
          : 'Bill ' + fullInvoice.invoiceNo + ' created');
      }

      state.billCustomerId = '';
      state.billSalespersonId = '';
      state.view = 'invoiceview';
      renderInvoiceDetail(fullInvoice.id, true);
    } catch(e){
      console.error(e);
      if (fullInvoice){
        // The invoice made it into the database and into local state even
        // though something afterwards failed — never tell the user it
        // wasn't saved when it was.
        state.billCustomerId = '';
        state.billSalespersonId = '';
        state.view = 'invoiceview';
        toast('Bill ' + fullInvoice.invoiceNo + ' created (kahi tapshil sync nahi zale)');
        renderInvoiceDetail(fullInvoice.id, true);
        return;
      }
      toast('Bill save nahi zala — punha try kara');
      if (genBtn){ genBtn.textContent = oldInv ? 'Update Bill' : 'Generate Bill'; genBtn.disabled = false; }
    }
  }

  function startEditInvoice(inv){
    state.editingInvoiceId = inv.id;
    state.billItems = (inv.items && inv.items.length) ? inv.items.map(it => ({ productId: it.productId, qty: it.qty })) : [{ productId:'', qty:1 }];
    state.billCustomer = { name: inv.customerName || '', phone: inv.customerPhone || '' };
    state.billCustomerId = inv.customerId || '';
    state.billSalespersonId = inv.salespersonId || '';
    state.billType = inv.billType || 'Retail';
    state.billGst = inv.gstPercent || 0;
    state.billGstManual = true;
    state.billDiscountType = inv.discountType || 'percent';
    state.billDiscountValue = inv.discountValue || 0;
    state.billPayment = inv.paymentMethod || 'Cash';
    state.billBuyer = Object.assign({address:'',gstin:'',stateName:'',placeOfSupply:''}, inv.buyer||{});
    state.billShipSame = inv.consignee ? !!inv.consignee.sameAsBuyer : true;
    state.billConsignee = Object.assign({name:'',address:'',gstin:'',stateName:''}, inv.consignee||{});
    state.billMeta = Object.assign({modeOfPayment:'',buyersOrderNo:'',buyersOrderDate:'',dispatchedThrough:'',destination:'',vehicleNo:'',driverName:'',paymentTerms:'',creditDays:45}, inv.meta||{});
    state.view = 'newbill';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === 'newbill');
    });
    render();
  }

  function cancelEditInvoice(){
    const id = state.editingInvoiceId;
    state.editingInvoiceId = null;
    if (id) renderInvoiceDetail(id, false);
    else setView('invoices');
  }

  // ---------- STOCK ----------
  function renderStock(){
    titleEl.textContent = 'Stock';
    subtitleEl.textContent = state.products.length + ' products';
    topbarActionEl.innerHTML = '<button class="btn-primary" id="add-product-btn">+ New Product</button>';
    document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());

    let html = '<div class="panel" style="padding:0;overflow-x:auto">';
    if (state.products.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No products yet. Click "+ New Product" to add one.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Product</th><th>Code</th><th>Batch</th><th>MRP</th><th>Dealer Price</th><th>Retail Price</th><th>GST%</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>';
      state.products.forEach(p => {
        const low = Number(p.stock) <= Number(p.lowStock||0);
        html += '<tr>';
        html += '<td>' + esc(p.name) + '</td>';
        html += '<td class="mono">' + esc(p.code||'—') + '</td>';
        html += '<td class="mono">' + esc(p.batch||'—') + '</td>';
        html += '<td class="mono">' + fmt(p.mrp) + '</td>';
        html += '<td class="mono">' + fmt(p.dealerPrice) + '</td>';
        html += '<td class="mono">' + fmt(p.retailPrice) + '</td>';
        html += '<td class="mono">' + (p.gstPercent||0) + '%</td>';
        html += '<td class="mono">' + p.stock + ' ' + esc(p.unit) + '</td>';
        html += '<td><span class="tag ' + (low?'low':'ok') + '">' + (low?'Low':'OK') + '</span></td>';
        html += '<td style="text-align:right;white-space:nowrap">';
        html += '<button class="btn-icon add-stock-p" data-id="'+p.id+'" title="Add Stock">➕</button>';
        html += '<button class="btn-icon edit-p" data-id="'+p.id+'" title="Edit">✎</button>';
        html += '<button class="btn-icon del-p" data-id="'+p.id+'" title="Delete">🗑</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    document.querySelectorAll('.add-stock-p').forEach(b => b.addEventListener('click', () => openAddStockModal(b.dataset.id)));
    document.querySelectorAll('.edit-p').forEach(b => b.addEventListener('click', () => openProductModal(b.dataset.id)));
    document.querySelectorAll('.del-p').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.id)));
  }

  // Quick restock: adds an entered quantity ON TOP of current stock,
  // instead of overwriting it — for when new stock arrives at the shop.
  function openAddStockModal(id){
    const prod = state.products.find(p => p.id === id);
    if (!prod) return;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:360px">
        <h3>Add Stock — ${esc(prod.name)}</h3>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px">Current stock: <strong>${prod.stock} ${esc(prod.unit)}</strong></div>
        <div class="field"><label>Quantity Received</label><input id="as-qty" type="number" min="0.01" step="0.01" placeholder="e.g. 50" autofocus></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="as-cancel">Cancel</button>
          <button class="btn-primary" id="as-save">Add Stock</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('as-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('as-save').addEventListener('click', async () => {
      const qty = Number(document.getElementById('as-qty').value);
      if (!qty || qty <= 0){ toast('Enter a valid quantity'); return; }
      const btn = document.getElementById('as-save');
      btn.textContent = 'Saving...'; btn.disabled = true;
      try {
        const newStock = Number(prod.stock) + qty;
        const { error } = await sb.from('products').update({ stock: newStock }).eq('id', prod.id);
        if (error) throw error;
        prod.stock = newStock;
        overlay.remove();
        toast('Stock updated: ' + prod.name + ' now has ' + newStock + ' ' + prod.unit);
        renderStock();
      } catch(e){
        console.error(e);
        toast('Add stock failed, please try again');
        btn.textContent = 'Add Stock'; btn.disabled = false;
      }
    });
  }

  function openProductModal(id){
    const editing = !!id;
    const prod = editing ? state.products.find(p=>p.id===id) : { name:'', unit:'1 Kg', code:'', batch:'', mrp:'', dealerPrice:'', retailPrice:'', gstPercent:'', stock:'', lowStock:'', hsn:'' };
    const parsedUnit = parseProductUnit(prod.unit);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:440px">
        <h3>${editing ? 'Edit Product' : 'New Product'}</h3>
        <div class="field"><label>Product Name</label><input id="pm-name" value="${esc(prod.name)}" placeholder="e.g. Urea 50kg Bag"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Product Code</label><input id="pm-code" value="${esc(prod.code)}" placeholder="e.g. UR-50"></div>
          <div class="field"><label>Batch No.</label><input id="pm-batch" value="${esc(prod.batch)}" placeholder="e.g. B-2026-01"></div>
        </div>
        <div class="field"><label>HSN/SAC Code (for GST invoice)</label><input id="pm-hsn" value="${esc(prod.hsn||'')}" placeholder="e.g. 3105"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Unit Type</label>
            <select id="pm-unit-type">
              ${UNIT_TYPES.map(u=>'<option value="'+u+'" '+(parsedUnit.type===u?'selected':'')+'>'+u+'</option>').join('')}
            </select>
          </div>
          <div class="field" id="pm-unit-value-wrap">
            <label id="pm-unit-value-label">Quantity</label>
            <input id="pm-unit-value" value="${esc(parsedUnit.value)}">
          </div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>GST %</label><input id="pm-gst" type="number" min="0" step="0.1" value="${prod.gstPercent}" placeholder="e.g. 5"></div>
          <div></div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr 1fr">
          <div class="field"><label>MRP</label><input id="pm-mrp" type="number" min="0" step="0.01" value="${prod.mrp}"></div>
          <div class="field"><label>Dealer Price</label><input id="pm-dealer" type="number" min="0" step="0.01" value="${prod.dealerPrice}"></div>
          <div class="field"><label>Retail Price</label><input id="pm-retail" type="number" min="0" step="0.01" value="${prod.retailPrice}"></div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Stock Quantity</label><input id="pm-stock" type="number" min="0" step="0.01" value="${prod.stock}"></div>
          <div class="field"><label>Low Stock Threshold</label><input id="pm-low" type="number" min="0" step="0.01" value="${prod.lowStock}"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="pm-cancel">Cancel</button>
          <button class="btn-primary" id="pm-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);

    // Value box next to Unit Type: numeric quantity for Kg/Litre/ml,
    // free text for Other, disabled (fixed) for Bag/Piece/Packet.
    function updateUnitValueField(){
      const type = document.getElementById('pm-unit-type').value;
      const label = document.getElementById('pm-unit-value-label');
      const input = document.getElementById('pm-unit-value');
      const isMeasured = (type === 'Kg' || type === 'Gm' || type === 'Litre' || type === 'ml');
      if (isMeasured){
        label.textContent = 'Quantity (' + type + ')';
        input.type = 'number'; input.min = '0'; input.step = '0.01';
        input.placeholder = 'e.g. 2.5'; input.disabled = false;
      } else if (type === 'Other'){
        label.textContent = 'Custom Unit Name';
        input.type = 'text'; input.removeAttribute('min'); input.removeAttribute('step');
        input.placeholder = 'e.g. Bottle'; input.disabled = false;
      } else {
        label.textContent = 'Quantity (optional)';
        input.type = 'text'; input.removeAttribute('min'); input.removeAttribute('step');
        input.placeholder = 'e.g. 50 Kg (optional)'; input.disabled = false;
      }
    }
    updateUnitValueField();
    document.getElementById('pm-unit-type').addEventListener('change', updateUnitValueField);

    document.getElementById('pm-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('pm-save').addEventListener('click', async () => {
      const name = document.getElementById('pm-name').value.trim();
      const code = document.getElementById('pm-code').value.trim();
      const batch = document.getElementById('pm-batch').value.trim();
      const hsn = document.getElementById('pm-hsn').value.trim();
      const unitType = document.getElementById('pm-unit-type').value;
      const unitValue = document.getElementById('pm-unit-value').value;
      const isMeasured = (unitType === 'Kg' || unitType === 'Gm' || unitType === 'Litre' || unitType === 'ml');
      if (isMeasured && (unitValue === '' || isNaN(Number(unitValue)) || Number(unitValue) <= 0)){
        toast('Enter a valid ' + unitType + ' quantity'); return;
      }
      if (unitType === 'Other' && !unitValue.trim()){
        toast('Enter a custom unit name'); return;
      }
      const unit = composeProductUnit(unitType, unitValue);
      const gstPercent = Number(document.getElementById('pm-gst').value) || 0;
      const mrp = Number(document.getElementById('pm-mrp').value) || 0;
      const dealerPrice = Number(document.getElementById('pm-dealer').value) || 0;
      const retailPrice = Number(document.getElementById('pm-retail').value) || 0;
      const stock = Number(document.getElementById('pm-stock').value);
      const lowStock = Number(document.getElementById('pm-low').value) || 0;
      if (!name){ toast('Enter product name'); return; }
      if (retailPrice < 0 || dealerPrice < 0){ toast('Enter a valid price'); return; }
      if (isNaN(stock) || stock < 0){ toast('Enter a valid stock quantity'); return; }

      const payload = { name, code, batch, hsn, unit, gstPercent, mrp, dealerPrice, retailPrice, stock, lowStock };
      const saveBtn = document.getElementById('pm-save');
      saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;

      try {
        if (editing){
          const { error } = await sb.from('products').update(productToDb(payload)).eq('id', prod.id);
          if (error) throw error;
          Object.assign(prod, payload);
        } else {
          const { data, error } = await sb.from('products').insert(productToDb(payload)).select().single();
          if (error) throw error;
          state.products.push(productFromDb(data));
        }
        overlay.remove();
        toast(editing ? 'Product updated' : 'Product added');
        renderStock();
      } catch(e){
        console.error(e);
        toast('Save failed: ' + (e.message||''));
        saveBtn.textContent = editing?'Update':'Add'; saveBtn.disabled = false;
      }
    });
  }

  async function deleteProduct(id){
    if (!confirm('Delete this product?')) return;
    try {
      const { error } = await sb.from('products').delete().eq('id', id);
      if (error) throw error;
      state.products = state.products.filter(p => p.id !== id);
      toast('Product deleted');
      renderStock();
    } catch(e){
      console.error(e);
      toast('Delete failed, please try again');
    }
  }

  // ---------- INVOICES ----------
  function renderInvoices(){
    titleEl.textContent = 'All Bills';

    // Bills are always browsed & downloaded one month at a time.
    const allMonthKeys = Array.from(new Set(state.invoices.map(i => monthKey(i.date)))).sort().reverse();
    if (!state.invoiceFilterMonth || !allMonthKeys.includes(state.invoiceFilterMonth)){
      state.invoiceFilterMonth = allMonthKeys[0] || monthKey(new Date());
    }
    const filterMonth = state.invoiceFilterMonth;
    const monthInvoices = state.invoices.filter(i => monthKey(i.date) === filterMonth);

    subtitleEl.textContent = monthInvoices.length + ' bills in ' + monthLabel(filterMonth);

    const monthOptions = allMonthKeys.length
      ? allMonthKeys.map(mk => '<option value="'+mk+'" '+(mk===filterMonth?'selected':'')+'>'+monthLabel(mk)+'</option>').join('')
      : '<option value="'+filterMonth+'">'+monthLabel(filterMonth)+'</option>';

    topbarActionEl.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<select id="inv-month-filter" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--surface)">' + monthOptions + '</select>' +
      (monthInvoices.length ? '<button class="btn-primary" id="download-all-btn">⬇ Download ' + monthLabel(filterMonth) + '</button>' : '') +
      '</div>';

    let html = '<div class="panel" style="padding:0">';
    if (monthInvoices.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No bills in ' + monthLabel(filterMonth) + '.</td></tr></tbody></table>';
    } else {
      const sorted = [...monthInvoices].sort((a,b)=> new Date(b.date)-new Date(a.date));
      html += '<table><thead><tr><th>Bill No</th><th>Customer</th><th>Salesperson</th><th>Date</th><th>Items</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>';
      sorted.forEach(i => {
        html += '<tr class="inv-row" data-id="'+i.id+'" style="cursor:pointer">';
        html += '<td class="mono">' + esc(i.invoiceNo) + '</td>';
        html += '<td>' + esc(i.customerName || '—') + '</td>';
        html += '<td>' + esc(i.salespersonName || '—') + '</td>';
        html += '<td>' + new Date(i.date).toLocaleDateString('en-IN') + '</td>';
        html += '<td>' + i.items.length + '</td>';
        html += '<td class="mono" style="text-align:right">' + fmt(i.total) + '</td>';
        html += '<td style="text-align:right"><button class="btn-icon edit-inv" data-id="'+i.id+'" title="Edit" style="margin-right:6px">✏️</button><button class="btn-icon del-inv" data-id="'+i.id+'" title="Delete">🗑</button></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    document.getElementById('inv-month-filter').addEventListener('change', (e) => {
      state.invoiceFilterMonth = e.target.value;
      renderInvoices();
    });
    document.querySelectorAll('.inv-row').forEach(r => r.addEventListener('click', (e) => {
      if (e.target.closest('.del-inv')) return;
      renderInvoiceDetail(r.dataset.id, false);
    }));
    document.querySelectorAll('.del-inv').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteInvoice(b.dataset.id);
    }));
    document.querySelectorAll('.edit-inv').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const inv = state.invoices.find(x => x.id === b.dataset.id);
      if (inv) startEditInvoice(inv);
    }));
    const downloadAllBtn = document.getElementById('download-all-btn');
    if (downloadAllBtn) downloadAllBtn.addEventListener('click', () => downloadAllInvoices(filterMonth));
  }

  // Builds one printable document containing every bill from the selected
  // month (each on its own page) and opens the print dialog so the user
  // can "Save as PDF" — this keeps each downloaded file month-wise rather
  // than one giant all-time file. Only reads existing invoice data — it
  // does not add, edit, or delete anything in the database.
  function downloadAllInvoices(filterMonth){
    const monthInvoices = state.invoices.filter(i => monthKey(i.date) === filterMonth);
    if (!monthInvoices.length){ toast('No bills to download'); return; }
    toast('In the print dialog, choose "Save as PDF" to download ' + monthLabel(filterMonth) + '\'s bills');
    const sorted = [...monthInvoices].sort((a,b)=> new Date(a.date)-new Date(b.date));
    const pagesHtml = sorted.map(inv =>
      '<div class="pi-page">' + printInvoiceBodyHTML(inv) + '</div>'
    ).join('');
    const css = taxInvoicePrintCSS() + `
      .pi-page { page-break-after: always; }
      .pi-page:last-child { page-break-after: auto; }
    `;
    printDocument(pagesHtml, css, 'Bills — ' + monthLabel(filterMonth));
  }

  async function deleteInvoice(id){
    if (!confirm('Delete this bill? Stock will not be restored automatically.')) return;
    try {
      const { error } = await sb.from('invoices').delete().eq('id', id);
      if (error) throw error;
      state.invoices = state.invoices.filter(i => i.id !== id);
      toast('Bill deleted');
      renderInvoices();
    } catch(e){
      console.error(e);
      toast('Delete failed, please try again');
    }
  }

  // ---------- CUSTOMERS ----------
  function renderCustomers(){
    titleEl.textContent = 'Customers';
    subtitleEl.textContent = state.customers.length + ' customers';
    topbarActionEl.innerHTML = '<button class="btn-primary" id="add-cust-btn">+ New Customer</button>';
    document.getElementById('add-cust-btn').addEventListener('click', () => openCustomerModal());

    let html = '<div class="panel" style="padding:0;overflow-x:auto">';
    if (state.customers.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No customers yet. Click "+ New Customer" to add one.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th class="num">Total Business</th><th class="num">Bills</th><th>Last Bill</th><th style="text-align:right">Outstanding</th><th></th></tr></thead><tbody>';
      state.customers.forEach(c => {
        const custInv = state.invoices.filter(i => i.customerId === c.id);
        const totalBusiness = custInv.reduce((s,i) => s + Number(i.total||0), 0);
        const lastInv = custInv.slice().sort((a,b) => new Date(b.date) - new Date(a.date))[0];
        html += '<tr>';
        html += '<td><a href="#" class="cust-ledger-link" data-id="'+c.id+'" style="color:var(--soil);font-weight:600;text-decoration:none;border-bottom:1px dashed var(--soil)">' + esc(c.name) + '</a></td>';
        html += '<td><span class="tag ' + (c.type==='Retail'?'ok':'low') + '" style="background:var(--wheat-pale);color:var(--soil)">' + esc(c.type) + '</span></td>';
        html += '<td>' + esc(c.phone||'—') + '</td>';
        html += '<td class="mono num">' + fmt(totalBusiness) + '</td>';
        html += '<td class="num">' + custInv.length + '</td>';
        html += '<td>' + (lastInv ? new Date(lastInv.date).toLocaleDateString('en-IN') : '—') + '</td>';
        html += '<td class="mono" style="text-align:right;' + (c.outstanding>0?'color:var(--rust);font-weight:600':'') + '">' + fmt(c.outstanding) + '</td>';
        html += '<td style="text-align:right;white-space:nowrap">';
        html += '<button class="btn-icon edit-c" data-id="'+c.id+'" title="Edit">✎</button>';
        html += '<button class="btn-icon del-c" data-id="'+c.id+'" title="Delete">🗑</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    document.querySelectorAll('.cust-ledger-link').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); renderCustomerLedger(a.dataset.id); }));
    document.querySelectorAll('.edit-c').forEach(b => b.addEventListener('click', () => openCustomerModal(b.dataset.id)));
    document.querySelectorAll('.del-c').forEach(b => b.addEventListener('click', () => deleteCustomer(b.dataset.id)));
  }

  // ---------- CUSTOMER LEDGER ----------
  function renderCustomerLedger(id){
    const cust = state.customers.find(c => c.id === id);
    if (!cust){ setView('customers'); return; }
    titleEl.textContent = cust.name;
    subtitleEl.textContent = (cust.type||'') + (cust.phone ? ' · ' + cust.phone : '');
    topbarActionEl.innerHTML = '<button class="btn-secondary" id="back-btn">← Back</button>';

    const custInvoices = state.invoices.filter(i => i.customerId === id).sort((a,b) => new Date(a.date) - new Date(b.date));
    const payments = (cust.payments || []).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
    const totalCredit = custInvoices.reduce((s,i) => s + Number(i.total||0), 0);
    const totalDebit = payments.reduce((s,p) => s + Number(p.amount||0), 0);

    // Build one combined, date-sorted ledger (credit rows = bills, debit rows = payments)
    const ledgerRows = [];
    custInvoices.forEach(inv => {
      const dueDate = inv.meta && inv.meta.creditDays ? new Date(new Date(inv.date).getTime() + inv.meta.creditDays*24*60*60*1000) : null;
      ledgerRows.push({
        date: new Date(inv.date), particulars: inv.items.map(it=>it.name).join(', '),
        qty: inv.items.reduce((s,it)=>s+Number(it.qty||0),0), credit: Number(inv.total||0), debit: 0,
        reason: '', dueDate, invoiceId: inv.id, invoiceNo: inv.invoiceNo
      });
    });
    payments.forEach(p => {
      ledgerRows.push({ date: new Date(p.date), particulars: 'Payment Received', qty: '', credit: 0, debit: Number(p.amount||0), reason: p.reason||'', dueDate: null, invoiceId: null });
    });
    ledgerRows.sort((a,b) => a.date - b.date);
    let running = 0;
    ledgerRows.forEach(r => { running += r.credit - r.debit; r.balance = running; });

    let html = '<div class="panel" style="max-width:760px;margin-bottom:14px">';
    html += '<h2>Account Summary</h2>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:6px">';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Total Credit (Billed)</div><div class="mono" style="font-size:16px;font-weight:600">'+fmt(totalCredit)+'</div></div>';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Total Debit (Paid)</div><div class="mono" style="font-size:16px;font-weight:600;color:var(--forest)">'+fmt(totalDebit)+'</div></div>';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Balance (Due)</div><div class="mono" style="font-size:16px;font-weight:700;'+(cust.outstanding>0?'color:var(--rust)':'color:var(--forest)')+'">'+fmt(cust.outstanding)+'</div></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:10px">';
    html += '<button class="btn-primary" id="record-payment-btn">Record Payment Received</button>';
    html += '<button class="btn-secondary" id="print-ledger-btn">Print Statement</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="panel" style="padding:0;overflow-x:auto;max-width:760px;margin-bottom:18px">';
    html += '<h2 style="padding:14px 14px 0">Ledger</h2>';
    if (ledgerRows.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No transactions yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Date</th><th>Particulars</th><th class="num">Qty</th><th class="num">Credit</th><th class="num">Debit</th><th>Reason</th><th>Due Date</th><th class="num">Balance</th></tr></thead><tbody>';
      ledgerRows.forEach(r => {
        const isOverdue = r.dueDate && r.dueDate < new Date() && r.balance > 0;
        html += '<tr'+(r.invoiceId ? ' class="row-click" data-id="'+r.invoiceId+'" style="cursor:pointer"' : '')+'>';
        html += '<td>'+r.date.toLocaleDateString('en-IN')+'</td>';
        html += '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.particulars)+'</td>';
        html += '<td class="num">'+(r.qty!==''?r.qty:'')+'</td>';
        html += '<td class="num" style="color:var(--rust)">'+(r.credit?fmt(r.credit):'')+'</td>';
        html += '<td class="num" style="color:var(--forest)">'+(r.debit?fmt(r.debit):'')+'</td>';
        html += '<td>'+esc(r.reason||'')+'</td>';
        html += '<td'+(isOverdue?' style="color:var(--rust);font-weight:600"':'')+'>'+(r.dueDate?r.dueDate.toLocaleDateString('en-IN'):'')+'</td>';
        html += '<td class="num mono">'+fmt(r.balance)+'</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    if (custInvoices.length){
      html += '<h2 style="margin-bottom:10px">Lot-wise Bill Details</h2>';
      custInvoices.forEach(inv => {
        const dueDate = inv.meta && inv.meta.creditDays ? new Date(new Date(inv.date).getTime() + inv.meta.creditDays*24*60*60*1000).toLocaleDateString('en-IN') : '—';
        html += '<div class="panel" style="max-width:760px;padding:0;overflow-x:auto;margin-bottom:14px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px 0"><strong>'+esc(inv.invoiceNo)+'</strong><span style="font-size:12px;color:var(--ink-soft)">'+new Date(inv.date).toLocaleDateString('en-IN')+'</span></div>';
        html += '<table style="margin-top:8px"><thead><tr><th>Sr No</th><th>Particulars</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th>Due Date</th></tr></thead><tbody>';
        inv.items.forEach((it, idx) => {
          html += '<tr><td>'+(idx+1)+'</td><td>'+esc(it.name)+'</td><td class="num">'+esc(formatQtyCount(it.qty, it.unit))+'</td><td class="num">'+fmt(it.price)+'</td><td class="num">'+fmt(it.total)+'</td><td>'+dueDate+'</td></tr>';
        });
        html += '<tr class="pi-total-row"><td colspan="4" style="text-align:right">Total Balance</td><td class="num">'+fmt(inv.total)+'</td><td></td></tr>';
        html += '</tbody></table></div>';
      });
    }

    contentEl.innerHTML = html;
    document.getElementById('back-btn').addEventListener('click', () => setView('customers'));
    document.querySelectorAll('.row-click').forEach(r => {
      r.addEventListener('click', () => renderInvoiceDetail(r.dataset.id, false));
    });
    document.getElementById('record-payment-btn').addEventListener('click', () => openRecordPaymentModal(cust));
    document.getElementById('print-ledger-btn').addEventListener('click', () => printCustomerLedger(cust, ledgerRows));
  }

  function openRecordPaymentModal(cust){
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const today = new Date().toISOString().slice(0,10);
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3>Record Payment — ${esc(cust.name)}</h3>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px">Current balance due: <strong>${fmt(cust.outstanding||0)}</strong></div>
        <div class="field"><label>Amount Received</label><input id="rp-amount" type="number" min="0.01" step="0.01" placeholder="e.g. 5000" autofocus></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Date</label><input id="rp-date" type="date" value="${today}"></div>
          <div class="field"><label>Reason / Mode</label><input id="rp-reason" placeholder="e.g. Online, HDFC, Cash"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="rp-cancel">Cancel</button>
          <button class="btn-primary" id="rp-save">Save</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('rp-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('rp-save').addEventListener('click', async () => {
      const amt = Number(document.getElementById('rp-amount').value);
      const date = document.getElementById('rp-date').value || today;
      const reason = document.getElementById('rp-reason').value.trim();
      if (!amt || amt <= 0){ toast('Enter a valid amount'); return; }
      const btn = document.getElementById('rp-save');
      btn.textContent = 'Saving...'; btn.disabled = true;
      try {
        const newOutstanding = Math.max(0, Number(cust.outstanding||0) - amt);
        const newPayments = (cust.payments || []).concat([{ date, amount: amt, reason }]);
        const { error } = await sb.from('customers').update({ outstanding: newOutstanding, extra: { payments: newPayments } }).eq('id', cust.id);
        if (error) throw error;
        cust.outstanding = newOutstanding;
        cust.payments = newPayments;
        overlay.remove();
        toast('Payment recorded. New balance due: ' + fmt(newOutstanding));
        renderCustomerLedger(cust.id);
      } catch(e){
        console.error(e);
        toast('Failed to record payment, please try again');
        btn.textContent = 'Save'; btn.disabled = false;
      }
    });
  }

  function printCustomerLedger(cust, ledgerRows){
    const s = state.settings;
    let rows = '';
    ledgerRows.forEach(r => {
      rows += '<tr><td>'+r.date.toLocaleDateString('en-IN')+'</td><td>'+esc(r.particulars)+'</td><td class="num">'+(r.qty!==''?r.qty:'')+'</td><td class="num">'+(r.credit?fmt(r.credit):'')+'</td><td class="num">'+(r.debit?fmt(r.debit):'')+'</td><td>'+esc(r.reason||'')+'</td><td>'+(r.dueDate?r.dueDate.toLocaleDateString('en-IN'):'')+'</td><td class="num">'+fmt(r.balance)+'</td></tr>';
    });
    const body = `
      <div class="dc-title">ACCOUNT STATEMENT</div>
      <div class="dc-field"><strong>${esc(s.shopName)}</strong>${s.address ? ' — '+esc(s.address) : ''}</div>
      <div class="dc-field">Customer: <strong>${esc(cust.name)}</strong>${cust.phone ? ' · '+esc(cust.phone) : ''}</div>
      <div style="height:10px"></div>
      <table>
        <thead><tr><th>Date</th><th>Particulars</th><th class="num">Qty</th><th class="num">Credit</th><th class="num">Debit</th><th>Reason</th><th>Due Date</th><th class="num">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="pi-words">Balance (Due) : <strong>${fmt(cust.outstanding||0)}</strong></div>
    `;
    printDocument(body, taxInvoicePrintCSS(), 'Statement-' + cust.name);
  }

  function openCustomerModal(id){
    const editing = !!id;
    const cust = editing ? state.customers.find(c=>c.id===id) : { name:'', type:'Retail', phone:'', address:'', outstanding: 0, payments: [], gstin:'', stateName:'' };
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${editing ? 'Edit Customer' : 'New Customer'}</h3>
        <div class="field"><label>Name</label><input id="cm-name" value="${esc(cust.name)}" placeholder="Customer / dealer name"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Type</label>
            <select id="cm-type">
              ${['Retail','Dealer','Distributor'].map(t=>'<option value="'+t+'" '+(cust.type===t?'selected':'')+'>'+t+'</option>').join('')}
            </select>
          </div>
          <div class="field"><label>Phone</label><input id="cm-phone" value="${esc(cust.phone)}" placeholder="10 digit number"></div>
        </div>
        <div class="field"><label>Address</label><input id="cm-address" value="${esc(cust.address)}" placeholder="Address"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>GSTIN/UIN (optional)</label><input id="cm-gstin" value="${esc(cust.gstin||'')}" placeholder="27ABCDE1234F1Z5"></div>
          <div class="field"><label>State Name</label><input id="cm-state" value="${esc(cust.stateName||'')}" placeholder="e.g. Maharashtra"></div>
        </div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin:-4px 0 6px">Saved once here — address/GSTIN/State will auto-fill on every future bill for this customer.</div>
        <div class="field"><label>Outstanding Amount</label><input id="cm-outstanding" type="number" min="0" step="0.01" value="${cust.outstanding}"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cm-cancel">Cancel</button>
          <button class="btn-primary" id="cm-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('cm-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('cm-save').addEventListener('click', async () => {
      const name = document.getElementById('cm-name').value.trim();
      const type = document.getElementById('cm-type').value;
      const phone = document.getElementById('cm-phone').value.trim();
      const address = document.getElementById('cm-address').value.trim();
      const gstin = document.getElementById('cm-gstin').value.trim();
      const stateName = document.getElementById('cm-state').value.trim();
      const outstanding = Number(document.getElementById('cm-outstanding').value) || 0;
      if (!name){ toast('Enter customer name'); return; }

      const payload = { name, type, phone, address, gstin, stateName, outstanding, payments: cust.payments || [] };
      const saveBtn = document.getElementById('cm-save');
      saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;

      try {
        if (editing){
          const { error } = await sb.from('customers').update(customerToDb(payload)).eq('id', cust.id);
          if (error) throw error;
          Object.assign(cust, payload);
        } else {
          const { data, error } = await sb.from('customers').insert(customerToDb(payload)).select().single();
          if (error) throw error;
          state.customers.push(customerFromDb(data));
        }
        overlay.remove();
        toast(editing ? 'Customer updated' : 'Customer added');
        renderCustomers();
      } catch(e){
        console.error(e);
        toast('Save failed: ' + (e.message||''));
        saveBtn.textContent = editing?'Update':'Add'; saveBtn.disabled = false;
      }
    });
  }

  async function deleteCustomer(id){
    if (!confirm('Delete this customer?')) return;
    try {
      const { error } = await sb.from('customers').delete().eq('id', id);
      if (error) throw error;
      state.customers = state.customers.filter(c => c.id !== id);
      toast('Customer deleted');
      renderCustomers();
    } catch(e){
      console.error(e);
      toast('Delete failed: ' + (e.message||''));
    }
  }

  // ---------- SALES TEAM (salespersons, targets, month-wise performance) ----------
  function monthKey(d){
    const dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
  }
  function monthLabel(key){
    const [y,m] = key.split('-').map(Number);
    return new Date(y, m-1, 1).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
  }
  // Sales/credit/cash totals for one salesperson within one calendar month (monthKeyStr = 'YYYY-MM').
  function salespersonMonthStats(spId, monthKeyStr){
    const invs = state.invoices.filter(i => i.salespersonId === spId && monthKey(i.date) === monthKeyStr);
    const sales = invs.reduce((s,i)=> s + Number(i.total||0), 0);
    const credit = invs.filter(i => i.paymentMethod === 'Credit').reduce((s,i)=> s + Number(i.total||0), 0);
    const cash = sales - credit;
    return { sales, credit, cash, bills: invs.length };
  }

  function renderSalespersons(){
    titleEl.textContent = 'Sales Team';
    const list = state.settings.salespersons || [];
    subtitleEl.textContent = list.length + ' salespersons';
    topbarActionEl.innerHTML = '<button class="btn-primary" id="add-sp-btn">+ New Salesperson</button>';
    document.getElementById('add-sp-btn').addEventListener('click', () => openSalespersonModal());

    const curMonth = monthKey(new Date());

    let html = '<div class="panel" style="padding:0;overflow-x:auto">';
    if (list.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No salespersons yet. Click "+ New Salesperson" to add one.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Name</th><th>Phone</th><th class="num">Monthly Target</th><th class="num">This Month Sale</th><th class="num">Achievement</th><th class="num">Credit</th><th class="num">Cash</th><th></th></tr></thead><tbody>';
      list.forEach(sp => {
        const st = salespersonMonthStats(sp.id, curMonth);
        const target = Number(sp.monthlyTarget||0);
        const pct = target > 0 ? Math.round((st.sales/target)*100) : null;
        html += '<tr>';
        html += '<td><a href="#" class="sp-ledger-link" data-id="'+sp.id+'" style="color:var(--soil);font-weight:600;text-decoration:none;border-bottom:1px dashed var(--soil)">' + esc(sp.name) + '</a></td>';
        html += '<td>' + esc(sp.phone||'—') + '</td>';
        html += '<td class="mono num">' + (target>0 ? fmt(target) : '—') + '</td>';
        html += '<td class="mono num">' + fmt(st.sales) + '</td>';
        html += '<td class="num">' + (pct===null ? '—' : '<span class="tag ' + (pct>=100?'ok':'low') + '">' + pct + '%</span>') + '</td>';
        html += '<td class="mono num" style="color:var(--rust)">' + fmt(st.credit) + '</td>';
        html += '<td class="mono num" style="color:var(--leaf)">' + fmt(st.cash) + '</td>';
        html += '<td style="text-align:right;white-space:nowrap">';
        html += '<button class="btn-icon edit-sp" data-id="'+sp.id+'" title="Edit">✎</button>';
        html += '<button class="btn-icon del-sp" data-id="'+sp.id+'" title="Delete">🗑</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:8px">Figures above are for ' + monthLabel(curMonth) + '. Click a name for the full month-wise history. "Credit" is sold-on-udhaar amount; "Cash" is what was collected on the spot (Cash/UPI/Card) at billing time.</div>';
    contentEl.innerHTML = html;

    document.querySelectorAll('.sp-ledger-link').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); renderSalespersonLedger(a.dataset.id); }));
    document.querySelectorAll('.edit-sp').forEach(b => b.addEventListener('click', () => openSalespersonModal(b.dataset.id)));
    document.querySelectorAll('.del-sp').forEach(b => b.addEventListener('click', () => deleteSalesperson(b.dataset.id)));
  }

  function renderSalespersonLedger(id){
    const sp = (state.settings.salespersons||[]).find(s => s.id === id);
    if (!sp){ setView('salespersons'); return; }
    titleEl.textContent = sp.name;
    subtitleEl.textContent = sp.phone ? sp.phone : 'Sales Team';
    topbarActionEl.innerHTML = '<button class="btn-secondary" id="back-btn">← Back</button>';

    const target = Number(sp.monthlyTarget||0);
    const spInvoices = state.invoices.filter(i => i.salespersonId === id);
    const totalSales = spInvoices.reduce((s,i)=> s + Number(i.total||0), 0);
    const totalCredit = spInvoices.filter(i => i.paymentMethod === 'Credit').reduce((s,i)=> s + Number(i.total||0), 0);
    const totalCash = totalSales - totalCredit;

    const curMonth = monthKey(new Date());
    const curStats = salespersonMonthStats(id, curMonth);
    const curPct = target > 0 ? Math.round((curStats.sales/target)*100) : null;

    let html = '<div class="panel" style="max-width:820px;margin-bottom:14px">';
    html += '<h2>This Month — ' + monthLabel(curMonth) + '</h2>';
    html += '<div class="stat-grid">';
    html += statCard('Sale', fmt(curStats.sales), false);
    html += statCard('Target', target>0?fmt(target):'—', false);
    html += statCard('Achievement', curPct===null?'—':(curPct+'%'), curPct!==null && curPct<100);
    html += statCard('Credit', fmt(curStats.credit), curStats.credit>0);
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr 1fr;margin-top:12px">';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Total Sale (all-time)</div><div class="mono" style="font-size:16px;font-weight:600">'+fmt(totalSales)+'</div></div>';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Total Credit (all-time)</div><div class="mono" style="font-size:16px;font-weight:600;color:var(--rust)">'+fmt(totalCredit)+'</div></div>';
    html += '<div><div style="font-size:11px;color:var(--ink-soft)">Total Cash Received (all-time)</div><div class="mono" style="font-size:16px;font-weight:600;color:var(--leaf)">'+fmt(totalCash)+'</div></div>';
    html += '</div>';
    html += '</div>';

    // Month-wise breakdown table (most recent month first)
    const monthKeys = Array.from(new Set(spInvoices.map(i => monthKey(i.date)))).sort().reverse();
    html += '<div class="panel" style="padding:0;overflow-x:auto;max-width:820px">';
    html += '<h2 style="padding:14px 14px 0">Month-wise Sell vs Target</h2>';
    if (monthKeys.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No bills recorded for this salesperson yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Month</th><th class="num">Bills</th><th class="num">Sale</th><th class="num">Target</th><th class="num">Achievement</th><th class="num">Credit</th><th class="num">Cash</th></tr></thead><tbody>';
      monthKeys.forEach(mk => {
        const st = salespersonMonthStats(id, mk);
        const pct = target > 0 ? Math.round((st.sales/target)*100) : null;
        html += '<tr>';
        html += '<td>' + monthLabel(mk) + '</td>';
        html += '<td class="num">' + st.bills + '</td>';
        html += '<td class="mono num">' + fmt(st.sales) + '</td>';
        html += '<td class="mono num">' + (target>0?fmt(target):'—') + '</td>';
        html += '<td class="num">' + (pct===null?'—':'<span class="tag ' + (pct>=100?'ok':'low') + '">' + pct + '%</span>') + '</td>';
        html += '<td class="mono num" style="color:var(--rust)">' + fmt(st.credit) + '</td>';
        html += '<td class="mono num" style="color:var(--leaf)">' + fmt(st.cash) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    contentEl.innerHTML = html;
    document.getElementById('back-btn').addEventListener('click', () => setView('salespersons'));
  }

  function openSalespersonModal(id){
    const editing = !!id;
    const list = state.settings.salespersons || [];
    const sp = editing ? list.find(s=>s.id===id) : { id: uid(), name:'', phone:'', monthlyTarget: 0 };
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${editing ? 'Edit Salesperson' : 'New Salesperson'}</h3>
        <div class="field"><label>Name</label><input id="sm-name" value="${esc(sp.name)}" placeholder="Salesperson name"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Phone (optional)</label><input id="sm-phone" value="${esc(sp.phone||'')}" placeholder="10 digit number"></div>
          <div class="field"><label>Monthly Target</label><input id="sm-target" type="number" min="0" step="0.01" value="${Number(sp.monthlyTarget||0)}" placeholder="e.g. 100000"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="sm-cancel">Cancel</button>
          <button class="btn-primary" id="sm-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('sm-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('sm-save').addEventListener('click', async () => {
      const name = document.getElementById('sm-name').value.trim();
      const phone = document.getElementById('sm-phone').value.trim();
      const monthlyTarget = Number(document.getElementById('sm-target').value) || 0;
      if (!name){ toast('Enter salesperson name'); return; }

      const saveBtn = document.getElementById('sm-save');
      saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;
      try {
        const nextList = editing
          ? list.map(s => s.id === sp.id ? { id: sp.id, name, phone, monthlyTarget } : s)
          : list.concat([{ id: sp.id, name, phone, monthlyTarget }]);
        state.settings.salespersons = nextList;
        await saveSalespersons();
        overlay.remove();
        toast(editing ? 'Salesperson updated' : 'Salesperson added');
        renderSalespersons();
      } catch(e){
        console.error(e);
        toast('Save failed: ' + (e.message||''));
        saveBtn.textContent = editing?'Update':'Add'; saveBtn.disabled = false;
      }
    });
  }

  async function deleteSalesperson(id){
    if (!confirm('Delete this salesperson? Past bills already recorded under them will keep showing their name, but the target/report entry will be removed.')) return;
    const prevList = state.settings.salespersons || [];
    try {
      state.settings.salespersons = prevList.filter(s => s.id !== id);
      await saveSalespersons();
      toast('Salesperson deleted');
      renderSalespersons();
    } catch(e){
      console.error(e);
      state.settings.salespersons = prevList;
      toast('Delete failed: ' + (e.message||''));
    }
  }

  // ---------- REPORTS ----------
  function renderReports(){
    titleEl.textContent = 'Reports';
    subtitleEl.textContent = 'Sales, stock and outstanding summary';

    const todayKey = new Date().toDateString();
    const todaysInvoices = state.invoices.filter(i => new Date(i.date).toDateString() === todayKey);
    const todaysSales = todaysInvoices.reduce((s,i)=> s + i.total, 0);

    const productSales = {};
    const customerSales = {};
    state.invoices.forEach(inv => {
      inv.items.forEach(it => {
        if (!productSales[it.name]) productSales[it.name] = { qty: 0, amount: 0 };
        productSales[it.name].qty += Number(it.qty);
        productSales[it.name].amount += Number(it.total);
      });
      const custKey = inv.customerName || 'Walk-in';
      if (!customerSales[custKey]) customerSales[custKey] = { count: 0, amount: 0 };
      customerSales[custKey].count += 1;
      customerSales[custKey].amount += Number(inv.total);
    });
    const productSalesArr = Object.entries(productSales).sort((a,b)=> b[1].amount - a[1].amount);
    const customerSalesArr = Object.entries(customerSales).sort((a,b)=> b[1].amount - a[1].amount);

    const lowStock = lowStockProducts();
    const outstandingCustomers = state.customers.filter(c => c.outstanding > 0).sort((a,b)=> b.outstanding - a.outstanding);
    const totalOutstanding = outstandingCustomers.reduce((s,c)=> s + c.outstanding, 0);

    let html = '<div class="stat-grid">';
    html += statCard("Today's Sales", fmt(todaysSales), false);
    html += statCard('Total Bills', state.invoices.length, false);
    html += statCard('Low Stock Items', lowStock.length, lowStock.length>0);
    html += statCard('Outstanding', fmt(totalOutstanding), totalOutstanding>0);
    html += '</div>';

    html += '<div class="panel"><h2>Product-wise Sales <span class="count-badge">' + productSalesArr.length + '</span></h2>';
    if (productSalesArr.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No sales yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Product</th><th>Qty Sold</th><th style="text-align:right">Amount</th></tr></thead><tbody>';
      productSalesArr.forEach(([name, d]) => {
        html += '<tr><td>' + esc(name) + '</td><td class="mono">' + d.qty + '</td><td class="mono" style="text-align:right">' + fmt(d.amount) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Customer-wise Sales <span class="count-badge">' + customerSalesArr.length + '</span></h2>';
    if (customerSalesArr.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No sales yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Customer</th><th>Bills</th><th style="text-align:right">Amount</th></tr></thead><tbody>';
      customerSalesArr.forEach(([name, d]) => {
        html += '<tr><td>' + esc(name) + '</td><td class="mono">' + d.count + '</td><td class="mono" style="text-align:right">' + fmt(d.amount) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Outstanding Payments <span class="count-badge">' + outstandingCustomers.length + '</span></h2>';
    if (outstandingCustomers.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No pending payments.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Customer</th><th>Type</th><th style="text-align:right">Outstanding</th></tr></thead><tbody>';
      outstandingCustomers.forEach(c => {
        html += '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.type) + '</td><td class="mono" style="text-align:right;color:var(--rust);font-weight:600">' + fmt(c.outstanding) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Available &amp; Low Stock <span class="count-badge">' + state.products.length + '</span></h2>';
    if (state.products.length === 0){
      html += '<table><tbody><tr class="empty-row"><td>No products yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Product</th><th>Stock</th><th>Status</th></tr></thead><tbody>';
      state.products.forEach(p => {
        const low = Number(p.stock) <= Number(p.lowStock||0);
        html += '<tr><td>' + esc(p.name) + '</td><td class="mono">' + p.stock + ' ' + esc(p.unit) + '</td><td><span class="tag ' + (low?'low':'ok') + '">' + (low?'Low':'OK') + '</span></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    contentEl.innerHTML = html;
  }

  // ---------- SETTINGS ----------
  function renderSettings(){
    titleEl.textContent = 'Shop Details';
    subtitleEl.textContent = 'This info will appear on all bills';
    const s = state.settings;

    let html = '<div class="panel" style="max-width:520px">';
    html += '<h2>Company Info</h2>';

    html += '<div class="field"><label>Logo</label>';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div id="logo-preview" style="width:56px;height:56px;border:1px solid var(--border);border-radius:8px;background:var(--paper);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">' + (s.logoDataUrl ? '<img src="'+s.logoDataUrl+'" style="width:100%;height:100%;object-fit:contain">' : '<span style="font-size:10px;color:var(--ink-soft)">No logo</span>') + '</div>';
    html += '<div><input type="file" id="logo-input" accept="image/*" style="width:auto"></div>';
    if (s.logoDataUrl) html += '<button class="btn-ghost" id="logo-remove">Remove</button>';
    html += '</div></div>';

    html += '<div class="field"><label>Company / Shop Name</label><input id="st-name" value="' + esc(s.shopName) + '" placeholder="e.g. Krushi Seva Kendra"></div>';
    html += '<div class="field"><label>Tagline (optional)</label><input id="st-tagline" value="' + esc(s.tagline) + '" placeholder="e.g. Fertilizer & Agri Inputs"></div>';
    html += '<div class="field"><label>Address</label><input id="st-address" value="' + esc(s.address) + '" placeholder="Full shop address"></div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>GSTIN (if applicable)</label><input id="st-gstin" value="' + esc(s.gstin) + '" placeholder="22AAAAA0000A1Z5"></div>';
    html += '<div class="field"><label>Phone</label><input id="st-phone" value="' + esc(s.phone) + '" placeholder="10 digit number"></div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Email</label><input id="st-email" value="' + esc(s.email) + '" placeholder="shop@example.com"></div>';
    html += '<div class="field"><label>PAN</label><input id="st-pan" value="' + esc(s.pan) + '" placeholder="ABCDE1234F"></div>';
    html += '</div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>State Name</label><input id="st-statename" value="' + esc(s.stateName) + '" placeholder="e.g. Maharashtra"></div>';
    html += '<div class="field"><label>State Code</label><input id="st-statecode" value="' + esc(s.stateCode) + '" placeholder="e.g. 27"></div>';
    html += '</div>';
    html += '<div class="field"><label>Jurisdiction (for invoice footer)</label><input id="st-jurisdiction" value="' + esc(s.jurisdiction) + '" placeholder="e.g. Sangli"></div>';
    html += '<h2 style="margin-top:18px">Bank Details (for invoice)</h2>';
    html += '<div class="field"><label>Bank Name</label><input id="st-bankname" value="' + esc(s.bankName) + '" placeholder="e.g. HDFC Bank"></div>';
    html += '<div class="field-row" style="grid-template-columns:1fr 1fr">';
    html += '<div class="field"><label>Account No.</label><input id="st-accountno" value="' + esc(s.accountNo) + '" placeholder="A/c number"></div>';
    html += '<div class="field"><label>Branch &amp; IFSC Code</label><input id="st-ifsc" value="' + esc(s.ifscBranch) + '" placeholder="e.g. Sangli & HDFC0000222"></div>';
    html += '</div>';
    html += '<div class="field"><label>UPI ID (optional)</label><input id="st-upiid" value="' + esc(s.upiId) + '" placeholder="e.g. 7030056556@hdfc"></div>';
    html += '<div class="field"><label>Payment QR Code (optional)</label>';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    if (s.qrDataUrl) html += '<img src="' + s.qrDataUrl + '" style="width:60px;height:60px;object-fit:contain;border:1px solid var(--line);border-radius:6px">';
    html += '<input type="file" id="qr-input" accept="image/*" style="width:auto">';
    if (s.qrDataUrl) html += '<button class="btn-ghost" id="qr-remove">Remove</button>';
    html += '</div></div>';
    html += '<div class="field"><label>Thank You Message</label><input id="st-thanks" value="' + esc(s.thankYou) + '"></div>';
    html += '<button class="btn-primary" id="st-save">Save</button>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById('logo-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { state.settings.logoDataUrl = reader.result; renderSettings(); };
      reader.readAsDataURL(file);
    });
    const rmBtn = document.getElementById('logo-remove');
    if (rmBtn) rmBtn.addEventListener('click', () => { state.settings.logoDataUrl = ''; renderSettings(); });

    document.getElementById('qr-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { state.settings.qrDataUrl = reader.result; renderSettings(); };
      reader.readAsDataURL(file);
    });
    const qrRmBtn = document.getElementById('qr-remove');
    if (qrRmBtn) qrRmBtn.addEventListener('click', () => { state.settings.qrDataUrl = ''; renderSettings(); });

    document.getElementById('st-save').addEventListener('click', async () => {
      state.settings.shopName = document.getElementById('st-name').value.trim() || 'Shop';
      state.settings.tagline = document.getElementById('st-tagline').value.trim();
      state.settings.address = document.getElementById('st-address').value.trim();
      state.settings.gstin = document.getElementById('st-gstin').value.trim();
      state.settings.phone = document.getElementById('st-phone').value.trim();
      state.settings.email = document.getElementById('st-email').value.trim();
      state.settings.pan = document.getElementById('st-pan').value.trim();
      state.settings.stateName = document.getElementById('st-statename').value.trim();
      state.settings.stateCode = document.getElementById('st-statecode').value.trim();
      state.settings.jurisdiction = document.getElementById('st-jurisdiction').value.trim();
      state.settings.bankName = document.getElementById('st-bankname').value.trim();
      state.settings.accountNo = document.getElementById('st-accountno').value.trim();
      state.settings.ifscBranch = document.getElementById('st-ifsc').value.trim();
      state.settings.upiId = document.getElementById('st-upiid').value.trim();
      state.settings.thankYou = document.getElementById('st-thanks').value.trim();
      const btn = document.getElementById('st-save');
      btn.textContent = 'Saving...'; btn.disabled = true;
      const ok = await saveSettings();
      btn.textContent = 'Save'; btn.disabled = false;
      if (ok) toast('Shop details saved');
    });
  }

  function renderInvoiceDetail(id, fromNewBill){
    const inv = state.invoices.find(i => i.id === id);
    if (!inv){ setView('invoices'); return; }
    titleEl.textContent = inv.invoiceNo;
    subtitleEl.textContent = new Date(inv.date).toLocaleDateString('en-IN');
    topbarActionEl.innerHTML = '<button class="btn-secondary" id="back-btn">← Back</button>';

    let html = '<div style="max-width:380px">';
    html += '<div class="receipt">';
    if (state.settings.logoDataUrl) html += '<div style="text-align:center;margin-bottom:6px"><img src="'+state.settings.logoDataUrl+'" style="height:36px;object-fit:contain"></div>';
    html += '<div class="receipt-head"><div class="shop-name">'+esc(state.settings.shopName)+'</div><div class="shop-tag">'+esc(state.settings.tagline)+'</div>';
    if (state.settings.gstin) html += '<div style="font-size:10.5px;color:var(--ink-soft);margin-top:2px">GSTIN: '+esc(state.settings.gstin)+'</div>';
    html += '</div>';
    html += '<div class="receipt-meta"><span>' + new Date(inv.date).toLocaleDateString('en-IN') + '</span><span class="mono">' + esc(inv.invoiceNo) + '</span></div>';
    if (inv.customerName || inv.customerPhone){
      html += '<div style="font-size:12px;color:var(--ink-soft);margin-bottom:8px">' + esc(inv.customerName||'') + (inv.customerPhone ? ' · ' + esc(inv.customerPhone) : '') + '</div>';
    }
    inv.items.forEach(it => {
      html += '<div class="receipt-line"><span class="item-name">'+esc(it.name)+(it.batch ? ' <span style="color:var(--ink-soft);font-size:10.5px">(Batch: '+esc(it.batch)+')</span>' : '')+'</span><span class="item-qty">'+esc(formatQtyCount(it.qty, it.unit))+'</span><span class="item-amt">'+fmt(it.total)+'</span></div>';
    });
    if (inv.discountAmount > 0 || inv.gstPercent){
      html += '<div class="receipt-line"><span class="item-name">Subtotal</span><span class="item-amt">'+fmt(inv.subtotal)+'</span></div>';
    }
    if (inv.discountAmount > 0){
      html += '<div class="receipt-line"><span class="item-name">Discount' + (inv.discountType==='percent' && inv.discountValue ? ' ('+inv.discountValue+'%)' : '') + '</span><span class="item-amt">-'+fmt(inv.discountAmount)+'</span></div>';
    }
    if (inv.gstPercent){
      html += '<div class="receipt-line"><span class="item-name">GST ('+inv.gstPercent+'%)</span><span class="item-amt">'+fmt(inv.gstAmount)+'</span></div>';
    }
    html += '<div class="receipt-total"><span>Total</span><span class="mono">'+fmt(inv.total)+'</span></div>';
    html += '<div style="font-size:11px;color:var(--ink-soft);margin-top:6px">Payment: '+esc(inv.paymentMethod||'Cash')+'</div>';
    if (inv.salespersonName) html += '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px">Salesperson: '+esc(inv.salespersonName)+'</div>';
    if (state.settings.thankYou) html += '<div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:10px;border-top:1px dashed var(--border);padding-top:8px">'+esc(state.settings.thankYou)+'</div>';
    html += '</div>';
    html += '<div class="receipt-print-btn" style="display:flex;flex-direction:column;gap:8px;margin-top:14px">';
    html += '<button class="btn-primary" id="print-btn" style="width:100%;padding:11px">Print Tax Invoice (A4)</button>';
    html += '<button class="btn-secondary" id="challan-btn" style="width:100%;padding:10px">Print Delivery Challan</button>';
    html += '<button class="btn-secondary" id="pdf-btn" style="width:100%;padding:10px">Download PDF</button>';
    html += '<button class="btn-secondary" id="wa-btn" style="width:100%;padding:10px">Send via WhatsApp</button>';
    html += '<button class="btn-secondary" id="edit-btn" style="width:100%;padding:10px">Edit Bill</button>';
    html += '<button class="btn-ghost" id="del-btn" style="width:100%;padding:8px;text-align:center;border:1px solid var(--border) !important">Delete Bill</button>';
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;
    document.getElementById('print-btn').addEventListener('click', () => {
      printInvoice(inv);
    });
    document.getElementById('challan-btn').addEventListener('click', () => {
      printDeliveryChallan(inv);
    });
    document.getElementById('pdf-btn').addEventListener('click', (e) => downloadPDF(inv, e.target));
    document.getElementById('wa-btn').addEventListener('click', (e) => shareWhatsApp(inv, e.target));
    document.getElementById('edit-btn').addEventListener('click', () => startEditInvoice(inv));
    document.getElementById('del-btn').addEventListener('click', async () => {
      if (!confirm('Delete this bill? Stock will not be restored automatically.')) return;
      try {
        const { error } = await sb.from('invoices').delete().eq('id', inv.id);
        if (error) throw error;
        state.invoices = state.invoices.filter(i => i.id !== inv.id);
        toast('Bill deleted');
        setView('invoices');
      } catch(e){
        console.error(e);
        toast('Delete failed, please try again');
      }
    });
    document.getElementById('back-btn').addEventListener('click', () => setView(fromNewBill ? 'dashboard' : 'invoices'));
  }

  async function downloadPDF(inv, btn){
    toast('In the print dialog, choose "Save as PDF" to download');
    printInvoice(inv);
  }

  async function shareWhatsApp(inv, btn){
    toast('Choose "Save as PDF" first, then WhatsApp will open');
    printInvoice(inv);
    const text = encodeURIComponent(state.settings.shopName + ' - Bill ' + inv.invoiceNo + '\nTotal: ' + fmt(inv.total) + '\nDate: ' + new Date(inv.date).toLocaleDateString('en-IN'));
    setTimeout(() => window.open('https://wa.me/?text=' + text, '_blank'), 800);
  }

  function printInvoiceBodyHTML(inv){
    const s = state.settings;
    const buyer = inv.buyer || {};
    const consignee = inv.consignee || {};
    const meta = inv.meta || {};

    let rows = '';
    inv.items.forEach((it, idx) => {
      const prod = state.products.find(p => p.id === it.productId);
      const hsn = it.hsn ? esc(it.hsn) : ((prod && prod.hsn) ? esc(prod.hsn) : '');
      const itemGst = (it.gstPercent !== undefined && it.gstPercent !== null) ? Number(it.gstPercent) : (prod ? Number(prod.gstPercent)||0 : 0);
      const batch = it.batch ? esc(it.batch) : (prod && prod.batch ? esc(prod.batch) : '');
      const altQty = formatAltQty(it.unit);
      const qtyCount = formatQtyCount(it.qty, it.unit);
      rows += '<tr><td>'+(idx+1)+'</td><td>'+esc(it.name)+'</td><td class="num">'+hsn+'</td><td class="num">'+(itemGst?itemGst+'%':'')+'</td><td class="num">'+batch+'</td><td class="num">'+esc(altQty)+'</td><td class="num">'+esc(qtyCount)+'</td><td class="num">'+fmt(it.price)+'</td><td class="num">'+fmt(it.total)+'</td></tr>';
    });
    let totalRows = '';
    const discountAmount = Number(inv.discountAmount || 0);
    const taxableValue = inv.subtotal - discountAmount;
    const cgst = inv.gstAmount / 2;
    const sgst = inv.gstAmount / 2;
    const cgstRate = (inv.gstPercent / 2).toFixed(2);
    if (discountAmount > 0 || inv.gstPercent){
      totalRows += '<tr><td colspan="7" style="text-align:right;border:none">Subtotal</td><td colspan="2" class="num" style="border:none">'+fmt(inv.subtotal)+'</td></tr>';
    }
    if (discountAmount > 0){
      totalRows += '<tr><td colspan="7" style="text-align:right;border:none">Discount' + (inv.discountType==='percent' && inv.discountValue ? ' ('+inv.discountValue+'%)' : '') + '</td><td colspan="2" class="num" style="border:none">-'+fmt(discountAmount)+'</td></tr>';
    }
    if (inv.gstPercent){
      totalRows += '<tr><td colspan="7" style="text-align:right;border:none">CGST ('+cgstRate+'%) + SGST ('+cgstRate+'%)</td><td colspan="2" class="num" style="border:none">'+fmt(inv.gstAmount)+'</td></tr>';
    }
    totalRows += '<tr class="pi-total-row"><td colspan="7" style="text-align:right">Total Amount</td><td colspan="2" class="num">'+fmt(inv.total)+'</td></tr>';

    const logoHtml = s.logoDataUrl ? '<img src="'+s.logoDataUrl+'" style="height:44px;object-fit:contain;margin-bottom:6px">' : '';

    const consigneeName = consignee.sameAsBuyer === false ? consignee.name : (inv.customerName || '');
    const consigneeAddr = consignee.sameAsBuyer === false ? consignee.address : buyer.address;
    const consigneeGstin = consignee.sameAsBuyer === false ? consignee.gstin : buyer.gstin;
    const consigneeState = consignee.sameAsBuyer === false ? consignee.stateName : buyer.stateName;

    // Rate-wise (5%, 18% etc.) tax breakup — built per product so a single
    // bill mixing different GST rates shows each rate on its own row,
    // instead of one blended rate. Falls back to the old single blended
    // row for historical bills saved before items carried their own
    // gstPercent (so past invoices still print exactly as before).
    const hasItemGst = inv.items.some(it => it.gstPercent !== undefined && it.gstPercent !== null && Number(it.gstPercent) > 0);
    let taxBreakupHtml = '';
    if (hasItemGst && inv.gstPercent){
      const subtotalForShare = inv.subtotal || 1;
      const groups = {};
      inv.items.forEach(it => {
        const rate = Number(it.gstPercent) || 0;
        const itemDiscount = discountAmount * (it.total / subtotalForShare);
        const itemTaxable = it.total - itemDiscount;
        if (!groups[rate]) groups[rate] = { taxable: 0, naturalTax: 0 };
        groups[rate].taxable += itemTaxable;
        groups[rate].naturalTax += itemTaxable * rate / 100;
      });
      const rateKeys = Object.keys(groups).sort((a,b)=>Number(a)-Number(b));
      const naturalTotalTax = rateKeys.reduce((s,k)=> s + groups[k].naturalTax, 0);
      // Scale so the rows always add up to the actual total tax charged
      // (matters if GST% was manually overridden on this bill).
      const scale = naturalTotalTax > 0 ? (inv.gstAmount / naturalTotalTax) : 1;
      let bodyRows = '';
      let sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumTax = 0;
      rateKeys.forEach(k => {
        const rate = Number(k);
        const half = (rate/2).toFixed(2);
        const rowTax = groups[k].naturalTax * scale;
        const rowCgst = rowTax / 2;
        const rowSgst = rowTax / 2;
        sumTaxable += groups[k].taxable; sumCgst += rowCgst; sumSgst += rowSgst; sumTax += rowTax;
        bodyRows += '<tr><td class="num">'+fmt(groups[k].taxable)+'</td><td class="num">'+half+'%</td><td class="num">'+fmt(rowCgst)+'</td><td class="num">'+half+'%</td><td class="num">'+fmt(rowSgst)+'</td><td class="num">'+fmt(rowTax)+'</td></tr>';
      });
      if (rateKeys.length > 1){
        bodyRows += '<tr style="font-weight:700"><td class="num">'+fmt(sumTaxable)+'</td><td></td><td class="num">'+fmt(sumCgst)+'</td><td></td><td class="num">'+fmt(sumSgst)+'</td><td class="num">'+fmt(sumTax)+'</td></tr>';
      }
      taxBreakupHtml = `
        <table style="margin-top:0">
          <thead>
            <tr><th rowspan="2" style="vertical-align:middle">Taxable Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th rowspan="2" style="vertical-align:middle" class="num">Total Tax Amount</th></tr>
            <tr><th class="num">Rate</th><th class="num">Amount</th><th class="num">Rate</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
        <div class="pi-words">Tax Amount (in words) : <strong>${amountInWords(inv.gstAmount)}</strong></div>
      `;
    } else if (inv.gstPercent){
      taxBreakupHtml = `
        <table style="margin-top:0">
          <thead>
            <tr><th rowspan="2" style="vertical-align:middle">Taxable Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th rowspan="2" style="vertical-align:middle" class="num">Total Tax Amount</th></tr>
            <tr><th class="num">Rate</th><th class="num">Amount</th><th class="num">Rate</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>
            <tr><td class="num">${fmt(taxableValue)}</td><td class="num">${cgstRate}%</td><td class="num">${fmt(cgst)}</td><td class="num">${cgstRate}%</td><td class="num">${fmt(sgst)}</td><td class="num">${fmt(inv.gstAmount)}</td></tr>
          </tbody>
        </table>
        <div class="pi-words">Tax Amount (in words) : <strong>${amountInWords(inv.gstAmount)}</strong></div>
      `;
    }

    return `
      <div class="pi-title-row">
        <div class="pi-title">TAX INVOICE</div>
        <div class="pi-original">(ORIGINAL FOR RECIPIENT)</div>
      </div>
      <div class="pi-head">
        <div>
          ${logoHtml}
          <div class="pi-shop-name">${esc(s.shopName)}</div>
          <div class="pi-shop-tag">${esc(s.tagline)}</div>
          ${s.address ? '<div class="pi-shop-tag">'+esc(s.address)+'</div>' : ''}
          ${s.gstin ? '<div class="pi-shop-tag">GSTIN/UIN: '+esc(s.gstin)+'</div>' : ''}
          ${s.stateName ? '<div class="pi-shop-tag">State Name: '+esc(s.stateName)+(s.stateCode ? ', Code: '+esc(s.stateCode) : '')+'</div>' : ''}
          ${s.email ? '<div class="pi-shop-tag">E-Mail: '+esc(s.email)+'</div>' : ''}
        </div>
        <div class="pi-inv-meta">
          <table class="pi-meta-table">
            <tr><td>Invoice No.</td><td><strong>${esc(inv.invoiceNo)}</strong></td></tr>
            <tr><td>Dated</td><td><strong>${new Date(inv.date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</strong></td></tr>
            <tr><td>Mode/Terms of Payment</td><td>${esc(inv.paymentMethod||'')}</td></tr>
            <tr><td>Buyer's Order No.</td><td>${esc(meta.buyersOrderNo||'')}</td></tr>
            ${meta.buyersOrderDate ? '<tr><td>Buyer\'s Order Date</td><td>'+new Date(meta.buyersOrderDate).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})+'</td></tr>' : ''}
            <tr><td>Dispatched through</td><td>${esc(meta.dispatchedThrough||'')}</td></tr>
            <tr><td>Destination</td><td>${esc(meta.destination||'')}</td></tr>
            ${meta.vehicleNo ? '<tr><td>Vehicle No.</td><td>'+esc(meta.vehicleNo)+'</td></tr>' : ''}
          </table>
        </div>
      </div>
      <div class="pi-party-box">
        <div class="pi-label">Consignee (Ship to)</div>
        <div class="pi-party-name">${esc(consigneeName || '—')}</div>
        ${consigneeAddr ? '<div>'+esc(consigneeAddr)+'</div>' : ''}
        ${consigneeGstin ? '<div>GSTIN/UIN : '+esc(consigneeGstin)+'</div>' : ''}
        ${consigneeState ? '<div>State Name : '+esc(consigneeState)+'</div>' : ''}
      </div>
      <div class="pi-party-box">
        <div class="pi-label">Buyer (Bill to)</div>
        <div class="pi-party-name">${esc(inv.customerName || '—')}</div>
        ${inv.customerPhone ? '<div>Ph: '+esc(inv.customerPhone)+'</div>' : ''}
        ${buyer.address ? '<div>'+esc(buyer.address)+'</div>' : ''}
        ${buyer.gstin ? '<div>GSTIN/UIN : '+esc(buyer.gstin)+'</div>' : ''}
        ${buyer.stateName ? '<div>State Name : '+esc(buyer.stateName)+'</div>' : ''}
        ${buyer.placeOfSupply ? '<div>Place of Supply : '+esc(buyer.placeOfSupply)+'</div>' : ''}
      </div>
      <table>
        <thead><tr><th style="width:30px">Sl</th><th>Description of Goods</th><th class="num">HSN/SAC</th><th class="num">GST%</th><th class="num">Batch</th><th class="num">Packing</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${rows}
          ${totalRows}
        </tbody>
      </table>
      <div class="pi-words">Amount Chargeable (in words) : <strong>${amountInWords(inv.total)}</strong></div>
      ${taxBreakupHtml}
      ${s.pan ? '<div class="pi-pan">Company&#39;s PAN : <strong>'+esc(s.pan)+'</strong></div>' : ''}
      ${(s.bankName || s.accountNo || s.ifscBranch || s.upiId || s.qrDataUrl) ? `
      <div class="pi-bank">
        <div class="pi-bank-row">
          <div class="pi-bank-text">
            <div class="pi-label">Company's Bank Details</div>
            ${s.bankName ? '<div>Bank Name : '+esc(s.bankName)+'</div>' : ''}
            ${s.accountNo ? '<div>A/c No. : '+esc(s.accountNo)+'</div>' : ''}
            ${s.ifscBranch ? '<div>Branch &amp; IFS Code : '+esc(s.ifscBranch)+'</div>' : ''}
            ${s.upiId ? '<div>UPI ID : '+esc(s.upiId)+'</div>' : ''}
          </div>
          ${s.qrDataUrl ? '<div class="pi-bank-qr"><img src="'+s.qrDataUrl+'" alt="Payment QR"><div class="pi-bank-qr-label">Scan to Pay</div></div>' : ''}
        </div>
      </div>` : ''}
      <div class="pi-declaration">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
      <div class="pi-footer">
        <div class="pi-sign"><div class="line">Customer's Seal and Signature</div></div>
        <div class="pi-sign"><div class="line">for ${esc(s.shopName)}<br><span style="font-weight:400">Authorised Signatory</span></div></div>
      </div>
      ${s.jurisdiction ? '<div class="pi-jurisdiction">SUBJECT TO '+esc(s.jurisdiction).toUpperCase()+' JURISDICTION</div>' : ''}
      <div class="pi-note">This is a Computer Generated Invoice</div>
    `;
  }

  // Shared print CSS for the Tax Invoice
  function taxInvoicePrintCSS(){
    return `
      * { box-sizing: border-box; }
      body { font-family: 'IBM Plex Sans', Arial, sans-serif; color: #2B2B22; margin: 0; padding: 14mm; }
      @page { size: A4; margin: 14mm; }
      .pi-title-row { display: flex; justify-content: center; align-items: baseline; gap: 14px; position: relative; margin-bottom: 10px; }
      .pi-title { font-family: Georgia, 'Fraunces', serif; font-size: 20px; font-weight: 700; text-align: center; }
      .pi-original { position: absolute; right: 0; font-size: 11px; font-style: italic; }
      .pi-head { display: flex; justify-content: space-between; align-items: flex-start; border-top: 1px solid #3D2B1F; border-bottom: 1px solid #3D2B1F; padding: 10px 0; margin-bottom: 0; }
      .pi-shop-name { font-family: Georgia, 'Fraunces', serif; font-size: 20px; font-weight: 700; color: #3D2B1F; }
      .pi-shop-tag { font-size: 12px; color: #2B2B22; margin-top: 2px; }
      .pi-inv-meta { font-size: 12px; }
      .pi-meta-table td { border: none; padding: 2px 0 2px 14px; font-size: 12px; }
      .pi-meta-table td:first-child { color: #6B6455; padding-left: 0; }
      .pi-party-box { border: 1px solid #E3DCC8; border-top: none; padding: 8px 10px; font-size: 12.5px; }
      .pi-party-box .pi-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B6455; margin-bottom: 3px; }
      .pi-party-name { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
      th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; background: #F3E4C8; color: #3D2B1F; padding: 7px 8px; border: 1px solid #E3DCC8; }
      td { padding: 7px 8px; border: 1px solid #E3DCC8; font-size: 12px; }
      td.num, th.num { text-align: right; font-family: 'Courier New', monospace; }
      .pi-total-row td { font-family: Georgia, 'Fraunces', serif; font-weight: 700; font-size: 13.5px; background: #F7F3EA; }
      .pi-words { font-size: 12px; border: 1px solid #E3DCC8; border-top: none; padding: 6px 10px; }
      .pi-pan { font-size: 12px; border: 1px solid #E3DCC8; border-top: none; padding: 6px 10px; }
      .pi-bank { font-size: 12px; border: 1px solid #E3DCC8; border-top: none; padding: 8px 10px; }
      .pi-bank .pi-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B6455; margin-bottom: 3px; }
      .pi-bank-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .pi-bank-text { flex: 1; }
      .pi-bank-qr { text-align: center; flex-shrink: 0; }
      .pi-bank-qr img { width: 72px; height: 72px; object-fit: contain; }
      .pi-bank-qr-label { font-size: 9px; color: #6B6455; margin-top: 2px; }
      .pi-declaration { font-size: 11px; color: #6B6455; border: 1px solid #E3DCC8; border-top: none; padding: 8px 10px; }
      .pi-footer { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; }
      .pi-sign { text-align: center; }
      .pi-sign .line { width: 200px; border-top: 1px solid #2B2B22; margin-top: 40px; padding-top: 4px; }
      .pi-jurisdiction { text-align: center; font-size: 11.5px; margin-top: 18px; }
      .pi-note { text-align: center; font-size: 11px; color: #6B6455; margin-top: 4px; }
    `;
  }

  // Opens a hidden same-page iframe with the given document HTML and
  // triggers print on it. Using srcdoc (not document.write) avoids the
  // file:// "unsafe navigation" block some browsers throw when the app
  // itself is opened as a local file:///...html page, and using an
  // iframe (not window.open) means no new tab appears.
  function printDocument(bodyHTML, css, titleText){
    const doc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(titleText)+'</title>'
      + '<style>'+css+'</style></head><body>'+bodyHTML+'</body></html>';

    let iframe = document.getElementById('krushi-print-iframe');
    if (!iframe){
      iframe = document.createElement('iframe');
      iframe.id = 'krushi-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    function triggerPrint(){
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch(e){ console.error(e); toast('Print failed, please try again'); }
    }

    iframe.onload = () => setTimeout(triggerPrint, 150);
    iframe.srcdoc = doc;
  }

  function printInvoice(inv){
    printDocument(printInvoiceBodyHTML(inv), taxInvoicePrintCSS(), inv.invoiceNo);
  }

  // ---------- DELIVERY CHALLAN ----------
  function deliveryChallanBodyHTML(inv){
    const s = state.settings;
    const buyer = inv.buyer || {};
    const meta = inv.meta || {};
    const materialList = inv.items.map(it => it.name).join(', ');
    const challanNo = inv.invoiceNo.replace(/^INV/i, 'DC');
    const cust = state.customers.find(c => c.id === inv.customerId);
    const pendingPayment = cust ? fmt(cust.outstanding||0) : fmt(inv.paymentMethod === 'Credit' ? inv.total : 0);
    const today = new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'long', year:'numeric'});
    const billDate = new Date(inv.date).toLocaleDateString('en-IN', {day:'2-digit', month:'2-digit', year:'numeric'});

    return `
      <div class="dc-title">DELIVERY CHALLAN</div>
      <div class="dc-field"><strong>Delivery Challan No.:</strong> ${esc(challanNo)}</div>
      <div class="dc-field"><strong>Date:</strong> ${billDate}</div>
      <div style="height:10px"></div>
      <div class="dc-field"><strong>Supplier Name &amp; Address:</strong> <strong>${esc(s.shopName)}</strong></div>
      ${s.address ? '<div class="dc-field" style="margin-left:0">'+esc(s.address)+'</div>' : ''}
      <div class="dc-field"><strong>Customer Name &amp; Address:</strong> ${esc(inv.customerName || '—')}${buyer.address ? ', '+esc(buyer.address) : ''}</div>
      <div class="dc-field"><strong>Product Description:</strong> ${esc(materialList)}</div>
      <div class="dc-field"><strong>Bill No :</strong> ${esc(inv.invoiceNo)}</div>
      <div class="dc-field"><strong>Transporter Name:</strong> ${esc(meta.dispatchedThrough || 'NA')}</div>
      <div class="dc-field"><strong>Destination:</strong> ${esc(meta.destination || 'NA')}</div>
      <div class="dc-field"><strong>Vehicle No.:</strong> ${esc(meta.vehicleNo || 'NA')}</div>
      <div class="dc-field"><strong>Driver Name :</strong> ${esc(meta.driverName || 'NA')}</div>
      <div class="dc-field">Goods delivered in good condition.</div>
      <div class="dc-field">Receiver's Signature &amp; Stamp:</div>

      <div class="dc-right"><div>Date: ${today}</div></div>
      <div class="dc-right" style="margin-top:30px"><div>Supplier's Signature:</div></div>

      <div class="dc-title" style="margin-top:50px;font-size:15px">PAYMENT UNDERTAKING / CONFIRMATION</div>
      <div class="dc-summary">
        <div><span>Party Name</span><strong>${esc(inv.customerName || '—')}</strong></div>
        <div><span>Invoice Number</span><strong>${esc(inv.invoiceNo)}</strong></div>
        <div><span>Material</span><strong>${esc(materialList)}</strong></div>
        <div><span>Amount</span><strong>${fmt(inv.total)}</strong></div>
        <div><span>Pending Payment</span><strong>${pendingPayment}</strong></div>
      </div>
      <div class="dc-field">I/We</div>
      <div class="dc-banner">${esc(inv.customerName || 'Customer')}</div>
      <div class="dc-field">hereby confirm that we have received ${esc(materialList)} from <strong>${esc(s.shopName)}</strong>. We undertake to pay the total amount of <strong>${fmt(inv.total)}</strong> ${meta.paymentTerms ? esc(meta.paymentTerms) : 'on bills'} from receiving date. In case of delay, the supplier shall have the right to take necessary action for recovery of dues.</div>
      <div class="dc-right" style="margin-top:26px"><div>Customer signature</div></div>
      <div class="dc-field" style="margin-top:14px">Name : &nbsp;&nbsp;&nbsp; Date ${today}</div>
    `;
  }

  function deliveryChallanPrintCSS(){
    return `
      * { box-sizing: border-box; }
      body { font-family: 'IBM Plex Sans', Arial, sans-serif; color: #2B2B22; margin: 0; padding: 16mm; font-size: 13px; }
      @page { size: A4; margin: 16mm; }
      .dc-title { text-align: center; font-size: 20px; font-weight: 700; font-family: Georgia, 'Fraunces', serif; margin-bottom: 16px; }
      .dc-field { margin-bottom: 8px; line-height: 1.5; }
      .dc-right { text-align: right; }
      .dc-summary { border: 1px solid #E3DCC8; border-radius: 6px; padding: 10px 14px; margin: 12px 0 16px; background: #F7F3EA; }
      .dc-summary div { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; }
      .dc-summary span { color: #6B6455; }
      .dc-banner { background: #4A7C59; color: #fff; text-align: center; font-weight: 700; padding: 8px; margin: 8px 0; border: 1px solid #365F44; }
    `;
  }

  function printDeliveryChallan(inv){
    printDocument(deliveryChallanBodyHTML(inv), deliveryChallanPrintCSS(), inv.invoiceNo.replace(/^INV/i,'DC'));
  }

  // ---------- BUSINESS ACCOUNTS ----------
  // This module is stored locally (per company, per browser) since it is
  // an addition on top of the existing products/invoices/customers tables.
  // Sales rows can be pulled in automatically from real bills ("Auto Fetch")
  // or typed in by hand — every other entry (purchase, expense, receipt,
  // payment, transfer, journal) is always manual with an editable date.

  function accStorageKey(){ return 'krushi_accounts_' + state.companyId; }

  function loadAccountsData(){
    try {
      const raw = localStorage.getItem(accStorageKey());
      const data = raw ? JSON.parse(raw) : null;
      state.accTxns = (data && data.txns) || [];
      state.accBanks = (data && data.banks) || [
        { id: 'bank1', name: 'Business Bank 1', opening: 0 },
        { id: 'bank2', name: 'Business Bank 2', opening: 0 },
        { id: 'cash',  name: 'Cash In Hand',    opening: 0 },
        { id: 'upi',   name: 'UPI / Other',     opening: 0 }
      ];
      state.accSuppliers = (data && data.suppliers) || [];
      state.accStockOpening = (data && data.stockOpening) || {};
    } catch(e){
      console.error('accounts load error', e);
      state.accTxns = []; state.accBanks = [
        { id: 'bank1', name: 'Business Bank 1', opening: 0 },
        { id: 'cash',  name: 'Cash In Hand',    opening: 0 },
        { id: 'upi',   name: 'UPI / Other',     opening: 0 }
      ]; state.accSuppliers = []; state.accStockOpening = {};
    }
  }

  function saveAccountsData(){
    try {
      localStorage.setItem(accStorageKey(), JSON.stringify({
        txns: state.accTxns, banks: state.accBanks,
        suppliers: state.accSuppliers, stockOpening: state.accStockOpening
      }));
    } catch(e){ console.error('accounts save error', e); toast('Save failed (storage full?)'); }
  }

  function accNewId(){ return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function accIsoToday(){ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function accDateLabel(iso){ if(!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; return d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}); }
  function accVoucherPrefix(type){ return { Sale:'S', Purchase:'P', Expense:'E', Receipt:'R', Payment:'Py', Transfer:'T', Journal:'J' }[type] || 'X'; }
  function accNextVoucherNo(type){
    const prefix = accVoucherPrefix(type);
    const count = state.accTxns.filter(t => t.type === type).length + 1;
    return prefix + String(count).padStart(3,'0');
  }

  // Pulls every bill not already imported into the register as a Sale txn.
  function accAutoFetchSales(){
    const already = new Set(state.accTxns.filter(t => t.invoiceId).map(t => t.invoiceId));
    let added = 0;
    state.invoices.forEach(inv => {
      if (already.has(inv.id)) return;
      const isoDate = (new Date(inv.date)).toISOString().slice(0,10);
      const productNames = (inv.items||[]).map(it => {
        const p = state.products.find(x => x.id === it.productId);
        return p ? p.name : '';
      }).filter(Boolean).join(', ');
      const bankAcc = inv.paymentMethod === 'Credit' ? '' :
        (inv.paymentMethod === 'UPI' ? 'UPI / Other' :
         inv.paymentMethod === 'Cash' ? 'Cash In Hand' : (state.accBanks[0]?state.accBanks[0].name:'Business Bank 1'));
      state.accTxns.push({
        id: accNewId(), date: isoDate, voucherNo: accNextVoucherNo('Sale'), type: 'Sale',
        party: inv.customerName || 'Walk-in', particular: 'Product Sale', product: productNames,
        amount: Number(inv.total)||0, paymentMode: inv.paymentMethod || 'Cash',
        bankAccount: bankAcc, drCr: 'Cr', remarks: 'Auto-fetched from Bill ' + inv.invoiceNo,
        source: 'auto', invoiceId: inv.id
      });
      added++;
    });
    saveAccountsData();
    toast(added ? (added + ' sale(s) auto-fetched') : 'All bills already fetched — nothing new');
    renderAccounts();
  }

  function accBankBalance(bankName){
    const bank = state.accBanks.find(b => b.name === bankName);
    let bal = bank ? Number(bank.opening)||0 : 0;
    state.accTxns.forEach(t => {
      if (t.bankAccount !== bankName) return;
      if (t.drCr === 'Cr') bal += Number(t.amount)||0; else bal -= Number(t.amount)||0;
    });
    return bal;
  }

  function accMonthTxns(monthStr){
    return state.accTxns.filter(t => (t.date||'').slice(0,7) === monthStr);
  }

  function accSetTab(tab){ state.accountsTab = tab; renderAccounts(); }

  function renderAccounts(){
    titleEl.textContent = 'Business Accounts';
    subtitleEl.textContent = 'Daily register, bank cash book, outstanding &amp; profit-loss — all in one place';
    subtitleEl.innerHTML = "Daily register, bank cash book, outstanding &amp; profit/loss";
    topbarActionEl.innerHTML = '<button class="btn-secondary" id="acc-fetch-btn" style="margin-right:8px">⟳ Auto Fetch Sales</button><button class="btn-primary" id="acc-add-btn">+ Add Entry</button>';

    const monthStr = new Date().toISOString().slice(0,7);
    const monthTx = accMonthTxns(monthStr);
    const totalSales = monthTx.filter(t=>t.type==='Sale').reduce((s,t)=>s+Number(t.amount||0),0);
    const totalExpenses = monthTx.filter(t=>t.type==='Expense').reduce((s,t)=>s+Number(t.amount||0),0);
    const totalPurchase = monthTx.filter(t=>t.type==='Purchase').reduce((s,t)=>s+Number(t.amount||0),0);
    const netProfit = totalSales - totalExpenses - totalPurchase;
    const totalReceivable = state.customers.reduce((s,c)=>s+Number(c.outstanding||0),0);
    const totalPayable = state.accSuppliers.reduce((s,sp)=>s+Number(supplierOutstanding(sp.id)),0);

    let html = '<div class="acc-summary-grid">';
    html += statCard('Total Sales (Month)', fmt(totalSales), false);
    html += statCard('Total Expenses', fmt(totalExpenses + totalPurchase), false);
    html += '<div class="stat-card profit leaf-accent"><div class="stat-label">Net Profit</div><div class="stat-val">' + fmt(netProfit) + '</div></div>';
    html += statCard('Total Receivable', fmt(totalReceivable), false);
    html += statCard('Total Payable', fmt(totalPayable), totalPayable>0);
    html += '</div>';

    html += '<div class="acc-bank-strip">';
    state.accBanks.forEach(b => {
      html += '<div class="acc-bank-chip"><div class="bc-name">' + esc(b.name) + '</div><div class="bc-val">' + fmt(accBankBalance(b.name)) + '</div></div>';
    });
    html += '</div>';

    const tabs = [['dashboard','Dashboard'],['register','Daily Register'],['bankbook','Bank Cash Book'],['outstanding','Outstanding'],['stock','Stock Register'],['pnl','Monthly P&L'],['banks','Bank Accounts']];
    html += '<div class="acc-tabs">';
    tabs.forEach(([key,label]) => {
      html += '<button class="acc-tab' + (state.accountsTab===key?' active':'') + '" data-atab="' + key + '">' + label + '</button>';
    });
    html += '</div>';

    html += '<div id="acc-tab-body"></div>';
    contentEl.innerHTML = html;

    document.getElementById('acc-fetch-btn').addEventListener('click', accAutoFetchSales);
    document.getElementById('acc-add-btn').addEventListener('click', () => openAccTxnModal());
    document.querySelectorAll('.acc-tab').forEach(el => el.addEventListener('click', () => accSetTab(el.dataset.atab)));

    const body = document.getElementById('acc-tab-body');
    if (state.accountsTab === 'dashboard') body.innerHTML = accDashboardHTML(monthTx, totalSales, totalExpenses+totalPurchase, netProfit);
    else if (state.accountsTab === 'register') renderAccRegister(body);
    else if (state.accountsTab === 'bankbook') renderAccBankBook(body);
    else if (state.accountsTab === 'outstanding') renderAccOutstanding(body);
    else if (state.accountsTab === 'stock') renderAccStock(body);
    else if (state.accountsTab === 'pnl') renderAccPnl(body, monthStr);
    else if (state.accountsTab === 'banks') renderAccBanks(body);
  }

  function accDashboardHTML(monthTx, sales, expenses, profit){
    const maxVal = Math.max(sales, expenses, profit, 1);
    const bar = (label, val, color) => {
      const h = Math.max(4, Math.round((Math.abs(val)/maxVal)*140));
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:80px">' +
        '<div style="font-size:11.5px;font-family:\'IBM Plex Mono\'">'+fmt(val)+'</div>' +
        '<div style="width:44px;height:'+h+'px;background:'+color+';border-radius:5px 5px 0 0"></div>' +
        '<div style="font-size:11px;color:var(--ink-soft)">'+label+'</div></div>';
    };
    let html = '<div class="panel"><h2>Sales vs Expenses vs Profit (this month)</h2>';
    html += '<div style="display:flex;gap:26px;align-items:flex-end;justify-content:center;padding:14px 0">';
    html += bar('Total Sales', sales, 'var(--leaf)');
    html += bar('Total Expenses', expenses, 'var(--rust)');
    html += bar('Net Profit', profit, 'var(--wheat)');
    html += '</div></div>';

    const byType = {};
    monthTx.filter(t=>t.type==='Expense').forEach(t => { byType[t.particular||'Other'] = (byType[t.particular||'Other']||0) + Number(t.amount||0); });
    const entries = Object.entries(byType).sort((a,b)=>b[1]-a[1]);
    html += '<div class="panel"><h2>Expenses Breakup (this month) <span class="count-badge">'+entries.length+'</span></h2>';
    if (!entries.length){
      html += '<div style="color:var(--ink-soft);font-size:13px;padding:10px 0">No expenses recorded this month yet.</div>';
    } else {
      const total = entries.reduce((s,[,v])=>s+v,0);
      html += '<table><thead><tr><th>Particular</th><th class="num">Amount</th><th class="num">%</th></tr></thead><tbody>';
      entries.forEach(([k,v]) => {
        html += '<tr><td>'+esc(k)+'</td><td class="num">'+fmt(v)+'</td><td class="num">'+(total?Math.round(v/total*100):0)+'%</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    return html;
  }

  // ---- Daily Transaction Register ----
  function renderAccRegister(body){
    let html = '<div class="panel"><h2>Daily Transaction Register <span class="count-badge">'+state.accTxns.length+'</span></h2>';
    const rows = [...state.accTxns].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    if (!rows.length){
      html += '<table><tbody><tr class="empty-row"><td>No transactions yet. Use "+ Add Entry" or "Auto Fetch Sales" above.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Party</th><th>Particular</th><th>Product</th><th class="num">Amount</th><th>Mode</th><th>Bank/Account</th><th>Dr/Cr</th><th></th></tr></thead><tbody>';
      rows.forEach(t => {
        html += '<tr>' +
          '<td>'+accDateLabel(t.date)+'</td>' +
          '<td class="mono">'+esc(t.voucherNo)+ (t.source==='auto' ? ' <span class="tag auto">auto</span>' : '') +'</td>' +
          '<td>'+esc(t.type)+'</td>' +
          '<td>'+esc(t.party||'-')+'</td>' +
          '<td>'+esc(t.particular||'-')+'</td>' +
          '<td>'+esc(t.product||'-')+'</td>' +
          '<td class="num">'+fmt(t.amount)+'</td>' +
          '<td>'+esc(t.paymentMode||'-')+'</td>' +
          '<td>'+esc(t.bankAccount||'-')+'</td>' +
          '<td><span class="tag '+(t.drCr==='Cr'?'cr':'dr')+'">'+t.drCr+'</span></td>' +
          '<td><button class="btn-icon" data-edit="'+t.id+'" title="Edit">✎</button><button class="btn-icon" data-del="'+t.id+'" title="Delete">✕</button></td>' +
          '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openAccTxnModal(b.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      state.accTxns = state.accTxns.filter(t => t.id !== b.dataset.del);
      saveAccountsData(); renderAccounts();
    }));
  }

  function openAccTxnModal(id){
    const editing = !!id;
    const tx = editing ? state.accTxns.find(t=>t.id===id) : {
      id: accNewId(), date: accIsoToday(), voucherNo: accNextVoucherNo('Sale'), type: 'Sale',
      party: '', particular: '', product: '', amount: '', paymentMode: 'Cash',
      bankAccount: state.accBanks[0] ? state.accBanks[0].name : '', drCr: 'Cr', remarks: '', source: 'manual'
    };
    const bankOptions = state.accBanks.map(b => '<option value="'+esc(b.name)+'" '+(tx.bankAccount===b.name?'selected':'')+'>'+esc(b.name)+'</option>').join('');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${editing ? 'Edit Transaction' : 'New Transaction'}</h3>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Date</label><input id="tx-date" type="date" value="${esc(tx.date)}"></div>
          <div class="field"><label>Type</label>
            <select id="tx-type">
              ${['Sale','Purchase','Expense','Receipt','Payment','Transfer','Journal'].map(t=>'<option value="'+t+'" '+(tx.type===t?'selected':'')+'>'+t+'</option>').join('')}
            </select>
          </div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Voucher No.</label><input id="tx-voucher" value="${esc(tx.voucherNo)}"></div>
          <div class="field"><label>Party Name</label><input id="tx-party" value="${esc(tx.party)}" placeholder="Customer / Supplier / Person"></div>
        </div>
        <div class="field"><label>Particular</label><input id="tx-particular" value="${esc(tx.particular)}" placeholder="e.g. Product Sale, Transport Charges"></div>
        <div class="field"><label>Product (optional)</label><input id="tx-product" value="${esc(tx.product||'')}" placeholder="e.g. Seaweed Extract"></div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Amount (₹)</label><input id="tx-amount" type="number" min="0" step="0.01" value="${tx.amount}"></div>
          <div class="field"><label>Dr / Cr</label>
            <select id="tx-drcr">
              <option value="Cr" ${tx.drCr==='Cr'?'selected':''}>Cr (Income / Cash In)</option>
              <option value="Dr" ${tx.drCr==='Dr'?'selected':''}>Dr (Expense / Cash Out)</option>
            </select>
          </div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Payment Mode</label>
            <select id="tx-mode">
              ${['Cash','UPI','NEFT','Cheque','Card','Credit'].map(m=>'<option value="'+m+'" '+(tx.paymentMode===m?'selected':'')+'>'+m+'</option>').join('')}
            </select>
          </div>
          <div class="field"><label>Bank / Account</label><select id="tx-bank">${bankOptions}</select></div>
        </div>
        <div class="field"><label>Remarks (optional)</label><input id="tx-remarks" value="${esc(tx.remarks||'')}"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="tx-cancel">Cancel</button>
          <button class="btn-primary" id="tx-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('tx-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('tx-type').addEventListener('change', (e) => {
      document.getElementById('tx-voucher').value = accNextVoucherNo(e.target.value);
    });
    document.getElementById('tx-save').addEventListener('click', () => {
      const date = document.getElementById('tx-date').value;
      const type = document.getElementById('tx-type').value;
      const voucherNo = document.getElementById('tx-voucher').value.trim();
      const party = document.getElementById('tx-party').value.trim();
      const particular = document.getElementById('tx-particular').value.trim();
      const product = document.getElementById('tx-product').value.trim();
      const amount = Number(document.getElementById('tx-amount').value) || 0;
      const drCr = document.getElementById('tx-drcr').value;
      const paymentMode = document.getElementById('tx-mode').value;
      const bankAccount = document.getElementById('tx-bank').value;
      const remarks = document.getElementById('tx-remarks').value.trim();
      if (!date){ toast('Select date'); return; }
      if (!amount){ toast('Enter amount'); return; }
      const payload = { date, type, voucherNo, party, particular, product, amount, drCr, paymentMode, bankAccount, remarks, source: tx.source || 'manual', invoiceId: tx.invoiceId };
      if (editing){
        state.accTxns = state.accTxns.map(t => t.id === id ? Object.assign({}, t, payload) : t);
      } else {
        state.accTxns.push(Object.assign({ id: tx.id }, payload));
      }
      saveAccountsData();
      overlay.remove();
      toast(editing ? 'Entry updated' : 'Entry added');
      renderAccounts();
    });
  }

  // ---- Bank-wise Cash Book ----
  function renderAccBankBook(body){
    let html = '';
    state.accBanks.forEach(bank => {
      const rows = state.accTxns.filter(t => t.bankAccount === bank.name).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
      html += '<div class="panel"><h2>'+esc(bank.name)+' <span class="count-badge">'+rows.length+' entries</span></h2>';
      if (!rows.length){
        html += '<table><tbody><tr class="empty-row"><td>No transactions in this account yet.</td></tr></tbody></table>';
      } else {
        let running = Number(bank.opening)||0;
        html += '<table><thead><tr><th>Date</th><th>Particular</th><th class="num">Deposit (₹)</th><th class="num">Withdrawal (₹)</th><th class="num">Balance (₹)</th></tr></thead><tbody>';
        html += '<tr><td>'+accDateLabel(rows[0].date)+'</td><td>Opening Balance</td><td class="num">-</td><td class="num">-</td><td class="num">'+fmt(running)+'</td></tr>';
        let dep=0, wit=0;
        rows.forEach(t => {
          const amt = Number(t.amount)||0;
          if (t.drCr === 'Cr'){ running += amt; dep += amt; } else { running -= amt; wit += amt; }
          html += '<tr><td>'+accDateLabel(t.date)+'</td><td>'+esc(t.particular||t.type)+'</td>' +
            '<td class="num">'+(t.drCr==='Cr'?fmt(amt):'-')+'</td>' +
            '<td class="num">'+(t.drCr==='Dr'?fmt(amt):'-')+'</td>' +
            '<td class="num">'+fmt(running)+'</td></tr>';
        });
        html += '<tr style="font-weight:600"><td colspan="2">Total</td><td class="num">'+fmt(dep)+'</td><td class="num">'+fmt(wit)+'</td><td class="num">-</td></tr>';
        html += '</tbody></table>';
      }
      html += '</div>';
    });
    body.innerHTML = html;
  }

  // ---- Outstanding (Customers + Suppliers) ----
  function supplierOutstanding(supplierId){
    const sp = state.accSuppliers.find(s=>s.id===supplierId);
    if (!sp) return 0;
    const paid = state.accTxns.filter(t => t.type==='Payment' && t.party === sp.name).reduce((s,t)=>s+Number(t.amount||0),0);
    const purchased = state.accTxns.filter(t => t.type==='Purchase' && t.party === sp.name).reduce((s,t)=>s+Number(t.amount||0),0);
    return Math.max(0, Number(sp.billAmount||0) + purchased - paid - Number(sp.paidUpfront||0));
  }

  function renderAccOutstanding(body){
    let html = '<div class="panel"><h2>Customer Outstanding <span class="count-badge">'+state.customers.length+'</span></h2>';
    if (!state.customers.length){
      html += '<table><tbody><tr class="empty-row"><td>No customers yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Customer Name</th><th>Type</th><th class="num">Outstanding (₹)</th></tr></thead><tbody>';
      state.customers.filter(c=>Number(c.outstanding||0)>0).forEach(c => {
        html += '<tr><td>'+esc(c.name)+'</td><td>'+esc(c.type)+'</td><td class="num">'+fmt(c.outstanding)+'</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="panel"><h2>Supplier Outstanding <span class="count-badge">'+state.accSuppliers.length+'</span> <button class="btn-secondary" id="acc-add-supplier">+ Add Supplier</button></h2>';
    if (!state.accSuppliers.length){
      html += '<table><tbody><tr class="empty-row"><td>No suppliers yet. Click "+ Add Supplier".</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Supplier Name</th><th class="num">Bill Amount (₹)</th><th class="num">Balance (₹)</th><th></th></tr></thead><tbody>';
      state.accSuppliers.forEach(sp => {
        html += '<tr><td>'+esc(sp.name)+'</td><td class="num">'+fmt(sp.billAmount||0)+'</td><td class="num">'+fmt(supplierOutstanding(sp.id))+'</td>' +
          '<td><button class="btn-icon" data-editsup="'+sp.id+'">✎</button><button class="btn-icon" data-delsup="'+sp.id+'">✕</button></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    body.innerHTML = html;
    const addBtn = document.getElementById('acc-add-supplier');
    if (addBtn) addBtn.addEventListener('click', () => openSupplierModal());
    body.querySelectorAll('[data-editsup]').forEach(b => b.addEventListener('click', () => openSupplierModal(b.dataset.editsup)));
    body.querySelectorAll('[data-delsup]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Delete this supplier?')) return;
      state.accSuppliers = state.accSuppliers.filter(s => s.id !== b.dataset.delsup);
      saveAccountsData(); renderAccounts();
    }));
  }

  function openSupplierModal(id){
    const editing = !!id;
    const sp = editing ? state.accSuppliers.find(s=>s.id===id) : { id: accNewId(), name: '', billAmount: 0, paidUpfront: 0 };
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:380px">
        <h3>${editing?'Edit Supplier':'New Supplier'}</h3>
        <div class="field"><label>Supplier Name</label><input id="sup-name" value="${esc(sp.name)}"></div>
        <div class="field"><label>Bill Amount (₹)</label><input id="sup-bill" type="number" min="0" value="${sp.billAmount||0}"></div>
        <div class="field"><label>Paid Already (₹)</label><input id="sup-paid" type="number" min="0" value="${sp.paidUpfront||0}"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="sup-cancel">Cancel</button>
          <button class="btn-primary" id="sup-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('sup-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });
    document.getElementById('sup-save').addEventListener('click', () => {
      const name = document.getElementById('sup-name').value.trim();
      if (!name){ toast('Enter supplier name'); return; }
      const billAmount = Number(document.getElementById('sup-bill').value)||0;
      const paidUpfront = Number(document.getElementById('sup-paid').value)||0;
      if (editing){
        state.accSuppliers = state.accSuppliers.map(s => s.id===id ? Object.assign({},s,{name,billAmount,paidUpfront}) : s);
      } else {
        state.accSuppliers.push({ id: sp.id, name, billAmount, paidUpfront });
      }
      saveAccountsData(); overlay.remove(); toast(editing?'Supplier updated':'Supplier added'); renderAccounts();
    });
  }

  // ---- Stock Register (Summary) ----
  function renderAccStock(body){
    let html = '<div class="panel"><h2>Stock Register (Summary) <span class="count-badge">'+state.products.length+'</span></h2>';
    if (!state.products.length){
      html += '<table><tbody><tr class="empty-row"><td>No products yet.</td></tr></tbody></table>';
    } else {
      html += '<table><thead><tr><th>Product Name</th><th class="num">Opening Stock</th><th class="num">Purchase (Qty)</th><th class="num">Sales (Qty)</th><th class="num">Closing Stock</th><th>Unit</th></tr></thead><tbody>';
      state.products.forEach(p => {
        const soldQty = state.invoices.reduce((s,inv) => s + (inv.items||[]).filter(it=>it.productId===p.id).reduce((s2,it)=>s2+Number(it.qty||0),0), 0);
        const purchasedQty = state.accTxns.filter(t=>t.type==='Purchase' && t.product===p.name).length; // count only, exact qty not tracked per txn
        const opening = state.accStockOpening[p.id];
        const openingVal = (opening!==undefined) ? opening : (Number(p.stock)||0) + soldQty;
        html += '<tr><td>'+esc(p.name)+'</td>' +
          '<td class="num"><input data-openid="'+p.id+'" type="number" value="'+openingVal+'" style="width:80px;display:inline-block;text-align:right"></td>' +
          '<td class="num">'+purchasedQty+'</td>' +
          '<td class="num">'+soldQty+'</td>' +
          '<td class="num">'+Number(p.stock||0)+'</td>' +
          '<td>'+esc(p.unit||'-')+'</td></tr>';
      });
      html += '</tbody></table>';
      html += '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:10px">Opening stock is editable — type a value and it saves automatically. Closing stock always reflects live stock from the Stock page. Purchase qty counts logged Purchase-type entries for that product from the register (log purchases with the product name to track them here).</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-openid]').forEach(inp => {
      inp.addEventListener('change', () => {
        state.accStockOpening[inp.dataset.openid] = Number(inp.value)||0;
        saveAccountsData();
        toast('Opening stock saved');
      });
    });
  }

  // ---- Monthly P&L ----
  function renderAccPnl(body, monthStr){
    const allMonths = Array.from(new Set(state.accTxns.map(t=>(t.date||'').slice(0,7)))).filter(Boolean).sort().reverse();
    if (!allMonths.includes(monthStr)) allMonths.unshift(monthStr);
    const selMonth = state.accPnlMonth && allMonths.includes(state.accPnlMonth) ? state.accPnlMonth : monthStr;
    const tx = accMonthTxns(selMonth);
    const sales = tx.filter(t=>t.type==='Sale').reduce((s,t)=>s+Number(t.amount||0),0);
    const purchase = tx.filter(t=>t.type==='Purchase').reduce((s,t)=>s+Number(t.amount||0),0);
    const grossProfit = sales - purchase;
    const expByParticular = {};
    tx.filter(t=>t.type==='Expense').forEach(t => { expByParticular[t.particular||'Other'] = (expByParticular[t.particular||'Other']||0) + Number(t.amount||0); });
    const totalExpenses = Object.values(expByParticular).reduce((s,v)=>s+v,0);
    const netProfit = grossProfit - totalExpenses;

    let html = '<div class="acc-toolbar"><label style="margin:0">Month</label><select id="pnl-month">' +
      allMonths.map(m => '<option value="'+m+'" '+(m===selMonth?'selected':'')+'>'+monthLabel(m+'-01')+'</option>').join('') +
      '</select></div>';
    html += '<div class="panel"><h2>Monthly P&L Summary — '+monthLabel(selMonth+'-01')+'</h2>';
    html += '<table><tbody>';
    html += '<tr><td>Total Sales (Income)</td><td class="num">'+fmt(sales)+'</td></tr>';
    html += '<tr><td>Less: Cost of Goods Sold / Purchase</td><td class="num">'+fmt(purchase)+'</td></tr>';
    html += '<tr style="font-weight:700"><td>Gross Profit</td><td class="num">'+fmt(grossProfit)+'</td></tr>';
    html += '<tr><td colspan="2" style="font-weight:600;padding-top:14px">Less: Expenses</td></tr>';
    Object.entries(expByParticular).forEach(([k,v]) => {
      html += '<tr><td style="padding-left:18px">'+esc(k)+'</td><td class="num">'+fmt(v)+'</td></tr>';
    });
    if (!Object.keys(expByParticular).length){
      html += '<tr><td style="padding-left:18px;color:var(--ink-soft);font-style:italic">No expenses logged this month</td><td class="num">-</td></tr>';
    }
    html += '<tr style="font-weight:700"><td>Total Expenses</td><td class="num">'+fmt(totalExpenses)+'</td></tr>';
    html += '<tr style="font-weight:700;color:var(--leaf-dark)"><td>Net Profit</td><td class="num">'+fmt(netProfit)+'</td></tr>';
    html += '</tbody></table></div>';
    body.innerHTML = html;
    document.getElementById('pnl-month').addEventListener('change', (e) => { state.accPnlMonth = e.target.value; renderAccounts(); });
  }

  // ---- Bank Accounts management ----
  function renderAccBanks(body){
    let html = '<div class="panel"><h2>Bank / Cash Accounts <span class="count-badge">'+state.accBanks.length+'</span> <button class="btn-secondary" id="acc-add-bank">+ Add Account</button></h2>';
    html += '<table><thead><tr><th>Account Name</th><th class="num">Opening Balance (₹)</th><th class="num">Current Balance (₹)</th><th></th></tr></thead><tbody>';
    state.accBanks.forEach(b => {
      html += '<tr><td>'+esc(b.name)+'</td><td class="num">'+fmt(b.opening)+'</td><td class="num">'+fmt(accBankBalance(b.name))+'</td>' +
        '<td><button class="btn-icon" data-editbank="'+b.id+'">✎</button><button class="btn-icon" data-delbank="'+b.id+'">✕</button></td></tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;
    document.getElementById('acc-add-bank').addEventListener('click', () => openBankModal());
    body.querySelectorAll('[data-editbank]').forEach(b => b.addEventListener('click', () => openBankModal(b.dataset.editbank)));
    body.querySelectorAll('[data-delbank]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Delete this account? Transactions logged under it will stay but stop matching a chip.')) return;
      state.accBanks = state.accBanks.filter(x => x.id !== b.dataset.delbank);
      saveAccountsData(); renderAccounts();
    }));
  }

  function openBankModal(id){
    const editing = !!id;
    const bk = editing ? state.accBanks.find(b=>b.id===id) : { id: accNewId(), name: '', opening: 0 };
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="width:360px">
        <h3>${editing?'Edit Account':'New Bank / Cash Account'}</h3>
        <div class="field"><label>Account Name</label><input id="bk-name" value="${esc(bk.name)}" placeholder="e.g. Business Bank 3"></div>
        <div class="field"><label>Opening Balance (₹)</label><input id="bk-opening" type="number" value="${bk.opening||0}"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="bk-cancel">Cancel</button>
          <button class="btn-primary" id="bk-save">${editing?'Update':'Add'}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    document.getElementById('bk-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });
    document.getElementById('bk-save').addEventListener('click', () => {
      const name = document.getElementById('bk-name').value.trim();
      if (!name){ toast('Enter account name'); return; }
      const opening = Number(document.getElementById('bk-opening').value)||0;
      if (editing){
        state.accBanks = state.accBanks.map(b => b.id===id ? Object.assign({},b,{name,opening}) : b);
      } else {
        state.accBanks.push({ id: bk.id, name, opening });
      }
      saveAccountsData(); overlay.remove(); toast(editing?'Account updated':'Account added'); renderAccounts();
    });
  }

  // ---------- AUTH ----------
  const loginEl = document.getElementById('krushi-login');
  const syncStatusEl = document.getElementById('sync-status');
  const logoutBtn = document.getElementById('logout-btn');

  function showApp(){
    loginEl.style.display = 'none';
    root.style.display = 'flex';
    logoutBtn.style.display = 'flex';
    syncStatusEl.textContent = 'Connected — data syncs across all devices.';
    loadData();
  }
  function showLogin(){
    root.style.display = 'none';
    logoutBtn.style.display = 'none';
    loginEl.style.display = 'block';
    document.getElementById('login-error').style.display = 'none';
    document.querySelector('#krushi-login .login-card').style.display = 'block';
    document.getElementById('register-card').style.display = 'none';
  }

  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    if (!email || !password){ errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; return; }
    btn.textContent = 'Logging in...'; btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.textContent = 'Login'; btn.disabled = false;
    if (error){
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      return;
    }
    showApp();
  });

  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });

  // --- Register (create a new shop login without SSH/seed-user.js) ---
  const loginCard = document.querySelector('#krushi-login .login-card');
  const registerCard = document.getElementById('register-card');

  document.getElementById('show-register-link').addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.style.display = 'none';
    registerCard.style.display = 'block';
  });
  document.getElementById('show-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.style.display = 'none';
    loginCard.style.display = 'block';
  });

  document.getElementById('register-btn').addEventListener('click', async () => {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const password2 = document.getElementById('register-password2').value;
    const errEl = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');
    errEl.style.display = 'none';
    if (!email || !password){ errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; return; }
    if (password.length < 6){ errEl.textContent = 'Password must be at least 6 characters'; errEl.style.display = 'block'; return; }
    if (password !== password2){ errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }
    btn.textContent = 'Creating account...'; btn.disabled = true;
    const { error } = await sb.auth.signUp({ email, password });
    btn.textContent = 'Create account'; btn.disabled = false;
    if (error){
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      return;
    }
    showApp();
  });
  document.getElementById('register-password2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('register-btn').click();
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
    showLogin();
  });

  // Number inputs (Qty, Rate, etc.) otherwise silently change value when
  // the page is scrolled with the mouse wheel while the field has focus —
  // this blurs them first so scrolling the page never changes a number.
  document.addEventListener('wheel', () => {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
  }, { passive: true });

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) showApp(); else showLogin();
  })();
}

