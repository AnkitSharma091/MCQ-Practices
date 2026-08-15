// ============================================================
// UP10 MCQ MASTER - Application Logic
// Vanilla JS, no dependencies, no build step
// ============================================================

(function () {
  "use strict";

  // ---------------------------------------------------------
  // 0. SAFE STORAGE WRAPPER (localStorage may be unavailable)
  // ---------------------------------------------------------
  var memoryStore = {};
  var storageAvailable = false;

  function testStorage() {
    try {
      var testKey = "__up10_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }
  storageAvailable = testStorage();

  var safeStorage = {
    get: function (key, fallback) {
      try {
        if (storageAvailable) {
          var raw = window.localStorage.getItem(key);
          if (raw === null || raw === undefined) return fallback;
          return JSON.parse(raw);
        } else {
          return Object.prototype.hasOwnProperty.call(memoryStore, key)
            ? memoryStore[key]
            : fallback;
        }
      } catch (e) {
        console.error("Storage read error for key:", key, e);
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        if (storageAvailable) {
          window.localStorage.setItem(key, JSON.stringify(value));
        } else {
          memoryStore[key] = value;
        }
        return true;
      } catch (e) {
        console.error("Storage write error for key:", key, e);
        try {
          memoryStore[key] = value;
        } catch (e2) {}
        return false;
      }
    }
  };

  var STORAGE_KEYS = {
    HISTORY: "up10_history_v1",
    BOOKMARKS: "up10_bookmarks_v1",
    WRONG: "up10_wrong_v1"
  };

  var MAX_HISTORY = 100;
  var QUIZ_DURATION_SECONDS = 20 * 60;

  // ---------------------------------------------------------
  // 1. STATE
  // ---------------------------------------------------------
  var state = {
    quizQuestions: [],
    currentIndex: 0,
    userAnswers: {},
    timerInterval: null,
    timeRemaining: QUIZ_DURATION_SECONDS,
    currentSubjectLabel: "",
    quizMode: "normal", // 'normal' | 'wrong'
    deferredInstallPrompt: null
  };

  // ---------------------------------------------------------
  // 2. DOM HELPERS
  // ---------------------------------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function showScreen(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove("active");
    }
    var target = $(id);
    if (target) target.classList.add("active");
    window.scrollTo(0, 0);
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------------------------------------------------------
  // 3. QUESTION BANK VALIDATION (robust, per spec)
  // ---------------------------------------------------------
  function validateQuestionBank() {
    var result = { ok: false, message: "", scienceCount: 0, sstCount: 0 };

    if (typeof QUESTIONS === "undefined") {
      result.message = "questions.js load nahi hua ya QUESTIONS variable maujood nahi hai.";
      console.error("Question bank load failed: QUESTIONS is undefined");
      return result;
    }

    if (!Array.isArray(QUESTIONS)) {
      result.message = "Question bank sahi format mein nahi hai (array nahi hai).";
      console.error("Question bank load failed: QUESTIONS is not an array");
      return result;
    }

    if (QUESTIONS.length === 0) {
      result.message = "Question bank khaali hai.";
      console.error("Question bank load failed: QUESTIONS array is empty");
      return result;
    }

    var scienceCount = 0;
    var sstCount = 0;
    var seenIds = {};
    var invalidFound = false;

    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      if (!q || typeof q !== "object") {
        invalidFound = true;
        console.error("Invalid question entry at index", i);
        continue;
      }
      if (!q.id || typeof q.id !== "string") {
        invalidFound = true;
        console.error("Question missing valid id at index", i);
        continue;
      }
      if (seenIds[q.id]) {
        invalidFound = true;
        console.error("Duplicate question id found:", q.id);
        continue;
      }
      seenIds[q.id] = true;

      if (q.subject !== "science" && q.subject !== "sst") {
        invalidFound = true;
        console.error("Question has invalid subject:", q.id, q.subject);
        continue;
      }
      if (!q.chapter || typeof q.chapter !== "string" || q.chapter.trim() === "") {
        invalidFound = true;
        console.error("Question missing chapter:", q.id);
        continue;
      }
      if (!q.question || typeof q.question !== "string" || q.question.trim() === "") {
        invalidFound = true;
        console.error("Question text empty:", q.id);
        continue;
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        invalidFound = true;
        console.error("Question does not have exactly 4 options:", q.id);
        continue;
      }
      var hasEmptyOption = false;
      for (var j = 0; j < q.options.length; j++) {
        if (!q.options[j] || typeof q.options[j] !== "string" || q.options[j].trim() === "") {
          hasEmptyOption = true;
        }
      }
      if (hasEmptyOption) {
        invalidFound = true;
        console.error("Question has an empty option:", q.id);
        continue;
      }
      if (
        typeof q.answer !== "number" ||
        q.answer < 0 ||
        q.answer > 3 ||
        Math.floor(q.answer) !== q.answer
      ) {
        invalidFound = true;
        console.error("Question has invalid answer index:", q.id, q.answer);
        continue;
      }

      if (q.subject === "science") scienceCount++;
      if (q.subject === "sst") sstCount++;
    }

    result.scienceCount = scienceCount;
    result.sstCount = sstCount;

    console.log("Science questions:", scienceCount);
    console.log("SST questions:", sstCount);

    if (invalidFound) {
      result.message = "कुछ questions सही फॉर्मेट में नहीं हैं। कृपया questions.js जाँचें।";
      console.error("Question bank load failed: invalid question entries found");
      return result;
    }

    if (scienceCount === 0) {
      result.message = "Science questions उपलब्ध नहीं हैं।";
      console.error("Question bank load failed: no science questions found");
      return result;
    }

    if (sstCount === 0) {
      result.message = "Social Science questions उपलब्ध नहीं हैं।";
      console.error("Question bank load failed: no SST questions found");
      return result;
    }

    result.ok = true;
    return result;
  }

  // ---------------------------------------------------------
  // 4. UTILS
  // ---------------------------------------------------------
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function getQuestionsBySubject(subject) {
    return QUESTIONS.filter(function (q) {
      return q.subject === subject;
    });
  }

  function findQuestionById(id) {
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].id === id) return QUESTIONS[i];
    }
    return null;
  }

  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function subjectLabelHindi(subject) {
    if (subject === "science") return "विज्ञान";
    if (subject === "sst") return "सामाजिक विज्ञान";
    return "गलत प्रश्न अभ्यास";
  }

  // ---------------------------------------------------------
  // 5. QUIZ FLOW
  // ---------------------------------------------------------
  function startQuiz(subject) {
    var pool = getQuestionsBySubject(subject);
    if (pool.length === 0) {
      alert("इस विषय के लिए कोई प्रश्न उपलब्ध नहीं है।");
      return;
    }
    state.quizMode = "normal";
    state.currentSubjectLabel = subjectLabelHindi(subject);
    state.quizSubjectKey = subject;
    state.quizQuestions = shuffleArray(pool);
    state.currentIndex = 0;
    state.userAnswers = {};
    state.timeRemaining = QUIZ_DURATION_SECONDS;
    beginQuizUi();
  }

  function startWrongPractice() {
    var wrongIds = safeStorage.get(STORAGE_KEYS.WRONG, []);
    var pool = [];
    for (var i = 0; i < wrongIds.length; i++) {
      var q = findQuestionById(wrongIds[i]);
      if (q) pool.push(q);
    }
    if (pool.length === 0) {
      return;
    }
    state.quizMode = "wrong";
    state.currentSubjectLabel = "गलत प्रश्न अभ्यास";
    state.quizSubjectKey = "wrong";
    state.quizQuestions = shuffleArray(pool);
    state.currentIndex = 0;
    state.userAnswers = {};
    state.timeRemaining = QUIZ_DURATION_SECONDS;
    beginQuizUi();
  }

  function beginQuizUi() {
    showScreen("screen-quiz");
    renderQuestion();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    updateTimerDisplay();
    state.timerInterval = setInterval(function () {
      state.timeRemaining--;
      updateTimerDisplay();
      if (state.timeRemaining <= 0) {
        stopTimer();
        submitQuiz();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    var el = $("quiz-timer");
    if (!el) return;
    var t = Math.max(0, state.timeRemaining);
    el.textContent = formatTime(t);
    if (t <= 60) {
      el.classList.add("timer-warning");
    } else {
      el.classList.remove("timer-warning");
    }
  }

  function renderQuestion() {
    var q = state.quizQuestions[state.currentIndex];
    if (!q) return;

    $("quiz-subject-label").textContent = state.currentSubjectLabel;
    $("quiz-qnum").textContent =
      "प्रश्न " + (state.currentIndex + 1) + " / " + state.quizQuestions.length;
    $("quiz-chapter").textContent = q.chapter;
    $("quiz-question").textContent = q.question;

    var pct = Math.round(((state.currentIndex + 1) / state.quizQuestions.length) * 100);
    $("quiz-progress-fill").style.width = pct + "%";

    var optionsContainer = $("quiz-options");
    optionsContainer.innerHTML = "";
    var letters = ["A", "B", "C", "D"];
    var selected = state.userAnswers[q.id];

    for (var i = 0; i < q.options.length; i++) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quiz-option" + (selected === idx ? " selected" : "");
        btn.setAttribute("data-index", String(idx));

        var letterSpan = document.createElement("span");
        letterSpan.className = "opt-letter";
        letterSpan.textContent = letters[idx];

        var textSpan = document.createElement("span");
        textSpan.className = "opt-text";
        textSpan.textContent = q.options[idx];

        btn.appendChild(letterSpan);
        btn.appendChild(textSpan);

        btn.addEventListener("click", function () {
          state.userAnswers[q.id] = idx;
          renderQuestion();
        });

        optionsContainer.appendChild(btn);
      })(i);
    }

    // Bookmark button state
    var bookmarks = safeStorage.get(STORAGE_KEYS.BOOKMARKS, []);
    var bookmarkBtn = $("btn-bookmark");
    if (bookmarks.indexOf(q.id) !== -1) {
      bookmarkBtn.classList.add("active");
    } else {
      bookmarkBtn.classList.remove("active");
    }

    // Prev button state
    $("btn-prev").disabled = state.currentIndex === 0;

    // Next / Submit label
    var isLast = state.currentIndex === state.quizQuestions.length - 1;
    $("btn-next").textContent = isLast ? "✅ Submit" : "अगला →";

    // Skip button hidden on last question (user should submit instead)
    $("btn-skip").classList.toggle("hidden", isLast);
  }

  function goToPrev() {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderQuestion();
    }
  }

  function goToNext() {
    var isLast = state.currentIndex === state.quizQuestions.length - 1;
    if (isLast) {
      submitQuiz();
      return;
    }
    state.currentIndex++;
    renderQuestion();
  }

  function goToSkip() {
    var q = state.quizQuestions[state.currentIndex];
    if (q) {
      delete state.userAnswers[q.id];
    }
    var isLast = state.currentIndex === state.quizQuestions.length - 1;
    if (isLast) {
      submitQuiz();
      return;
    }
    state.currentIndex++;
    renderQuestion();
  }

  function toggleBookmark() {
    var q = state.quizQuestions[state.currentIndex];
    if (!q) return;
    var bookmarks = safeStorage.get(STORAGE_KEYS.BOOKMARKS, []);
    var idx = bookmarks.indexOf(q.id);
    if (idx === -1) {
      bookmarks.push(q.id);
    } else {
      bookmarks.splice(idx, 1);
    }
    safeStorage.set(STORAGE_KEYS.BOOKMARKS, bookmarks);
    renderQuestion();
  }

  function submitQuiz() {
    stopTimer();

    var total = state.quizQuestions.length;
    var correct = 0;
    var attempted = 0;
    var wrongIdsThisRound = [];
    var correctedIdsThisRound = [];

    for (var i = 0; i < state.quizQuestions.length; i++) {
      var q = state.quizQuestions[i];
      var ans = state.userAnswers[q.id];
      if (ans !== undefined && ans !== null) {
        attempted++;
        if (ans === q.answer) {
          correct++;
          correctedIdsThisRound.push(q.id);
        } else {
          wrongIdsThisRound.push(q.id);
        }
      }
    }

    var wrongCount = attempted - correct;
    var percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Update wrong-questions storage
    var wrongStore = safeStorage.get(STORAGE_KEYS.WRONG, []);
    for (var w = 0; w < wrongIdsThisRound.length; w++) {
      if (wrongStore.indexOf(wrongIdsThisRound[w]) === -1) {
        wrongStore.push(wrongIdsThisRound[w]);
      }
    }
    for (var c = 0; c < correctedIdsThisRound.length; c++) {
      var pos = wrongStore.indexOf(correctedIdsThisRound[c]);
      if (pos !== -1) wrongStore.splice(pos, 1);
    }
    safeStorage.set(STORAGE_KEYS.WRONG, wrongStore);

    // Save history entry
    var historyEntry = {
      subject: state.quizSubjectKey === "wrong" ? "wrong" : state.quizSubjectKey,
      correct: correct,
      wrong: wrongCount,
      attempted: attempted,
      total: total,
      percentage: percentage,
      date: new Date().toISOString()
    };
    var history = safeStorage.get(STORAGE_KEYS.HISTORY, []);
    history.unshift(historyEntry);
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    safeStorage.set(STORAGE_KEYS.HISTORY, history);

    renderResult(historyEntry);
    showScreen("screen-result");
  }

  function renderResult(entry) {
    $("result-percentage").textContent = entry.percentage + "%";
    $("result-score").textContent = entry.correct + " / " + entry.total;
    $("result-correct").textContent = String(entry.correct);
    $("result-attempted").textContent = String(entry.attempted);
    $("result-wrong").textContent = String(entry.wrong);
  }

  // ---------------------------------------------------------
  // 6. HISTORY SCREEN
  // ---------------------------------------------------------
  function renderHistoryScreen() {
    var history = safeStorage.get(STORAGE_KEYS.HISTORY, []);
    var listEl = $("history-list");
    var emptyEl = $("history-empty");
    listEl.innerHTML = "";

    if (history.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    listEl.classList.remove("hidden");

    for (var i = 0; i < history.length; i++) {
      var entry = history[i];
      var card = document.createElement("div");
      card.className = "list-card";

      var subjLabel =
        entry.subject === "science"
          ? "विज्ञान"
          : entry.subject === "sst"
          ? "सामाजिक विज्ञान"
          : "गलत प्रश्न अभ्यास";

      var dateStr = "";
      try {
        var d = new Date(entry.date);
        dateStr = d.toLocaleDateString("hi-IN") + " " + d.toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" });
      } catch (e) {
        dateStr = "";
      }

      card.innerHTML =
        '<div class="list-card-top">' +
        '<span class="list-card-subject">' + escapeHtml(subjLabel) + "</span>" +
        '<span class="list-card-date">' + escapeHtml(dateStr) + "</span>" +
        "</div>" +
        '<div class="list-card-pct">' + entry.percentage + "%</div>" +
        '<div class="list-card-stats">सही: ' + entry.correct + " • गलत: " + entry.wrong +
        " • Attempted: " + entry.attempted + " / " + entry.total + "</div>";

      listEl.appendChild(card);
    }
  }

  function clearHistory() {
    safeStorage.set(STORAGE_KEYS.HISTORY, []);
    renderHistoryScreen();
  }

  // ---------------------------------------------------------
  // 7. PROGRESS SCREEN
  // ---------------------------------------------------------
  function renderProgressScreen() {
    var history = safeStorage.get(STORAGE_KEYS.HISTORY, []);
    var best = 0;
    var avg = 0;
    var total = history.length;

    if (total > 0) {
      var sum = 0;
      for (var i = 0; i < history.length; i++) {
        var p = history[i].percentage || 0;
        if (p > best) best = p;
        sum += p;
      }
      avg = Math.round(sum / total);
    }

    $("progress-best").textContent = best + "%";
    $("progress-avg").textContent = avg + "%";
    $("progress-total").textContent = String(total);
  }

  // ---------------------------------------------------------
  // 8. BOOKMARKS SCREEN
  // ---------------------------------------------------------
  function renderBookmarksScreen() {
    var bookmarks = safeStorage.get(STORAGE_KEYS.BOOKMARKS, []);
    var listEl = $("bookmarks-list");
    var emptyEl = $("bookmarks-empty");
    listEl.innerHTML = "";

    var validQuestions = [];
    for (var i = 0; i < bookmarks.length; i++) {
      var q = findQuestionById(bookmarks[i]);
      if (q) validQuestions.push(q);
    }

    if (validQuestions.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.classList.add("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    listEl.classList.remove("hidden");

    for (var j = 0; j < validQuestions.length; j++) {
      var q2 = validQuestions[j];
      var subjLabel = q2.subject === "science" ? "विज्ञान" : "सामाजिक विज्ञान";
      var card = document.createElement("div");
      card.className = "list-card";
      card.innerHTML =
        '<div class="list-card-top">' +
        '<span class="list-card-subject">' + escapeHtml(subjLabel) + "</span>" +
        "</div>" +
        '<div class="bookmark-q-text">' + escapeHtml(q2.question) + "</div>" +
        '<div class="bookmark-chapter">' + escapeHtml(q2.chapter) + "</div>";
      listEl.appendChild(card);
    }
  }

  // ---------------------------------------------------------
  // 9. WRONG PRACTICE SCREEN
  // ---------------------------------------------------------
  function renderWrongScreen() {
    var wrongIds = safeStorage.get(STORAGE_KEYS.WRONG, []);
    var validCount = 0;
    for (var i = 0; i < wrongIds.length; i++) {
      if (findQuestionById(wrongIds[i])) validCount++;
    }

    var emptyEl = $("wrong-empty");
    var summaryEl = $("wrong-summary");

    if (validCount === 0) {
      emptyEl.classList.remove("hidden");
      summaryEl.classList.add("hidden");
    } else {
      emptyEl.classList.add("hidden");
      summaryEl.classList.remove("hidden");
      $("wrong-count-text").textContent = validCount + " गलत प्रश्न उपलब्ध हैं";
    }
  }

  // ---------------------------------------------------------
  // 10. PWA INSTALL
  // ---------------------------------------------------------
  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      var banner = $("install-banner");
      if (banner) banner.classList.remove("hidden");
    });

    var installBtn = $("btn-install");
    if (installBtn) {
      installBtn.addEventListener("click", function () {
        if (!state.deferredInstallPrompt) return;
        state.deferredInstallPrompt.prompt();
        state.deferredInstallPrompt.userChoice.finally(function () {
          state.deferredInstallPrompt = null;
          var banner = $("install-banner");
          if (banner) banner.classList.add("hidden");
        });
      });
    }

    window.addEventListener("appinstalled", function () {
      var banner = $("install-banner");
      if (banner) banner.classList.add("hidden");
      state.deferredInstallPrompt = null;
    });
  }

  // ---------------------------------------------------------
  // 11. SERVICE WORKER REGISTRATION
  // ---------------------------------------------------------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function (err) {
          console.error("Service worker registration failed:", err);
          // App browser mein chalta rahega chahe SW register na ho
        });
      });
    } else {
      console.warn("Service worker is not supported in this browser.");
    }
  }

  // ---------------------------------------------------------
  // 12. ERROR SCREEN
  // ---------------------------------------------------------
  function showFatalError(message) {
    var msgEl = $("error-message");
    if (msgEl) msgEl.textContent = message;
    showScreen("screen-error");
  }

  // ---------------------------------------------------------
  // 13. EVENT WIRING
  // ---------------------------------------------------------
  function wireEvents() {
    $("card-science").addEventListener("click", function () {
      startQuiz("science");
    });
    $("card-sst").addEventListener("click", function () {
      startQuiz("sst");
    });

    $("btn-nav-history").addEventListener("click", function () {
      renderHistoryScreen();
      showScreen("screen-history");
    });
    $("btn-nav-progress").addEventListener("click", function () {
      renderProgressScreen();
      showScreen("screen-progress");
    });
    $("btn-nav-bookmarks").addEventListener("click", function () {
      renderBookmarksScreen();
      showScreen("screen-bookmarks");
    });
    $("btn-nav-wrong").addEventListener("click", function () {
      renderWrongScreen();
      showScreen("screen-wrong");
    });

    $("btn-back-history").addEventListener("click", function () {
      showScreen("screen-home");
    });
    $("btn-back-progress").addEventListener("click", function () {
      showScreen("screen-home");
    });
    $("btn-back-bookmarks").addEventListener("click", function () {
      showScreen("screen-home");
    });
    $("btn-back-wrong").addEventListener("click", function () {
      showScreen("screen-home");
    });

    $("btn-clear-history").addEventListener("click", function () {
      if (confirm("क्या आप वाकई इतिहास साफ करना चाहते हैं?")) {
        clearHistory();
      }
    });

    $("btn-start-wrong").addEventListener("click", function () {
      startWrongPractice();
    });

    $("btn-prev").addEventListener("click", goToPrev);
    $("btn-next").addEventListener("click", goToNext);
    $("btn-skip").addEventListener("click", goToSkip);
    $("btn-bookmark").addEventListener("click", toggleBookmark);

    $("btn-retry").addEventListener("click", function () {
      if (state.quizMode === "wrong") {
        startWrongPractice();
      } else {
        startQuiz(state.quizSubjectKey);
      }
    });
    $("btn-home-from-result").addEventListener("click", function () {
      showScreen("screen-home");
    });

    $("btn-error-reload").addEventListener("click", function () {
      window.location.reload();
    });

    // Warn before leaving mid-quiz (best-effort, ignored on mobile back gestures)
    window.addEventListener("beforeunload", function (e) {
      var quizScreen = $("screen-quiz");
      if (quizScreen && quizScreen.classList.contains("active") && state.timerInterval) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // ---------------------------------------------------------
  // 14. INIT
  // ---------------------------------------------------------
  function init() {
    try {
      var validation = validateQuestionBank();
      if (!validation.ok) {
        showFatalError(validation.message || "Question bank load failed");
        return;
      }

      wireEvents();
      setupInstallPrompt();
      registerServiceWorker();
      showScreen("screen-home");
    } catch (err) {
      console.error("App initialization error:", err);
      showFatalError("App शुरू करने में समस्या आई। कृपया पेज को दोबारा लोड करें।");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
