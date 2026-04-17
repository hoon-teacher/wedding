// Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjpXgNZuiaq4DDUy5VPpPoc7VIm1QT_60",
  authDomain: "imyoo-studio.firebaseapp.com",
  projectId: "imyoo-studio",
  storageBucket: "imyoo-studio.firebasestorage.app",
  messagingSenderId: "281378286031",
  appId: "1:281378286341:web:f00e2ab0b8be1e19c70aba"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ===== 전역 상태 =====
let currentUser = null;
let currentUserRole = "staff";
let currentDate = new Date();
let weddings = [];
let allUsers = [];
let currentFilter = "upcoming";
let editingWeddingId = null;
let editingChecklist = [];
let editingNameUid = null; // 이름 편집 중인 사용자 UID

// ===== DOM =====
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const modal = document.getElementById("wedding-modal");
const nameModal = document.getElementById("name-modal");

// ===== 로그인/로그아웃 =====
document.getElementById("google-login-btn").addEventListener("click", async () => {
  try {
    document.getElementById("login-error").textContent = "";
    await signInWithPopup(auth, provider);
  } catch (err) {
    document.getElementById("login-error").textContent = "Login failed: " + err.message;
  }
});
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await ensureUserDoc(user);
    await loadUserRole(user.uid);
    showApp();
    initCalendar();
    subscribeWeddings();
    subscribeUsers();
  } else {
    currentUser = null;
    currentUserRole = "staff";
    showLogin();
  }
});

async function ensureUserDoc(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      name: user.displayName || "이름없음",
      photoURL: user.photoURL || "",
      role: "staff",
      createdAt: new Date().toISOString()
    });
  }
}

async function loadUserRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) currentUserRole = snap.data().role || "staff";
}

// ===== 화면 전환 =====
function showLogin() {
  loginScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}
function showApp() {
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  // 헤더 이름 표시: Firestore에서 가져온 name 우선
  const me = allUsers.find(u => u.uid === currentUser.uid);
  document.getElementById("user-name").textContent = me?.name || currentUser.displayName || currentUser.email;
  const roleEl = document.getElementById("user-role");
  roleEl.textContent = currentUserRole === "admin" ? "Admin" : "Staff";
  roleEl.classList.toggle("staff", currentUserRole === "staff");
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", currentUserRole !== "admin");
  });
}

// ===== 탭 전환 =====
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    document.getElementById(`${tab}-tab`).classList.remove("hidden");
    if (tab === "admin") renderStaffList();
  });
});

// ===== 달력 =====
function initCalendar() {
  document.getElementById("prev-month").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById("add-wedding-btn").addEventListener("click", () => {
    openWeddingModal(null);
  });
  renderCalendar();
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];
  document.getElementById("current-month").textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((d) => {
    const h = document.createElement("div");
    h.className = "calendar-day-header";
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();

  for (let i = 0; i < firstDay.getDay(); i++) {
    const e = document.createElement("div");
    e.className = "calendar-day empty";
    grid.appendChild(e);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    const dow = new Date(year, month, day).getDay();
    if (dow === 0) cell.classList.add("sunday");

    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    if (isToday) cell.classList.add("today");

    const dn = document.createElement("div");
    dn.className = "day-number";
    dn.textContent = day;
    cell.appendChild(dn);

    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    weddings.filter(w => w.date === dateStr).forEach(w => {
      const dot = document.createElement("div");
      dot.className = "wedding-dot";
      if (w.assignedStaff?.includes(currentUser.uid)) dot.classList.add("mine");
      dot.textContent = `${w.time||""} ${w.venue||"(venue)"}`.trim();
      dot.title = w.couple || w.venue || "";
      dot.addEventListener("click", e => { e.stopPropagation(); openWeddingModal(w.id); });
      cell.appendChild(dot);
    });

    cell.addEventListener("click", () => {
      if (currentUserRole === "admin") openWeddingModal(null, dateStr);
    });
    grid.appendChild(cell);
  }
}

// ===== Firestore 구독 =====
function subscribeWeddings() {
  const q = query(collection(db, "weddings"), orderBy("date", "asc"));
  onSnapshot(q, snap => {
    weddings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    renderList();
  });
}

function subscribeUsers() {
  onSnapshot(collection(db, "users"), snap => {
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // 헤더 이름 최신화
    if (currentUser) {
      const me = allUsers.find(u => u.uid === currentUser.uid);
      if (me) document.getElementById("user-name").textContent = me.name;
    }
    if (!document.getElementById("admin-tab").classList.contains("hidden")) {
      renderStaffList();
    }
  });
}

// ===== 목록 =====
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

function renderList() {
  const listEl = document.getElementById("wedding-list");
  let list = [...weddings];
  const todayStr = new Date().toISOString().split("T")[0];

  if (currentFilter === "mine") list = list.filter(w => w.assignedStaff?.includes(currentUser.uid));
  else if (currentFilter === "upcoming") list = list.filter(w => w.date >= todayStr);

  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">No events to display.</p>';
    return;
  }

  listEl.innerHTML = list.map(w => {
    const staffNames = (w.assignedStaff||[])
      .map(uid => allUsers.find(u => u.uid === uid)?.name || "")
      .filter(Boolean).join(", ");
    const priceStr = w.price ? `₩${Number(w.price).toLocaleString()}` : "";
    const paidChip = w.paid
      ? '<span class="status-chip paid">Paid</span>'
      : '<span class="status-chip pending">Unpaid</span>';
    const settledChip = w.settled ? '<span class="status-chip settled">Settled</span>' : '';
    return `
      <div class="wedding-card" data-id="${w.id}">
        <div class="wedding-card-top">
          <div class="wedding-card-date">${formatDate(w.date)}<span class="time">${w.time||""}</span></div>
          <div>${paidChip}${settledChip}</div>
        </div>
        <div class="wedding-card-venue">${w.venue||"(장소 미정)"} ${w.couple?"· "+w.couple:""}</div>
        <div class="wedding-card-meta">
          ${w.concept ? w.concept+" · " : ""}
          ${staffNames || "담당자 미배정"}
          ${priceStr ? " · "+priceStr : ""}
        </div>
      </div>`;
  }).join("");

  listEl.querySelectorAll(".wedding-card").forEach(card => {
    card.addEventListener("click", () => openWeddingModal(card.dataset.id));
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}. ${m}. ${d}`;
}

// ===== 예식 모달 =====
function openWeddingModal(weddingId, defaultDate = null) {
  editingWeddingId = weddingId;
  editingChecklist = [];
  const titleEl = document.getElementById("modal-title");
  const deleteBtn = document.getElementById("delete-wedding-btn");

  renderStaffCheckboxes();

  if (weddingId) {
    const w = weddings.find(x => x.id === weddingId);
    if (!w) return;
    titleEl.textContent = currentUserRole === "admin" ? "Edit Event" : "Event Details";
    document.getElementById("w-date").value = w.date || "";
    document.getElementById("w-time").value = w.time || "";
    document.getElementById("w-couple").value = w.couple || "";
    document.getElementById("w-venue").value = w.venue || "";
    document.getElementById("w-concept").value = w.concept || "";
    document.getElementById("w-decoration").value = w.decoration || "";
    document.getElementById("w-price").value = w.price || "";
    document.getElementById("w-paid").checked = !!w.paid;
    document.getElementById("w-settled").checked = !!w.settled;
    document.getElementById("w-memo").value = w.memo || "";
    document.querySelectorAll(".staff-checkbox").forEach(cb => {
      cb.checked = (w.assignedStaff||[]).includes(cb.value);
    });
    editingChecklist = [...(w.checklist||[])];
    deleteBtn.classList.toggle("hidden", currentUserRole !== "admin");
  } else {
    titleEl.textContent = "New Event";
    document.getElementById("w-date").value = defaultDate || "";
    document.getElementById("w-time").value = "";
    document.getElementById("w-couple").value = "";
    document.getElementById("w-venue").value = "";
    document.getElementById("w-concept").value = "";
    document.getElementById("w-decoration").value = "";
    document.getElementById("w-price").value = "";
    document.getElementById("w-paid").checked = false;
    document.getElementById("w-settled").checked = false;
    document.getElementById("w-memo").value = "";
    document.querySelectorAll(".staff-checkbox").forEach(cb => cb.checked = false);
    editingChecklist = [];
    deleteBtn.classList.add("hidden");
  }
  renderChecklist();

  const isReadOnly = currentUserRole !== "admin";
  document.getElementById("save-wedding-btn").classList.toggle("hidden", isReadOnly);
  document.querySelectorAll("#wedding-modal input, #wedding-modal textarea").forEach(el => {
    if (el.id === "new-checklist-item") { el.disabled = false; return; }
    el.disabled = isReadOnly;
  });
  document.getElementById("add-checklist-btn").style.display = isReadOnly ? "none" : "";

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  editingWeddingId = null;
  editingChecklist = [];
}

document.getElementById("modal-close-btn").addEventListener("click", closeModal);
document.getElementById("cancel-btn").addEventListener("click", closeModal);
document.querySelector(".modal-backdrop").addEventListener("click", closeModal);

function renderStaffCheckboxes() {
  const container = document.getElementById("w-staff-checkboxes");
  if (allUsers.length === 0) {
    container.innerHTML = '<span style="color:#a0a0a0;font-size:0.85rem;">No team members</span>';
    return;
  }
  container.innerHTML = allUsers.map(u => `
    <label>
      <input type="checkbox" class="staff-checkbox" value="${u.uid}" />
      ${u.name}
    </label>
  `).join("");
}

function renderChecklist() {
  const container = document.getElementById("checklist-container");
  if (editingChecklist.length === 0) {
    container.innerHTML = '<p style="color:#a0a0a0;font-size:0.85rem;padding:0.3rem 0;font-style:italic;">No items yet.</p>';
    return;
  }
  container.innerHTML = editingChecklist.map((item, idx) => `
    <div class="checklist-item ${item.done ? "checked" : ""}">
      <input type="checkbox" data-idx="${idx}" class="checklist-toggle" ${item.done?"checked":""} />
      <span class="checklist-text">${item.text}</span>
      ${currentUserRole === "admin" ? `<button class="checklist-delete" data-idx="${idx}" type="button">×</button>` : ""}
    </div>
  `).join("");

  container.querySelectorAll(".checklist-toggle").forEach(cb => {
    cb.addEventListener("change", e => {
      editingChecklist[Number(e.target.dataset.idx)].done = e.target.checked;
      renderChecklist();
    });
  });
  container.querySelectorAll(".checklist-delete").forEach(btn => {
    btn.addEventListener("click", e => {
      editingChecklist.splice(Number(e.target.dataset.idx), 1);
      renderChecklist();
    });
  });
}

document.getElementById("add-checklist-btn").addEventListener("click", addChecklistItem);
document.getElementById("new-checklist-item").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); }
});
function addChecklistItem() {
  const input = document.getElementById("new-checklist-item");
  const text = input.value.trim();
  if (!text) return;
  editingChecklist.push({ text, done: false });
  input.value = "";
  renderChecklist();
}

document.getElementById("save-wedding-btn").addEventListener("click", async () => {
  const date = document.getElementById("w-date").value;
  const venue = document.getElementById("w-venue").value.trim();
  if (!date || !venue) { alert("Date and venue are required."); return; }

  const assignedStaff = Array.from(document.querySelectorAll(".staff-checkbox:checked")).map(cb => cb.value);
  const data = {
    date, time: document.getElementById("w-time").value,
    couple: document.getElementById("w-couple").value.trim(),
    venue, concept: document.getElementById("w-concept").value.trim(),
    decoration: document.getElementById("w-decoration").value.trim(),
    price: Number(document.getElementById("w-price").value) || 0,
    paid: document.getElementById("w-paid").checked,
    settled: document.getElementById("w-settled").checked,
    memo: document.getElementById("w-memo").value.trim(),
    assignedStaff, checklist: editingChecklist,
    updatedAt: new Date().toISOString()
  };

  try {
    if (editingWeddingId) {
      await updateDoc(doc(db, "weddings", editingWeddingId), data);
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, "weddings"), data);
    }
    closeModal();
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

document.getElementById("delete-wedding-btn").addEventListener("click", async () => {
  if (!editingWeddingId) return;
  if (!confirm("이 이벤트를 삭제하시겠습니까?")) return;
  try {
    await deleteDoc(doc(db, "weddings", editingWeddingId));
    closeModal();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
});

// ===== 직원 관리 =====
function renderStaffList() {
  const el = document.getElementById("staff-list");
  if (allUsers.length === 0) {
    el.innerHTML = '<p class="empty-msg">No members yet.</p>';
    return;
  }
  el.innerHTML = allUsers.map(u => `
    <div class="staff-row">
      <div class="staff-info">
        <div class="staff-name-row">
          <span class="staff-name">${u.name}</span>
          ${u.uid === currentUser.uid ? '<span style="color:#a0a0a0;font-size:0.75rem;">(you)</span>' : ""}
          <button class="icon-btn edit-name-btn" data-uid="${u.uid}" data-name="${u.name}" title="이름 편집">✎</button>
        </div>
        <div class="staff-email">${u.email}</div>
      </div>
      <div class="staff-actions">
        <select class="role-select" data-uid="${u.uid}" ${u.uid === currentUser.uid ? "disabled" : ""}>
          <option value="staff" ${u.role==="staff"?"selected":""}>Staff</option>
          <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
        </select>
      </div>
    </div>
  `).join("");

  // 이름 편집 버튼
  el.querySelectorAll(".edit-name-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openNameModal(btn.dataset.uid, btn.dataset.name);
    });
  });

  // 역할 변경
  el.querySelectorAll(".role-select").forEach(sel => {
    sel.addEventListener("change", async e => {
      const uid = e.target.dataset.uid;
      const newRole = e.target.value;
      if (!confirm(`Change this member's role to '${newRole}'?`)) {
        e.target.value = allUsers.find(x => x.uid === uid)?.role;
        return;
      }
      try {
        await updateDoc(doc(db, "users", uid), { role: newRole });
      } catch (err) {
        alert("Update failed: " + err.message);
      }
    });
  });
}

// ===== 이름 편집 모달 =====
function openNameModal(uid, currentName) {
  editingNameUid = uid;
  document.getElementById("edit-name-input").value = currentName || "";
  nameModal.classList.remove("hidden");
  setTimeout(() => document.getElementById("edit-name-input").focus(), 50);
}

function closeNameModal() {
  nameModal.classList.add("hidden");
  editingNameUid = null;
}

document.getElementById("name-modal-close").addEventListener("click", closeNameModal);
document.getElementById("name-cancel-btn").addEventListener("click", closeNameModal);
document.getElementById("name-modal-backdrop").addEventListener("click", closeNameModal);

document.getElementById("name-save-btn").addEventListener("click", async () => {
  const newName = document.getElementById("edit-name-input").value.trim();
  if (!newName) { alert("이름을 입력해주세요."); return; }
  if (!editingNameUid) return;
  try {
    await updateDoc(doc(db, "users", editingNameUid), { name: newName });
    closeNameModal();
  } catch (err) {
    alert("Save failed: " + err.message);
  }
});

document.getElementById("edit-name-input").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("name-save-btn").click();
});
