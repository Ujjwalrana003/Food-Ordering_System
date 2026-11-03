const $ = id => document.getElementById(id);
const STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
let items = [], editing = null, adminOrders = null;

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
  ['menuP', 'ordersP', 'analyticsP'].forEach(p => $(p).hidden = p !== t.dataset.p);
  if (t.dataset.p === 'analyticsP') loadAnalytics();
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
async function loadAnalytics() {
  $('analyticsNotice').hidden = true;
  $('analyticsError').textContent = '';
  $('analyticsStats').innerHTML = '<div class="analytics-loading">Loading analytics…</div>';
  try {
    const data = await API.req(`/reports/analytics?days=${$('analyticsPeriod').value}`);
    renderAnalytics(data);
  } catch (e) {
    if (e.status === 401 || e.status === 403) { gate(); return; }
    if (e.status === 404) {
      try {
        if (adminOrders === null) adminOrders = await API.req('/orders');
        const days = Number($('analyticsPeriod').value);
        renderAnalytics(buildAnalyticsFromOrders(adminOrders, days));
        $('analyticsNotice').textContent = 'Showing analytics from the latest 200 orders. Restart the server to enable complete report data.';
        $('analyticsNotice').hidden = false;
        return;
      } catch (fallbackError) {
        e = fallbackError;
      }
    }
    $('analyticsStats').innerHTML = '';
    $('revenueChart').innerHTML = '';
    $('statusChart').innerHTML = '';
    $('popularItems').innerHTML = '';
    $('analyticsError').textContent = e.message;
  }
}
function buildAnalyticsFromOrders(orders, days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: localDateKey(date), orders: 0, revenue: 0 };
  });
  const byDate = new Map(trend.map(day => [day.date, day]));
  const statusCounts = new Map();
  const itemCounts = new Map();
  let cancelled = 0, revenue = 0, nonCancelledOrders = 0, orderCount = 0;
  for (const order of orders) {
    const createdAt = new Date(order.created_at);
    if (!Number.isFinite(createdAt.getTime())) continue;
    const dateKey = localDateKey(createdAt);
    const day = byDate.get(dateKey);
    if (!day) continue;
    orderCount++;
    day.orders++;
    statusCounts.set(order.status, (statusCounts.get(order.status) || 0) + 1);
    if (order.status === 'cancelled') {
      cancelled++;
      continue;
    }
    const total = Number(order.total) || 0;
    revenue += total;
    nonCancelledOrders++;
    day.revenue += total;
    for (const item of order.items || []) {
      itemCounts.set(item.name_snapshot, (itemCounts.get(item.name_snapshot) || 0) + Number(item.quantity || 0));
    }
  }
  return {
    orders: orderCount,
    cancelled,
    revenue,
    average_order: nonCancelledOrders ? revenue / nonCancelledOrders : 0,
    trend,
    statuses: [...statusCounts].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    top_items: [...itemCounts].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
}
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function renderAnalytics(data) {
  const cancelledRate = data.orders ? data.cancelled / data.orders * 100 : 0;
  $('analyticsStats').innerHTML = `
    <div class="stat"><span>Revenue</span><b>${money(data.revenue)}</b></div>
    <div class="stat"><span>Orders</span><b>${data.orders}</b></div>
    <div class="stat"><span>Average order value</span><b>${money(data.average_order)}</b></div>
    <div class="stat"><span>Cancellation rate</span><b>${cancelledRate.toFixed(1)}%</b></div>`;
  renderRevenueChart(data.trend);
  renderStatusChart(data.statuses);
  $('popularItems').innerHTML = data.top_items.length
    ? data.top_items.map(item => `<li><span>${esc(item.name)}</span><b>${item.quantity} sold</b></li>`).join('')
    : '<li class="chart-empty">No item sales in this period.</li>';
}
function renderRevenueChart(trend) {
  const width = 720, height = 270, left = 58, right = 12, top = 14, bottom = 42;
  const values = trend.map(day => Number(day.revenue));
  const max = Math.max(...values, 0);
  const scale = max || 1;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const points = values.map((value, i) => ({
    x: left + (trend.length > 1 ? i / (trend.length - 1) : 0.5) * plotWidth,
    y: top + plotHeight - value / scale * plotHeight,
  }));
  const grid = Array.from({ length: 5 }, (_, i) => {
    const y = top + i * plotHeight / 4;
    const value = scale * (4 - i) / 4;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid-line"/>
      <text x="${left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis-label">${esc(compactMoney(value))}</text>`;
  }).join('');
  const labelIndexes = new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1]);
  const xLabels = trend.map((day, i) => labelIndexes.has(i)
    ? `<text x="${points[i].x}" y="${height - 12}" text-anchor="middle" class="chart-axis-label">${esc(shortDate(day.date))}</text>`
    : '').join('');
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const circles = points.map((point, i) => `<circle cx="${point.x}" cy="${point.y}" r="3" class="chart-point"><title>${esc(shortDate(trend[i].date))}: ${esc(money(values[i]))}</title></circle>`).join('');
  $('revenueChart').setAttribute('aria-label', 'Daily revenue chart');
  $('revenueChart').innerHTML = trend.length
    ? `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="revenueChartTitle">
        <title id="revenueChartTitle">Daily revenue for the selected period</title>${grid}
        <polyline points="${line}" class="revenue-line"/>${circles}${xLabels}
      </svg>${max === 0 ? '<p class="chart-empty">No revenue in this period.</p>' : ''}`
    : '<p class="chart-empty">No order data available.</p>';
}
function renderStatusChart(statuses) {
  const total = statuses.reduce((sum, item) => sum + item.count, 0);
  const colors = ['#e23744', '#e99434', '#6b62c7', '#3287bd', '#267e3e', '#a8a8a8'];
  $('statusChart').innerHTML = statuses.length
    ? statuses.map((item, index) => {
      const percent = total ? item.count / total * 100 : 0;
      return `<div class="status-row">
        <div class="status-label"><span class="status-dot" style="--status-color:${colors[index % colors.length]}"></span>${esc(label(item.status))}<b>${item.count}</b></div>
        <div class="status-track" aria-label="${esc(label(item.status))}: ${item.count} orders"><span style="width:${percent}%;--status-color:${colors[index % colors.length]}"></span></div>
      </div>`;
    }).join('')
    : '<p class="chart-empty">No orders in this period.</p>';
}
function compactMoney(value) {
  return '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
function shortDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
$('analyticsPeriod').onchange = loadAnalytics;
async function loadMenu() {
  const m = await API.req('/menu'); items = m.items;
  $('cats').innerHTML = m.categories.map(c => `<option value="${esc(c.name)}">`).join('');
  $('rows').innerHTML = items.map(i => `<tr><td>${imgTag(i.image_url, i.name, 't')}</td><td><b>${i.is_veg ? '🟢' : '🔴'} ${esc(i.name)}</b><br><small>${esc(i.description)}</small></td><td>${esc(i.category)}</td><td>${money(i.price)}</td><td>${i.stock}${i.is_available ? '' : ' (hidden)'}</td>
    <td><button class="btn sm" data-e="${i.id}">Edit</button> <button class="btn red sm" data-x="${i.id}">Delete</button></td></tr>`).join('');
}
async function loadOrders() {
  const o = adminOrders = await API.req('/orders');
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
