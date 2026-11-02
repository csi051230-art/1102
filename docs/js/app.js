/* 화면 구성과 상태 관리 */
"use strict";

const App = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = Fmt.esc;

  const state = {
    datasets: [], // datasets.json 목록
    cache: {}, // id -> wrapped data
    varId: null,
    D: null, // 화면에 쓰는 자료 보기 (선택한 모델만)
    base: null, // 불러온 원래 자료 (21개 전체)
    visible: null, // 선택한 모델 (보이는 모델)
    region: null, // 적용한 평가 영역 { lat: [a, b], lon: [a, b] }
    regionInput: null, // 입력칸 글자 (다시 그려도 유지)
    regionOK: true, // 적용한 영역이 JSON의 계산 영역과 같은지
    regionMsg: null,
    userFile: null, // 끌어다 놓은 파일 이름
    tab: "overview",
    sel: [], // 강조한 모델 (누른 순서)
    o: {
      portrait: { period: null, order: "name" },
      taylor: { period: null, stat: null },
      rank: { period: null, basis: "overall", sortKey: "overall_rank", sortDir: 1 },
      meanext: { period: null },
      rankchange: { basis: "overall" },
      bias: { period: null, stat: null, sort: "name" },
    },
  };

  /* ---------- 테마 ---------- */
  function applyTheme() {
    const pref = localStorage.getItem("theme") || "auto";
    const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = pref;
    document.documentElement.dataset.resolvedTheme = dark ? "dark" : "light";
    const b = $("#themeBtn");
    if (b) b.textContent = { auto: "◐ 자동", light: "☀ 밝게", dark: "☾ 어둡게" }[pref];
  }
  function cycleTheme() {
    const order = ["auto", "light", "dark"];
    const cur = localStorage.getItem("theme") || "auto";
    localStorage.setItem("theme", order[(order.indexOf(cur) + 1) % 3]);
    applyTheme();
    render();
  }

  /* ---------- 자료 불러오기 ---------- */
  async function init() {
    applyTheme();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      applyTheme();
      render();
    });
    buildTabs();
    bindGlobal();
    state.datasets = await Data.loadIndex();
    const sel = $("#varSelect");
    sel.innerHTML = state.datasets.map((d) => `<option value="${esc(d.id)}">${esc(d.id)}</option>`).join("");
    const fromHash = new URLSearchParams(location.hash.slice(1));
    state.tab = CONFIG.tabs.some((t) => t.id === fromHash.get("tab")) ? fromHash.get("tab") : "overview";
    await selectVariable(state.datasets[0].id);
  }

  async function selectVariable(id) {
    const ds = state.datasets.find((d) => d.id === id);
    if (!ds) return;
    try {
      if (!state.cache[id]) {
        setStatus("자료를 불러오는 중…");
        const raw = await Data.fetchJSON(ds.file);
        const errs = Data.validate(raw);
        if (errs.length) throw new Error(errs.join(" "));
        state.cache[id] = Data.wrap(raw, ds.file);
      }
      state.varId = id;
      state.userFile = null;
      setData(state.cache[id]);
      $("#varSelect").value = id;
      // 변수 메뉴에 JSON의 변수 이름을 붙인다
      const opt = [...$("#varSelect").options].find((o) => o.value === id);
      if (opt) opt.textContent = `${state.cache[id].varName} (${state.cache[id].varLong})`;
    } catch (e) {
      console.error(e);
      const fileHint =
        location.protocol === "file:"
          ? " 파일을 직접 열면 브라우저가 JSON 읽기를 막습니다. view.bat으로 띄우거나 JSON 파일을 화면에 끌어다 놓으세요."
          : "";
      setStatus(`자료를 불러오지 못했습니다: ${e.message}.${fileHint}`, true);
    }
  }

  function loadUserFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const raw = JSON.parse(fr.result);
        const errs = Data.validate(raw);
        if (errs.length) throw new Error(errs.join(" "));
        state.userFile = file.name;
        setData(Data.wrap(raw, file.name));
      } catch (e) {
        setStatus(`"${file.name}"을(를) 읽지 못했습니다: ${e.message}`, true);
      }
    };
    fr.readAsText(file, "utf-8");
  }

  function setData(D) {
    state.base = D;
    // 선택 모델: 새 자료에 있는 것만 남기고, 하나도 없으면 전체 선택
    const keep = (state.visible || []).filter((m) => D.modelIds.includes(m));
    state.visible = keep.length ? keep : D.modelIds.slice();
    // 평가 영역: 새 자료의 계산 영역으로 시작
    resetRegion(false);
    state.D = Subset.view(D, state.visible);
    state.sel = state.sel.filter((m) => state.visible.includes(m));
    const P0 = D.periods[0],
      S0 = D.stats[0];
    const fixP = (o, list = D.periods) => {
      if (!list.includes(o.period)) o.period = list[0] ?? P0;
    };
    const fixS = (o) => {
      if (!D.stats.includes(o.stat)) o.stat = S0;
    };
    fixP(state.o.portrait);
    const tp = D.periods.filter((p) => CONFIG.taylorPeriods.includes(p));
    fixP(state.o.taylor, tp.length ? tp : D.periods);
    fixS(state.o.taylor);
    fixP(state.o.rank);
    fixP(state.o.meanext);
    fixP(state.o.bias);
    fixS(state.o.bias);
    const src = state.userFile ? `끌어다 놓은 파일: ${state.userFile}` : `기본 자료: ${D.sourceLabel}`;
    setStatus(`${src} · 모델 ${D.models.length}개`);
    $("#resetData").hidden = !state.userFile;
    fillModelSelect();
    buildPanels();
    showTab(state.tab, true);
  }

  /* ---------- 평가 영역 ---------- */
  // 계산 영역: config.js의 computedRegion이 있으면 그것을, 없으면 JSON meta.region을 쓴다
  function computedRegion(D = state.base) {
    const r = CONFIG.computedRegion || D?.meta?.region || {};
    return Array.isArray(r.lat) && Array.isArray(r.lon) ? { lat: [r.lat[0], r.lat[1]], lon: [r.lon[0], r.lon[1]] } : null;
  }
  const regionText = (g) => `위도 ${g.lat[0]} ~ ${g.lat[1]} °N, 경도 ${g.lon[0]} ~ ${g.lon[1]} °E`;
  // 네 값이 모두 숫자로 정확히 같을 때만 계산된 영역
  const sameRegion = (a, b) => !!a && !!b && a.lat[0] === b.lat[0] && a.lat[1] === b.lat[1] && a.lon[0] === b.lon[0] && a.lon[1] === b.lon[1];

  function resetRegion(redraw = true) {
    const c = computedRegion();
    state.region = c;
    state.regionInput = c ? { latA: String(c.lat[0]), latB: String(c.lat[1]), lonA: String(c.lon[0]), lonB: String(c.lon[1]) } : { latA: "", latB: "", lonA: "", lonB: "" };
    state.regionOK = !!c;
    state.regionMsg = c ? { kind: "ok", text: "✓ 계산된 영역입니다." } : { kind: "bad", text: "JSON에 계산 영역(meta.region)이 없습니다." };
    if (redraw) render();
  }

  function applyRegion() {
    const ids = ["latA", "latB", "lonA", "lonB"];
    const txt = Object.fromEntries(ids.map((k) => [k, ($(`#rg-${k}`)?.value ?? "").trim()]));
    state.regionInput = txt;
    const n = Object.fromEntries(ids.map((k) => [k, txt[k] === "" ? NaN : Number(txt[k])]));
    let err = "";
    if (ids.some((k) => !Number.isFinite(n[k]))) err = "네 칸 모두 숫자를 입력하세요.";
    else if (n.latA >= n.latB || n.lonA >= n.lonB) err = "시작값은 끝값보다 작아야 합니다.";
    else if (n.latA < -90 || n.latB > 90) err = "위도는 −90 ~ 90 사이여야 합니다.";
    else if (n.lonA < -180 || n.lonB > 360) err = "경도는 −180 ~ 360 사이여야 합니다.";
    if (err) {
      state.regionMsg = { kind: "err", text: `적용하지 않았습니다: ${err}` };
      render();
      return;
    }
    state.region = { lat: [n.latA, n.latB], lon: [n.lonA, n.lonB] };
    state.regionOK = sameRegion(state.region, computedRegion());
    state.regionMsg = state.regionOK
      ? { kind: "ok", text: "✓ 계산된 영역입니다." }
      : { kind: "bad", text: "✕ 이 영역은 아직 계산되지 않았습니다. 다른 화면에는 '자료 없음'이 표시됩니다." };
    render();
  }

  /* ---------- 모델 선택 (보이는 모델) ---------- */
  function setVisible(ids) {
    const all = state.base.modelIds;
    state.visible = all.filter((m) => ids.includes(m));
    state.D = Subset.view(state.base, state.visible);
    state.sel = state.sel.filter((m) => state.visible.includes(m)); // 숨긴 모델은 강조에서도 뺀다
    render();
  }

  function setStatus(msg, err = false) {
    const el = $("#dataStatus");
    el.textContent = msg;
    el.classList.toggle("error", err);
  }

  /* ---------- 공통 UI ---------- */
  function buildTabs() {
    $("#tabs").innerHTML = CONFIG.tabs
      .map((t) => `<button role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-${t.id}">${esc(t.label)}</button>`)
      .join("");
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]");
      if (b) showTab(b.dataset.tab);
    });
  }

  function showTab(id, force) {
    if (!state.D) return;
    state.tab = id;
    document.querySelectorAll("#tabs button").forEach((b) => {
      const on = b.dataset.tab === id;
      b.setAttribute("aria-selected", on);
      if (on) {
        // 탭 줄만 가로로 옮긴다 (페이지 세로 위치는 그대로)
        const bar = b.parentElement;
        if (b.offsetLeft < bar.scrollLeft || b.offsetLeft + b.offsetWidth > bar.scrollLeft + bar.clientWidth)
          bar.scrollLeft = b.offsetLeft - 16;
      }
    });
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `panel-${id}`));
    history.replaceState(null, "", `#tab=${id}`);
    render();
  }

  // 강조 상태를 그림 함수에 넘기는 형태. 강조 색 = 모델 고유색 (모든 그림에서 같다).
  function selection() {
    const list = state.sel.slice();
    const colors = Charts.modelColors(state.D);
    return { list, size: list.length, has: (m) => list.includes(m), color: (m) => (list.includes(m) ? colors[m] : null) };
  }
  const isSel = (m) => state.sel.includes(m);
  // 표 행·목록 공통: 모델 색 점, 강조 표시
  const colorOf = (m) => Charts.modelColors(state.D)[m];
  const dot = (m) => `<span class="dot" style="background:${colorOf(m)}"></span>`;
  const rowAttr = (m) => `data-model="${esc(m)}" tabindex="0" class="${isSel(m) ? "sel" : ""}" style="--mark:${colorOf(m)}"`;

  function fillModelSelect() {
    const s = $("#modelSelect");
    s.innerHTML =
      `<option value="">선택 안 함</option>` +
      state.D.modelIds.map((m) => `<option value="${esc(m)}">${isSel(m) ? "✓ " : ""}${esc(m)}</option>`).join("");
    s.value = "";
  }

  function updateSelUI() {
    const S = selection();
    $("#selCount").textContent = S.size;
    $("#selClear").hidden = !S.size;
    $("#selClear2").hidden = !S.size;
    $("#modelRail").innerHTML = state.D.modelIds
      .map(
        (m) =>
          `<button type="button" role="option" data-model="${esc(m)}" aria-selected="${isSel(m)}" style="--mark:${colorOf(m)}">${dot(m)}<span>${esc(m)}</span></button>`
      )
      .join("");
    $("#selList").innerHTML = S.list
      .map((m) => `<button type="button" class="chip" data-model="${esc(m)}" title="강조 해제">${dot(m)}${esc(m)} ✕</button>`)
      .join("");
    fillModelSelect();
  }

  function toggleModel(m) {
    state.sel = isSel(m) ? state.sel.filter((x) => x !== m) : [...state.sel, m];
    updateSelUI();
    render();
  }

  function bindGlobal() {
    $("#themeBtn").addEventListener("click", cycleTheme);
    $("#varSelect").addEventListener("change", (e) => selectVariable(e.target.value));
    $("#modelSelect").addEventListener("change", (e) => {
      if (e.target.value) toggleModel(e.target.value);
    });
    const clearSel = () => {
      state.sel = [];
      updateSelUI();
      render();
    };
    $("#selClear").addEventListener("click", clearSel);
    $("#selClear2").addEventListener("click", clearSel);
    $("#fileInput").addEventListener("change", (e) => {
      if (e.target.files[0]) loadUserFile(e.target.files[0]);
      e.target.value = "";
    });
    $("#resetData").addEventListener("click", () => {
      const id = state.varId || state.datasets[0].id;
      state.userFile = null;
      if (state.cache[id]) setData(state.cache[id]);
      else selectVariable(id);
    });
    // 끌어다 놓기: 파일은 브라우저 안에서만 읽는다
    let depth = 0;
    const ov = $("#dropOverlay");
    window.addEventListener("dragenter", (e) => {
      if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
      depth++;
      ov.hidden = false;
    });
    window.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) ov.hidden = true;
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      ov.hidden = true;
      const f = e.dataTransfer?.files?.[0];
      if (f) loadUserFile(f);
    });
    // 표의 모델 행 클릭 → 강조
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-model]");
      if (el) toggleModel(el.dataset.model);
    });
    document.addEventListener("keydown", (e) => {
      const tr = e.target.closest?.("tr[data-model]");
      if (tr && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        toggleModel(tr.dataset.model);
      }
    });
    // 개요: 평가 영역과 모델 선택
    $("#panels").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "region-apply") applyRegion();
      if (act === "region-reset") resetRegion();
      if (act === "pick-all") setVisible(state.base.modelIds);
      if (act === "pick-none") setVisible([]);
    });
    $("#panels").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches?.("input[id^='rg-']")) applyRegion();
    });
    $("#panels").addEventListener("change", (e) => {
      const c = e.target.closest("input[data-pick]");
      if (!c) return;
      const ids = [...$("#panels").querySelectorAll("input[data-pick]:checked")].map((x) => x.dataset.pick);
      setVisible(ids);
    });
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(render, 250);
    });
  }

  /* ---------- 패널 뼈대 ---------- */
  const opts = (list, cur, lab = (x) => x) => list.map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(lab(v))}</option>`).join("");
  const ctl = (label, html) => `<label class="ctl"><span>${label}</span>${html}</label>`;
  // 버튼 묶음(세그먼트): 기간·기준 고르기. 바뀐 값은 data-o로 state.o에 들어간다.
  const seg = (key, list, cur, lab = (x) => x) =>
    `<div class="ctl"><span>${key.endsWith("basis") ? (key.startsWith("rank.") ? "기준" : "순위 기준") : "기간"}</span><div class="seg" role="radiogroup">${list
      .map((v) => `<label class="seg-opt"><input type="radio" name="${key}" value="${esc(v)}" data-o="${key}"${v === cur ? " checked" : ""}>${esc(lab(v))}</label>`)
      .join("")}</div></div>`;
  const corners = `<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>`;
  const fig = (id, inner = "", before = "") => `<figure class="blueprint">${corners}${before}<div class="chart" id="${id}"></div>${inner}</figure>`;
  const basisLabel = (k) => CONFIG.rankBases[k].label;

  function buildPanels() {
    const D = state.D;
    const o = state.o;
    const tp = D.periods.filter((p) => CONFIG.taylorPeriods.includes(p));
    const panels = {
      overview: { controls: "", body: `<div id="ov-body" class="stack"></div>` },
      portrait: {
        controls: `
          ${seg("portrait.period", D.periods, o.portrait.period)}
          ${ctl("모델 순서", `<select data-o="portrait.order">${opts(["name", "rank"], o.portrait.order, (v) => (v === "name" ? "자료 순서 (이름)" : "선택 기간 종합 순위"))}</select>`)}`,
        body: `
        <div class="layout-2">
          ${fig("ch-portrait", "", `<div class="fig-title" id="portrait-title"></div>`)}
          <aside>
            <div class="card">
              <div class="card-title">읽는 법</div>
              <p><b>NRMSE</b> = RMSE ÷ 표준편차 → 0에 가까울수록 ERA5와 가까움.</p>
              <p class="muted-p">색이 진할수록 NRMSE가 큽니다(나쁨). 칸 안 숫자는 소수 둘째 자리이며, 마우스를 올리면 JSON 값이 그대로 보입니다.</p>
            </div>
            <div class="card" id="portrait-ref"></div>
          </aside>
        </div>`,
      },
      taylor: {
        controls: `
          ${tp.length ? seg("taylor.period", tp, o.taylor.period) : `<span class="muted">그릴 기간 없음</span>`}
          ${ctl("통계량", `<select data-o="taylor.stat">${opts(D.stats, o.taylor.stat, Fmt.stat)}</select>`)}`,
        body: `
        <div id="taylor-count" class="countline"></div>
        <div class="layout-2">
          ${fig("ch-taylor", `<div id="taylor-legend" class="model-legend"></div>`)}
          <aside>
            <div class="card">
              <div class="card-title">읽는 법</div>
              <p>모델 점이 ★ ERA5 기준점에 가까울수록 재현 성능이 좋습니다.</p>
              <ul>
                <li><b>원점에서의 거리 = 표준편차비</b><br>모델 ÷ ERA5. 1에 가까울수록 공간 변동 크기가 ERA5와 유사합니다.</li>
                <li><b>각도 = 공간 상관계수</b><br>면적가중 공간 상관. 1에 가까울수록 공간 패턴이 ERA5와 유사합니다.</li>
                <li><b>점선 호 = 정규화된 centred RMSE</b><br>평균 편의를 제거한 RMSE를 ERA5 표준편차로 나눈 값. 0에 가까울수록 오차가 작습니다.</li>
              </ul>
            </div>
            <div id="taylor-hidden"></div>
          </aside>
        </div>
        <details class="card"><summary>값 표 보기</summary><div id="taylor-table"></div></details>`,
      },
      rank: {
        controls: `
          ${seg("rank.period", D.periods, o.rank.period)}
          ${seg("rank.basis", Object.keys(CONFIG.rankBases), o.rank.basis, basisLabel)}`,
        body: `
        <div class="layout-2">
          ${fig("ch-rank")}
          <aside><div class="card" id="rank-note"></div></aside>
        </div>
        <div class="card"><div class="card-title">순위 표 <span class="muted">(머리글을 누르면 정렬)</span></div><div id="rank-table"></div></div>`,
      },
      meanext: {
        controls: seg("meanext.period", D.periods, o.meanext.period),
        body: `
        <div class="layout-2">
          ${fig("ch-meanext")}
          <aside>
            <div class="blueprint statbox">${corners}<div id="meanext-stat"></div></div>
            <div class="card">
              <div class="card-title">읽는 법</div>
              <ul>
                <li><b>가로축</b>: 평균장(mean) NRMSE</li>
                <li><b>세로축</b>: 극값장 NRMSE — p5·p1·min NRMSE의 산술평균</li>
                <li><b>점의 위치</b>: 왼쪽 아래에 가까울수록 두 성능이 모두 우수</li>
                <li><b>점선(1:1)</b>: 두 NRMSE가 같은 지점. 선 위는 극값장 오차가, 선 아래는 평균장 오차가 더 큼</li>
              </ul>
              <div class="card-title" style="margin-top:8px">Spearman ρ · 성능 순위의 연관성</div>
              <ul>
                <li><b>1에 가까울수록</b>: 평균장 성능이 좋은 모델은 극값장 성능도 좋은 경향</li>
                <li><b>0에 가까울수록</b>: 평균장 성능만으로 극값장 성능을 판단하기 어려움</li>
                <li><b>−1에 가까울수록</b>: 평균장 성능이 좋은 모델은 극값장 성능이 낮은 경향</li>
              </ul>
            </div>
          </aside>
        </div>`,
      },
      rankchange: {
        controls: seg("rankchange.basis", Object.keys(CONFIG.rankBases), o.rankchange.basis, basisLabel),
        body: `
        <div class="layout-2">
          ${fig("ch-rankchange")}
          <aside class="card">
            <div class="card-title">읽는 법</div>
            <p>각 선이 한 모델입니다. 위로 갈수록 순위가 높습니다(1 = 최상). 모델을 고르면 그 선이 강조되고 순위가 표시됩니다. 여러 모델을 함께 고를 수 있습니다.</p>
            <p class="muted-p">기간마다 NRMSE 분모가 달라 값이 아니라 <b>순위</b>만 비교합니다.</p>
            <div id="rankchange-stat"></div>
          </aside>
        </div>`,
      },
      bias: {
        controls: `
          ${seg("bias.period", D.periods, o.bias.period)}
          ${ctl("통계량", `<select data-o="bias.stat">${opts(D.stats, o.bias.stat, Fmt.stat)}</select>`)}
          ${ctl("정렬", `<select data-o="bias.sort">${opts(["name", "value"], o.bias.sort, (v) => (v === "name" ? "자료 순서" : "편의 크기"))}</select>`)}`,
        body: `
        <div id="bias-count" class="countline"></div>
        <div class="layout-2">
          ${fig("ch-bias")}
          <aside class="card">
            <div class="card-title">읽는 법</div>
            <p><b>편의</b> = 면적가중 평균(모델 − ERA5). 양수(<span style="color:var(--div-pos);font-weight:600">주황</span>)는 모델 기압이 높고, 음수(<span style="color:var(--div-neg);font-weight:600">파랑</span>)는 낮습니다. 막대 끝 숫자는 소수 둘째 자리이며, 마우스를 올리면 JSON 값과 RMSE가 보입니다.</p>
            <p class="muted-p">편의 값이 JSON에 없는 모델은 막대 없이 <b>자료 없음</b>으로 표시합니다. 0이 아닙니다.</p>
            <div id="bias-med"></div>
          </aside>
        </div>`,
      },
    };
    $("#panels").innerHTML = CONFIG.tabs
      .map(
        (t) => `<section class="panel" id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" hidden>
          <div class="panel-head"><h2>${esc(t.label)}</h2><div class="controls">${panels[t.id].controls}</div></div>
          <div class="na-block" hidden></div>
          <div class="pbody"><div class="recalc" hidden></div>${panels[t.id].body}</div></section>`
      )
      .join("");
    $("#panels").querySelectorAll("[data-o]").forEach((el) =>
      el.addEventListener("change", () => {
        const [tab, key] = el.dataset.o.split(".");
        state.o[tab][key] = el.type === "checkbox" ? el.checked : el.value;
        render();
      })
    );
  }

  /* ---------- 그리기 ---------- */
  function render() {
    const D = state.D;
    if (!D) return;
    updateSelUI();
    const fn = { overview, portrait, taylor, rank, meanext, rankchange, bias }[state.tab];
    const panel = $(`#panel-${state.tab}`);
    if (panel && state.tab !== "overview") {
      const na = !state.regionOK
        ? "자료 없음: 이 영역은 아직 계산되지 않았습니다"
        : !D.modelIds.length
          ? "자료 없음: 선택한 모델이 없습니다 (개요에서 모델을 고르세요)"
          : "";
      panel.querySelector(".na-block").hidden = !na;
      panel.querySelector(".na-block").textContent = na;
      panel.querySelector(".pbody").hidden = !!na;
      if (na) return;
    }
    try {
      fn();
      recalcNote(panel);
    } catch (e) {
      console.error(e);
      setStatus(`그림을 그리는 중 오류: ${e.message}`, true);
    }
  }

  // 다시 계산한 값이 화면에 쓰이면 안내를 띄운다
  function recalcNote(panel) {
    const el = panel?.querySelector(".recalc");
    if (!el) return;
    const D = state.D,
      n = D.modelIds.length;
    let what = "";
    if (D.subset) {
      const t = state.tab,
        o = state.o;
      if (t === "rank") what = "순위";
      if (t === "rankchange") what = "순위와 Spearman ρ·p";
      if (t === "meanext") what = "Spearman ρ·p";
      if (t === "portrait" && o.portrait.order === "rank") what = "순위(정렬 기준)";
    }
    el.hidden = !what;
    if (!what) return;
    const few = [];
    if (/순위/.test(what) && n < Subset.MIN_RANK) few.push(`순위는 모델 ${Subset.MIN_RANK}개 이상`);
    if (/Spearman/.test(what) && n < Subset.MIN_SPEARMAN) few.push(`Spearman은 모델 ${Subset.MIN_SPEARMAN}개 이상`);
    el.innerHTML = `선택한 ${n}개 모델 기준으로 다시 계산한 ${esc(what)}입니다. NRMSE 등 원래 값은 JSON 그대로입니다.${few.length ? ` <b>${few.join(", ")}이 필요해 '자료 없음'으로 표시합니다.</b>` : ""}`;
  }

  function regionCard() {
    const c = computedRegion(),
      v = state.regionInput,
      msg = state.regionMsg || { kind: "ok", text: "" };
    const inp = (k, label) =>
      `<input id="rg-${k}" class="input num-in" type="text" inputmode="decimal" autocomplete="off" aria-label="${label}" value="${esc(v[k])}">`;
    return `<div class="card region-card">
      <div class="card-title">평가 영역</div>
      <div class="rrow"><span class="rlab">위도</span>${inp("latA", "위도 시작")}<span>~</span>${inp("latB", "위도 끝")}<span class="unit">°N</span></div>
      <div class="rrow"><span class="rlab">경도</span>${inp("lonA", "경도 시작")}<span>~</span>${inp("lonB", "경도 끝")}<span class="unit">°E</span></div>
      <div class="ractions">
        <button type="button" class="btn btn-primary" data-act="region-apply">적용</button>
        <button type="button" class="btn" data-act="region-reset">현재 계산 영역으로 되돌리기</button>
      </div>
      <p class="muted-p small">현재 계산 영역: ${c ? esc(regionText(c)) : "JSON에 없음"}. 네 값이 이 값과 숫자로 정확히 같을 때만 계산된 영역으로 봅니다.</p>
      <p class="region-msg ${msg.kind}" aria-live="polite">${esc(msg.text)}</p>
    </div>`;
  }

  function pickCard() {
    const B = state.base,
      all = B.modelIds,
      on = new Set(state.visible);
    const famOf = (m) => {
      const id = B.model(m)?.institution_id || m;
      return CONFIG.familyAlias[id] || id;
    };
    const groups = [];
    all.forEach((m) => {
      const f = famOf(m);
      let g = groups.find((x) => x.f === f);
      if (!g) groups.push((g = { f, ms: [] }));
      g.ms.push(m);
    });
    const colors = Charts.modelColors(B);
    return `<div class="card pick-card">
      <div class="pick-head">
        <div class="card-title">모델 선택 <span class="muted">${all.length}개 중 ${on.size}개</span></div>
        <div class="pick-btns">
          <button type="button" class="btn small" data-act="pick-all">전체 선택</button>
          <button type="button" class="btn small" data-act="pick-none">전체 해제</button>
        </div>
      </div>
      <p class="muted-p small">선택한 모델만 모든 화면에 나옵니다. 왼쪽 "모델 강조"는 보이는 모델 중에서 눈에 띄게 할 모델을 고르는 것으로, 선택과는 따로 동작합니다.</p>
      <div class="pick-groups">${groups
        .map(
          (g) => `<div class="pick-group"><span class="pick-fam">${esc(g.f)}</span><div class="pick-items">${g.ms
            .map(
              (m) =>
                `<label class="pick"><input type="checkbox" data-pick="${esc(m)}"${on.has(m) ? " checked" : ""}><span class="dot" style="background:${colors[m]}"></span>${esc(m)}</label>`
            )
            .join("")}</div></div>`
        )
        .join("")}</div>
    </div>`;
  }

  function overview() {
    const D = state.D,
      M = D.meta;
    const r = M.region || {};
    const dl = (rows) => `<dl class="meta">${rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    const lonTxt = Array.isArray(r.lon) ? `${r.lon[0]}–${r.lon[1]}°E` : "";
    const latTxt = Array.isArray(r.lat) ? `${r.lat[0]}–${r.lat[1]}°N` : "";
    // 다시 그릴 때 접어 둔 카드는 접힌 채로 둔다
    const wasOpen = (k) => {
      const el = document.querySelector(`#ov-body details[data-k="${k}"]`);
      return el ? el.open : true;
    };
    const openSet = wasOpen("settings"),
      openGloss = wasOpen("glossary");
    const kv = (obj) => (obj ? Object.entries(obj).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>") : "");
    $("#ov-body").innerHTML = `
      <div class="ov-grid">
        <div class="card lead-card">
          <p class="lead">CMIP6 전지구 기후모델(GCM) ${state.base.models.length}개가 북서태평양 ${esc(CONFIG.varNames[D.varName] ?? D.varLong)}(${esc(D.varName)})을 얼마나 잘 재현하는지 ERA5 재분석 자료와 비교해 평가했습니다.</p>
          <p class="lead2">평가 기간은 1979–2014년이며, 기간과 통계량에 따라 공간 오차(NRMSE), 상관계수, 표준편차비, 편의와 모델 순위를 확인할 수 있습니다.</p>
          <div class="facts">
            <div><span>평가 영역</span><strong>${state.region ? esc(`${state.region.lat[0]}~${state.region.lat[1]}°N, ${state.region.lon[0]}~${state.region.lon[1]}°E`) : "자료 없음"}</strong></div>
            <div><span>모델</span><strong>${D.models.length === state.base.models.length ? `${D.models.length}개` : `${D.models.length}개 선택 (전체 ${state.base.models.length}개)`}</strong></div>
            <div><span>기준 자료</span><strong>${esc(CONFIG.overview.reference ?? M.reference)}</strong></div>
          </div>
        </div>
        <figure class="blueprint">${corners}<div class="chart" id="ch-map"></div><figcaption>상자는 적용한 평가 영역입니다${state.regionOK ? "" : " (아직 계산되지 않은 영역)"}. 해안선: Natural Earth 1:50m.</figcaption></figure>
      </div>
      <div class="ov-grid">${regionCard()}${pickCard()}</div>
      <div class="ov-grid">
        <details class="card plain" data-k="settings"${openSet ? " open" : ""}><summary>분석 설정</summary>
        ${dl([
          ["제목", esc(M.title)],
          ["변수", esc(`${D.varName} [${D.units}]`)],
          ["기준 자료", esc(CONFIG.overview.reference ?? M.reference)],
          ["실험", esc(M.experiment)],
          ["기간", esc(M.period)],
          ["영역", (() => { const c = computedRegion(); return c ? esc(regionText(c)) : esc(`${lonTxt}, ${latTxt}`); })()],
          ["공통 격자", esc(CONFIG.overview.commonGrid ?? r.common_grid)],
          ["가중치", esc(r.weights)],
          ["품질 관리", esc(M.qc)],
          ["모델 선정", esc(M.model_selection)],
          ["구분 기간", kv(M.periods)],
          ["통계량", kv(M.stats)],
          ["지표", kv(M.metrics)],
          ["순위", kv(M.ranking)],
          ["주의", Array.isArray(M.notes) ? M.notes.map(esc).join("<br>") : ""],
        ])}
        </details>
        <details class="card plain" data-k="glossary"${openGloss ? " open" : ""}><summary>지표 읽는 법</summary>
          <ul class="glossary">
            <li><b>NRMSE</b><span> — RMSE를 ERA5 공간 표준편차로 나눈 값. 작을수록 좋음. 기간·통계량마다 분모가 다르므로 다른 기간끼리 값을 비교하지 않습니다.</span></li>
            <li><b>상관계수</b><span> — 면적가중 공간 상관. 1에 가까울수록 공간 분포 모양이 ERA5와 같습니다.</span></li>
            <li><b>표준편차비</b><span> — 모델 공간 표준편차 ÷ ERA5 공간 표준편차. 1이면 공간 변동 크기가 같습니다.</span></li>
            <li><b>centred RMSE</b><span> — 영역 평균 차이(편의)를 뺀 뒤의 RMSE. 공간 패턴 오차만 봅니다.</span></li>
            <li><b>편의</b><span> — 면적가중 평균(모델 − ERA5) [${esc(D.units)}].</span></li>
            <li><b>통계량</b><span> — 각 격자점의 일자료로 구한 평균(mean), 5·1 백분위(p5, p1), 최솟값(min). 극값장 = p5·p1·min.</span></li>
          </ul>
        </details>
      </div>
      <div class="card">
        <div class="card-title">모델 정보 <span class="muted">(행을 누르면 강조)</span></div>
        <div class="table-scroll">${modelTable()}</div>
      </div>`;
    Charts.regionMap($("#ch-map"), D, state.region);
  }

  function modelTable() {
    const D = state.D;
    const rows = D.models
      .map((m) => {
        const r = m.resolution_deg || {},
          g = m.grid_points || {};
        return `<tr ${rowAttr(m.id)}>
          <td><span class="model-cell">${dot(m.id)}${esc(m.id)}</span></td>
          <td title="${esc(m.institution)}">${esc(m.institution_id)}<div class="small muted">${esc(m.institution)}</div></td>
          <td>${esc(m.country)}</td>
          <td class="num">${g.lon ?? Fmt.NA} × ${g.lat ?? Fmt.NA}</td>
          <td class="num">${r.lon ?? Fmt.NA}° × ${r.lat ?? Fmt.NA}°</td>
          <td>${esc(m.nominal_resolution ?? Fmt.NA)}</td>
          <td>${esc(m.grid_label ?? "")}</td>
          <td>${esc(m.calendar ?? Fmt.NA)}</td>
          <td>${esc(m.variant_label ?? "")}</td>
        </tr>`;
      })
      .join("");
    return `<table class="data" style="min-width:880px"><thead><tr><th>모델</th><th>기관</th><th>국가</th><th class="num">격자 수 (경도×위도)</th><th class="num">격자 간격 (경도×위도)</th><th>공칭 해상도</th><th>격자</th><th>달력</th><th>변이</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function portrait() {
    const D = state.D,
      o = state.o.portrait;
    let order = D.modelIds.slice();
    if (o.order === "rank") order.sort((a, b) => (D.rank(o.period, a, "overall_rank") ?? 1e9) - (D.rank(o.period, b, "overall_rank") ?? 1e9));
    Charts.portrait($("#ch-portrait"), D, selection(), { period: o.period, order }, toggleModel);
    $("#portrait-title").textContent = `NRMSE · ${Fmt.period(o.period)}`;
    const rs = D.stats.map((s) => `<div><span>${esc(Fmt.stat(s))}</span><strong>${Fmt.raw(D.refSd(o.period, s))}</strong></div>`).join("");
    $("#portrait-ref").innerHTML = `<div class="card-title">ERA5 공간 표준편차 <small class="muted">NRMSE 분모, ${esc(D.units)}</small></div><div class="ref-sd">${rs}</div>`;
  }

  function taylor() {
    const D = state.D,
      o = state.o.taylor;
    const tp = D.periods.filter((p) => CONFIG.taylorPeriods.includes(p));
    if (!tp.length) {
      $("#ch-taylor").innerHTML = `<p class="empty">설정된 Taylor 기간이 이 자료에 없습니다.</p>`;
      return;
    }
    const pts = Charts.taylor($("#ch-taylor"), D, selection(), o, toggleModel);
    const total = D.modelIds.length;
    const missing = D.modelIds.filter((m) => !pts.some((q) => q.m === m));
    $("#taylor-count").innerHTML =
      `<b>${D.subset ? "선택한 " : ""}${total}개 중 ${pts.length}개 표시</b>${
        pts.some((q) => q.src === "digitized_hidden") ? ` <span class="badge">이 중 ${pts.filter((q) => q.src === "digitized_hidden").length}개는 실제 위치 아님</span>` : ""
      } · ${esc(Fmt.period(o.period))} · ${esc(Fmt.stat(o.stat))}` +
      (missing.length ? `<br><span class="muted">자료 없음: ${missing.map(esc).join(", ")}</span>` : "");
    const colors = Charts.modelColors(D);
    $("#taylor-legend").classList.toggle("has-sel", state.sel.length > 0);
    $("#taylor-legend").innerHTML = D.modelIds
      .map((m) => {
        const has = pts.some((q) => q.m === m);
        return `<button type="button" data-model="${esc(m)}" class="${isSel(m) ? "sel" : ""}${has ? "" : " nodata"}" title="${has ? "" : "자료 없음"}">
          <span class="dot" style="background:${colors[m]}"></span>${esc(m)}</button>`;
      })
      .join("");
    const hidden = pts.filter((q) => q.src === "digitized_hidden");
    $("#taylor-hidden").innerHTML = hidden.length
      ? `<div class="warn-box"><b>⚠ 실제 위치가 아닌 점</b>${hidden
          .map(
            (q) =>
              `${esc(q.m)}: 그림에서 다른 마커에 완전히 가려져, 그 위를 덮은 마커의 위치를 대신 사용했습니다.${
                q.twins.length ? ` 상관계수·표준편차비가 ${q.twins.map(esc).join(", ")}과(와) 같습니다.` : ""
              }`
          )
          .map((t) => `<span>${t}</span>`)
          .join("")}</div>`
      : "";
    const rows = D.modelIds
      .map((m) => {
        const q = pts.find((x) => x.m === m);
        const ob = D.metricObj(o.period, o.stat, m) || {};
        return `<tr ${rowAttr(m)}><td><span class="model-cell">${dot(m)}${esc(m)}</span></td>
          <td class="num">${Fmt.raw(Data.num(ob.corr))}</td><td class="num">${Fmt.raw(Data.num(ob.sd_ratio))}</td>
          <td class="num">${q && q.crmse !== null ? (q.crmseComputed ? q.crmse.toFixed(3) + " (계산값)" : String(q.crmse)) : Fmt.NA}</td>
          <td class="num">${Fmt.raw(Data.num(ob.sd_mod))}</td></tr>`;
      })
      .join("");
    $("#taylor-table").innerHTML = `<div class="table-scroll"><table class="data"><thead><tr><th>모델</th><th class="num">상관계수</th><th class="num">표준편차비</th><th class="num">centred RMSE [${esc(D.units)}]</th><th class="num">모델 표준편차 [${esc(D.units)}]</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="table-note">ERA5 공간 표준편차 = ${Fmt.raw(D.refSd(o.period, o.stat))} ${esc(D.units)}</p>`;
  }

  function rank() {
    const D = state.D,
      o = state.o.rank;
    Charts.rankBars($("#ch-rank"), D, selection(), o, toggleModel);
    const R = D.meta.ranking || {};
    $("#rank-note").innerHTML = `<div class="card-title">순위 기준</div>
      <ul>
        <li><b>평균장</b>: mean NRMSE 순위. <span class="muted">${esc(R.mean ?? "")}</span></li>
        <li><b>극값장</b>: p5·p1·min NRMSE 산술평균의 순위. <span class="muted">${esc(R.ext ?? "")}</span></li>
        <li><b>종합</b>: (평균장 NRMSE + 극값장 NRMSE) ÷ 2의 순위. <span class="muted">${esc(R.overall ?? "")}</span></li>
        <li><b>순위합</b>: 평균장 순위 + 극값장 순위의 순위(민감도 확인용). 막대 길이는 두 순위의 합으로, JSON 순위에서 계산한 값입니다.</li>
      </ul>
      <p class="muted">${esc(R.order ?? "")}</p>`;
    // 정렬 가능한 표
    const cols = [
      ["model", "모델"],
      ["mean_nrmse", "평균장 NRMSE"],
      ["mean_rank", "평균장 순위"],
      ["ext_nrmse", "극값장 NRMSE"],
      ["ext_rank", "극값장 순위"],
      ["overall_nrmse", "종합 NRMSE"],
      ["overall_rank", "종합 순위"],
      ["ranksum", "순위 합 (계산)"],
      ["ranksum_rank", "순위합 순위"],
    ];
    const val = (m, k) => {
      if (k === "model") return m;
      if (k === "ranksum") {
        const a = D.rank(o.period, m, "mean_rank"),
          b = D.rank(o.period, m, "ext_rank");
        return a === null || b === null ? null : a + b;
      }
      return D.rank(o.period, m, k);
    };
    const ms = D.modelIds.slice().sort((a, b) => {
      const x = val(a, o.sortKey),
        y = val(b, o.sortKey);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * o.sortDir;
    });
    const head = cols
      .map(([k, l]) => {
        const s = o.sortKey === k ? (o.sortDir > 0 ? " ▲" : " ▼") : "";
        return `<th class="${k === "model" ? "" : "num"}"><button class="sort" data-sort="${k}" aria-sort="${o.sortKey === k ? (o.sortDir > 0 ? "ascending" : "descending") : "none"}">${l}${s}</button></th>`;
      })
      .join("");
    const body = ms
      .map(
        (m) =>
          `<tr ${rowAttr(m)}>${cols
            .map(([k]) => {
              const v = val(m, k);
              return k === "model" ? `<td><span class="model-cell">${dot(m)}${esc(m)}</span></td>` : `<td class="num">${Fmt.raw(v)}</td>`;
            })
            .join("")}</tr>`
      )
      .join("");
    $("#rank-table").innerHTML = `<div class="table-scroll"><table class="data" style="min-width:820px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="table-note">${esc(Fmt.period(o.period))} 기준. NRMSE와 순위는 JSON 값 그대로입니다. 같은 값은 같은 순위(낮은 쪽)를 가집니다.</p>`;
    $("#rank-table")
      .querySelectorAll("button.sort")
      .forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const k = b.dataset.sort;
          if (o.sortKey === k) o.sortDir *= -1;
          else {
            o.sortKey = k;
            o.sortDir = 1;
          }
          rank();
        })
      );
  }

  function meanext() {
    const D = state.D,
      o = state.o.meanext;
    const n = Charts.meanExt($("#ch-meanext"), D, selection(), o, toggleModel);
    const sp = D.summary(o.period)?.spearman_mean_vs_ext;
    const rho = Data.num(sp?.rho),
      p = Data.num(sp?.p);
    $("#meanext-stat").innerHTML = `<div class="big">Spearman ρ = ${rho === null ? Fmt.NA : rho}</div>
      <div>p = ${Fmt.p(p)}</div>
      <div class="muted small">${esc(Fmt.period(o.period))} · 모델 ${n}개 · ${D.subset ? "선택한 모델로 다시 계산한 값입니다." : "값은 JSON summary에 적힌 그대로입니다."}</div>`;
  }

  function rankchange() {
    const D = state.D,
      o = state.o.rankchange;
    Charts.rankChange($("#ch-rankchange"), D, selection(), o, toggleModel);
    const rows = D.periods
      .map((p) => {
        const s = D.summary(p) || {};
        const a = s.spearman_vs_entire_mean,
          b = s.spearman_vs_entire_ext;
        if (!a && !b) return "";
        const f = (x) => (x ? `${Data.num(x.rho) ?? Fmt.NA} (p ${Fmt.p(Data.num(x.p))})` : Fmt.NA);
        return `<tr><td>${esc(Fmt.period(p))}</td><td class="num">${f(a)}</td><td class="num">${f(b)}</td></tr>`;
      })
      .join("");
    $("#rankchange-stat").innerHTML = rows
      ? `<div class="card-title" style="margin-top:10px">Entire 순위와의 Spearman ρ</div><table class="data compact"><thead><tr><th>기간</th><th class="num">평균장</th><th class="num">극값장</th></tr></thead><tbody>${rows}</tbody></table><p class="table-note">${D.subset ? `선택한 ${D.modelIds.length}개 모델로 다시 계산한 값.` : "JSON summary 값."}</p>`
      : "";
  }

  function bias() {
    const D = state.D,
      o = state.o.bias;
    const r = Charts.bias($("#ch-bias"), D, selection(), o, toggleModel);
    $("#bias-count").innerHTML = `<b>${r.total}개 중 ${r.n}개 값 있음</b> · ${esc(Fmt.period(o.period))} · ${esc(Fmt.stat(o.stat))}${
      r.n === 0 ? ` <span class="badge">이 기간·통계량은 모델별 편의 자료가 없습니다</span>` : ""
    }`;
    $("#bias-med").innerHTML =
      r.med === null
        ? D.subset
          ? `<p class="muted-p">세로 점선(JSON summary 중앙값): <b>자료 없음</b> — 선택한 모델로 다시 계산할 수 없어 그리지 않습니다 (21개 전체를 선택하면 표시).</p>`
          : ""
        : `<p class="muted-p">세로 점선은 JSON <code>summary.${esc(o.period)}.median.${esc(o.stat)}.bias</code> 값(${r.med} ${esc(D.units)})입니다. 어떤 모델 집합의 중앙값인지는 JSON에 적혀 있지 않습니다.</p>`;
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
