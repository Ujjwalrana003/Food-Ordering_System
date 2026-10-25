const $ = id => document.getElementById(id);
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let menu = { categories: [], items: [] }, cart = store('cart', {}), favs = store('favs', []), coupon = localStorage.getItem('coupon') || '', quote = null, signup = false;
let deliveryLocation = store('deliveryLocation', null), deliveryMap = null, deliveryMarker = null, geocodeRequest = 0, addressEditVersion = 0;
let geocodeQueue = Promise.resolve(), lastGeocodeAt = 0;
if (!deliveryLocation || !Number.isFinite(+deliveryLocation.lat) || !Number.isFinite(+deliveryLocation.lng)
  || Math.abs(+deliveryLocation.lat) > 90 || Math.abs(+deliveryLocation.lng) > 180) deliveryLocation = null;
const F = { q: '', type: '', rating: false, cheap: false, fav: false, sort: '', cat: 0 };
const OFFERS = [['WELCOME50', '50% OFF up to ₹100', 'On orders above ₹199', 'o1'], ['FLAT75', 'Flat ₹75 OFF', 'On orders above ₹399', 'o2'], ['FREEDEL', 'Free delivery', 'On orders above ₹249', 'o3']];
const TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>';
const itemById = id => menu.items.find(i => i.id == id);
const eta = i => `${i.prep_time + 10}-${i.prep_time + 15} min`;
const vg = i => `<span class="vg ${i.is_veg ? '' : 'nv'}" title="${i.is_veg ? 'Veg' : 'Non-veg'}"></span>`;
const validCoords = (lat, lng) => lat !== null && lat !== undefined && lng !== null && lng !== undefined
  && String(lat).trim() !== '' && String(lng).trim() !== ''
  && Number.isFinite(+lat) && Number.isFinite(+lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180;

function updateLocationStatus(message, error = false) {
  const status = $('locationStatus');
  if (status) { status.textContent = message; status.classList.toggle('bad', error); }
}
function geocodeFetch(url) {
  const request = geocodeQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();
    return fetch(url);
  });
  geocodeQueue = request.then(() => undefined, () => undefined);
  return request;
}
async function reverseGeocode(lat, lng) {
  const request = ++geocodeRequest;
  const editVersion = addressEditVersion;
  updateLocationStatus('Finding the address for this pin…');
  try {
    const response = await geocodeFetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`);
    if (!response.ok) throw new Error('Address lookup is unavailable right now.');
    const place = await response.json();
    if (request !== geocodeRequest) return;
    if (place.display_name && editVersion === addressEditVersion) {
      $('addr').value = place.display_name;
      localStorage.setItem('addr', place.display_name);
      updateLocationStatus('Pin selected. You can edit the address or add apartment details.');
    } else updateLocationStatus('Pin selected. Please enter or confirm the street address below.');
  } catch (error) {
    if (request !== geocodeRequest) return;
    updateLocationStatus(`${error.message} The pin is saved; enter the address below.`, true);
  }
}
function selectDeliveryLocation(lat, lng) {
  if (!validCoords(lat, lng)) return;
  deliveryLocation = { lat: +lat, lng: +lng };
  localStorage.setItem('deliveryLocation', JSON.stringify(deliveryLocation));
  if (deliveryMarker) deliveryMarker.setLatLng([deliveryLocation.lat, deliveryLocation.lng]);
  if ($('clearPin')) $('clearPin').hidden = false;
  reverseGeocode(deliveryLocation.lat, deliveryLocation.lng);
}
function clearDeliveryLocation() {
  deliveryLocation = null;
  localStorage.removeItem('deliveryLocation');
  if (deliveryMarker && deliveryMap) deliveryMap.removeLayer(deliveryMarker);
  deliveryMarker = null;
  if ($('clearPin')) $('clearPin').hidden = true;
  updateLocationStatus('Map pin cleared. Your typed address is unchanged.');
}
function ensureDeliveryMarker(lat, lng) {
  if (deliveryMarker) return;
  deliveryMarker = L.marker([lat, lng], { draggable: true }).addTo(deliveryMap);
  deliveryMarker.on('dragend', () => {
    const point = deliveryMarker.getLatLng();
    selectDeliveryLocation(point.lat, point.lng);
  });
}
function initializeDeliveryMap() {
  if (deliveryMap || !window.L || !$('deliveryMap')) return;
  deliveryMap = L.map('deliveryMap').setView(deliveryLocation ? [deliveryLocation.lat, deliveryLocation.lng] : [20.5937, 78.9629], deliveryLocation ? 15 : 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(deliveryMap);
  if (deliveryLocation) ensureDeliveryMarker(deliveryLocation.lat, deliveryLocation.lng);
  deliveryMap.on('click', e => {
    ensureDeliveryMarker(e.latlng.lat, e.latlng.lng);
    selectDeliveryLocation(e.latlng.lat, e.latlng.lng);
  });
  setTimeout(() => deliveryMap.invalidateSize(), 0);
}
async function findMapPlace(query) {
  const status = $('mapSearchStatus');
  status.textContent = 'Searching…';
  try {
    const response = await geocodeFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Place search is unavailable right now.');
    const [place] = await response.json();
    if (!place) { status.textContent = 'No places found. Try a nearby landmark or area.'; return; }
    const lat = Number(place.lat), lng = Number(place.lon);
    deliveryMap.setView([lat, lng], 16);
    ensureDeliveryMarker(lat, lng);
    selectDeliveryLocation(lat, lng);
    status.textContent = '';
  } catch (error) { status.textContent = error.message; }
}

async function loadMenu() {
  menu = await API.req('/menu');
  menu.items.forEach(i => { i.price = +i.price; i.rating = +i.rating; });
  const first = c => menu.items.find(i => i.category_id === c.id);
  $('cats').innerHTML = [{ id: 0, name: 'All', image_url: '/images/menu/butter-chicken.svg' }, ...menu.categories.map(c => ({ ...c, image_url: first(c)?.image_url }))]
    .map(c => `<button class="cat" data-cat="${c.id}" aria-pressed="${F.cat === c.id}"><div class="c">${imgTag(c.image_url, '')}</div>${esc(c.name)}</button>`).join('');
  renderMenu(); renderCart();
}
function filtered() {
  const l = menu.items.filter(i => (!F.cat || i.category_id === F.cat) && (!F.q || `${i.name} ${i.description} ${i.category}`.toLowerCase().includes(F.q))
    && (!F.type || (F.type === 'veg') === !!i.is_veg) && (!F.rating || i.rating >= 4) && (!F.cheap || i.price <= 200) && (!F.fav || favs.includes(i.id)));
  const s = { low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating, fast: (a, b) => a.prep_time - b.prep_time }[F.sort];
  return s ? l.sort(s) : l;
}
function renderMenu() {
  const list = filtered();
  $('menu').innerHTML = list.map(i => {
    const out = !i.is_available || i.stock < 1, q = cart[i.id] || 0, fav = favs.includes(i.id);
    return `<article class="dish ${out ? 'out' : ''}" tabindex="0" role="button" data-open="${i.id}" aria-label="View ${esc(i.name)}">
      <div class="ph">${imgTag(i.image_url, i.name)}<button class="heart ${fav ? 'on' : ''}" data-fav="${i.id}" aria-pressed="${fav}" aria-label="Favourite ${esc(i.name)}">♥</button>
        <span class="tagline">${out ? 'Sold out' : i.stock <= 5 ? `Only ${i.stock} left` : ''}</span></div>
      <div class="b"><div class="row"><h3>${vg(i)}${esc(i.name)}</h3><span class="rt">${i.rating.toFixed(1)} ★</span></div>
        <div class="meta"><span><b>${money(i.price)}</b></span><span>${eta(i)}</span></div><p>${esc(i.description)}</p>
        ${out ? '<button class="add" disabled>Unavailable</button>' : q ? `<div class="qty"><button data-d="-1" data-id="${i.id}" aria-label="Remove one">−</button><b>${q}</b><button data-d="1" data-id="${i.id}" aria-label="Add one">+</button></div>`
          : `<button class="add" data-d="1" data-id="${i.id}">ADD +</button>`}</div></article>`;
  }).join('') || `<p class="empty">${F.fav ? 'No favourites yet. Tap the heart on a dish.' : 'No dishes match your filters.'}</p>`;
}
$('offers').innerHTML = OFFERS.map(([c, t, s, k]) => `<button class="offer ${k}" data-coupon="${c}"><b>${t}</b><span>${s}</span><br><em>${c}</em></button>`).join('');

// ---- cart ----
function change(id, d) {
  const it = itemById(id); if (!it) return;
  const n = Math.max(0, (cart[id] || 0) + d);
  if (n > it.stock) return toast(`Only ${it.stock} available.`);
  n ? cart[id] = n : delete cart[id]; saveCart(); renderMenu();
}
function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); renderCart(); }
const cartItems = () => Object.entries(cart).filter(([id]) => itemById(id)).map(([id, quantity]) => ({ id: +id, quantity }));
async function renderCart() {
  const items = cartItems(), count = items.reduce((a, b) => a + b.quantity, 0);
  $('cartCount').textContent = count;
  
  const body = items.length ? `<div class="box">${items.map(({ id, quantity }) => { const i = itemById(id);
    
    return `<div class="line">${imgTag(i.image_url, i.name)}<div class="n"><b>${vg(i)} ${esc(i.name)}</b>${money(i.price)} each<br><button class="rm" data-rm="${id}" aria-label="Remove ${esc(i.name)}">${TRASH} Remove</button></div>
      <div><div class="qty"><button data-d="-1" data-id="${id}" aria-label="Fewer">−</button><b>${quantity}</b><button data-d="1" data-id="${id}" aria-label="More">+</button></div><div style="text-align:right;margin-top:4px;font-weight:600">${money(i.price * quantity)}</div></div></div>`; }).join('')}</div>
    <div class="box"><b>Apply coupon</b><div class="coupon" style="margin-top:8px"><input id="cin" placeholder="Enter code" value="${esc(coupon)}" aria-label="Coupon code"><button class="btn ghost sm" id="capply">Apply</button></div><p class="cmsg" id="cmsg"></p></div>
    <div class="box bill" id="bill"></div>
    <div class="box"><label for="phone" style="margin-top:0">Phone number</label><input id="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="Phone number for delivery" required>
    <label for="addr">Delivery address</label><textarea id="addr" rows="2" placeholder="House no, street, city">${esc(localStorage.getItem('addr') || '')}</textarea>
    <button type="button" class="btn ghost sm map-toggle" id="mapToggle" aria-expanded="false">Choose location on map</button>
    <div id="mapPicker" class="map-picker" hidden>
      <div class="map-search"><input id="mapSearch" type="search" placeholder="Search an area or landmark" aria-label="Search map"><button type="button" class="btn sm" id="mapSearchBtn">Search</button></div>
      <p id="mapSearchStatus" class="map-status" role="status"></p>
      <p class="map-hint">Map and search data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>.</p>
      <button type="button" class="btn plain sm locate-btn" id="locateBtn">◎ Use my current location</button>
      <button type="button" class="btn plain sm" id="clearPin" ${deliveryLocation ? '' : 'hidden'}>Clear selected pin</button>
      <p class="map-hint">Tap the map or drag the pin to your delivery entrance.</p>
      <div id="deliveryMap" aria-label="Choose delivery location on map"></div>
      <p id="locationStatus" class="map-status" role="status">${deliveryLocation ? 'Saved pin loaded. Choose another point to move it.' : ''}</p>
    </div>
    <label for="pay">Pay with</label><select id="pay"><option value="upi">UPI</option><option value="card">Debit / credit card</option><option value="cod">Cash on delivery</option></select></div>`
    
    : '<p class="empty">Your cart is empty.<br>Add a dish to get started.</p>';
  const mapWasOpen = $('mapPicker') && !$('mapPicker').hidden;
  const keepAddr = $('addr') && $('addr').value;
  const keepPhone = $('phone') && $('phone').value;
  if (deliveryMap) { deliveryMap.remove(); deliveryMap = null; deliveryMarker = null; }
  $('cartBody').innerHTML = body;
  if (keepAddr && $('addr')) $('addr').value = keepAddr;
  if (keepPhone && $('phone')) $('phone').value = keepPhone;
  if ($('addr')) $('addr').oninput = () => { addressEditVersion++; localStorage.setItem('addr', $('addr').value); };
  if ($('mapToggle')) $('mapToggle').onclick = () => {
    const panel = $('mapPicker'), open = panel.hidden;
    panel.hidden = !open; $('mapToggle').setAttribute('aria-expanded', String(open));
    $('mapToggle').textContent = open ? 'Hide map' : 'Choose location on map';
    if (open) {
      if (!window.L) updateLocationStatus('The map could not load. Please check your connection and try again.', true);
      else { initializeDeliveryMap(); setTimeout(() => deliveryMap.invalidateSize(), 0); }
    }
  };
  if ($('mapSearchBtn')) $('mapSearchBtn').onclick = () => {
    const query = $('mapSearch').value.trim();
    if (query) findMapPlace(query);
    else $('mapSearchStatus').textContent = 'Enter an area or landmark to search.';
  };
  if ($('mapSearch')) $('mapSearch').onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); $('mapSearchBtn').click(); }
  };
  if ($('locateBtn')) $('locateBtn').onclick = () => {
    if (!navigator.geolocation) return updateLocationStatus('Location is not available in this browser.', true);
    updateLocationStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      ensureDeliveryMarker(latitude, longitude);
      deliveryMap.setView([latitude, longitude], 16);
      selectDeliveryLocation(latitude, longitude);
    }, error => {
      const message = error.code === 1 ? 'Location permission was denied. Search or tap the map instead.' : 'Could not get your location. Search or tap the map instead.';
      updateLocationStatus(message, true);
    }, { enableHighAccuracy: true, timeout: 10000 });
  };
  if ($('clearPin')) $('clearPin').onclick = clearDeliveryLocation;
  if (mapWasOpen && $('mapPicker')) {
    $('mapPicker').hidden = false;
    $('mapToggle').setAttribute('aria-expanded', 'true');
    $('mapToggle').textContent = 'Hide map';
    if (window.L) initializeDeliveryMap();
  }
  $('placeBtn').hidden = !items.length;
  if (!items.length) { quote = null; $('cartbar').classList.remove('on'); return; }
  try { quote = await API.req('/orders/quote', { method: 'POST', body: { items, coupon } }); } catch { return; }
  if (coupon && !quote.coupon) { $('cmsg').textContent = quote.couponError; $('cmsg').className = 'cmsg bad'; }
  else if (quote.coupon) { $('cmsg').textContent = `${quote.coupon} applied. You save ${money(quote.discount + (quote.delivery_fee === 0 && quote.subtotal < 500 ? 40 : 0))}`; $('cmsg').className = 'cmsg ok'; }
  $('bill').innerHTML = `<div><span>Item total</span><span>${money(quote.subtotal)}</span></div>
    ${quote.discount ? `<div class="g"><span>Coupon discount</span><span>− ${money(quote.discount)}</span></div>` : ''}
    <div><span>Delivery fee</span><span>${quote.delivery_fee ? money(quote.delivery_fee) : '<b class="g">FREE</b>'}</span></div><div><span>GST (5%)</span><span>${money(quote.tax)}</span></div>
    <div class="t"><span>To pay</span><span>${money(quote.total)}</span></div>`;
  $('placeBtn').textContent = `Place order · ${money(quote.total)}`;
  $('cbText').textContent = `${count} item${count > 1 ? 's' : ''} · ${money(quote.subtotal)}`; $('cartbar').classList.add('on');
}
const openCart = () => { $('cart').classList.add('open'); $('shade').classList.add('on'); $('cartbar').classList.remove('on'); };
const closeCart = () => { $('cart').classList.remove('open'); $('shade').classList.remove('on'); if (cartItems().length) $('cartbar').classList.add('on'); };
const setCoupon = c => { coupon = c.trim().toUpperCase(); localStorage.setItem('coupon', coupon); renderCart(); };

// ---- dish popup ----
let cur = null, dq = 1;
function openItem(id) { cur = itemById(id); if (!cur) return; dq = 1; drawItem(); $('itemDlg').showModal(); }
function drawItem() {
  const i = cur, out = !i.is_available || i.stock < 1;
  $('itemBody').innerHTML = `${imgTag(i.image_url, i.name, 'big')}<div class="info"><div class="row"><span class="tag">${esc(i.category)}</span><span class="rt">${i.rating.toFixed(1)} ★</span></div>
    <h2>${vg(i)} ${esc(i.name)}</h2><p style="margin:0;color:var(--mute)">${esc(i.description)}</p>
    <div class="meta" style="justify-content:flex-start;gap:16px"><span>Delivery ${eta(i)}</span><span>${i.stock} in stock</span></div><b style="font-size:26px">${money(i.price)}</b>
    ${out ? '<p class="tag">Sold out for now</p>' : `<div class="qty"><button id="dm" aria-label="Fewer">−</button><b>${dq}</b><button id="dp" aria-label="More">+</button></div>
    <button class="btn" id="dAdd">Add to cart · ${money(i.price * dq)}</button><button class="btn ghost" id="dNow">Order now</button>`}</div>`;
}
$('itemBody').onclick = e => {
  const id = e.target.id; if (!cur) return;
  if (id === 'dm') { dq = Math.max(1, dq - 1); drawItem(); }
  if (id === 'dp') { if (dq + (cart[cur.id] || 0) >= cur.stock) toast(`Only ${cur.stock} available.`); else { dq++; drawItem(); } }
  if (id === 'dAdd' || id === 'dNow') {
    cart[cur.id] = Math.min(cur.stock, (cart[cur.id] || 0) + dq); saveCart(); renderMenu(); $('itemDlg').close();
    if (id === 'dNow') openCart(); else toast(`${cur.name} added to cart`);
  }
};
$('closeItem').onclick = () => $('itemDlg').close();
$('itemDlg').addEventListener('click', e => { if (e.target === $('itemDlg')) $('itemDlg').close(); });

// ---- clicks ----
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.open) openItem(e.target.dataset.open); });
document.addEventListener('click', async e => {
  const t = e.target, g = s => t.closest(s);
  let b;
  if ((b = g('[data-d]'))) return change(b.dataset.id, +b.dataset.d);
  if ((b = g('[data-rm]'))) { delete cart[b.dataset.rm]; saveCart(); renderMenu(); return toast('Item removed from cart'); }
  if ((b = g('[data-fav]'))) { const id = +b.dataset.fav; favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]; localStorage.setItem('favs', JSON.stringify(favs)); return renderMenu(); }
  if ((b = g('[data-open]'))) return openItem(b.dataset.open);
  if ((b = g('[data-cat]'))) { F.cat = +b.dataset.cat; document.querySelectorAll('.cat').forEach(x => x.setAttribute('aria-pressed', x === b)); return renderMenu(); }
  if ((b = g('[data-f]'))) { const f = b.dataset.f, on = b.getAttribute('aria-pressed') !== 'true';
    if (f === 'veg' || f === 'nonveg') { F.type = on ? f : ''; document.querySelectorAll('[data-f=veg],[data-f=nonveg]').forEach(x => x.setAttribute('aria-pressed', x === b && on)); }
    else { F[f] = on; b.setAttribute('aria-pressed', on); } return renderMenu(); }
  if ((b = g('[data-coupon]'))) { setCoupon(b.dataset.coupon); toast(`${b.dataset.coupon} will apply to your cart`); }
  if (g('#capply')) setCoupon($('cin').value);
  if ((b = g('[data-cancel]'))) { if (!confirm('Cancel this order?')) return; try { await API.req(`/orders/${b.dataset.cancel}/cancel`, { method: 'PATCH' }); toast('Order cancelled'); await loadMenu(); loadOrders(); } catch (er) { toast(er.message); } }
  if ((b = g('[data-reorder]'))) { const o = orders.find(x => x.id == b.dataset.reorder); o.items.forEach(i => { const m = itemById(i.menu_item_id); if (m && m.stock > 0) cart[m.id] = Math.min(m.stock, (cart[m.id] || 0) + i.quantity); }); saveCart(); renderMenu(); openCart(); }
});
$('q').oninput = e => { F.q = e.target.value.trim().toLowerCase(); renderMenu(); };
$('sort').onchange = e => { F.sort = e.target.value; renderMenu(); };
$('cartBtn').onclick = openCart; $('cartbar').onclick = openCart; $('closeCart').onclick = closeCart; $('shade').onclick = closeCart;

// ---- auth ----
function refreshAuth() { const u = API.user(); $('authBtn').textContent = u ? `Log out (${u.name.split(' ')[0]})` : 'Log in'; $('ordersBtn').hidden = !u; }
$('authBtn').onclick = () => { if (API.user()) { API.clear(); $('orders').hidden = true; refreshAuth(); } else openAuth(); };
function openAuth(s = false) { signup = s; $('authTitle').textContent = s ? 'Sign up' : 'Log in'; $('nameWrap').hidden = !s; $('switchAuth').textContent = s ? 'I have an account' : 'Create account'; $('authErr').textContent = ''; $('authDlg').showModal(); }
$('switchAuth').onclick = () => openAuth(!signup);
$('authForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const r = await API.req(signup ? '/auth/register' : '/auth/login', { method: 'POST', body: { email: $('aemail').value, password: $('apass').value, name: $('aname').value } });
    API.setSession(r.token, r.user); $('authDlg').close(); refreshAuth(); toast(`Welcome, ${r.user.name}`); loadOrders();
  } catch (err) { $('authErr').textContent = err.message; }
};

// ---- checkout ----
$('placeBtn').onclick = async () => {
  $('cartErr').textContent = '';
  if (!API.user()) { closeCart(); toast('Please log in to place your order'); return openAuth(); }
  const addr = $('addr').value; localStorage.setItem('addr', addr);
  const phoneNumber = $('phone').value.trim();
  if (!$('phone').checkValidity()) { $('phone').reportValidity(); return; }
  try {
    const o = await API.req('/orders', { method: 'POST', body: {
      items: cartItems(), delivery_address: addr, phone_number: phoneNumber, coupon,
      ...(deliveryLocation ? { delivery_lat: deliveryLocation.lat, delivery_lng: deliveryLocation.lng } : {}),
    } });
    const p = await API.req('/payments', { method: 'POST', body: { order_id: o.id, method: $('pay').value } });
    cart = {}; coupon = ''; deliveryLocation = null; localStorage.removeItem('coupon'); localStorage.removeItem('deliveryLocation'); saveCart(); closeCart();
    toast(p.status === 'success' ? `Order #${o.id} placed and paid. Ref ${p.transaction_ref}` : `Order #${o.id} placed. Pay on delivery.`);
    await loadMenu(); await loadOrders(); $('orders').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { $('cartErr').textContent = err.message; }
};

// ---- orders with live tracking ----
let orders = []; const STEPS = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
const stepper = s => s === 'cancelled' ? '' : `<ol class="steps">${STEPS.map((x, k) => `<li class="${k <= STEPS.indexOf(s) ? 'done' : ''}">${label(x)}</li>`).join('')}</ol>`;
async function loadOrders() {
  if (!API.user()) return;
  try { orders = await API.req('/orders/mine'); } catch { return; }
  $('orders').hidden = false;
  $('orderList').innerHTML = orders.map(o => `<div class="order"><div class="row"><b>Order #${o.id}</b><span><span class="pill ${o.status}">${label(o.status)}</span> <span class="pill ${o.payment_status}">${o.payment_status}</span></span></div>
    <div class="thumbs">${o.items.map(i => imgTag(i.image_url, i.name_snapshot)).join('')}</div>
    <div style="color:var(--mute)">${o.items.map(i => `${esc(i.name_snapshot)} × ${i.quantity}`).join(', ')}</div>${stepper(o.status)}
    <div class="row"><span style="color:var(--mute)">${esc(o.delivery_address)}${validCoords(o.delivery_lat, o.delivery_lng) ? `<br><a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(o.delivery_lat)}&mlon=${encodeURIComponent(o.delivery_lng)}#map=17/${encodeURIComponent(o.delivery_lat)}/${encodeURIComponent(o.delivery_lng)}" target="_blank" rel="noopener">View delivery pin</a>` : ''}</span><b>${money(o.total)}</b></div>
    ${o.coupon_code ? `<small style="color:var(--green)">${esc(o.coupon_code)} saved ${money(o.discount)}</small>` : ''}
    <div class="acts"><button class="btn ghost sm" data-reorder="${o.id}">Reorder</button>${['pending', 'confirmed'].includes(o.status) ? `<button class="btn plain sm" style="color:var(--red)" data-cancel="${o.id}">Cancel order</button>` : ''}</div></div>`).join('') || '<p class="empty">No orders yet.</p>';
}
$('ordersBtn').onclick = async () => { await loadOrders(); $('orders').scrollIntoView({ behavior: 'smooth' }); };
setInterval(() => { if (API.user() && !document.hidden) loadOrders(); }, 15000);

refreshAuth(); loadMenu().then(loadOrders).catch(e => toast(e.message));
