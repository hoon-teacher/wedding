// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDjpXgNZuiaq4DDUy5VPpPoc7VIm1QT_60",
  authDomain: "imyoo-studio.firebaseapp.com",
  projectId: "imyoo-studio",
  storageBucket: "imyoo-studio.firebasestorage.app",
  messagingSenderId: "281378286031",
  appId: "1:281378286031:web:f00e2ab0b8be1e19c70aba"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ===== 전역 상태 =====
let currentUser = null;
let currentUserRole = "staff"; // 'admin' or 'staff'
let currentDate = new Date();
let weddings = []; // Firestore에서 받아올 예식 목록

// ===== DOM 요소 =====
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const loginError = document.getElementById("login-error");
const userNameEl = document.getElementById("user-name");
const userRoleEl = document.getElementById("user-role");

// ===== 로그인 처리 =====
googleLoginBtn.addEventListener("click", async () => {
  try {
    loginError.textContent = "";
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    loginError.textContent = "로그인 실패: " + err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// 인증 상태 감지
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await ensureUserDoc(user); // Firestore에 사용자 정보 저장
    await loadUserRole(user.uid);
    showApp();
    initCalendar();
    subscribeWeddings();
  } else {
    currentUser = null;
    currentUserRole = "staff";
    showLogin();
  }
});

// 사용자 문서가 없으면 생성 (처음 로그인 시)
async function ensureUserDoc(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    // 첫 로그인 사용자는 기본적으로 staff
    // 관리자(처제)는 콘솔에서 수동으로 role을 'admin'으로 바꿔줘야 함
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
  if (snap.exists()) {
    currentUserRole = snap.data().role || "staff";
  }
}

// ===== 화면 전환 =====
function showLogin() {
  loginScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

function showApp() {
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  userNameEl.textContent = currentUser.displayName || currentUser.email;
  userRoleEl.textContent = currentUserRole === "admin" ? "관리자" : "직원";
  userRoleEl.classList.toggle("staff", currentUserRole === "staff");

  // 관리자 전용 UI 표시
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
  renderCalendar();
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  document.getElementById("current-month").textContent = `${year}년 ${month + 1}월`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  // 요일 헤더
  ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => {
    const h = document.createElement("div");
    h.className = "calendar-day-header";
    h.textContent = d;
    grid.appendChild(h);
  });

  // 해당 월의 첫 날, 마지막 날
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const today = new Date();

  // 빈 칸 (첫 날 앞부분)
  for (let i = 0; i < startDayOfWeek; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  // 날짜 칸
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;
    if (isToday) cell.classList.add("today");

    const dayNumber = document.createElement("div");
    dayNumber.className = "day-number";
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    // 해당 날짜의 예식 표시
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayWeddings = weddings.filter((w) => w.date === dateStr);
    dayWeddings.forEach((w) => {
      const dot = document.createElement("div");
      dot.className = "wedding-dot";
      dot.textContent = `${w.time || ""} ${w.venue || ""}`.trim();
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        alert(`예식 상세 (추후 구현): ${w.venue}`);
      });
      cell.appendChild(dot);
    });

    cell.addEventListener("click", () => {
      if (currentUserRole === "admin") {
        alert(`${dateStr}에 예식 추가 (추후 구현)`);
      }
    });

    grid.appendChild(cell);
  }
}

// ===== Firestore 실시간 구독 =====
function subscribeWeddings() {
  const q = query(collection(db, "weddings"), orderBy("date", "asc"));
  onSnapshot(q, (snapshot) => {
    weddings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCalendar();
    renderList();
  });
}

// ===== 목록 렌더링 =====
function renderList() {
  const listEl = document.getElementById("wedding-list");
  if (weddings.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">등록된 예식이 없습니다.</p>';
    return;
  }
  listEl.innerHTML = weddings
    .map(
      (w) => `
    <div class="wedding-card" style="background:white;padding:1rem;border-radius:10px;border:1px solid #eee;">
      <strong>${w.date} ${w.time || ""}</strong><br/>
      <span style="color:#666;">${w.venue || "장소 미정"} · ${w.concept || "컨셉 미정"}</span>
    </div>
  `
    )
    .join("");
}
