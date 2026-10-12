
"use strict";

/* ==========================================================
   STUDYX — ADVANCED STUDY OS
   Front-end app for GitHub Pages
   Storage: browser localStorage
   ========================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = "studyx_os_v1";

const defaultData = () => ({
  profile: { name: "", age: "", schoolClass: "", board: "", goal: "Better school results" },
  theme: "dark",
  subjects: ["Mathematics", "Science", "English"],
  sessions: [],
  tasks: [],
  syllabus: [],
  exams: [],
  quizzes: [],
  attempts: [],
  decks: [],
  notes: [],
  revisions: [],
  focusSessions: [],
  goals: [],
  reminders: [],
  activity: [],
  settings: { dailyTarget: 120, focusMinutes: 25, breakMinutes: 5 }
});

let data = loadData();
let currentPage = "dashboard";
let currentQuizId = null;
let quizPosition = 0;
let quizAnswers = {};
let quizSubmitted = false;
let activeDeckId = null;
let flashPosition = 0;
let flashRevealed = false;
let timerInterval = null;
let timerRemaining = 25 * 60;
let timerRunning = false;
let timerMode = "focus";
let toastTimeout = null;

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultData();
    const parsed = JSON.parse(saved);
    const base = defaultData();
    return {
      ...base, ...parsed,
      profile: { ...base.profile, ...(parsed.profile || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) }
    };
  } catch (error) {
    console.error("STUDYX storage could not be read:", error);
    return defaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    toast("Storage is full or unavailable. Export a backup and free some space.");
    console.error(error);
    return false;
  }
}

function uid() {
  return window.crypto?.randomUUID?.() ||
    "sx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function dateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateISO(date);
}

function niceDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "No date set";
  const d = new Date(value + "T12:00:00");
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString(undefined, options);
}

function timeNow() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function durationLabel(minutes) {
  minutes = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
}

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3000);
}

function logActivity(type, details = {}) {
  data.activity.unshift({ id: uid(), type, at: timeNow(), ...details });
  data.activity = data.activity.slice(0, 500);
}

function completeProfile() {
  const p = data.profile;
  return Boolean(p.name && p.age);
}

function showOnboardingStep(step) {
  $$(".onboard-screen").forEach(screen => {
    screen.classList.toggle("active", Number(screen.dataset.step) === step);
  });
  $("#step-label").textContent = `STEP ${String(step + 1).padStart(2, "0")} OF 04`;
  $("#onboard-progress-fill").style.width = `${((step + 1) / 4) * 100}%`;
}

function showApp() {
  $("#onboarding").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#sidebar-name").textContent = data.profile.name || "Student";
  $("#sidebar-class").textContent = data.profile.schoolClass || "My workspace";
  $("#sidebar-avatar").textContent = (data.profile.name || "S").trim().charAt(0).toUpperCase();
  $("#top-avatar").textContent = (data.profile.name || "S").trim().charAt(0).toUpperCase();
  $("#top-name").textContent = data.profile.name || "Student";
  document.body.classList.toggle("light-theme", data.theme === "light");
  renderPage(currentPage);
}

function openOnboarding() {
  $("#app").classList.add("hidden");
  $("#onboarding").classList.remove("hidden");
  const p = data.profile;
  $("#profile-name").value = p.name || "";
  $("#profile-age").value = p.age || "";
  $("#profile-class").value = p.schoolClass || "";
  $("#profile-board").value = p.board || "";
  $("#profile-goal").value = p.goal || "Better school results";
  showOnboardingStep(0);
}

$("#onboarding").addEventListener("click", event => {
  const next = event.target.closest("[data-next]");
  if (next) {
    const current = Number($(".onboard-screen.active")?.dataset.step || 0);
    showOnboardingStep(Math.min(current + 1, 3));
  }
});

$("#profile-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#profile-name").value.trim();
  const age = Number($("#profile-age").value);
  if (!name || !Number.isInteger(age) || age < 5 || age > 100) {
    toast("Enter a name and a valid age between 5 and 100.");
    return;
  }
  data.profile = {
    name,
    age,
    schoolClass: $("#profile-class").value.trim(),
    board: $("#profile-board").value.trim(),
    goal: $("#profile-goal").value
  };
  saveData();
  showOnboardingStep(2);
});

$("#launch-app").addEventListener("click", () => {
  saveData();
  showApp();
  currentPage = "dashboard";
  renderPage("dashboard");
});

if (!completeProfile()) openOnboarding();
else showApp();

/* NAVIGATION */

function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-overlay").classList.remove("show");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}

function navigate(page) {
  const validPages = [
    "dashboard", "timetable", "homework", "syllabus", "exams",
    "quizzes", "flashcards", "revision", "focus", "notes",
    "goals", "analytics", "achievements", "reminders", "settings"
  ];
  if (!validPages.includes(page)) return;
  currentPage = page;
  closeSidebar();
  renderPage(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-page]");
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.page);
  }
});

$("#menu-toggle").addEventListener("click", () => {
  const open = !$("#sidebar").classList.contains("open");
  $("#sidebar").classList.toggle("open", open);
  $("#sidebar-overlay").classList.toggle("show", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
});

$("#sidebar-overlay").addEventListener("click", closeSidebar);
$("#mobile-more").addEventListener("click", () => {
  const open = !$("#sidebar").classList.contains("open");
  $("#sidebar").classList.toggle("open", open);
  $("#sidebar-overlay").classList.toggle("show", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
});

/* SHARED UI HELPERS */

function heading(title, description, actions = "") {
  return `<div class="page-heading">
    <div><div class="section-kicker">STUDYX WORKSPACE</div>
      <h1>${title}</h1><p>${description}</p></div>
    <div class="page-heading-actions">${actions}</div>
  </div>`;
}

function panel(title, body, subtitle = "", extra = "") {
  return `<section class="panel">
    <div class="section-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${extra}</div>
    ${body}</section>`;
}

function empty(icon, title, description, button = "") {
  return `<div class="empty-state"><span>${icon}</span><b>${title}</b><p>${description}</p>${button}</div>`;
}

function progressBar(value, label = "Progress") {
  const pct = clamp(value, 0, 100);
  return `<div class="progress-meta"><span>${label}</span><b>${pct}%</b></div>
    <div class="progress-line"><span style="width:${pct}%"></span></div>`;
}

function statCard(icon, label, value, foot, glow = "rgba(73,227,244,.08)") {
  return `<div class="stat-card" style="--glow:${glow}">
    <div class="stat-icon">${icon}</div><div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`;
}

function field(label, name, type = "text", value = "", placeholder = "", extra = "") {
  const isTextArea = type === "textarea";
  return `<div class="field ${extra}">
    <label for="f-${name}">${label}</label>
    ${isTextArea
      ? `<textarea id="f-${name}" name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
  </div>`;
}

function subjectOptions(selected = "") {
  const subjects = [...new Set([...data.subjects, ...data.syllabus.map(s => s.subject).filter(Boolean)])];
  return subjects.map(s => `<option value="${esc(s)}" ${s === selected ? "selected" : ""}>${esc(s)}</option>`).join("");
}

function saveButton(text = "Save", extraClass = "") {
  return `<button type="submit" class="btn btn-primary ${extraClass}">${text}</button>`;
}

function getTodaySessions() {
  return data.sessions.filter(s => s.date === dateISO());
}

function getCompletedTasks() {
  return data.tasks.filter(t => t.done);
}

function getStudyMinutes(days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return data.focusSessions
    .filter(s => new Date(s.at) >= start)
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
}

function streakDays() {
  const activeDates = new Set([
    ...data.focusSessions.map(s => dateISO(new Date(s.at))),
    ...data.activity.filter(a => ["task-complete", "quiz-complete", "session-complete", "revision-complete"].includes(a.type))
      .map(a => dateISO(new Date(a.at)))
  ]);
  let streak = 0;
  const today = dateISO();
  let cursor = new Date(today + "T12:00:00");
  if (!activeDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(dateISO(cursor)) && streak < 3650) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function quizScore(quiz) {
  const attempts = data.attempts.filter(a => a.quizId === quiz.id);
  if (!attempts.length) return "Not attempted";
  return `${Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length)}% average`;
}

/* DASHBOARD */

function renderDashboard() {
  const name = esc(data.profile.name || "Student");
  const minutes = getStudyMinutes(7);
  const todayTasks = data.tasks.filter(t => !t.done && (!t.due || t.due <= dateISO()));
  const upcoming = data.exams.filter(e => e.date >= dateISO()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const sessions = getTodaySessions().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const done = getCompletedTasks().length;
  const taskPct = data.tasks.length ? Math.round(done / data.tasks.length * 100) : 0;
  const focusPct = clamp(minutes / Math.max(1, data.settings.dailyTarget * 7) * 100, 0, 100);

  return `
    <div class="greeting-banner">
      <div class="section-kicker">YOUR PERSONAL STUDY OS</div>
      <h1>Let's make today count, ${name} <span>✦</span></h1>
      <p>${niceDate(dateISO(), { weekday: "long", month: "long", day: "numeric" })} · One focused session at a time.</p>
      <div class="greeting-symbol">✧</div>
    </div>
    <div class="grid grid-4" style="margin-bottom:18px">
      ${statCard("◷", "STUDY TIME · 7 DAYS", durationLabel(minutes), "Recorded focus sessions")}
      ${statCard("☑", "TASKS COMPLETED", done, `${data.tasks.length - done} still pending`, "rgba(84,227,176,.09)")}
      ${statCard("✦", "QUIZ ATTEMPTS", data.attempts.length, "Completed practice quizzes", "rgba(161,138,255,.1)")}
      ${statCard("↗", "STUDY STREAK", `${streakDays()} days`, "Consecutive active days", "rgba(246,203,119,.09)")}
    </div>
    <div class="dashboard-grid">
      <div class="dashboard-stack">
        ${panel("Today's plan", " <div class='action-row' style='margin-bottom:14px'><button class='btn btn-primary' data-action='add-session'>＋ Add study session</button><button class='btn' data-page='timetable'>Full timetable ↗</button></div>" +
          (sessions.length ? `<div class="list">${sessions.map(s => `<div class="list-item">
            <div class="stat-icon">◷</div><div class="list-item-main"><b>${esc(s.title)}</b><small>${esc(s.subject || "General")} · ${esc(s.time || "Time flexible")} · ${Number(s.minutes) || 0} min</small></div>
            <div class="list-item-actions"><button class="btn btn-sm" data-action="complete-session" data-id="${s.id}">Done</button></div></div>`).join("")}</div>`
          : empty("◷", "Your day is open", "Add a session to start planning today's study.", `<button class="btn" data-action="add-session">Create session</button>`)))}
        ${panel("Your next steps", `<div class="section-heading"><p>Tasks that need your attention</p><button class="btn btn-sm" data-page="homework">All tasks ↗</button></div>` +
          (todayTasks.length ? `<div class="list">${todayTasks.slice(0, 4).map(t => `<label class="list-item check-row">
            <input type="checkbox" data-action="toggle-task" data-id="${t.id}">
            <span><b>${esc(t.title)}</b><small>${esc(t.subject || "General")} · ${t.due ? niceDate(t.due) : "No deadline"}</small></span>
            <i class="badge ${t.priority === "High" ? "red" : ""}">${esc(t.priority || "Normal")}</i>
          </label>`).join("")}</div>` : empty("✓", "All caught up", "Add homework or a task whenever you need.")))}
      </div>
      <div class="dashboard-stack">
        ${panel("Weekly progress", `<div class="ring-wrap"><div class="ring" style="--progress:${focusPct}%"><strong>${Math.round(focusPct)}%</strong></div>
          <div class="ring-details"><b>${durationLabel(minutes)}</b><small>Focus time in the last 7 days</small><small>Target: ${durationLabel(data.settings.dailyTarget * 7)}</small></div></div>
          <div class="divider"></div>${progressBar(taskPct, "Tasks completed")}`)}
        ${panel("Upcoming exams", upcoming.length ? `<div class="list">${upcoming.map(e => {
          const days = Math.ceil((new Date(e.date + "T12:00:00") - new Date(dateISO() + "T12:00:00")) / 86400000);
          return `<div class="list-item"><div class="stat-icon">▦</div><div class="list-item-main"><b>${esc(e.title)}</b><small>${esc(e.subject || "General")} · ${niceDate(e.date)}</small></div><span class="badge ${days <= 3 ? "red" : "violet"}">${days === 0 ? "Today" : `${days}d`}</span></div>`;
        }).join("")}</div>` : empty("▦", "No exams scheduled", "Add your next exam to start a countdown.", `<button class="btn" data-action="add-exam">Add exam</button>`))}
        ${panel("Quick actions", `<div class="quick-actions">
          <button class="quick-action" data-action="add-task"><span>＋</span>Add homework</button>
          <button class="quick-action" data-page="quizzes"><span>✦</span>Take a quiz</button>
          <button class="quick-action" data-page="flashcards"><span>▱</span>Study cards</button>
          <button class="quick-action" data-page="focus"><span>◉</span>Focus room</button>
        </div>`)}
      </div>
    </div>`;
}

/* TIMETABLE */

function renderTimetable() {
  const sessions = [...data.sessions].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  return heading("Smart timetable", "Organize your study sessions and build a routine.") +
    `<div class="grid grid-2" style="margin-bottom:18px">
      ${statCard("▦", "TOTAL SESSIONS", sessions.length, "Sessions planned")}
      ${statCard("✓", "COMPLETED SESSIONS", sessions.filter(s => s.done).length, "Keep your momentum", "rgba(84,227,176,.09)")}
    </div>` +
    panel("Create a study session", `<form id="session-form" class="form-grid">
      ${field("Session title", "title", "text", "", "e.g. Algebra practice")}
      <div class="field"><label for="f-subject">Subject</label><select id="f-subject" name="subject">${subjectOptions()}</select></div>
      ${field("Date", "date", "date", dateISO())}
      ${field("Start time", "time", "time", "17:00")}
      ${field("Duration (minutes)", "minutes", "number", "45")}
      ${field("Topic (optional)", "topic", "text", "", "Chapter or topic")}
      <div class="full form-actions">${saveButton("＋ Add session")}</div>
    </form>`) +
    panel("All study sessions", sessions.length ? `<div class="list">${sessions.map(s => `<div class="list-item">
      <div class="stat-icon">${s.done ? "✓" : "◷"}</div><div class="list-item-main">
      <b>${esc(s.title)} ${s.done ? '<span class="badge green">Done</span>' : ""}</b>
      <small>${esc(s.subject || "General")} · ${niceDate(s.date)} · ${esc(s.time || "Flexible")} · ${s.minutes} min</small>
      ${s.topic ? `<small>${esc(s.topic)}</small>` : ""}</div>
      <div class="list-item-actions">${!s.done ? `<button class="btn btn-sm" data-action="complete-session" data-id="${s.id}">Complete</button>` : ""}
      <button class="btn btn-sm btn-danger" data-action="delete-session" data-id="${s.id}">Delete</button></div></div>`).join("")}</div>` : empty("◷", "No sessions yet", "Create your first study session above."));
}

/* HOMEWORK */

function renderHomework() {
  const tasks = [...data.tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
  return heading("Homework manager", "Keep assignments, priorities and deadlines organized.") +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("☑", "ALL TASKS", tasks.length, "Tasks in your workspace")}
      ${statCard("◷", "PENDING", tasks.filter(t => !t.done).length, "Ready for your attention", "rgba(246,203,119,.09)")}
      ${statCard("✓", "COMPLETED", tasks.filter(t => t.done).length, "Finished assignments", "rgba(84,227,176,.09)")}
    </div>` +
    panel("Add homework or task", `<form id="task-form" class="form-grid">
      ${field("Task title", "title", "text", "", "e.g. Complete science worksheet")}
      <div class="field"><label for="f-subject">Subject</label><select id="f-subject" name="subject">${subjectOptions()}</select></div>
      ${field("Due date", "due", "date", dateISO())}
      <div class="field"><label for="f-priority">Priority</label><select id="f-priority" name="priority"><option>Normal</option><option>High</option><option>Low</option></select></div>
      <div class="full">${field("Details (optional)", "details", "textarea", "", "What needs to be done?")}</div>
      <div class="full form-actions">${saveButton("＋ Add task")}</div>
    </form>`) +
    panel("Your tasks", tasks.length ? `<div class="list">${tasks.map(t => `<div class="list-item">
      <label class="check-row"><input type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done ? "checked" : ""}>
      <span class="${t.done ? "muted" : ""}"><b>${esc(t.title)}</b><small>${esc(t.subject || "General")} · ${t.due ? niceDate(t.due) : "No deadline"}${t.details ? " · " + esc(t.details) : ""}</small></span></label>
      <div class="list-item-actions"><span class="badge ${t.priority === "High" ? "red" : t.priority === "Low" ? "green" : ""}">${esc(t.priority || "Normal")}</span>
      <button class="btn btn-sm btn-danger" data-action="delete-task" data-id="${t.id}">Delete</button></div></div>`).join("")}</div>` : empty("☑", "Nothing on your list", "Add an assignment to keep track of it."));
}

/* SYLLABUS */

function renderSyllabus() {
  const subjects = [...new Set(data.syllabus.map(s => s.subject))];
  const overall = data.syllabus.length ? Math.round(data.syllabus.filter(s => s.done).length / data.syllabus.length * 100) : 0;
  return heading("Syllabus tracker", "Track chapters, topics and your preparation progress.") +
    panel("Overall syllabus progress", `<div class="ring-wrap"><div class="ring" style="--progress:${overall}%"><strong>${overall}%</strong></div><div class="ring-details"><b>${data.syllabus.filter(s => s.done).length} of ${data.syllabus.length} topics completed</b><small>Mark topics complete as you finish them.</small></div></div>`) +
    panel("Add a chapter or topic", `<form id="syllabus-form" class="form-grid">
      ${field("Subject", "subject", "text", "", "e.g. Mathematics")}
      ${field("Chapter / topic", "title", "text", "", "e.g. Rational numbers")}
      <div class="full form-actions">${saveButton("＋ Add topic")}</div></form>`) +
    (subjects.length ? subjects.map(subject => {
      const list = data.syllabus.filter(s => s.subject === subject);
      const pct = Math.round(list.filter(s => s.done).length / list.length * 100);
      return panel(esc(subject), `${progressBar(pct, `${list.filter(s => s.done).length} / ${list.length} completed`)}
        <div class="list" style="margin-top:14px">${list.map(s => `<div class="list-item"><label class="check-row ${s.done ? "done" : ""}">
          <input type="checkbox" data-action="toggle-syllabus" data-id="${s.id}" ${s.done ? "checked" : ""}>
          <span>${esc(s.title)}</span></label><button class="btn btn-sm btn-danger" data-action="delete-syllabus" data-id="${s.id}">Delete</button></div>`).join("")}</div>`);
    }).join("") : panel("Your chapters", empty("▤", "No topics added", "Add subjects and chapters to track your syllabus.")));
}

/* EXAMS */

function renderExams() {
  const exams = [...data.exams].sort((a, b) => a.date.localeCompare(b.date));
  return heading("Exam centre", "Count down to exams and organize your preparation.") +
    panel("Add an exam", `<form id="exam-form" class="form-grid">
      ${field("Exam name", "title", "text", "", "e.g. Mathematics half-yearly")}
      ${field("Subject", "subject", "text", "", "e.g. Mathematics")}
      ${field("Exam date", "date", "date", dateISO())}
      ${field("Maximum marks", "maxMarks", "number", "100")}
      <div class="full">${field("Preparation notes", "notes", "textarea", "", "Topics to revise before the exam")}</div>
      <div class="full form-actions">${saveButton("＋ Add exam")}</div></form>`) +
    panel("Exam calendar", exams.length ? `<div class="list">${exams.map(e => {
      const days = Math.ceil((new Date(e.date + "T12:00:00") - new Date(dateISO() + "T12:00:00")) / 86400000);
      return `<div class="list-item"><div class="stat-icon">▦</div><div class="list-item-main">
        <b>${esc(e.title)}</b><small>${esc(e.subject || "General")} · ${niceDate(e.date)} · Max marks: ${e.maxMarks || 100}</small>
        ${e.notes ? `<small>${esc(e.notes)}</small>` : ""}</div>
        <span class="badge ${days < 0 ? "red" : days <= 3 ? "gold" : "violet"}">${days < 0 ? "Past" : days === 0 ? "Today" : `${days} days`}</span>
        <button class="btn btn-sm btn-danger" data-action="delete-exam" data-id="${e.id}">Delete</button></div>`;
    }).join("")}</div>` : empty("▦", "No exams scheduled", "Add an exam date to plan ahead."));
}

/* QUIZ STUDIO */

function renderQuizzes() {
  const quizzes = data.quizzes;
  return heading("Quiz studio", "Build your own tests, practice and review your results.",
    `<button class="btn btn-primary" data-action="new-quiz">＋ Create quiz</button>`) +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("✦", "SAVED QUIZZES", quizzes.length, "Your personal question bank")}
      ${statCard("✓", "ATTEMPTS", data.attempts.length, "Completed practice tests", "rgba(84,227,176,.09)")}
      ${statCard("↗", "AVERAGE SCORE", data.attempts.length ? Math.round(data.attempts.reduce((s,a)=>s+a.score,0)/data.attempts.length)+"%" : "—", "Across completed attempts", "rgba(161,138,255,.1)")}
    </div>` +
    panel("Create a quiz", `<form id="quiz-form">
      <div class="form-grid">
        ${field("Quiz title", "title", "text", "", "e.g. Science Chapter 1")}
        ${field("Subject", "subject", "text", "", "e.g. Science")}
        <div class="full">${field("Description (optional)", "description", "textarea", "", "What will this quiz help you practice?")}</div>
      </div>
      <div id="quiz-question-builder" class="list" style="margin-top:16px"></div>
      <div class="form-actions"><button type="button" class="btn" data-action="add-question">＋ Add question</button>${saveButton("Save quiz")}</div>
      <p class="tiny muted">Each question has four options. Select the correct answer. Add five or more questions for a full-length quiz.</p>
    </form>`, "Create as many quizzes as you need.") +
    panel("Your quiz library", quizzes.length ? `<div class="list">${quizzes.map(q => `<div class="list-item">
      <div class="stat-icon">✦</div><div class="list-item-main"><b>${esc(q.title)}</b>
      <small>${esc(q.subject || "General")} · ${q.questions.length} questions · ${quizScore(q)}</small>
      ${q.description ? `<small>${esc(q.description)}</small>` : ""}</div>
      <div class="list-item-actions"><button class="btn btn-sm btn-primary" data-action="start-quiz" data-id="${q.id}">Start</button>
      <button class="btn btn-sm" data-action="edit-quiz" data-id="${q.id}">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete-quiz" data-id="${q.id}">Delete</button></div></div>`).join("")}</div>` : empty("✦", "Your quiz library is empty", "Create a quiz above, then start it whenever you're ready."));
}

function addQuizQuestion(values = {}) {
  const container = $("#quiz-question-builder");
  if (!container) return;
  const index = container.children.length;
  const options = values.options || ["", "", "", ""];
  const card = document.createElement("section");
  card.className = "panel quiz-question-card";
  card.style.marginTop = "0";
  card.innerHTML = `<div class="section-heading"><h3>Question ${index + 1}</h3>
    <button type="button" class="btn btn-sm btn-danger" data-action="remove-question">Remove</button></div>
    <div class="field"><label>Question</label><textarea data-q-field="question" required placeholder="Enter your question">${esc(values.question || "")}</textarea></div>
    <div class="form-grid" style="margin-top:12px">${options.map((option, i) => `
      <div class="field"><label>Option ${String.fromCharCode(65+i)}</label>
      <input data-q-option="${i}" required value="${esc(option)}" placeholder="Enter option ${String.fromCharCode(65+i)}"></div>`).join("")}</div>
    <div class="field" style="margin-top:12px"><label>Correct answer</label>
      <select data-q-field="answer">${options.map((_,i)=>`<option value="${i}" ${Number(values.answer || 0)===i?"selected":""}>Option ${String.fromCharCode(65+i)}</option>`).join("")}</select></div>`;
  container.appendChild(card);
  renumberQuestions();
}

function renumberQuestions() {
  $$(".quiz-question-card").forEach((card, i) => {
    const title = $("h3", card);
    if (title) title.textContent = `Question ${i + 1}`;
  });
}

function readQuizQuestions() {
  const cards = $$(".quiz-question-card");
  if (!cards.length) throw new Error("Add at least one question.");
  return cards.map((card, i) => {
    const question = $('[data-q-field="question"]', card).value.trim();
    const options = $$("[data-q-option]", card).map(input => input.value.trim());
    const answer = Number($('[data-q-field="answer"]', card).value);
    if (!question || options.some(o => !o)) throw new Error(`Complete the question and all four options for Question ${i + 1}.`);
    return { question, options, answer };
  });
}

function renderQuizRun() {
  const quiz = data.quizzes.find(q => q.id === currentQuizId);
  if (!quiz) { currentQuizId = null; renderPage("quizzes"); return; }
  const q = quiz.questions[quizPosition];
  const isLast = quizPosition === quiz.questions.length - 1;
  const submitted = quizSubmitted;
  const picked = quizAnswers[quizPosition];
  const correct = picked === q.answer;
  const result = submitted ? quiz.questions.reduce((sum, question, i) => sum + (quizAnswers[i] === question.answer ? 1 : 0), 0) : 0;

  $("#page-content").innerHTML = heading(esc(quiz.title), `${esc(quiz.subject || "General")} · Question ${quizPosition + 1} of ${quiz.questions.length}`,
    `<button class="btn" data-action="exit-quiz">Exit quiz</button>`) +
    `<section class="panel" style="max-width:780px;margin:0 auto">
      ${submitted ? `<div class="ring-wrap" style="margin-bottom:22px"><div class="ring" style="--progress:${Math.round(result/quiz.questions.length*100)}%"><strong>${Math.round(result/quiz.questions.length*100)}%</strong></div>
        <div class="ring-details"><b>${result} / ${quiz.questions.length} correct</b><small>Your completed attempt is saved.</small></div></div>` : progressBar(Math.round((quizPosition + 1) / quiz.questions.length * 100), "Quiz progress")}
      <div class="section-kicker" style="margin-top:20px">QUESTION ${quizPosition + 1}</div>
      <h2 style="line-height:1.45;margin-top:8px">${esc(q.question)}</h2>
      <div style="margin-top:20px">${q.options.map((option, i) => {
        let cls = "quiz-option";
        if (picked === i) cls += " selected";
        if (submitted && i === q.answer) cls += " correct";
        if (submitted && picked === i && !correct) cls += " wrong";
        return `<button class="${cls}" data-action="quiz-answer" data-option="${i}" ${submitted ? "disabled" : ""}>
          <span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(option)}</span></button>`;
      }).join("")}</div>
      ${submitted ? `<div class="panel" style="margin-top:16px"><b class="${correct ? "accent" : ""}">${correct ? "Correct answer!" : "Review this answer"}</b>
        <p class="muted" style="margin:7px 0 0;font-size:12px">Correct option: ${String.fromCharCode(65+q.answer)}. ${esc(q.options[q.answer])}</p>
      </div>` : ""}
      <div class="form-actions" style="justify-content:space-between">
        <button class="btn" data-action="quiz-prev" ${quizPosition===0?"disabled":""}>← Previous</button>
        ${!submitted
          ? `<button class="btn btn-primary" data-action="${isLast ? "submit-quiz" : "quiz-next"}" ${picked===undefined?"disabled":""}>${isLast?"Submit quiz":"Next question →"}</button>`
          : `<button class="btn btn-primary" data-action="${isLast?"finish-quiz":"review-next"}">${isLast?"Finish review":"Next answer →"}</button>`}
      </div>
      ${!submitted ? `<p class="tiny muted" style="margin-top:12px">Your score is calculated when you submit. You can move back to review your answers.</p>` : ""}
    </section>`;
}

/* FLASHCARDS */

function renderFlashcards() {
  const decks = data.decks;
  const deck = decks.find(d => d.id === activeDeckId);
  let studyArea = "";
  if (deck && deck.cards.length) {
    const card = deck.cards[flashPosition % deck.cards.length];
    studyArea = panel(esc(deck.title), `<div class="flashcard">
      <div class="flash-label">${flashRevealed ? "ANSWER" : "QUESTION"} · ${flashPosition + 1} / ${deck.cards.length}</div>
      <h2>${esc(flashRevealed ? card.answer : card.question)}</h2>
      ${!flashRevealed ? `<p>Think of your answer, then reveal the card.</p>` : ""}
    </div><div class="flashcard-actions">
      <button class="btn" data-action="flash-prev">← Previous</button>
      <button class="btn btn-primary" data-action="flash-flip">${flashRevealed ? "Show question" : "Reveal answer"}</button>
      <button class="btn" data-action="flash-next">Next →</button>
    </div><div class="flashcard-actions">
      <button class="btn" data-action="flash-mark" data-level="learning">Still learning</button>
      <button class="btn" data-action="flash-mark" data-level="mastered">I know this ✓</button>
    </div>`, `${deck.cards.filter(c=>c.mastered).length} of ${deck.cards.length} cards mastered`);
  }
  return heading("Flashcards", "Build card decks, test your memory and master topics.",
    `<button class="btn btn-primary" data-action="new-deck">＋ New deck</button>`) +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("▱", "DECKS", decks.length, "Your personal card library")}
      ${statCard("▤", "TOTAL CARDS", decks.reduce((n,d)=>n+d.cards.length,0), "Cards across all decks")}
      ${statCard("✓", "MASTERED", decks.reduce((n,d)=>n+d.cards.filter(c=>c.mastered).length,0), "Cards you know well", "rgba(84,227,176,.09)")}
    </div>` +
    (studyArea ? studyArea : panel("Study a deck", empty("▱", "Choose a deck to begin", "Create a deck, add questions and answers, and start studying."))) +
    panel("Create a flashcard deck", `<form id="deck-form" class="form-grid">
      ${field("Deck name", "title", "text", "", "e.g. Biology definitions")}
      ${field("Subject", "subject", "text", "", "e.g. Science")}
      <div class="full form-actions">${saveButton("＋ Create deck")}</div></form>`) +
    panel("Your decks", decks.length ? `<div class="list">${decks.map(d => `<div class="list-item">
      <div class="stat-icon">▱</div><div class="list-item-main"><b>${esc(d.title)}</b>
      <small>${esc(d.subject || "General")} · ${d.cards.length} cards · ${d.cards.filter(c=>c.mastered).length} mastered</small></div>
      <div class="list-item-actions"><button class="btn btn-sm btn-primary" data-action="study-deck" data-id="${d.id}">Study</button>
      <button class="btn btn-sm" data-action="add-card" data-id="${d.id}">＋ Card</button>
      <button class="btn btn-sm btn-danger" data-action="delete-deck" data-id="${d.id}">Delete</button></div></div>`).join("")}</div>` : empty("▱", "No decks yet", "Create your first deck above."));
}

/* REVISION ENGINE */

function renderRevision() {
  const items = [...data.revisions].sort((a,b) => a.due.localeCompare(b.due));
  const due = items.filter(r => !r.done && r.due <= dateISO());
  return heading("Revision engine", "Schedule repeat reviews so important topics stay fresh.") +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("↻", "TOTAL TOPICS", items.length, "In your revision list")}
      ${statCard("◷", "DUE NOW", due.length, "Ready for review", "rgba(246,203,119,.09)")}
      ${statCard("✓", "REVISED", items.filter(r=>r.done).length, "Completed revisions", "rgba(84,227,176,.09)")}
    </div>` +
    panel("Schedule a revision", `<form id="revision-form" class="form-grid">
      ${field("Topic", "title", "text", "", "e.g. Algebraic identities")}
      ${field("Subject", "subject", "text", "", "e.g. Mathematics")}
      ${field("First revision date", "due", "date", dateISO())}
      <div class="field"><label for="f-interval">Repeat interval</label><select id="f-interval" name="interval"><option value="1">Every 1 day</option><option value="3">Every 3 days</option><option value="7" selected>Every 7 days</option><option value="14">Every 14 days</option><option value="30">Every 30 days</option></select></div>
      <div class="full form-actions">${saveButton("＋ Schedule revision")}</div></form>`) +
    panel("Revision list", items.length ? `<div class="list">${items.map(r => `<div class="list-item">
      <div class="stat-icon">${r.done ? "✓" : "↻"}</div><div class="list-item-main"><b>${esc(r.title)}</b>
      <small>${esc(r.subject || "General")} · ${r.done ? "Completed" : `Due ${niceDate(r.due)}`} · Repeat every ${r.interval} days</small></div>
      <div class="list-item-actions">${!r.done ? `<button class="btn btn-sm btn-primary" data-action="complete-revision" data-id="${r.id}">Reviewed</button>` : ""}
      <button class="btn btn-sm btn-danger" data-action="delete-revision" data-id="${r.id}">Delete</button></div></div>`).join("")}</div>` : empty("↻", "No revisions scheduled", "Add a topic and choose how often you want to review it."));
}

/* FOCUS ROOM */

function renderFocus() {
  const target = data.settings.dailyTarget;
  const todayMinutes = data.focusSessions.filter(s => dateISO(new Date(s.at)) === dateISO()).reduce((n,s)=>n+s.minutes,0);
  return heading("Focus room", "Protect your attention. Work in focused sessions.") +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("◉", "TODAY'S FOCUS", durationLabel(todayMinutes), `Target: ${durationLabel(target)}`)}
      ${statCard("◷", "TOTAL SESSIONS", data.focusSessions.length, "Recorded focus sessions")}
      ${statCard("↗", "THIS WEEK", durationLabel(getStudyMinutes(7)), "Keep building consistency", "rgba(161,138,255,.1)")}
    </div>` +
    panel("Focus timer", `<div class="pill-tabs" style="justify-content:center">
      <button class="pill-tab ${timerMode==="focus"?"active":""}" data-action="timer-mode" data-mode="focus">Focus</button>
      <button class="pill-tab ${timerMode==="break"?"active":""}" data-action="timer-mode" data-mode="break">Short break</button>
    </div>
    <div class="timer-face" style="--timer-progress:${timerProgress()}%">
      <div class="timer-time" id="timer-display">${formatTimer(timerRemaining)}<small id="timer-label">${timerRunning?"IN PROGRESS":timerMode==="focus"?"FOCUS SESSION":"BREAK TIME"}</small></div>
    </div>
    <div class="action-row" style="justify-content:center">
      <button class="btn btn-primary" data-action="timer-toggle">${timerRunning?"Pause":"Start focus"}</button>
      <button class="btn" data-action="timer-reset">Reset</button>
    </div>
    <p class="tiny muted center" style="margin-top:16px">Timer runs while this page is open. Completed focus sessions are saved automatically.</p>`, "Choose a session, put distractions aside, and begin.") +
    panel("Recent sessions", data.focusSessions.length ? `<div class="list">${data.focusSessions.slice(-8).reverse().map(s=>`<div class="list-item">
      <div class="stat-icon">✓</div><div class="list-item-main"><b>${esc(s.label || "Focus session")}</b><small>${niceDate(dateISO(new Date(s.at)),{month:"short",day:"numeric",year:"numeric"})} · ${s.minutes} minutes</small></div>
      <span class="badge green">Complete</span></div>`).join("")}</div>` : empty("◉", "Your first session awaits", "Start the timer to record your first focus session."));
}

function formatTimer(seconds) {
  const m = Math.floor(Math.max(0,seconds)/60);
  const s = Math.max(0,seconds)%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function timerProgress() {
  const total = (timerMode === "focus" ? data.settings.focusMinutes : data.settings.breakMinutes) * 60;
  return total ? (1 - timerRemaining / total) * 100 : 0;
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}
function resetTimer() {
  stopTimer();
  timerRemaining = (timerMode === "focus" ? data.settings.focusMinutes : data.settings.breakMinutes) * 60;
  renderPage("focus");
}
function startTimer() {
  if (timerRunning) {
    stopTimer();
    renderPage("focus");
    return;
  }
  if (timerRemaining <= 0) resetTimer();
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerRemaining--;
    const display = $("#timer-display");
    if (display) {
      display.firstChild.textContent = formatTimer(timerRemaining);
      $("#timer-label").textContent = "IN PROGRESS";
      $(".timer-face").style.setProperty("--timer-progress", `${timerProgress()}%`);
    }
    if (timerRemaining <= 0) {
      const completedMode = timerMode;
      stopTimer();
      if (completedMode === "focus") {
        const minutes = Number(data.settings.focusMinutes);
        data.focusSessions.push({ id: uid(), at: timeNow(), minutes, label: "Focus session" });
        logActivity("session-complete", { minutes });
        toast("Focus session complete! Great work.");
        saveData();
      } else {
        toast("Break complete. Ready for another session?");
      }
      timerMode = completedMode === "focus" ? "break" : "focus";
      timerRemaining = (timerMode === "focus" ? data.settings.focusMinutes : data.settings.breakMinutes) * 60;
      renderPage("focus");
    }
  }, 1000);
}

/* NOTES */

function renderNotes() {
  const notes = [...data.notes].sort((a,b)=>b.updated.localeCompare(a.updated));
  return heading("Notes & resources", "Keep your learning notes and useful links in one place.",
    `<button class="btn btn-primary" data-action="new-note">＋ New note</button>`) +
    panel("Create a note", `<form id="note-form" class="form-grid">
      ${field("Title", "title", "text", "", "e.g. Laws of motion")}
      ${field("Subject", "subject", "text", "", "e.g. Physics")}
      <div class="full">${field("Note content", "content", "textarea", "", "Write your notes here...")}</div>
      ${field("Resource URL (optional)", "url", "url", "", "https://example.com", "full")}
      <div class="full form-actions">${saveButton("Save note")}</div></form>`) +
    panel("Your notebook", notes.length ? `<div class="list">${notes.map(n=>`<div class="list-item"><div class="stat-icon">▧</div>
      <div class="list-item-main"><b>${esc(n.title)}</b><small>${esc(n.subject || "General")} · Updated ${niceDate(dateISO(new Date(n.updated)))}</small>
      <small>${esc((n.content || "").slice(0,150))}${(n.content || "").length>150?"…":""}</small>
      ${n.url ? `<small><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Open saved resource ↗</a></small>` : ""}</div>
      <div class="list-item-actions"><button class="btn btn-sm" data-action="edit-note" data-id="${n.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-note" data-id="${n.id}">Delete</button></div></div>`).join("")}</div>` : empty("▧", "Your notebook is ready", "Write your first set of notes above."));
}

/* GOALS */

function renderGoals() {
  const goals = data.goals;
  const done = goals.filter(g => g.done).length;
  return heading("Goals & challenges", "Set meaningful targets and track your consistency.",
    `<button class="btn btn-primary" data-action="new-goal">＋ New goal</button>`) +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("◎", "TOTAL GOALS", goals.length, "Personal study targets")}
      ${statCard("✓", "COMPLETED", done, "Targets achieved", "rgba(84,227,176,.09)")}
      ${statCard("↗", "IN PROGRESS", goals.filter(g=>!g.done).length, "One step at a time", "rgba(161,138,255,.1)")}
    </div>` +
    panel("Create a goal", `<form id="goal-form" class="form-grid">
      ${field("Goal title", "title", "text", "", "e.g. Complete 3 chapters")}
      <div class="field"><label for="f-type">Goal type</label><select id="f-type" name="type"><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Personal</option></select></div>
      ${field("Target number", "target", "number", "5")}
      ${field("Target date (optional)", "due", "date", "")}
      <div class="full form-actions">${saveButton("＋ Create goal")}</div></form>`) +
    panel("Your goals", goals.length ? `<div class="list">${goals.map(g=>{
      const pct = g.done ? 100 : clamp((g.current || 0)/(g.target || 1)*100,0,100);
      return `<div class="list-item"><div class="stat-icon">${g.done?"✓":"◎"}</div><div class="list-item-main">
        <b>${esc(g.title)}</b><small>${esc(g.type)} goal${g.due?" · Due "+niceDate(g.due):""} · ${g.current||0} / ${g.target||1}</small>
        ${progressBar(pct,"Progress")}</div>
        <div class="list-item-actions">${!g.done?`<button class="btn btn-sm btn-primary" data-action="goal-increment" data-id="${g.id}">＋ Progress</button>`:""}
        <button class="btn btn-sm btn-danger" data-action="delete-goal" data-id="${g.id}">Delete</button></div></div>`;
    }).join("")}</div>` : empty("◎", "Set your first goal", "Choose a target that is achievable and meaningful."));
}

/* ANALYTICS */

function renderAnalytics() {
  const days = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-(6-i)); return dateISO(d); });
  const minutes = days.map(day=>data.focusSessions.filter(s=>dateISO(new Date(s.at))===day).reduce((sum,s)=>sum+s.minutes,0));
  const max = Math.max(1,...minutes);
  const total = minutes.reduce((a,b)=>a+b,0);
  const maxHeight = 110;
  const scores = data.attempts;
  const avg = scores.length ? Math.round(scores.reduce((n,a)=>n+a.score,0)/scores.length) : 0;
  const subjects = [...new Set(data.syllabus.map(s=>s.subject))];
  return heading("Analytics & reports", "Understand your habits and see your progress over time.",
    `<button class="btn" data-action="export-data">Export backup</button>`) +
    `<div class="grid grid-4" style="margin-bottom:18px">
      ${statCard("◷", "7-DAY STUDY TIME", durationLabel(total), "Recorded focus sessions")}
      ${statCard("✦", "QUIZ AVERAGE", scores.length?avg+"%":"—", `${scores.length} attempts`, "rgba(161,138,255,.1)")}
      ${statCard("☑", "TASK COMPLETION", data.tasks.length?Math.round(getCompletedTasks().length/data.tasks.length*100)+"%":"—", `${getCompletedTasks().length} of ${data.tasks.length} tasks`,"rgba(84,227,176,.09)")}
      ${statCard("↗", "STREAK", `${streakDays()} days`, "Active study days", "rgba(246,203,119,.09)")}
    </div>` +
    panel("Your study activity", `<div class="chart-bars">${days.map((d,i)=>`<div class="chart-bar-col">
      <div class="chart-bar" style="height:${Math.max(3,minutes[i]/max*maxHeight)}px" title="${minutes[i]} minutes"></div>
      <small>${new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"})}</small></div>`).join("")}</div>
      <div class="divider"></div><div class="progress-meta"><span>Total focus time</span><b>${durationLabel(total)}</b></div>`,
      "Focus sessions recorded over the last seven days.") +
    panel("Syllabus by subject", subjects.length ? `<div class="list">${subjects.map(subject=>{
      const arr=data.syllabus.filter(s=>s.subject===subject);
      const pct=Math.round(arr.filter(s=>s.done).length/arr.length*100);
      return `<div><div class="progress-meta"><span>${esc(subject)}</span><b>${pct}%</b></div><div class="progress-line"><span style="width:${pct}%"></span></div></div>`;
    }).join("")}</div>` : empty("▤","No syllabus data yet","Add topics in the Syllabus Tracker to see subject progress.")) +
    panel("Recent quiz attempts", scores.length ? `<div class="table-wrap"><table><thead><tr><th>Quiz</th><th>Score</th><th>Date</th></tr></thead><tbody>${scores.slice(-10).reverse().map(a=>{
      const q=data.quizzes.find(q=>q.id===a.quizId);
      return `<tr><td>${esc(q?.title || "Deleted quiz")}</td><td><span class="badge ${a.score>=70?"green":"violet"}">${a.score}%</span></td><td>${niceDate(dateISO(new Date(a.at)))}</td></tr>`;
    }).join("")}</tbody></table></div>` : empty("✦","No quiz attempts yet","Take a quiz to begin building your performance history."));
}

/* ACHIEVEMENTS */

function renderAchievements() {
  const minutes = data.focusSessions.reduce((n,s)=>n+s.minutes,0);
  const definitions = [
    ["First steps","Complete your first focus session",data.focusSessions.length>=1,"◉"],
    ["Focus starter","Record 60 total focus minutes",minutes>=60,"◷"],
    ["Quiz explorer","Complete your first quiz",data.attempts.length>=1,"✦"],
    ["Quiz regular","Complete five quiz attempts",data.attempts.length>=5,"✧"],
    ["Task finisher","Complete five tasks",getCompletedTasks().length>=5,"✓"],
    ["Card learner","Create your first flashcard",data.decks.some(d=>d.cards.length),"▱"],
    ["Chapter champion","Complete five syllabus topics",data.syllabus.filter(s=>s.done).length>=5,"▤"],
    ["Goal setter","Create your first study goal",data.goals.length>=1,"◎"],
    ["Week of progress","Record seven active study days",streakDays()>=7,"↗"],
    ["Study marathon","Record 10 hours of focus",minutes>=600,"♜"]
  ];
  const unlocked = definitions.filter(a=>a[2]).length;
  return heading("Achievements", "Celebrate consistency, milestones and effort.") +
    `<div class="grid grid-3" style="margin-bottom:18px">
      ${statCard("♜","UNLOCKED",`${unlocked}/${definitions.length}`,"Achievements earned")}
      ${statCard("◉","TOTAL FOCUS",durationLabel(minutes),"All recorded sessions")}
      ${statCard("↗","CURRENT STREAK",`${streakDays()} days`,"Keep your habit going")}
    </div>` +
    panel("Your milestones", `<div class="grid grid-2">${definitions.map(a=>`<div class="list-item" style="align-items:center;opacity:${a[2]?1:.55}">
      <div class="stat-icon" style="width:43px;height:43px;font-size:21px">${a[3]}</div>
      <div class="list-item-main"><b>${esc(a[0])}</b><small>${esc(a[1])}</small></div>
      <span class="badge ${a[2]?"green":""}">${a[2]?"Unlocked":"Locked"}</span></div>`).join("")}</div>`);
}

/* REMINDERS */

function renderReminders() {
  const reminders = [...data.reminders].sort((a,b)=>a.date.localeCompare(b.date));
  return heading("Reminders centre", "Keep upcoming tasks and study plans visible.") +
    panel("Create a reminder", `<form id="reminder-form" class="form-grid">
      ${field("Reminder title", "title", "text", "", "e.g. Revise biology")}
      ${field("Date", "date", "date", dateISO())}
      ${field("Time", "time", "time", "18:00")}
      <div class="field"><label for="f-type">Reminder type</label><select id="f-type" name="type"><option>Study</option><option>Homework</option><option>Exam</option><option>Revision</option><option>Other</option></select></div>
      <div class="full form-actions">${saveButton("＋ Add reminder")}</div></form>`) +
    panel("Your reminders", reminders.length ? `<div class="list">${reminders.map(r=>`<div class="list-item">
      <div class="stat-icon">♧</div><div class="list-item-main"><b>${esc(r.title)}</b>
      <small>${esc(r.type)} · ${niceDate(r.date)} · ${esc(r.time||"Any time")}</small></div>
      <div class="list-item-actions">${!r.notified?`<button class="btn btn-sm" data-action="notify-reminder" data-id="${r.id}">Notify now</button>`:""}
      <button class="btn btn-sm btn-danger" data-action="delete-reminder" data-id="${r.id}">Delete</button></div></div>`).join("")}</div>` : empty("♧","No reminders yet","Add a reminder to keep important dates on your radar.")) +
    panel("Notification support", `<p class="muted" style="font-size:12px">Browser notifications require permission and may depend on your browser, device and installation. STUDYX keeps your reminder list here; it does not guarantee alarms while the app is closed.</p>
      <button class="btn" data-action="enable-notifications">Enable browser notifications</button>`);
}

/* SETTINGS AND BACKUP */

function renderSettings() {
  return heading("Settings & backup", "Personalize your workspace and protect your saved data.") +
    panel("Your profile", `<form id="settings-profile-form" class="form-grid">
      ${field("Name","name","text",data.profile.name)}
      ${field("Age","age","number",data.profile.age)}
      ${field("Class / level","schoolClass","text",data.profile.schoolClass)}
      ${field("School board","board","text",data.profile.board)}
      <div class="field full"><label for="f-goal">Learning goal</label><select id="f-goal" name="goal">
        ${["Better school results","Competitive exams","Build consistent habits","Learn new skills"].map(g=>`<option ${data.profile.goal===g?"selected":""}>${g}</option>`).join("")}
      </select></div>
      <div class="full form-actions">${saveButton("Save profile")}</div></form>`) +
    panel("Appearance", `<div class="settings-row"><div><b>Light theme</b><small>Switch between dark and light appearance.</small></div>
      <input class="switch" type="checkbox" id="theme-switch" ${data.theme==="light"?"checked":""} aria-label="Enable light theme"></div>`) +
    panel("Study preferences", `<form id="settings-study-form" class="form-grid">
      ${field("Daily focus target (minutes)","dailyTarget","number",data.settings.dailyTarget)}
      ${field("Focus session (minutes)","focusMinutes","number",data.settings.focusMinutes)}
      ${field("Break duration (minutes)","breakMinutes","number",data.settings.breakMinutes)}
      <div class="full form-actions">${saveButton("Save preferences")}</div></form>`) +
    panel("Backup & restore", `<p class="muted" style="font-size:12px">Export a JSON backup of your profile, quizzes, cards, tasks, notes and progress. Keep the downloaded file somewhere safe. Importing a backup replaces the current local STUDYX data.</p>
      <div class="action-row"><button class="btn btn-primary" data-action="export-data">↓ Export backup</button>
      <button class="btn" data-action="choose-import">↑ Import backup</button>
      <input id="import-file" type="file" accept=".json,application/json" class="hidden"></div>`) +
    panel("Onboarding", `<p class="muted" style="font-size:12px">You can reopen the introduction to review your profile and the app's features.</p>
      <button class="btn" data-action="reopen-onboarding">Restart introduction</button>`) +
    panel("Data controls", `<p class="muted" style="font-size:12px">This app saves data in this browser on this device. Clearing browser data may remove it. Export a backup first if you want to keep a copy.</p>
      <button class="btn btn-danger" data-action="reset-data">Reset all local data</button>`);
}

/* PAGE RENDERER */

function renderPage(page) {
  const renderers = {
    dashboard: renderDashboard, timetable: renderTimetable, homework: renderHomework,
    syllabus: renderSyllabus, exams: renderExams, quizzes: renderQuizzes,
    flashcards: renderFlashcards, revision: renderRevision, focus: renderFocus,
    notes: renderNotes, goals: renderGoals, analytics: renderAnalytics,
    achievements: renderAchievements, reminders: renderReminders, settings: renderSettings
  };
  if (!renderers[page]) page = "dashboard";
  currentPage = page;

  $$(".nav-item[data-page], .mobile-nav-item[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  $("#breadcrumb").textContent = ({
    dashboard:"Dashboard", timetable:"Smart timetable", homework:"Homework manager",
    syllabus:"Syllabus tracker", exams:"Exam centre", quizzes:"Quiz studio",
    flashcards:"Flashcards", revision:"Revision engine", focus:"Focus room",
    notes:"Notes & resources", goals:"Goals & challenges", analytics:"Analytics & reports",
    achievements:"Achievements", reminders:"Reminders centre", settings:"Settings & backup"
  })[page] || "Dashboard";

  if (page === "quizzes" && currentQuizId) {
    renderQuizRun();
    return;
  }
  $("#page-content").innerHTML = renderers[page]();
  if (page === "quizzes") {
    const form = $("#quiz-question-builder");
    if (form && !form.children.length) {
      for (let i = 0; i < 5; i++) addQuizQuestion();
    }
  }
}

/* CREATE, EDIT, COMPLETE AND DELETE */

function byId(listName, id) {
  return data[listName].find(item => item.id === id);
}
function removeById(listName, id) {
  data[listName] = data[listName].filter(item => item.id !== id);
  saveData();
}

function createSessionFromPrompt() {
  const title = prompt("Study session title:");
  if (!title?.trim()) return;
  const subject = prompt("Subject:", "Mathematics") || "General";
  const date = prompt("Date (YYYY-MM-DD):", dateISO()) || dateISO();
  const time = prompt("Start time (HH:MM):", "17:00") || "17:00";
  const minutes = Number(prompt("Duration in minutes:", "45") || 45);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return toast("Enter a duration from 1 to 1440 minutes.");
  data.sessions.push({id:uid(),title:title.trim(),subject,date,time,minutes,topic:"",done:false});
  saveData(); renderPage("dashboard"); toast("Study session added.");
}

function createTaskFromPrompt() {
  const title = prompt("Task or homework title:");
  if (!title?.trim()) return;
  data.tasks.push({id:uid(),title:title.trim(),subject:"General",due:dateISO(),priority:"Normal",details:"",done:false});
  saveData(); renderPage(currentPage); toast("Task added.");
}

function createExamFromPrompt() {
  const title = prompt("Exam name:");
  if (!title?.trim()) return;
  const date = prompt("Exam date (YYYY-MM-DD):", shiftDate(7)) || shiftDate(7);
  data.exams.push({id:uid(),title:title.trim(),subject:"General",date,maxMarks:100,notes:""});
  saveData(); renderPage(currentPage); toast("Exam added.");
}

function createQuizPrompt() {
  currentQuizId = null;
  quizSubmitted = false;
  quizAnswers = {};
  renderPage("quizzes");
  $("#quiz-form")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function editQuiz(id) {
  const quiz = byId("quizzes", id);
  if (!quiz) return;
  currentQuizId = null;
  renderPage("quizzes");
  $("#quiz-form").elements.title.value = quiz.title;
  $("#quiz-form").elements.subject.value = quiz.subject || "";
  $("#quiz-form").elements.description.value = quiz.description || "";
  $("#quiz-question-builder").innerHTML = "";
  quiz.questions.forEach(q => addQuizQuestion({question:q.question,options:q.options,answer:q.answer}));
  $("#quiz-form").dataset.editId = id;
  $("#quiz-form").scrollIntoView({behavior:"smooth",block:"start"});
}

function startQuiz(id) {
  const quiz = byId("quizzes", id);
  if (!quiz) return toast("Quiz not found.");
  if (!quiz.questions.length) return toast("This quiz has no questions.");
  currentQuizId = id;
  quizPosition = 0;
  quizAnswers = {};
  quizSubmitted = false;
  renderQuizRun();
}

function submitQuiz() {
  const quiz = byId("quizzes", currentQuizId);
  if (!quiz) return;
  const correct = quiz.questions.reduce((sum,q,i)=>sum+(quizAnswers[i]===q.answer?1:0),0);
  const score = Math.round(correct / quiz.questions.length * 100);
  data.attempts.push({id:uid(),quizId:quiz.id,score,correct,total:quiz.questions.length,at:timeNow(),answers:{...quizAnswers}});
  logActivity("quiz-complete",{quizId:quiz.id,score});
  saveData();
  quizSubmitted = true;
  quizPosition = 0;
  renderQuizRun();
  toast(`Quiz submitted. Score: ${score}%`);
}

/* CENTRAL EVENT HANDLER */

document.addEventListener("submit", event => {
  const form = event.target;
  event.preventDefault();
  const fd = new FormData(form);
  const val = key => String(fd.get(key) ?? "").trim();

  try {
    switch (form.id) {
      case "session-form": {
        const title=val("title"), minutes=Number(val("minutes"));
        if (!title) throw new Error("Enter a session title.");
        if (!Number.isFinite(minutes)||minutes<1||minutes>1440) throw new Error("Duration must be between 1 and 1440 minutes.");
        data.sessions.push({id:uid(),title,subject:val("subject"),date:val("date")||dateISO(),time:val("time"),minutes,topic:val("topic"),done:false});
        break;
      }
      case "task-form": {
        if (!val("title")) throw new Error("Enter a task title.");
        data.tasks.push({id:uid(),title:val("title"),subject:val("subject"),due:val("due"),priority:val("priority"),details:val("details"),done:false});
        break;
      }
      case "syllabus-form": {
        if (!val("subject")||!val("title")) throw new Error("Enter a subject and a chapter or topic.");
        data.syllabus.push({id:uid(),subject:val("subject"),title:val("title"),done:false});
        if (!data.subjects.includes(val("subject"))) data.subjects.push(val("subject"));
        break;
      }
      case "exam-form": {
        if (!val("title")||!val("date")) throw new Error("Enter an exam name and date.");
        data.exams.push({id:uid(),title:val("title"),subject:val("subject"),date:val("date"),maxMarks:clamp(val("maxMarks")||100,1,100000),notes:val("notes")});
        break;
      }
      case "quiz-form": {
        if (!val("title")) throw new Error("Enter a quiz title.");
        const questions=readQuizQuestions();
        const editId=form.dataset.editId;
        if (editId) {
          const quiz=byId("quizzes",editId);
          if (quiz) Object.assign(quiz,{title:val("title"),subject:val("subject"),description:val("description"),questions});
          delete form.dataset.editId;
        } else {
          data.quizzes.push({id:uid(),title:val("title"),subject:val("subject"),description:val("description"),questions,created:timeNow()});
        }
        break;
      }
      case "deck-form": {
        if (!val("title")) throw new Error("Enter a deck name.");
        const deck={id:uid(),title:val("title"),subject:val("subject"),cards:[],created:timeNow()};
        data.decks.push(deck); activeDeckId=deck.id; flashPosition=0; flashRevealed=false;
        break;
      }
      case "revision-form": {
        if (!val("title")) throw new Error("Enter a topic to revise.");
        data.revisions.push({id:uid(),title:val("title"),subject:val("subject"),due:val("due")||dateISO(),interval:clamp(val("interval")||7,1,365),done:false});
        break;
      }
      case "note-form": {
        if (!val("title")) throw new Error("Enter a note title.");
        const editId=form.dataset.editId;
        const record={title:val("title"),subject:val("subject"),content:val("content"),url:val("url"),updated:timeNow()};
        if (editId) {
          const note=byId("notes",editId);
          if (note) Object.assign(note,record);
          delete form.dataset.editId;
        } else data.notes.push({id:uid(),...record});
        break;
      }
      case "goal-form": {
        if (!val("title")) throw new Error("Enter a goal title.");
        const target=clamp(val("target")||1,1,1000000);
        data.goals.push({id:uid(),title:val("title"),type:val("type"),target,current:0,due:val("due"),done:false});
        break;
      }
      case "reminder-form": {
        if (!val("title")||!val("date")) throw new Error("Enter a reminder title and date.");
        data.reminders.push({id:uid(),title:val("title"),date:val("date"),time:val("time"),type:val("type"),notified:false});
        break;
      }
      case "settings-profile-form": {
        const age=Number(val("age"));
        if (!val("name")||!Number.isInteger(age)||age<5||age>100) throw new Error("Enter a name and a valid age.");
        data.profile={...data.profile,name:val("name"),age,schoolClass:val("schoolClass"),board:val("board"),goal:val("goal")};
        break;
      }
      case "settings-study-form": {
        const target=Number(val("dailyTarget")), focus=Number(val("focusMinutes")), br=Number(val("breakMinutes"));
        if (![target,focus,br].every(Number.isFinite)||target<1||target>1440||focus<1||focus>180||br<1||br>60) {
          throw new Error("Daily target must be 1–1440 minutes, focus 1–180, break 1–60.");
        }
        data.settings.dailyTarget=target; data.settings.focusMinutes=focus; data.settings.breakMinutes=br;
        if (!timerRunning) timerRemaining=(timerMode==="focus"?focus:br)*60;
        break;
      }
      default: return;
    }
    logActivity("data-updated",{page:currentPage});
    saveData();
    renderPage(currentPage);
    toast("Saved successfully.");
  } catch(error) {
    toast(error.message || "Could not save. Check your entries.");
  }
});

document.addEventListener("change", event => {
  const target=event.target;
  if (target.matches('[data-action="toggle-task"]')) {
    const task=byId("tasks",target.dataset.id);
    if (!task) return;
    task.done=target.checked;
    if (task.done) logActivity("task-complete",{taskId:task.id});
    saveData(); renderPage(currentPage);
  }
  if (target.matches('[data-action="toggle-syllabus"]')) {
    const topic=byId("syllabus",target.dataset.id);
    if (!topic) return;
    topic.done=target.checked;
    saveData(); renderPage(currentPage);
  }
  if (target.id==="theme-switch") {
    data.theme=target.checked?"light":"dark";
    saveData(); document.body.classList.toggle("light-theme",target.checked);
  }
  if (target.id==="import-file" && target.files?.[0]) importBackup(target.files[0]);
});

document.addEventListener("click", async event => {
  const button=event.target.closest("[data-action]");
  if (!button) return;
  const action=button.dataset.action;
  const id=button.dataset.id;

  switch(action) {
    case "add-session": createSessionFromPrompt(); break;
    case "add-task": createTaskFromPrompt(); break;
    case "add-exam": createExamFromPrompt(); break;
    case "new-quiz": createQuizPrompt(); break;
    case "add-question": addQuizQuestion(); break;
    case "remove-question": button.closest(".quiz-question-card")?.remove(); renumberQuestions(); break;
    case "start-quiz": startQuiz(id); break;
    case "edit-quiz": editQuiz(id); break;
    case "delete-quiz":
      if(confirm("Delete this quiz? Its recorded attempts will remain in analytics.")) { removeById("quizzes",id); if(currentQuizId===id)currentQuizId=null; renderPage(currentPage); }
      break;
    case "exit-quiz": currentQuizId=null; quizSubmitted=false; renderPage("quizzes"); break;
    case "quiz-answer":
      if(quizSubmitted)return;
      quizAnswers[quizPosition]=Number(button.dataset.option); renderQuizRun(); break;
    case "quiz-prev": quizPosition=Math.max(0,quizPosition-1); renderQuizRun(); break;
    case "quiz-next": quizPosition=Math.min(byId("quizzes",currentQuizId).questions.length-1,quizPosition+1); renderQuizRun(); break;
    case "submit-quiz":
      if(Object.keys(quizAnswers).length < byId("quizzes",currentQuizId).questions.length) {
        if(!confirm("Some questions are unanswered. Submit anyway?"))return;
      }
      submitQuiz(); break;
    case "review-next":
      if(quizPosition < byId("quizzes",currentQuizId).questions.length-1) {quizPosition++;renderQuizRun();}
      else {toast("Review complete.");currentQuizId=null;quizSubmitted=false;renderPage("quizzes");}
      break;
    case "finish-quiz": currentQuizId=null;quizSubmitted=false;renderPage("quizzes");break;
    case "new-deck": $("#f-title")?.focus(); toast("Enter a deck name in the form below."); break;
    case "study-deck": activeDeckId=id;flashPosition=0;flashRevealed=false;renderPage("flashcards");break;
    case "add-card": addCardPrompt(id);break;
    case "delete-deck":
      if(confirm("Delete this flashcard deck and its cards?")){removeById("decks",id);if(activeDeckId===id)activeDeckId=null;renderPage("flashcards");}
      break;
    case "flash-flip": flashRevealed=!flashRevealed;renderPage("flashcards");break;
    case "flash-next": {
      const deck=byId("decks",activeDeckId);if(deck?.cards.length){flashPosition=(flashPosition+1)%deck.cards.length;flashRevealed=false;renderPage("flashcards");}break;
    }
    case "flash-prev": {
      const deck=byId("decks",activeDeckId);if(deck?.cards.length){flashPosition=(flashPosition-1+deck.cards.length)%deck.cards.length;flashRevealed=false;renderPage("flashcards");}break;
    }
    case "flash-mark": {
      const deck=byId("decks",activeDeckId);const card=deck?.cards[flashPosition];
      if(card){card.mastered=button.dataset.level==="mastered";saveData();toast(card.mastered?"Card marked mastered.":"Keep practicing this card.");renderPage("flashcards");}break;
    }
    case "complete-session": {
      const s=byId("sessions",id);if(s){s.done=true;logActivity("session-complete",{sessionId:id,minutes:s.minutes});saveData();renderPage(currentPage);toast("Session completed.");}break;
    }
    case "delete-session": if(confirm("Delete this session?")){removeById("sessions",id);renderPage(currentPage);}break;
    case "delete-task": if(confirm("Delete this task?")){removeById("tasks",id);renderPage(currentPage);}break;
    case "delete-syllabus": if(confirm("Delete this topic?")){removeById("syllabus",id);renderPage(currentPage);}break;
    case "delete-exam": if(confirm("Delete this exam?")){removeById("exams",id);renderPage(currentPage);}break;
    case "complete-revision": {
      const r=byId("revisions",id);if(r){r.done=true;logActivity("revision-complete",{revisionId:id});saveData();renderPage(currentPage);}break;
    }
    case "delete-revision": if(confirm("Delete this revision item?")){removeById("revisions",id);renderPage(currentPage);}break;
    case "edit-note": editNote(id);break;
    case "new-note": $("#f-title")?.focus();toast("Enter your note in the form below.");break;
    case "delete-note": if(confirm("Delete this note?")){removeById("notes",id);renderPage(currentPage);}break;
    case "new-goal": $("#f-title")?.focus();toast("Enter your goal in the form below.");break;
    case "goal-increment": {
      const g=byId("goals",id);if(g){g.current=Math.min(g.target,g.current+1);g.done=g.current>=g.target;saveData();renderPage(currentPage);toast(g.done?"Goal achieved!":"Progress updated.");}break;
    }
    case "delete-goal": if(confirm("Delete this goal?")){removeById("goals",id);renderPage(currentPage);}break;
    case "delete-reminder": if(confirm("Delete this reminder?")){removeById("reminders",id);renderPage(currentPage);}break;
    case "notify-reminder": {
      const r=byId("reminders",id);if(!r)break;
      if("Notification" in window && Notification.permission==="granted") {
        new Notification("STUDYX reminder",{body:r.title});
        r.notified=true;saveData();renderPage("reminders");
      } else toast("Enable browser notifications first, or check your reminder list.");
      break;
    }
    case "enable-notifications":
      if(!("Notification" in window)){toast("This browser does not support notifications.");break;}
      try { const permission=await Notification.requestPermission();toast(permission==="granted"?"Browser notifications enabled.":"Notification permission was not granted."); }
      catch(error){toast("Could not request notification permission.");}
      break;
    case "timer-mode":
      if(timerRunning){toast("Pause the timer before changing modes.");break;}
      timerMode=button.dataset.mode;timerRemaining=(timerMode==="focus"?data.settings.focusMinutes:data.settings.breakMinutes)*60;renderPage("focus");break;
    case "timer-toggle": startTimer();break;
    case "timer-reset": resetTimer();break;
    case "export-data": exportBackup();break;
    case "choose-import": $("#import-file").click();break;
    case "reopen-onboarding": openOnboarding();break;
    case "reset-data":
      if(confirm("This permanently deletes all STUDYX data stored in this browser. Export a backup first if needed. Continue?")) {
        stopTimer();localStorage.removeItem(STORAGE_KEY);data=defaultData();currentPage="dashboard";currentQuizId=null;activeDeckId=null;openOnboarding();toast("Local data reset.");
      }break;
  }
});

function addCardPrompt(deckId) {
  const deck=byId("decks",deckId);
  if(!deck)return;
  const question=prompt("Enter the flashcard question:");
  if(!question?.trim())return;
  const answer=prompt("Enter the answer:");
  if(!answer?.trim())return;
  deck.cards.push({id:uid(),question:question.trim(),answer:answer.trim(),mastered:false});
  activeDeckId=deckId;flashPosition=deck.cards.length-1;flashRevealed=false;
  saveData();renderPage("flashcards");toast("Flashcard added.");
}

function editNote(id) {
  const note=byId("notes",id);
  if(!note)return;
  renderPage("notes");
  const form=$("#note-form");
  form.dataset.editId=id;
  for(const key of ["title","subject","content","url"]) {
    if(form.elements[key])form.elements[key].value=note[key]||"";
  }
  form.scrollIntoView({behavior:"smooth",block:"start"});
}

function exportBackup() {
  const payload={format:"STUDYX_BACKUP",version:1,exportedAt:timeNow(),data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`studyx-backup-${dateISO()}.json`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  toast("Backup export started.");
}

function importBackup(file) {
  const reader=new FileReader();
  reader.onload=()=>{
    try {
      const parsed=JSON.parse(reader.result);
      const incoming=parsed.format==="STUDYX_BACKUP"?parsed.data:parsed;
      const required=["profile","sessions","tasks","quizzes","decks"];
      if(!incoming||typeof incoming!=="object"||!required.every(k=>k in incoming)) {
        throw new Error("This file does not look like a valid STUDYX backup.");
      }
      if(!confirm("Importing replaces your current STUDYX data. Continue?"))return;
      const base=defaultData();
      data={
        ...base,...incoming,
        profile:{...base.profile,...incoming.profile},
        settings:{...base.settings,...incoming.settings}
      };
      saveData();currentQuizId=null;activeDeckId=null;showApp();renderPage("dashboard");
      toast("Backup imported successfully.");
    }catch(error){toast(error.message||"Could not import this backup.");}
    finally{$("#import-file").value="";}
  };
  reader.onerror=()=>toast("Could not read that file.");
  reader.readAsText(file);
}

/* Keep saved changes consistent when the page is refreshed. */
window.addEventListener("beforeunload", () => {
  if (timerInterval) clearInterval(timerInterval);
  saveData();
});

/* Re-render the current screen after returning from onboarding. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !$("#app").classList.contains("hidden")) {
    $("#sidebar-name").textContent=data.profile.name||"Student";
  }
});
