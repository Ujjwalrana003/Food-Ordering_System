const $ = id => document.getElementById(id);
const STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
let items = [], editing = null;

function gate() {
  const u = API.user(), ok = u && u.role === 'admin';
  $('login').hidden = ok; $('panel').hidden = !ok; $('out').hidden = !ok;
  if (ok) { loadAll(); }
}
$('lbtn').onclick = async () => {
  try {
    const r = await API.req('/auth/login', { method: 'POST', body: { email: $('le').value, password: $('lp').value } });
    if (r.user.role !== 'admin') throw new Error('This account is not an admin.');
    API.setSession(r.token, r.user); gate();
  } catch (e) { $('lerr').textContent = e.message; }
};
$('out').onclick = () => { API.clear(); gate(); };
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-pressed', x === t));
  ['menuP', 'ordersP'].forEach(p => $(p).hidden = p !== t.dataset.p);
});

async function loadAll() {
  try { await Promise.all([loadStats(), loadMenu(), loadOrders()]); }
  catch (e) { if (e.status === 401 || e.status === 403) gate(); else toast(e.message); }
}
async function loadStats() {
  const s = await API.req('/reports/summary');
  $('stats').innerHTML = `<div class="stat">Orders<br><b>${s.orders}</b></div><div class="stat">Revenue<br><b>${money(s.revenue)}</b></div><div class="stat">Low stock items<br><b>${s.low_stock}</b></div>
    <div class="stat">Best sellers<br>${s.top.map(t => `${imgTag(t.image_url, t.name, 't')} ${esc(t.name)} (${t.qty})`).join('<br>') || '—'}</div>`;
}
async function loadMenu() {
  const m = await API.req('/menu'); items = m.items;
  $('cats').innerHTML = m.categories.map(c => `<option value="${esc(c.name)}">`).join('');
  $('rows').innerHTML = items.map(i => `<tr><td>${imgTag(i.image_url, i.name, 't')}</td><td><b>${i.is_veg ? '🟢' : '🔴'} ${esc(i.name)}</b><br><small>${esc(i.description)}</small></td><td>${esc(i.category)}</td><td>${money(i.price)}</td><td>${i.stock}${i.is_available ? '' : ' (hidden)'}</td>
    <td><button class="btn sm" data-e="${i.id}">Edit</button> <button class="btn red sm" data-x="${i.id}">Delete</button></td></tr>`).join('');
}
async function loadOrders() {
  const o = await API.req('/orders');
  $('orows').innerHTML = o.map(r => `<tr><td>${r.id}</td><td>${esc(r.customer)}<br><small>${esc(r.delivery_address)}</small>${r.delivery_lat !== null && r.delivery_lat !== undefined && r.delivery_lng !== null && r.delivery_lng !== undefined && Number.isFinite(+r.delivery_lat) && Number.isFinite(+r.delivery_lng) ? `<br><a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(r.delivery_lat)}&mlon=${encodeURIComponent(r.delivery_lng)}#map=17/${encodeURIComponent(r.delivery_lat)}/${encodeURIComponent(r.delivery_lng)}" target="_blank" rel="noopener">Open delivery pin</a>` : ''}</td>
    <td>${esc(r.phone_number || '—')}</td><td>${r.created_at ? esc(new Date(r.created_at).toLocaleString()) : '—'}</td>
    <td>${r.items.map(i => `${imgTag(i.image_url, i.name_snapshot, 't')}`).join(' ')}<br>${r.items.map(i => `${esc(i.name_snapshot)} × ${i.quantity}`).join(', ')}</td>
    <td>${money(r.total)}</td><td><span class="pill ${r.payment_status}">${r.payment_status}</span></td>
    <td><select data-o="${r.id}" aria-label="Status for order ${r.id}">${STATUSES.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="8">No orders yet.</td></tr>';
}
document.addEventListener('change', async e => {
  if (!e.target.dataset.o) return;
  try { await API.req(`/orders/${e.target.dataset.o}/status`, { method: 'PATCH', body: { status: e.target.value } }); toast('Order updated'); } catch (er) { toast(er.message); }
});
document.addEventListener('click', async e => {
  if (e.target.dataset.e) openForm(items.find(i => i.id == e.target.dataset.e));
  if (e.target.dataset.x && confirm('Delete this item?')) { try { await API.req('/menu/' + e.target.dataset.x, { method: 'DELETE' }); toast('Item deleted'); loadMenu(); } catch (er) { toast(er.message); } }
});

function openForm(i) {
  editing = i ? i.id : null; $('dt').textContent = i ? 'Edit item' : 'Add item'; $('ferr').textContent = ''; $('file').value = '';
  $('nm').value = i?.name || ''; $('ds').value = i?.description || ''; $('cat').value = i?.category || ''; $('pr').value = i?.price ?? ''; $('st').value = i?.stock ?? ''; $('av').checked = i ? !!i.is_available : true; $('vg').checked = i ? !!i.is_veg : true; $('rt').value = i?.rating ?? 4; $('pt').value = i?.prep_time ?? 20;
  $('url').value = i?.image_url || ''; $('prev').src = i?.image_url || PLACEHOLDER; $('dlg').showModal();
}
$('newBtn').onclick = () => openForm(null);
$('cancel').onclick = () => $('dlg').close();
$('url').oninput = () => $('prev').src = $('url').value || PLACEHOLDER;
$('file').onchange = () => {
  const f = $('file').files[0]; if (!f) return;
  if (f.size > 3 * 1024 * 1024) { $('ferr').textContent = 'Image must be under 3 MB.'; $('file').value = ''; return; }
  const r = new FileReader();
  r.onload = async () => {
    try { const u = await API.req('/menu/upload', { method: 'POST', body: { data: r.result } }); $('url').value = u.image_url; $('prev').src = u.image_url; $('ferr').textContent = ''; }
    catch (e) { $('ferr').textContent = e.message; }
  };
  r.readAsDataURL(f);
};
$('f').onsubmit = async e => {
  e.preventDefault();
  const body = { name: $('nm').value, description: $('ds').value, category: $('cat').value, price: $('pr').value, stock: $('st').value, is_available: $('av').checked, is_veg: $('vg').checked, rating: $('rt').value, prep_time: $('pt').value, image_url: $('url').value };
  try { await API.req(editing ? '/menu/' + editing : '/menu', { method: editing ? 'PUT' : 'POST', body }); $('dlg').close(); toast('Item saved'); loadMenu(); loadStats(); }
  catch (er) { $('ferr').textContent = er.message; }
};
gate();
