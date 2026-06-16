/* ============================================================
   PC SHOP — Lớp chức năng dùng chung (Auth + Cart + Checkout)
   Lưu dữ liệu bằng localStorage (web tĩnh, không cần server).
   Tự động gắn UI vào mọi trang có nạp app.js.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const K_USERS = "pcshop_users";
  const K_SESSION = "pcshop_session";
  const K_CART = "pcshop_cart";
  const K_RETURN = "pcshop_return";
  const K_COUPON = "pcshop_coupon";

  /* Mã giảm giá khả dụng */
  const COUPONS = {
    WELCOME: { type: "percent", value: 15, label: "Giảm 15% cho thành viên mới" },
    GIAM10: { type: "percent", value: 10, label: "Giảm 10% toàn đơn" },
    GIAM20: { type: "percent", value: 20, label: "Giảm 20% toàn đơn" },
    SINHVIEN: { type: "percent", value: 12, label: "Ưu đãi sinh viên -12%" },
    GIAM50K: { type: "fixed", value: 50000, label: "Giảm 50.000đ" },
    FREESHIP: { type: "fixed", value: 30000, label: "Miễn phí ship -30.000đ" },
  };

  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
  const read = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch (e) {
      return d;
    }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const parsePrice = (txt) => {
    if (!txt) return 0;
    const n = String(txt).replace(/[^\d]/g, "");
    return n ? parseInt(n, 10) : 0;
  };
  const fmt = (n) => n.toLocaleString("vi-VN") + "đ";

  /* ============================================================
     AUTH
     ============================================================ */
  const Auth = {
    users: () => read(K_USERS, []),
    current() {
      const email = read(K_SESSION, null);
      if (!email) return null;
      return this.users().find((u) => u.email === email) || null;
    },
    register({ name, email, password }) {
      email = (email || "").trim().toLowerCase();
      const users = this.users();
      if (users.some((u) => u.email === email))
        return { ok: false, msg: "Email này đã được đăng ký." };
      const user = { name: name.trim(), email, password, phone: "", address: "" };
      users.push(user);
      write(K_USERS, users);
      write(K_SESSION, email);
      return { ok: true };
    },
    login({ email, password }) {
      email = (email || "").trim().toLowerCase();
      const user = this.users().find((u) => u.email === email);
      if (!user) return { ok: false, msg: "Tài khoản không tồn tại." };
      if (user.password !== password)
        return { ok: false, msg: "Mật khẩu không đúng." };
      write(K_SESSION, email);
      return { ok: true };
    },
    logout() {
      localStorage.removeItem(K_SESSION);
    },
    save(patch) {
      const cur = this.current();
      if (!cur) return;
      const users = this.users().map((u) =>
        u.email === cur.email ? { ...u, ...patch } : u
      );
      write(K_USERS, users);
    },
  };

  /* ============================================================
     CART
     ============================================================ */
  const Cart = {
    items: () => read(K_CART, []),
    count() {
      return this.items().reduce((s, i) => s + i.qty, 0);
    },
    total() {
      return this.items().reduce((s, i) => s + i.price * i.qty, 0);
    },
    add(item) {
      if (!Auth.current()) {
        guardLogin();
        return false;
      }
      const items = this.items();
      const found = items.find((i) => i.id === item.id);
      if (found) found.qty += 1;
      else items.push({ ...item, qty: 1 });
      write(K_CART, items);
      sync();
      toast(`Đã thêm “${item.name}” vào giỏ`);
      return true;
    },
    setQty(id, qty) {
      let items = this.items();
      items = items
        .map((i) => (i.id === id ? { ...i, qty } : i))
        .filter((i) => i.qty > 0);
      write(K_CART, items);
      sync();
    },
    remove(id) {
      write(K_CART, this.items().filter((i) => i.id !== id));
      sync();
    },
    clear() {
      write(K_CART, []);
      localStorage.removeItem(K_COUPON);
      sync();
    },
    coupon: () => read(K_COUPON, null),
    applyCoupon(code) {
      code = (code || "").trim().toUpperCase();
      if (!code) return { ok: false, msg: "Vui lòng nhập mã giảm giá." };
      if (!COUPONS[code]) return { ok: false, msg: "Mã không hợp lệ hoặc đã hết hạn." };
      if (this.total() === 0) return { ok: false, msg: "Giỏ hàng đang trống." };
      write(K_COUPON, code);
      return { ok: true, msg: COUPONS[code].label };
    },
    removeCoupon() {
      localStorage.removeItem(K_COUPON);
    },
    discount() {
      const code = this.coupon();
      const c = code && COUPONS[code];
      if (!c) return 0;
      const sub = this.total();
      const d = c.type === "percent" ? Math.round((sub * c.value) / 100) : c.value;
      return Math.min(d, sub);
    },
    grandTotal() {
      return Math.max(0, this.total() - this.discount());
    },
  };

  function guardLogin() {
    toast("Vui lòng đăng nhập để tiếp tục mua hàng", "warn");
    write(K_RETURN, location.href);
    setTimeout(() => (location.href = "index.html"), 900);
  }

  /* ============================================================
     UI — Styles (tự nạp, dùng biến màu chung của trang)
     ============================================================ */
  function injectStyles() {
    if ($("#pcshop-style")) return;
    // Đảm bảo Font Awesome 6 có sẵn để icon hiển thị trên mọi trang
    if (!$("#pcshop-fa")) {
      const fa = document.createElement("link");
      fa.id = "pcshop-fa";
      fa.rel = "stylesheet";
      fa.href =
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
      document.head.appendChild(fa);
    }
    const css = `
:root{
  --app-grad: var(--grad, linear-gradient(135deg,#2563eb,#0ea5e9));
  --app-ink: var(--ink, #1e1b2e);
  --app-danger: var(--danger, #e11d48);
}
.pc-badge{position:absolute;top:-8px;right:-10px;min-width:19px;height:19px;padding:0 5px;
  background:var(--app-danger);color:#fff;border-radius:20px;font-size:11px;font-weight:700;
  display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.25);
  transform:scale(0);transition:transform .3s cubic-bezier(.22,1,.36,1);font-family:inherit;}
.pc-badge.show{transform:scale(1);}
.pc-cart-wrap{position:relative;display:inline-flex;cursor:pointer;}
.pc-account{display:inline-flex;align-items:center;gap:8px;color:#fff;font-weight:600;
  font-size:14px;cursor:pointer;position:relative;user-select:none;}
.pc-account .pc-name{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pc-menu{position:absolute;top:130%;right:0;background:#fff;border-radius:14px;min-width:200px;
  box-shadow:0 20px 44px -18px rgba(15, 23, 42,.4);padding:8px;opacity:0;visibility:hidden;
  transform:translateY(8px);transition:.25s cubic-bezier(.22,1,.36,1);z-index:2000;}
.pc-account.open .pc-menu{opacity:1;visibility:visible;transform:translateY(0);}
.pc-menu a,.pc-menu button{display:block;width:100%;text-align:left;background:none;border:none;
  padding:11px 14px;border-radius:9px;color:var(--app-ink);font:inherit;font-weight:600;cursor:pointer;
  transition:background .2s;}
.pc-menu a:hover,.pc-menu button:hover{background:rgba(37, 99, 235,.1);}
.pc-menu .pc-muted{font-weight:400;color:#6b7280;font-size:12px;padding:6px 14px 2px;}

/* Quick add button on product cards */
.pc-add{margin-top:12px;width:100%;padding:11px 14px;border:none;border-radius:11px;
  background:var(--app-grad);color:#fff;font:inherit;font-weight:700;cursor:pointer;
  box-shadow:0 8px 18px -10px rgba(30, 58, 138,.7);transition:transform .25s,filter .25s;}
.pc-add:hover{transform:translateY(-2px);filter:brightness(1.06);}
.pc-add i{margin-right:7px;}

/* Drawer */
.pc-overlay{position:fixed;inset:0;background:rgba(8, 18, 35,.5);backdrop-filter:blur(4px);
  opacity:0;visibility:hidden;transition:.35s;z-index:5000;}
.pc-overlay.open{opacity:1;visibility:visible;}
.pc-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:92vw;background:#f7f7fb;
  box-shadow:-20px 0 50px -20px rgba(15, 23, 42,.5);transform:translateX(100%);
  transition:transform .4s cubic-bezier(.22,1,.36,1);z-index:5001;display:flex;flex-direction:column;
  font-family:inherit;}
.pc-drawer.open{transform:translateX(0);}
.pc-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;
  background:var(--app-grad);color:#fff;}
.pc-drawer-head h3{margin:0;font-size:19px;font-weight:800;}
.pc-drawer-head button{background:rgba(255,255,255,.18);border:none;color:#fff;width:34px;height:34px;
  border-radius:50%;cursor:pointer;font-size:18px;transition:.25s;}
.pc-drawer-head button:hover{background:rgba(255,255,255,.3);transform:rotate(90deg);}
.pc-drawer-body{flex:1;overflow-y:auto;padding:16px;}
.pc-empty{text-align:center;color:#9094a6;padding:60px 20px;}
.pc-empty i{font-size:46px;opacity:.4;display:block;margin-bottom:14px;}
.pc-line{display:flex;gap:12px;background:#fff;border:1px solid #ece9f5;border-radius:14px;
  padding:12px;margin-bottom:12px;align-items:center;animation:pcIn .35s cubic-bezier(.22,1,.36,1);}
@keyframes pcIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.pc-line img{width:58px;height:58px;object-fit:contain;border-radius:9px;background:#eaf2fd;padding:5px;}
.pc-line .pc-li-info{flex:1;min-width:0;}
.pc-line h4{margin:0 0 4px;font-size:14px;font-weight:700;color:var(--app-ink);line-height:1.3;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.pc-line .pc-li-price{color:var(--app-danger);font-weight:800;font-size:14px;}
.pc-qty{display:inline-flex;align-items:center;gap:8px;margin-top:6px;}
.pc-qty button{width:26px;height:26px;border-radius:8px;border:1px solid #e2e0ec;background:#fff;
  cursor:pointer;font-weight:700;color:var(--app-ink);transition:.2s;}
.pc-qty button:hover{background:var(--app-grad);color:#fff;border-color:transparent;}
.pc-qty span{min-width:22px;text-align:center;font-weight:700;}
.pc-li-del{background:none;border:none;color:#c0c0cc;cursor:pointer;font-size:15px;transition:.2s;align-self:flex-start;}
.pc-li-del:hover{color:var(--app-danger);}
.pc-drawer-foot{padding:18px 20px;border-top:1px solid #ece9f5;background:#fff;}
.pc-tot{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;}
.pc-tot span{color:#6b7280;font-weight:600;}
.pc-tot b{font-size:22px;color:var(--app-danger);}
.pc-tot.sub{margin-bottom:6px;}
.pc-tot.sub b,.pc-tot.disc b{font-size:15px;}
.pc-tot.sub b{color:var(--app-ink);}
.pc-tot.disc b{color:var(--success,#0ea371);}
.pc-coupon{display:flex;gap:8px;margin-bottom:8px;}
.pc-coupon input{flex:1;padding:10px 12px;border:1.5px solid #e2e0ec;border-radius:11px;font:inherit;
  outline:none;text-transform:uppercase;transition:.25s;}
.pc-coupon input:focus{border-color:var(--primary,#2563eb);box-shadow:0 0 0 4px rgba(37,99,235,.12);}
.pc-coupon button{padding:0 16px;border:none;border-radius:11px;background:var(--app-ink);color:#fff;
  font:inherit;font-weight:700;cursor:pointer;transition:.25s;white-space:nowrap;}
.pc-coupon button:hover{filter:brightness(1.15);}
.pc-coupon.applied{align-items:center;background:rgba(14,163,113,.1);border:1px dashed #0ea371;
  border-radius:12px;padding:10px 12px;justify-content:space-between;}
.pc-coupon.applied b{color:#0ea371;} .pc-coupon.applied span{color:#6b7280;font-size:12px;}
.pc-coupon.applied button{background:none;color:#9094a6;padding:4px 8px;font-size:15px;}
.pc-coupon.applied button:hover{color:var(--app-danger);filter:none;}
.pc-coupon-hint{font-size:11.5px;color:#9094a6;margin-bottom:12px;}
.pc-btn{width:100%;padding:14px;border:none;border-radius:13px;background:var(--app-grad);color:#fff;
  font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 12px 26px -12px rgba(30, 58, 138,.8);
  transition:transform .25s,filter .25s;}
.pc-btn:hover{transform:translateY(-2px);filter:brightness(1.07);}
.pc-btn.ghost{background:#f1f0f7;color:var(--app-ink);box-shadow:none;margin-top:8px;}
.pc-field{margin-bottom:12px;}
.pc-field label{display:block;font-size:13px;font-weight:600;color:var(--app-ink);margin-bottom:5px;}
.pc-field input,.pc-field textarea{width:100%;padding:11px 13px;border:1.5px solid #e2e0ec;border-radius:11px;
  font:inherit;outline:none;transition:.25s;resize:vertical;}
.pc-field input:focus,.pc-field textarea:focus{border-color:var(--primary,#2563eb);
  box-shadow:0 0 0 4px rgba(37, 99, 235,.12);}

/* Toast */
.pc-toasts{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:9000;
  display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;}
.pc-toast{background:var(--app-ink);color:#fff;padding:13px 20px;border-radius:13px;font-weight:600;
  font-size:14px;box-shadow:0 16px 34px -14px rgba(0,0,0,.5);opacity:0;transform:translateY(20px);
  transition:.35s cubic-bezier(.22,1,.36,1);display:flex;align-items:center;gap:10px;max-width:90vw;}
.pc-toast.show{opacity:1;transform:none;}
.pc-toast.ok i{color:#34d399;} .pc-toast.warn i{color:#fbbf24;}
@media(max-width:480px){.pc-drawer{width:100%;}}
`;
    const st = document.createElement("style");
    st.id = "pcshop-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- Toast ---------- */
  let toastBox;
  function toast(msg, type = "ok") {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "pc-toasts";
      document.body.appendChild(toastBox);
    }
    const t = document.createElement("div");
    t.className = "pc-toast " + type;
    const icon = type === "warn" ? "fa-triangle-exclamation" : "fa-circle-check";
    t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${msg}</span>`;
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, 2400);
  }

  /* ============================================================
     HEADER (account + cart)
     ============================================================ */
  function wireNav() {
    // Thêm link "Trang chủ" nếu chưa có
    const nav = $(".nav");
    if (nav && !nav.querySelector('a[href="home.html"]')) {
      const a = document.createElement("a");
      a.href = "home.html";
      a.className = "nav-link";
      a.textContent = "Trang chủ";
      nav.insertBefore(a, nav.firstChild);
    }
    // Logo dẫn về trang chủ
    const logo = $(".logo");
    if (logo && !logo.querySelector("a")) {
      const img = logo.querySelector("img");
      if (img) {
        const a = document.createElement("a");
        a.href = "home.html";
        img.parentNode.insertBefore(a, img);
        a.appendChild(img);
      }
    }
  }

  function buildHeader() {
    const icons = $(".icons");
    if (!icons) return;

    // Cart icon -> wrap with badge + open drawer
    const cartIcon = $(".fa-shopping-cart", icons) || $('[class*="cart"]', icons);
    if (cartIcon && !cartIcon.closest(".pc-cart-wrap")) {
      const wrap = document.createElement("span");
      wrap.className = "pc-cart-wrap";
      cartIcon.style.fontSize = "22px";
      cartIcon.parentNode.insertBefore(wrap, cartIcon);
      wrap.appendChild(cartIcon);
      const badge = document.createElement("span");
      badge.className = "pc-badge";
      wrap.appendChild(badge);
      wrap.addEventListener("click", openDrawer);
    }

    // Account chip
    const avatar = $(".avatar", icons);
    const acc = document.createElement("div");
    acc.className = "pc-account";
    icons.insertBefore(acc, icons.firstChild);
    if (avatar) acc.appendChild(avatar);
    renderAccount(acc);
  }

  function renderAccount(acc) {
    const user = Auth.current();
    const label = document.createElement("span");
    label.className = "pc-name";
    label.textContent = user ? user.name : "Đăng nhập";
    acc.appendChild(label);

    if (!user) {
      acc.style.cursor = "pointer";
      acc.onclick = () => (location.href = "index.html");
      return;
    }
    const menu = document.createElement("div");
    menu.className = "pc-menu";
    menu.innerHTML = `
      <div class="pc-muted">Xin chào</div>
      <div style="padding:0 14px 8px;font-weight:700">${user.name}</div>
      <div class="pc-muted" style="border-top:1px solid #eee;margin-top:4px">${user.email}</div>
      <button data-act="orders"><i class="fa-solid fa-bag-shopping" style="margin-right:8px"></i>Giỏ hàng của tôi</button>
      <button data-act="logout"><i class="fa-solid fa-right-from-bracket" style="margin-right:8px"></i>Đăng xuất</button>`;
    acc.appendChild(menu);
    acc.onclick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "logout") {
        Auth.logout();
        toast("Đã đăng xuất");
        setTimeout(() => location.reload(), 600);
        return;
      }
      if (act === "orders") {
        openDrawer();
        return;
      }
      acc.classList.toggle("open");
    };
    document.addEventListener("click", (e) => {
      if (!acc.contains(e.target)) acc.classList.remove("open");
    });
  }

  /* ============================================================
     DRAWER (cart + checkout)
     ============================================================ */
  let overlay, drawer;
  function buildDrawer() {
    overlay = document.createElement("div");
    overlay.className = "pc-overlay";
    drawer = document.createElement("div");
    drawer.className = "pc-drawer";
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    overlay.addEventListener("click", closeDrawer);
  }
  function openDrawer() {
    renderCart();
    overlay.classList.add("open");
    drawer.classList.add("open");
  }
  function closeDrawer() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
  }

  function couponRow() {
    const code = Cart.coupon();
    if (code && COUPONS[code]) {
      return `<div class="pc-coupon applied">
        <div><i class="fa-solid fa-ticket"></i> <b>${code}</b> &nbsp;<span>${COUPONS[code].label}</span></div>
        <button data-rmcoupon title="Bỏ mã"><i class="fa-solid fa-xmark"></i></button></div>`;
    }
    return `<div class="pc-coupon">
        <input id="pc-coupon-input" placeholder="Nhập mã giảm giá" autocomplete="off">
        <button data-applycoupon>Áp dụng</button></div>
      <div class="pc-coupon-hint">Mã gợi ý: WELCOME · GIAM10 · GIAM50K · FREESHIP</div>`;
  }

  function cartFoot() {
    const disc = Cart.discount();
    return `<div class="pc-drawer-foot">
      ${couponRow()}
      <div class="pc-tot sub"><span>Tạm tính</span><b>${fmt(Cart.total())}</b></div>
      ${disc ? `<div class="pc-tot disc"><span>Giảm giá</span><b>− ${fmt(disc)}</b></div>` : ""}
      <div class="pc-tot"><span>Tổng cộng</span><b>${fmt(Cart.grandTotal())}</b></div>
      <button class="pc-btn" data-checkout><i class="fa-solid fa-credit-card" style="margin-right:8px"></i>Thanh toán</button>
    </div>`;
  }

  function renderCart() {
    const items = Cart.items();
    let body;
    if (!items.length) {
      body = `<div class="pc-empty"><i class="fa-solid fa-cart-shopping"></i>
        Giỏ hàng đang trống.<br>Hãy thêm sản phẩm bạn thích!</div>`;
    } else {
      body = items
        .map(
          (i) => `<div class="pc-line">
        <img src="${i.img || ""}" alt="">
        <div class="pc-li-info">
          <h4>${i.name}</h4>
          <div class="pc-li-price">${fmt(i.price)}</div>
          <div class="pc-qty">
            <button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">+</button>
          </div>
        </div>
        <button class="pc-li-del" data-del="${i.id}"><i class="fa-solid fa-trash"></i></button>
      </div>`
        )
        .join("");
    }
    drawer.innerHTML = `
      <div class="pc-drawer-head"><h3><i class="fa-solid fa-cart-shopping" style="margin-right:8px"></i>Giỏ hàng</h3>
        <button data-close>&times;</button></div>
      <div class="pc-drawer-body">${body}</div>
      ${items.length ? cartFoot() : ""}`;
    wireDrawer();
  }

  function wireDrawer() {
    $("[data-close]", drawer)?.addEventListener("click", closeDrawer);
    $$("[data-inc]", drawer).forEach((b) =>
      b.addEventListener("click", () => {
        const it = Cart.items().find((i) => i.id === b.dataset.inc);
        Cart.setQty(b.dataset.inc, it.qty + 1);
        renderCart();
      })
    );
    $$("[data-dec]", drawer).forEach((b) =>
      b.addEventListener("click", () => {
        const it = Cart.items().find((i) => i.id === b.dataset.dec);
        Cart.setQty(b.dataset.dec, it.qty - 1);
        renderCart();
      })
    );
    $$("[data-del]", drawer).forEach((b) =>
      b.addEventListener("click", () => {
        Cart.remove(b.dataset.del);
        renderCart();
      })
    );
    $("[data-checkout]", drawer)?.addEventListener("click", renderCheckout);
    const applyBtn = $("[data-applycoupon]", drawer);
    if (applyBtn) {
      const apply = () => {
        const r = Cart.applyCoupon($("#pc-coupon-input", drawer).value);
        toast(r.msg, r.ok ? "ok" : "warn");
        if (r.ok) renderCart();
      };
      applyBtn.addEventListener("click", apply);
      $("#pc-coupon-input", drawer).addEventListener("keydown", (e) => {
        if (e.key === "Enter") apply();
      });
    }
    $("[data-rmcoupon]", drawer)?.addEventListener("click", () => {
      Cart.removeCoupon();
      renderCart();
    });
  }

  function renderCheckout() {
    const user = Auth.current();
    if (!user) return guardLogin();
    drawer.innerHTML = `
      <div class="pc-drawer-head"><h3><i class="fa-solid fa-truck-fast" style="margin-right:8px"></i>Thanh toán</h3>
        <button data-close>&times;</button></div>
      <div class="pc-drawer-body">
        <div class="pc-field"><label>Họ và tên</label><input id="ck-name" value="${user.name || ""}"></div>
        <div class="pc-field"><label>Email</label><input id="ck-email" value="${user.email}" disabled></div>
        <div class="pc-field"><label>Số điện thoại</label><input id="ck-phone" placeholder="0xxx xxx xxx" value="${user.phone || ""}"></div>
        <div class="pc-field"><label>Địa chỉ nhận hàng</label><textarea id="ck-addr" rows="3" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành">${user.address || ""}</textarea></div>
      </div>
      <div class="pc-drawer-foot">
        <div class="pc-tot sub"><span>Tạm tính</span><b>${fmt(Cart.total())}</b></div>
        ${Cart.discount() ? `<div class="pc-tot disc"><span>Giảm giá${Cart.coupon() ? " (" + Cart.coupon() + ")" : ""}</span><b>− ${fmt(Cart.discount())}</b></div>` : ""}
        <div class="pc-tot"><span>Thanh toán</span><b>${fmt(Cart.grandTotal())}</b></div>
        <button class="pc-btn" data-place><i class="fa-solid fa-check" style="margin-right:8px"></i>Đặt hàng</button>
        <button class="pc-btn ghost" data-back>Quay lại giỏ hàng</button>
      </div>`;
    $("[data-close]", drawer).addEventListener("click", closeDrawer);
    $("[data-back]", drawer).addEventListener("click", renderCart);
    $("[data-place]", drawer).addEventListener("click", () => {
      const name = $("#ck-name", drawer).value.trim();
      const phone = $("#ck-phone", drawer).value.trim();
      const addr = $("#ck-addr", drawer).value.trim();
      if (!name || !phone || !addr) {
        toast("Vui lòng điền đầy đủ thông tin nhận hàng", "warn");
        return;
      }
      if (!/^\d{9,11}$/.test(phone.replace(/\s/g, ""))) {
        toast("Số điện thoại không hợp lệ", "warn");
        return;
      }
      Auth.save({ name, phone, address: addr });
      const total = Cart.grandTotal();
      Cart.clear();
      drawer.innerHTML = `
        <div class="pc-drawer-head"><h3>Đặt hàng thành công</h3><button data-close>&times;</button></div>
        <div class="pc-drawer-body" style="text-align:center;padding-top:50px">
          <i class="fa-solid fa-circle-check" style="font-size:70px;color:#34d399"></i>
          <h2 style="margin:18px 0 8px;color:var(--ink,#1e1b2e)">Cảm ơn ${name}!</h2>
          <p style="color:#6b7280">Đơn hàng <b>${fmt(total)}</b> đã được ghi nhận.<br>
          Chúng tôi sẽ giao tới:<br><b>${addr}</b></p>
          <button class="pc-btn" data-close style="margin-top:24px;max-width:200px;display:inline-block">Tiếp tục mua sắm</button>
        </div>`;
      $$("[data-close]", drawer).forEach((b) =>
        b.addEventListener("click", closeDrawer)
      );
      toast("Đặt hàng thành công!");
    });
  }

  /* ============================================================
     SYNC (badge)
     ============================================================ */
  function sync() {
    const badge = $(".pc-badge");
    if (!badge) return;
    const c = Cart.count();
    badge.textContent = c;
    badge.classList.toggle("show", c > 0);
  }

  /* ============================================================
     PRODUCT WIRING — gắn nút "Thêm vào giỏ"
     ============================================================ */
  function makeId(name, price) {
    return (name + "-" + price).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  }

  function wireProducts() {
    // Lưới sản phẩm (gear / laptop)
    $$(".product-card").forEach((card) => {
      const info = $(".product-info", card);
      if (!info || $(".pc-add", info)) return;
      const name = $("h4", info)?.textContent.trim();
      const price = parsePrice($(".price", info)?.textContent);
      const img = $("img", card)?.src;
      if (!name || !price) return;
      const btn = document.createElement("button");
      btn.className = "pc-add";
      btn.innerHTML = `<i class="fa-solid fa-cart-plus"></i>Thêm vào giỏ`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        Cart.add({ id: makeId(name, price), name, price, img });
      });
      info.appendChild(btn);
    });

    // Modal chi tiết (gear)
    $$(".modal .modal-details").forEach((d) => {
      if ($(".pc-add", d)) return;
      const modal = d.closest(".modal");
      const name = $("h4", d)?.textContent.trim();
      const price = parsePrice($(".price", d)?.textContent);
      const img = $("img", modal)?.src;
      if (!name || !price) return;
      const btn = document.createElement("button");
      btn.className = "pc-add";
      btn.innerHTML = `<i class="fa-solid fa-cart-plus"></i>Thêm vào giỏ hàng`;
      btn.addEventListener("click", () =>
        Cart.add({ id: makeId(name, price), name, price, img })
      );
      d.appendChild(btn);
    });

    // Trang Build PC — thêm cả cấu hình vào giỏ
    const cost = $(".cost");
    if (cost && !$("#pc-build-add")) {
      const btn = document.createElement("button");
      btn.id = "pc-build-add";
      btn.className = "pc-btn";
      btn.style.cssText = "max-width:340px;margin:14px auto 30px;display:block";
      btn.innerHTML = `<i class="fa-solid fa-cart-plus" style="margin-right:8px"></i>Thêm cấu hình này vào giỏ`;
      btn.addEventListener("click", () => {
        const price = parsePrice(cost.textContent);
        if (!price) {
          toast("Bạn chưa chọn linh kiện nào", "warn");
          return;
        }
        Cart.add({
          id: "build-" + Date.now(),
          name: "Cấu hình PC tự build",
          price,
          img: "https://cdn-icons-png.flaticon.com/512/8002/8002224.png",
        });
      });
      cost.parentNode.insertBefore(btn, cost.nextSibling);
    }
  }

  /* ============================================================
     AUTH PAGE (index.html) wiring
     ============================================================ */
  function wireAuthPage() {
    const signIn = $(".sign-in form");
    const signUp = $(".sign-up form");
    if (!signIn && !signUp) return false;

    const showErr = (form, msg) => {
      let e = $(".pc-form-err", form);
      if (!e) {
        e = document.createElement("p");
        e.className = "error-message pc-form-err";
        form.appendChild(e);
      }
      e.textContent = msg;
    };

    if (signUp) {
      signUp.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = $('input[type="text"]', signUp).value.trim();
        const email = $('input[type="email"]', signUp).value.trim();
        const pass = $('input[type="password"]', signUp).value;
        if (name.length < 2) return showErr(signUp, "Vui lòng nhập tên (≥ 2 ký tự).");
        if (!/^\S+@\S+\.\S+$/.test(email)) return showErr(signUp, "Email không hợp lệ.");
        if (pass.length < 4) return showErr(signUp, "Mật khẩu cần ít nhất 4 ký tự.");
        const r = Auth.register({ name, email, password: pass });
        if (!r.ok) return showErr(signUp, r.msg);
        afterAuth();
      });
    }
    if (signIn) {
      signIn.removeAttribute("action");
      signIn.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const email = $('input[type="email"]', signIn).value.trim();
        const pass = $('input[type="password"]', signIn).value;
        const r = Auth.login({ email, password: pass });
        if (!r.ok) return showErr(signIn, r.msg);
        afterAuth();
      });
    }
    return true;
  }

  function afterAuth() {
    const ret = read(K_RETURN, null);
    localStorage.removeItem(K_RETURN);
    location.href = ret || "home.html";
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    injectStyles();
    if (wireAuthPage()) return; // trang đăng nhập: chỉ cần auth
    wireNav();
    buildHeader();
    buildDrawer();
    wireProducts();
    sync();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PCShop = { Auth, Cart, openDrawer };
})();
