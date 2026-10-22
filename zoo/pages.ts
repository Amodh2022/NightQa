export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly blurb: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: 'tshirt', name: 'Blue T-shirt', price: 49, blurb: 'Soft cotton tee in sky blue.' },
  { id: 'hoodie', name: 'Black Hoodie', price: 89, blurb: 'Heavy fleece hoodie.' },
  { id: 'cap', name: 'Canvas Cap', price: 19, blurb: 'Adjustable cap, one size.' },
];

const STYLE = `body{font-family:system-ui,sans-serif;margin:0;color:#111}header,footer{padding:12px 24px;background:#f3f4f6;display:flex;gap:16px;align-items:center}
main{padding:24px;max-width:760px}button{padding:8px 14px;font-size:15px}input,select{padding:6px;font-size:15px}label{display:block;margin:8px 0 2px}
.row{display:flex;gap:12px;align-items:center;margin:8px 0}.err{color:#b00020}.ok{color:#0a7a2f}footer{margin-top:40px}`;

/** Wraps page content in the shop layout: header navigation, footer links and shared client helpers. */
export function layout(opts: {
  title: string;
  body: string;
  script?: string;
  bugs: ReadonlySet<string>;
}): string {
  const returnsHref = '/returns';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${opts.title} - ZooShop</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style></head><body>
<header><a href="/products"><strong>ZooShop</strong></a><a href="/products">Products</a><a href="/cart" id="cart-link">Cart (0)</a><a href="/orders">Orders</a><a href="/login">Sign in</a>
<form action="/search" method="get" role="search" class="row"><label for="q" style="margin:0">Search</label><input id="q" name="q" type="search"><button type="submit">Go</button></form></header>
<main>${opts.body}</main>
<footer><a href="${returnsHref}">Returns policy</a><a href="/products">All products</a></footer>
<script>
window.BUGS=${JSON.stringify([...opts.bugs])};
window.cart={get(){try{return JSON.parse(localStorage.getItem('zoo-cart')||'[]')}catch{return []}},set(v){localStorage.setItem('zoo-cart',JSON.stringify(v));window.cart.badge()},
count(){return window.cart.get().reduce((n,i)=>n+i.qty,0)},badge(){const a=document.getElementById('cart-link');if(a)a.textContent='Cart ('+window.cart.count()+')'}};
window.money=n=>'$'+n.toFixed(2);window.cart.badge();
${opts.script ?? ''}
</script></body></html>`;
}

export function productListPage(bugs: ReadonlySet<string>): string {
  const items = PRODUCTS.map(
    (p) =>
      `<li><a href="/product/${p.id}">${p.name}</a> - $${p.price.toFixed(2)}<div>${p.blurb}</div></li>`,
  ).join('');
  return layout({ title: 'Products', body: `<h1>Products</h1><ul>${items}</ul>`, bugs });
}

export function productPage(p: Product, bugs: ReadonlySet<string>): string {
  const body = `<h1>${p.name}</h1><p>${p.blurb}</p><p>Price: $${p.price.toFixed(2)}</p>
<label for="size">Size</label><select id="size"><option>S</option><option>M</option><option>L</option></select>
<div class="row"><button id="add">Add to cart</button><button id="wish">Add to wishlist</button></div>
<p id="status" role="status"></p><h2>Reviews</h2><div id="reviews" aria-busy="true">Loading reviews...</div>`;
  const script = `
const P=${JSON.stringify(p)};const st=document.getElementById('status');
document.getElementById('add').onclick=()=>{const size=window.BUGS.includes('B08')?'L':document.getElementById('size').value;
const c=window.cart.get();const f=c.find(i=>i.id===P.id&&i.size===size);if(f)f.qty++;else c.push({id:P.id,name:P.name,size,price:P.price,qty:1});
window.cart.set(c);st.textContent='Added '+P.name+' to the cart';};
document.getElementById('wish').onclick=()=>{if(window.BUGS.includes('B03')){const w=undefined;w.push(P.id);}
localStorage.setItem('zoo-wish',P.id);st.textContent='Saved to wishlist';};
fetch('/api/reviews/'+P.id).then(r=>r.json()).then(rs=>{const el=document.getElementById('reviews');el.removeAttribute('aria-busy');
el.innerHTML=rs.map(r=>'<p><strong>'+r.who+'</strong>: '+r.text+'</p>').join('')});`;
  return layout({ title: p.name, body, script, bugs });
}

export function cartPage(bugs: ReadonlySet<string>): string {
  const body = `<h1>Your cart</h1><p id="summary">Cart is empty</p><div id="items"></div>
<label for="coupon">Coupon code</label><div class="row"><input id="coupon"><button id="apply">Apply coupon</button></div>
<p id="coupon-msg" role="status"></p><p id="total"><strong>Total: $0.00</strong></p><a href="/checkout" id="checkout">Checkout</a>`;
  const script = `
let pct=Number(sessionStorage.getItem('zoo-pct')||0);
function render(){const c=window.cart.get();const n=window.cart.count();
document.getElementById('summary').textContent=n===0?'Cart is empty':'Cart shows '+n+' item'+(n===1?'':'s');
document.getElementById('items').innerHTML=c.map((i,k)=>'<div class="row"><span>'+i.name+' (size '+i.size+') - '+window.money(i.price)+'</span>'+
'<label for="q'+k+'" style="margin:0">Quantity for '+i.name+'</label><input id="q'+k+'" type="number" min="1" value="'+i.qty+'" style="width:60px">'+
'<button data-rm="'+k+'">Remove '+i.name+'</button></div>').join('');
const sub=window.BUGS.includes('B02')?c.reduce((s,i)=>s+i.price,0):c.reduce((s,i)=>s+i.price*i.qty,0);
const total=sub*(1-pct/100);sessionStorage.setItem('zoo-total',String(total));
document.getElementById('total').innerHTML='<strong>Total: '+window.money(total)+'</strong>';
c.forEach((i,k)=>{document.getElementById('q'+k).onchange=e=>{const v=window.cart.get();v[k].qty=Math.max(1,Number(e.target.value)||1);window.cart.set(v);render();}});
document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const v=window.cart.get();v.splice(Number(b.dataset.rm),1);window.cart.set(v);render();});}
document.getElementById('apply').onclick=async()=>{const code=document.getElementById('coupon').value.trim();
const r=await(await fetch('/api/coupon?code='+encodeURIComponent(code))).json();const m=document.getElementById('coupon-msg');
if(r.ok){pct=r.percent;sessionStorage.setItem('zoo-pct',String(pct));m.className='ok';m.textContent='Coupon applied: '+pct+'% off';}
else{m.className='err';m.textContent=r.message;}render();};
render();`;
  return layout({ title: 'Cart', body, script, bugs });
}

export function checkoutPage(bugs: ReadonlySet<string>): string {
  const body = `<h1>Checkout</h1><p id="due"></p>
<label for="card">Card number</label><input id="card" autocomplete="off"><label for="exp">Expiry (MM/YY)</label><input id="exp">
<label for="cvc">CVC</label><input id="cvc"><div class="row"><button id="pay" disabled>Pay now</button></div><p id="msg" role="alert"></p>`;
  const script = `
document.getElementById('due').textContent='Amount due: '+window.money(Number(sessionStorage.getItem('zoo-total')||0));
const f=['card','exp','cvc'].map(id=>document.getElementById(id));const pay=document.getElementById('pay');
function valid(){const raw=f[0].value;const digits=window.BUGS.includes('B09')?raw:raw.replace(/\\s+/g,'');
return /^\\d{16}$/.test(digits)&&/^\\d{2}\\/\\d{2}$/.test(f[1].value)&&/^\\d{3}$/.test(f[2].value);}
f.forEach(i=>i.oninput=()=>{pay.disabled=!valid();});
pay.onclick=async()=>{const r=await fetch('/api/pay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({card:f[0].value.replace(/\\s+/g,''),total:Number(sessionStorage.getItem('zoo-total')||0)})});
const j=await r.json();const m=document.getElementById('msg');if(!j.ok){m.className='err';m.textContent=j.message;return;}
sessionStorage.setItem('zoo-order',JSON.stringify(j));const o=JSON.parse(localStorage.getItem('zoo-orders')||'[]');o.push({id:j.orderId,total:j.total});
localStorage.setItem('zoo-orders',JSON.stringify(o));window.cart.set([]);sessionStorage.removeItem('zoo-pct');location.href='/confirmation';};`;
  return layout({ title: 'Checkout', body, script, bugs });
}

export function confirmationPage(bugs: ReadonlySet<string>): string {
  const body = `<h1>Thank you!</h1><p id="order">Loading order...</p>`;
  const script = `
const o=JSON.parse(sessionStorage.getItem('zoo-order')||'{}');
const id=window.BUGS.includes('B10')?o.orderNumber:o.orderId;
document.getElementById('order').textContent='Your order number is '+id;`;
  return layout({ title: 'Confirmation', body, script, bugs });
}

export function ordersPage(bugs: ReadonlySet<string>): string {
  if (bugs.has('B06'))
    return '<!doctype html><html><head><title>Orders</title></head><body></body></html>';
  const body = `<h1>Order history</h1><div id="list">Loading...</div>`;
  const script = `
const o=JSON.parse(localStorage.getItem('zoo-orders')||'[]');
document.getElementById('list').innerHTML=o.length?'<ul>'+o.map(x=>'<li>'+x.id+' - '+window.money(x.total)+'</li>').join('')+'</ul>':'No orders yet.';`;
  return layout({ title: 'Orders', body, script, bugs });
}

export function searchPage(bugs: ReadonlySet<string>): string {
  const body = `<h1>Search results</h1><p id="state" role="status">Searching...</p><ul id="results"></ul>`;
  const script = `
const q=new URLSearchParams(location.search).get('q')||'';
fetch('/api/search?q='+encodeURIComponent(q)).then(async r=>{const s=document.getElementById('state');
if(!r.ok){s.className='err';s.textContent='Something went wrong';return;}
const rs=await r.json();s.textContent=rs.length+' result'+(rs.length===1?'':'s')+' for "'+q+'"';
document.getElementById('results').innerHTML=rs.map(p=>'<li><a href="/product/'+p.id+'">'+p.name+'</a></li>').join('');});`;
  return layout({ title: 'Search', body, script, bugs });
}

export function loginPage(bugs: ReadonlySet<string>): string {
  const body = `<h1>Sign in</h1><label for="email">Email</label><input id="email" type="email"><label for="password">Password</label><input id="password" type="password">
<div class="row"><button id="signin">Sign in</button></div><p id="msg" role="alert"></p>`;
  const script = `
document.getElementById('signin').onclick=async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});const j=await r.json();
const m=document.getElementById('msg');if(j.ok){m.className='ok';m.textContent='Signed in as '+j.name;}else{m.className='err';m.textContent=j.message;}};`;
  return layout({ title: 'Sign in', body, script, bugs });
}

export function simplePage(title: string, text: string, bugs: ReadonlySet<string>): string {
  return layout({ title, body: `<h1>${title}</h1><p>${text}</p>`, bugs });
}
