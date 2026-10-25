// All money maths lives here so the cart preview and the real order always match.
const COUPONS = {
  WELCOME50: { min: 199, calc: s => Math.min(100, Math.round(s * 0.5)) },
  FLAT75: { min: 399, calc: () => 75 },
  FREEDEL: { min: 249, calc: () => 0, freeDelivery: true },
};
const r2 = n => Math.round(n * 100) / 100;

exports.breakdown = (subtotal, code) => {
  let discount = 0, freeDel = false, applied = null, couponError = null;
  const key = String(code || '').trim().toUpperCase();
  if (key) {
    const c = COUPONS[key];
    if (!c) couponError = 'Invalid coupon code.';
    else if (subtotal < c.min) couponError = `Add items worth ₹${c.min} to use ${key}.`;
    else { applied = key; discount = Math.min(subtotal, c.calc(subtotal)); freeDel = !!c.freeDelivery; }
  }
  const delivery_fee = subtotal === 0 || subtotal >= 500 || freeDel ? 0 : 40;
  const tax = r2((subtotal - discount) * 0.05);
  return { subtotal: r2(subtotal), discount: r2(discount), delivery_fee, tax, total: r2(subtotal - discount + delivery_fee + tax), coupon: applied, couponError };
};
