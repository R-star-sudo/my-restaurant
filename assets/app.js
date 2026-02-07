const STORAGE_KEY = "vibe-restaurant-state";
const API_BASE = window.API_BASE || "/api";

const defaultState = { menu: [], reservations: [], orders: [] };

let state = { ...defaultState };

function uid(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${random.slice(0, 6)}`;
}

const panels = document.querySelectorAll(".panel");
const navButtons = document.querySelectorAll(".nav-btn");
const liveBtn = document.getElementById("live-btn");

const els = {
  statRevenue: document.getElementById("stat-revenue"),
  statOrders: document.getElementById("stat-orders"),
  statReservations: document.getElementById("stat-reservations"),
  statResStatus: document.getElementById("stat-res-status"),
  statAvailable: document.getElementById("stat-available"),
  stat86: document.getElementById("stat-86"),
  resCountPill: document.getElementById("res-count-pill"),
  orderCountPill: document.getElementById("order-count-pill"),
  reservationsList: document.getElementById("reservations-list"),
  ordersList: document.getElementById("orders-list"),
  menuList: document.getElementById("menu-list"),
  menuSearch: document.getElementById("menu-search"),
  resFilter: document.getElementById("reservation-filter"),
  orderFilter: document.getElementById("order-filter"),
  reservationSelect: document.getElementById("order-reservation"),
  orderItems: document.getElementById("order-items"),
};

const templates = {
  menu: document.getElementById("menu-item-template"),
  reservation: document.getElementById("reservation-item-template"),
  order: document.getElementById("order-item-template"),
};

const forms = {
  menu: document.getElementById("menu-form"),
  reservation: document.getElementById("reservation-form"),
  order: document.getElementById("order-form"),
};

const resetButtons = {
  menu: document.getElementById("menu-reset"),
  reservation: document.getElementById("reservation-reset"),
  order: document.getElementById("order-reset"),
};

const addItemBtn = document.getElementById("add-item");

init();

async function init() {
  bindNavigation();
  bindMenuForm();
  bindReservationForm();
  bindOrderForm();
  bindFilters();
  bindLiveButton();
  hydrateOrderItemRows();
  await syncState();
}

async function syncState() {
  try {
    const [menu, reservations, orders] = await Promise.all([
      api("/menu"),
      api("/reservations"),
      api("/orders"),
    ]);
    state = { menu, reservations, orders };
    saveCache();
  } catch (err) {
    console.warn("API unreachable, using cached/default data", err);
    state = loadCachedState() || { ...defaultState };
  }
  if (!els.orderItems.querySelector(".item-row") && state.menu.length) {
    hydrateOrderItemRows(true);
  }
  renderAll();
}

function loadCachedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.warn("State load failed, ignoring cache", e);
    return null;
  }
}

function saveCache() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindLiveButton() {
  if (!liveBtn) return;
  const url = liveBtn.dataset.url || window.LIVE_URL;
  if (url) {
    liveBtn.addEventListener("click", () => window.open(url, "_blank"));
    liveBtn.title = `Open live site: ${url}`;
  } else {
    liveBtn.disabled = true;
    liveBtn.textContent = "Set LIVE_URL";
  }
}

function bindNavigation() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      panels.forEach((p) => p.classList.toggle("visible", p.id === target));
    });
  });
}

function bindMenuForm() {
  forms.menu.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(forms.menu);
    const id = formData.get("id") || uid("m");
    const existingIndex = state.menu.findIndex((m) => m.id === id);
    const entry = {
      id,
      name: formData.get("name").trim(),
      category: formData.get("category").trim(),
      price: Number(formData.get("price")),
      prepTime: Number(formData.get("prepTime") || 10),
      available: formData.get("available") === "true",
    };

    const method = existingIndex >= 0 ? "PUT" : "POST";
    const url = existingIndex >= 0 ? `/menu/${id}` : "/menu";
    api(url, { method, body: JSON.stringify(entry) })
      .then(() => syncState())
      .catch((err) => alert(`Menu save failed: ${err.message}`));
    forms.menu.reset();
  });

  resetButtons.menu.addEventListener("click", () => forms.menu.reset());
}

function bindReservationForm() {
  forms.reservation.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(forms.reservation);
    const id = data.get("id") || uid("r");
    const entry = {
      id,
      name: data.get("name").trim(),
      partySize: Number(data.get("partySize")),
      table: Number(data.get("table")),
      time: new Date(data.get("time")).getTime(),
      status: data.get("status"),
      notes: data.get("notes").trim(),
    };
    const existingIndex = state.reservations.findIndex((r) => r.id === id);
    const method = existingIndex >= 0 ? "PUT" : "POST";
    const url = existingIndex >= 0 ? `/reservations/${id}` : "/reservations";
    api(url, { method, body: JSON.stringify(entry) })
      .then(() => syncState())
      .catch((err) => alert(`Reservation save failed: ${err.message}`));
    forms.reservation.reset();
  });

  resetButtons.reservation.addEventListener("click", () => forms.reservation.reset());
}

function bindOrderForm() {
  forms.order.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(forms.order);
    const id = data.get("id") || uid("o");
    const items = collectOrderItems();
    if (!items.length) {
      alert("Add at least one menu item to the order.");
      return;
    }
    const entry = {
      id,
      table: Number(data.get("table")),
      reservationId: data.get("reservationId") || "",
      status: data.get("status"),
      taxRate: Number(data.get("taxRate") || 0),
      items,
    };
    const existingIndex = state.orders.findIndex((o) => o.id === id);
    const method = existingIndex >= 0 ? "PUT" : "POST";
    const url = existingIndex >= 0 ? `/orders/${id}` : "/orders";
    api(url, { method, body: JSON.stringify(entry) })
      .then(() => syncState())
      .catch((err) => alert(`Order save failed: ${err.message}`));
    forms.order.reset();
    hydrateOrderItemRows(true);
  });

  resetButtons.order.addEventListener("click", () => {
    forms.order.reset();
    hydrateOrderItemRows(true);
  });

  addItemBtn.addEventListener("click", () => addOrderItemRow());
}

function bindFilters() {
  els.menuSearch.addEventListener("input", renderMenu);
  els.resFilter.addEventListener("change", renderReservations);
  els.orderFilter.addEventListener("change", renderOrders);
}

function renderAll() {
  renderDashboard();
  renderMenu();
  renderReservations();
  renderOrders();
  populateReservationSelect();
}

function renderDashboard() {
  const revenueOrders = state.orders.filter((o) => o.status === "paid");
  const revenue = revenueOrders.reduce((sum, o) => sum + orderTotals(o).total, 0);
  els.statRevenue.textContent = currency(revenue);
  els.statOrders.textContent = `${state.orders.length} orders`;

  els.statReservations.textContent = state.reservations.length;
  const seated = state.reservations.filter((r) => r.status === "seated").length;
  els.statResStatus.textContent = seated ? `${seated} seated` : "Waiting to seat";

  const availableCount = state.menu.filter((m) => m.available).length;
  const eightySix = state.menu.length - availableCount;
  els.statAvailable.textContent = `${availableCount} live`;
  els.stat86.textContent = `86’d: ${eightySix}`;
}

function renderMenu() {
  els.menuList.innerHTML = "";
  const q = els.menuSearch.value?.toLowerCase() || "";
  const filtered = state.menu
    .filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
    .sort((a, b) => a.category.localeCompare(b.category));

  filtered.forEach((item) => {
    const li = templates.menu.content.firstElementChild.cloneNode(true);
    li.querySelector(".title").textContent = item.name;
    li.querySelector(".meta").textContent = `${item.category} • ${currency(item.price)} • ${item.prepTime} min`;
    const availability = li.querySelector(".availability");
    availability.textContent = item.available ? "On" : "86’d";
    availability.classList.toggle("pill", true);
    availability.classList.toggle("pill-soft", true);
    if (!item.available) availability.classList.add("danger");

    li.querySelector(".edit").addEventListener("click", () => loadMenuIntoForm(item));
    li.querySelector(".delete").addEventListener("click", () => {
      api(`/menu/${item.id}`, { method: "DELETE" })
        .then(() => syncState())
        .catch((err) => alert(`Delete failed: ${err.message}`));
    });

    els.menuList.appendChild(li);
  });
}

function loadMenuIntoForm(item) {
  forms.menu.name.value = item.name;
  forms.menu.category.value = item.category;
  forms.menu.price.value = item.price;
  forms.menu.prepTime.value = item.prepTime;
  forms.menu.available.value = item.available ? "true" : "false";
  forms.menu.id.value = item.id;
}

function renderReservations() {
  els.reservationsList.innerHTML = "";
  const filter = els.resFilter.value;
  const list = state.reservations
    .filter((r) => (filter === "all" ? true : r.status === filter))
    .sort((a, b) => a.time - b.time);

  els.resCountPill.textContent = list.length;

  list.forEach((res) => {
    const li = templates.reservation.content.firstElementChild.cloneNode(true);
    li.querySelector(".title").textContent = `${res.name} • Table ${res.table} • ${res.partySize} ppl`;
    li.querySelector(".meta").textContent = `${formatDate(res.time)} • ${res.notes || "No notes"}`;
    const status = li.querySelector(".status");
    status.textContent = res.status;
    status.classList.add("status-pill");
    if (res.status === "cancelled") status.classList.add("danger");
    li.querySelector(".edit").addEventListener("click", () => loadReservationIntoForm(res));
    li.querySelector(".delete").addEventListener("click", () => {
      api(`/reservations/${res.id}`, { method: "DELETE" })
        .then(() => syncState())
        .catch((err) => alert(`Cancel failed: ${err.message}`));
    });
    els.reservationsList.appendChild(li);
  });
}

function loadReservationIntoForm(res) {
  forms.reservation.name.value = res.name;
  forms.reservation.partySize.value = res.partySize;
  forms.reservation.table.value = res.table;
  forms.reservation.time.value = new Date(res.time).toISOString().slice(0, 16);
  forms.reservation.status.value = res.status;
  forms.reservation.notes.value = res.notes;
  forms.reservation.id.value = res.id;
}

function renderOrders() {
  els.ordersList.innerHTML = "";
  els.orderCountPill.textContent = state.orders.length;
  const filter = els.orderFilter.value;
  const list = state.orders.filter((o) => (filter === "all" ? true : o.status === filter));

  list.forEach((order) => {
    const li = templates.order.content.firstElementChild.cloneNode(true);
    const totals = orderTotals(order);
    const resLabel = order.reservationId ? ` • Res ${order.reservationId}` : "";
    li.querySelector(".title").textContent = `Table ${order.table}${resLabel} • ${order.items.length} items`;
    li.querySelector(".meta").textContent = `${formatDate(order.createdAt)} • ${currency(totals.total)} (${currency(totals.subtotal)} + tax)`;

    const status = li.querySelector(".status");
    status.textContent = order.status;
    status.classList.add("status-pill");
    if (order.status === "paid") status.classList.add("pill");

    li.querySelector(".edit").addEventListener("click", () => loadOrderIntoForm(order));
    li.querySelector(".delete").addEventListener("click", () => {
      api(`/orders/${order.id}`, { method: "DELETE" })
        .then(() => syncState())
        .catch((err) => alert(`Delete failed: ${err.message}`));
    });

    els.ordersList.appendChild(li);
  });
}

function loadOrderIntoForm(order) {
  forms.order.table.value = order.table;
  forms.order.reservationId.value = order.reservationId;
  forms.order.status.value = order.status;
  forms.order.taxRate.value = order.taxRate;
  forms.order.id.value = order.id;
  hydrateOrderItemRows(true, order.items);
}

function addOrderItemRow(selectedId = "", qty = 1) {
  const row = document.createElement("div");
  row.className = "item-row";

  const select = document.createElement("select");
  populateMenuOptions(select, selectedId);

  const qtyInput = document.createElement("input");
  qtyInput.type = "number";
  qtyInput.min = "1";
  qtyInput.value = qty;

  const pricePreview = document.createElement("div");
  pricePreview.textContent = "—";
  pricePreview.className = "muted";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "ghost-btn small danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => row.remove());

  select.addEventListener("change", () => {
    const menu = state.menu.find((m) => m.id === select.value);
    pricePreview.textContent = menu ? currency(menu.price) : "—";
  });
  select.dispatchEvent(new Event("change"));

  row.append(select, qtyInput, pricePreview, removeBtn);
  els.orderItems.appendChild(row);
}

function populateMenuOptions(selectEl, selectedId = "") {
  selectEl.innerHTML = "";
  if (!state.menu.length) {
    const opt = document.createElement("option");
    opt.textContent = "No dishes available";
    opt.disabled = true;
    opt.selected = true;
    selectEl.appendChild(opt);
    return;
  }
  state.menu.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = `${item.name} (${currency(item.price)})`;
    if (!item.available) {
      opt.textContent += " – 86’d";
    }
    if (item.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function hydrateOrderItemRows(reset = false, items = []) {
  if (reset) els.orderItems.innerHTML = "";
  if (!items.length) {
    if (!state.menu.length) {
      els.orderItems.innerHTML = "<p class='muted'>Add menu items first.</p>";
      return;
    }
    addOrderItemRow(state.menu[0]?.id, 1);
    return;
  }
  items.forEach((item) => addOrderItemRow(item.menuId, item.qty));
}

function populateReservationSelect() {
  els.reservationSelect.innerHTML = `<option value="">Walk-in</option>`;
  state.reservations
    .sort((a, b) => a.time - b.time)
    .forEach((res) => {
      const opt = document.createElement("option");
      opt.value = res.id;
      opt.textContent = `${res.name} • Table ${res.table} • ${formatTime(res.time)}`;
      els.reservationSelect.appendChild(opt);
    });
}

function collectOrderItems() {
  const rows = els.orderItems.querySelectorAll(".item-row");
  const items = [];
  rows.forEach((row) => {
    const menuId = row.querySelector("select").value;
    const qty = Number(row.querySelector('input[type="number"]').value) || 1;
    if (menuId) items.push({ menuId, qty });
  });
  return items;
}

function orderTotals(order) {
  const subtotal = order.items.reduce((sum, item) => {
    const menu = state.menu.find((m) => m.id === item.menuId);
    return sum + (menu ? menu.price * item.qty : 0);
  }, 0);
  const tax = subtotal * (order.taxRate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} • ${formatTime(ts)}`;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}
