/* 화면 구성과 상태 관리 */
"use strict";

const App = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = Fmt.esc;

  const state = {
    datasets: [], // datasets.json 목록
    cache: {}, // id -> wrapped data
    varId: null,
    D: null,
    userFile: null, // 끌어다 놓은 파일 이름
    tab: "overview",
    sel: null,
    o: {
      portrait: { period: null, order: "name" },
      taylor: { period: null, stat: null },
      rank: { period: null, basis: "overall", sortKey: "overall_rank", sortDir: 1 },
      meanext: { period: null },
      rankchange: { basis: "overall" },
      bias: { period: null, stat: null, sort: "name" },
      resolution: { period: null, x: "mean", y: "rank:overall_rank", family: true },
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
    state.D = D;
    if (state.sel && !D.modelIds.includes(state.sel)) state.sel = null;
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
    fixP(state.o.resolution);
    const src = state.userFile ? `끌어다 놓은 파일: ${state.userFile}` : `기본 자료: ${D.sourceLabel}`;
    setStatus(`${src} · 모델 ${D.models.length}개 · 생성일 ${D.meta.generated ?? "미표기"}`);
    $("#resetData").hidden = !state.userFile;
    fillModelSelect();
    buildPanels();
    showTab(state.tab, true);
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

  function fillModelSelect() {
    const s = $("#modelSelect");
    s.innerHTML = `<option value="">강조 없음</option>` + state.D.modelIds.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    s.value = state.sel || "";
  }

  function toggleModel(m) {
    state.sel = state.sel === m ? null : m;
    $("#modelSelect").value = state.sel || "";
    $("#selChip").hidden = !state.sel;
    $("#selName").textContent = state.sel || "";
    render();
  }

  function bindGlobal() {
    $("#themeBtn").addEventListener("click", cycleTheme);
    $("#varSelect").addEventListener("change", (e) => selectVariable(e.target.value));
    $("#modelSelect").addEventListener("change", (e) => {
      state.sel = e.target.value || null;
      $("#selChip").hidden = !state.sel;
      $("#selName").textContent = state.sel || "";
      render();
    });
    $("#selClear").addEventListener("click", () => toggleModel(state.sel));
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
      const tr = e.target.closest("tr[data-model]");
      if (tr) toggleModel(tr.dataset.model);
    });
    document.addEventListener("keydown", (e) => {
      const tr = e.target.closest?.("tr[data-model]");
      if (tr && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        toggleModel(tr.dataset.model);
      }
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

  function buildPanels() {
    const D = state.D;
    const o = state.o;
    const tp = D.periods.filter((p) => CONFIG.taylorPeriods.includes(p));
    const html = {
      overview: `<div id="ov-body"></div>`,
      portrait: `
        <div class="controls">
          ${ctl("기간", `<select data-o="portrait.period">${opts(D.periods, o.portrait.period, Fmt.period)}</select>`)}
          ${ctl("모델 순서", `<select data-o="portrait.order">${opts(["name", "rank"], o.portrait.order, (v) => (v === "name" ? "자료 순서 (이름)" : "선택 기간 종합 순위"))}</select>`)}
        </div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-portrait"></div></div>
          <aside class="note">
            <h3>읽는 법</h3>
            <p><b>NRMSE</b> = RMSE ÷ 해당 기간·통계량 ERA5 공간 표준편차. 0에 가까울수록 ERA5와 가깝고, 1이면 오차가 ERA5의 공간 변동 크기만큼 됩니다.</p>
            <p>색이 진할수록 NRMSE가 큽니다(나쁨). 칸 안 숫자는 소수 둘째 자리이며, 마우스를 올리면 JSON 값이 그대로 보입니다.</p>
            <p>색 범위는 기간마다 0부터 그 기간 최댓값까지입니다. 기간마다 분모(ERA5 표준편차)가 달라 <b>기간 사이 NRMSE를 직접 비교하면 안 됩니다</b>.</p>
            <p>모델 칸을 누르면 모든 그림에서 그 모델이 강조됩니다.</p>
            <div id="portrait-ref"></div>
          </aside>
        </div>`,
      taylor: `
        <div class="controls">
          ${ctl("기간", tp.length ? `<select data-o="taylor.period">${opts(tp, o.taylor.period, Fmt.period)}</select>` : `<span class="muted">그릴 기간 없음</span>`)}
          ${ctl("통계량", `<select data-o="taylor.stat">${opts(D.stats, o.taylor.stat, Fmt.stat)}</select>`)}
        </div>
        <p class="callout">Taylor diagram은 <b>${tp.map(Fmt.period).join(", ") || "—"}</b> 기간만 그립니다. 다른 기간은 상관계수·표준편차비가 일부 모델에만 있어 그리지 않습니다.</p>
        <div id="taylor-count" class="countline"></div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-taylor"></div></div>
          <aside class="note">
            <h3>읽는 법</h3>
            <p>★ ERA5에 가까울수록 좋습니다. 원점에서의 거리 = <b>표준편차비</b>(모델 ÷ ERA5, 1이면 공간 변동 크기 일치), 각도 = <b>상관계수</b>(면적가중 공간 상관), 점선 호 = ERA5 표준편차로 나눈 <b>centred RMSE</b>(평균 편의를 뺀 RMSE).</p>
            <h3>마커와 출처</h3>
            <ul class="legend-list">
              ${Object.entries(CONFIG.sources)
                .map(([k, s]) => `<li><span class="sym sym-${k}"></span><b>${esc(s.label)}</b> — ${esc(s.error)}</li>`)
                .join("")}
            </ul>
            <div id="taylor-hidden"></div>
          </aside>
        </div>
        <details class="table-wrap"><summary>값 표 보기</summary><div id="taylor-table"></div></details>`,
      rank: `
        <div class="controls">
          ${ctl("기간", `<select data-o="rank.period">${opts(D.periods, o.rank.period, Fmt.period)}</select>`)}
          ${ctl("기준", `<select data-o="rank.basis">${opts(Object.keys(CONFIG.rankBases), o.rank.basis, (k) => CONFIG.rankBases[k].label)}</select>`)}
        </div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-rank"></div></div>
          <aside class="note" id="rank-note"></aside>
        </div>
        <div class="table-wrap"><h3>순위 표 <span class="muted">(머리글을 누르면 정렬)</span></h3><div id="rank-table"></div></div>`,
      meanext: `
        <div class="controls">${ctl("기간", `<select data-o="meanext.period">${opts(D.periods, o.meanext.period, Fmt.period)}</select>`)}</div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-meanext"></div></div>
          <aside class="note">
            <div id="meanext-stat" class="statbox"></div>
            <h3>읽는 법</h3>
            <p>가로축은 평균장(mean) NRMSE, 세로축은 극값장(p5·p1·min NRMSE의 산술평균) NRMSE입니다. 점선은 1:1 선입니다.</p>
            <p>Spearman ρ는 두 순위가 얼마나 같은 방향으로 움직이는지 나타냅니다. ρ가 0에 가깝다면 평균장을 잘 재현하는 모델이 극값장도 잘 재현한다고 말할 수 없습니다.</p>
          </aside>
        </div>`,
      rankchange: `
        <div class="controls">${ctl("순위 기준", `<select data-o="rankchange.basis">${opts(Object.keys(CONFIG.rankBases), o.rankchange.basis, (k) => CONFIG.rankBases[k].label)}</select>`)}</div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-rankchange"></div></div>
          <aside class="note">
            <h3>읽는 법</h3>
            <p>각 선이 한 모델입니다. 위로 갈수록 순위가 높습니다(1 = 최상). 모델을 고르면 그 선이 강조되고 순위가 표시됩니다.</p>
            <p>기간마다 NRMSE 분모가 달라 값이 아니라 <b>순위</b>만 비교합니다.</p>
            <div id="rankchange-stat"></div>
          </aside>
        </div>`,
      bias: `
        <div class="controls">
          ${ctl("기간", `<select data-o="bias.period">${opts(D.periods, o.bias.period, Fmt.period)}</select>`)}
          ${ctl("통계량", `<select data-o="bias.stat">${opts(D.stats, o.bias.stat, Fmt.stat)}</select>`)}
          ${ctl("정렬", `<select data-o="bias.sort">${opts(["name", "value"], o.bias.sort, (v) => (v === "name" ? "자료 순서" : "편의 크기"))}</select>`)}
        </div>
        <div id="bias-count" class="countline"></div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-bias"></div></div>
          <aside class="note">
            <h3>읽는 법</h3>
            <p><b>편의</b> = 면적가중 평균(모델 − ERA5). 양수(빨강)는 모델 기압이 높고, 음수(파랑)는 낮습니다. 막대 끝 숫자는 소수 둘째 자리이며, 마우스를 올리면 JSON 값과 RMSE가 보입니다.</p>
            <p>편의 값이 JSON에 없는 모델은 막대 없이 <b>자료 없음</b>으로 표시합니다. 0이 아닙니다.</p>
            <div id="bias-med"></div>
          </aside>
        </div>`,
      resolution: `
        <div class="controls">
          ${ctl("기간", `<select data-o="resolution.period">${opts(D.periods, o.resolution.period, Fmt.period)}</select>`)}
          ${ctl("가로축", `<select data-o="resolution.x">${opts(["mean", "lon", "lat"], o.resolution.x, (v) => ({ mean: "경도·위도 평균", lon: "경도 간격", lat: "위도 간격" })[v])}</select>`)}
          ${ctl("세로축", `<select data-o="resolution.y">${resYOptions()
            .map(([v, l]) => `<option value="${v}"${v === o.resolution.y ? " selected" : ""}>${esc(l)}</option>`)
            .join("")}</select>`)}
          <label class="ctl check"><input type="checkbox" data-o="resolution.family"${o.resolution.family ? " checked" : ""}> <span>같은 기관 모델 잇기</span></label>
        </div>
        <div class="layout-2">
          <div class="chart-card"><div class="chart" id="ch-resolution"></div></div>
          <aside class="note warn">
            <h3>⚠ 해석 주의</h3>
            <ul>
              <li><b>참고용 탐색 그림</b>이며 인과관계를 뜻하지 않습니다.</li>
              <li>모든 모델을 약 1.9° 공통 격자(19×26)로 옮겨 비교했으므로 <b>해상도 효과가 가려졌을 수 있습니다</b>.${
                D.meta.region?.common_grid ? ` <span class="muted small">(JSON: ${esc(D.meta.region.common_grid)})</span>` : ""
              }</li>
              <li>같은 기관의 형제 모델(EC-Earth3 계열 등)은 <b>서로 독립적이지 않습니다</b>. 점선은 같은 institution_id를 잇습니다.</li>
            </ul>
            <p class="muted">격자 간격은 모델 원래 격자의 값입니다. 같은 간격의 모델은 점이 겹칠 수 있으니 아래 표를 함께 보세요.</p>
          </aside>
        </div>
        <details class="table-wrap"><summary>값 표 보기</summary><div id="resolution-table"></div></details>`,
    };
    $("#panels").innerHTML = CONFIG.tabs
      .map((t) => `<section class="panel" id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" hidden><h2>${esc(t.label)}</h2>${html[t.id]}</section>`)
      .join("");
    $("#panels").querySelectorAll("[data-o]").forEach((el) =>
      el.addEventListener("change", () => {
        const [tab, key] = el.dataset.o.split(".");
        state.o[tab][key] = el.type === "checkbox" ? el.checked : el.value;
        render();
      })
    );
  }

  function resYOptions() {
    const D = state.D;
    return [
      ...D.stats.map((s) => [`stat:${s}`, `NRMSE · ${Fmt.stat(s)}`]),
      ["rank:mean_nrmse", "평균장 NRMSE"],
      ["rank:ext_nrmse", "극값장 NRMSE"],
      ["rank:overall_nrmse", "종합 NRMSE"],
      ["rank:mean_rank", "평균장 순위"],
      ["rank:ext_rank", "극값장 순위"],
      ["rank:overall_rank", "종합 순위"],
      ["rank:ranksum_rank", "순위합 순위"],
    ];
  }

  /* ---------- 그리기 ---------- */
  function render() {
    const D = state.D;
    if (!D) return;
    $("#selChip").hidden = !state.sel;
    $("#selName").textContent = state.sel || "";
    const fn = { overview, portrait, taylor, rank, meanext, rankchange, bias, resolution }[state.tab];
    try {
      fn();
    } catch (e) {
      console.error(e);
      setStatus(`그림을 그리는 중 오류: ${e.message}`, true);
    }
  }

  function overview() {
    const D = state.D,
      M = D.meta;
    const r = M.region || {};
    const dl = (rows) => `<dl class="meta">${rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    const lonTxt = Array.isArray(r.lon) ? `${r.lon[0]}–${r.lon[1]}°E` : "";
    const latTxt = Array.isArray(r.lat) ? `${r.lat[0]}–${r.lat[1]}°N` : "";
    $("#ov-body").innerHTML = `
      <div class="layout-2 ov">
        <div>
          <p class="lead">CMIP6 전지구 기후모델(GCM) ${D.models.length}개가 북서태평양(${esc(lonTxt)}, ${esc(latTxt)})의
          <b>${esc(D.varLong)} (${esc(D.varName)})</b>을(를) 얼마나 잘 재현하는지 ERA5 재분석 자료와 비교해 평가한 결과입니다.
          기간·통계량별 공간 오차(NRMSE), 상관계수, 표준편차비, 편의와 모델 순위를 탐색할 수 있습니다.</p>
          <div class="chart-card"><div class="chart" id="ch-map"></div></div>
          <p class="muted small">상자는 평가 영역입니다. 해안선: Natural Earth 1:50m.</p>
        </div>
        <aside class="note">
          <h3>자료 상태</h3>
          ${dl([
            ["생성일", esc(M.generated)],
            ["버전", esc(M.version)],
            ["불러온 자료", esc(state.userFile ? `${state.userFile} (끌어다 놓은 파일)` : D.sourceLabel)],
          ])}
          <p class="status-text">${esc(M.data_status ?? "data_status 미표기")}</p>
        </aside>
      </div>
      <h3>분석 설정</h3>
      ${dl([
        ["제목", esc(M.title)],
        ["변수", esc(`${D.varName} — ${D.varLong} [${D.units}]`)],
        ["기준 자료", esc(M.reference)],
        ["실험", esc(M.experiment)],
        ["기간", esc(M.period)],
        ["영역", esc(`${lonTxt}, ${latTxt}`)],
        ["공통 격자", esc(r.common_grid)],
        ["가중치", esc(r.weights)],
        ["품질 관리", esc(M.qc)],
        ["모델 선정", esc(M.model_selection)],
        ["구분 기간", M.periods ? Object.entries(M.periods).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>") : ""],
        ["통계량", M.stats ? Object.entries(M.stats).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>") : ""],
        ["지표", M.metrics ? Object.entries(M.metrics).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>") : ""],
        ["순위", M.ranking ? Object.entries(M.ranking).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join("<br>") : ""],
        ["주의", Array.isArray(M.notes) ? M.notes.map(esc).join("<br>") : ""],
      ])}
      <h3>지표 읽는 법</h3>
      <ul class="glossary">
        <li><b>NRMSE</b>: RMSE를 ERA5 공간 표준편차로 나눈 값. 작을수록 좋음. 기간·통계량마다 분모가 다르므로 다른 기간끼리 값을 비교하지 않습니다.</li>
        <li><b>상관계수</b>: 면적가중 공간 상관. 1에 가까울수록 공간 분포 모양이 ERA5와 같습니다.</li>
        <li><b>표준편차비</b>: 모델 공간 표준편차 ÷ ERA5 공간 표준편차. 1이면 공간 변동 크기가 같습니다.</li>
        <li><b>centred RMSE</b>: 영역 평균 차이(편의)를 뺀 뒤의 RMSE. 공간 패턴 오차만 봅니다.</li>
        <li><b>편의</b>: 면적가중 평균(모델 − ERA5) [${esc(D.units)}].</li>
        <li><b>통계량</b>: 각 격자점의 일자료로 구한 평균(mean), 5·1 백분위(p5, p1), 최솟값(min). 극값장 = p5·p1·min.</li>
      </ul>
      <h3>모델 정보 <span class="muted">(행을 누르면 강조)</span></h3>
      <div class="table-scroll">${modelTable()}</div>`;
    Charts.regionMap($("#ch-map"), D);
  }

  function modelTable() {
    const D = state.D;
    const rows = D.models
      .map((m) => {
        const r = m.resolution_deg || {},
          g = m.grid_points || {};
        return `<tr data-model="${esc(m.id)}" tabindex="0" class="${m.id === state.sel ? "sel" : ""}">
          <td><b>${esc(m.id)}</b></td>
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
    return `<table class="data"><thead><tr><th>모델</th><th>기관</th><th>국가</th><th>격자 수 (경도×위도)</th><th>격자 간격 (경도×위도)</th><th>공칭 해상도</th><th>격자</th><th>달력</th><th>변이</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function portrait() {
    const D = state.D,
      o = state.o.portrait;
    let order = D.modelIds.slice();
    if (o.order === "rank") order.sort((a, b) => (D.rank(o.period, a, "overall_rank") ?? 1e9) - (D.rank(o.period, b, "overall_rank") ?? 1e9));
    Charts.portrait($("#ch-portrait"), D, state.sel, { period: o.period, order }, toggleModel);
    const rs = D.stats.map((s) => `<tr><td>${esc(Fmt.stat(s))}</td><td class="num">${Fmt.raw(D.refSd(o.period, s))}</td></tr>`).join("");
    $("#portrait-ref").innerHTML = `<h3>ERA5 공간 표준편차 (NRMSE 분모, ${esc(D.units)})</h3><table class="data compact"><tbody>${rs}</tbody></table>`;
  }

  function taylor() {
    const D = state.D,
      o = state.o.taylor;
    const tp = D.periods.filter((p) => CONFIG.taylorPeriods.includes(p));
    if (!tp.length) {
      $("#ch-taylor").innerHTML = `<p class="empty">설정된 Taylor 기간이 이 자료에 없습니다.</p>`;
      return;
    }
    const pts = Charts.taylor($("#ch-taylor"), D, state.sel, o, toggleModel);
    const total = D.modelIds.length;
    const bySrc = {};
    pts.forEach((q) => (bySrc[q.src] = (bySrc[q.src] || 0) + 1));
    const missing = D.modelIds.filter((m) => !pts.some((q) => q.m === m));
    $("#taylor-count").innerHTML =
      `<b>${total}개 중 ${pts.length}개 표시</b>${
        pts.some((q) => q.src === "digitized_hidden") ? ` <span class="badge">이 중 ${pts.filter((q) => q.src === "digitized_hidden").length}개는 실제 위치 아님</span>` : ""
      } · ${esc(Fmt.period(o.period))} · ${esc(Fmt.stat(o.stat))}` +
      ` <span class="muted">(${Object.entries(bySrc)
        .map(([k, n]) => `${esc(CONFIG.sources[k].label)} ${n}`)
        .join(", ")})</span>` +
      (missing.length ? `<br><span class="muted">자료 없음: ${missing.map(esc).join(", ")}</span>` : "");
    const hidden = pts.filter((q) => q.src === "digitized_hidden");
    $("#taylor-hidden").innerHTML = hidden.length
      ? `<div class="callout warn"><b>⚠ 실제 위치가 아닌 점</b><br>${hidden
          .map(
            (q) =>
              `${esc(q.m)}: 그림에서 다른 마커에 완전히 가려져, 그 위를 덮은 마커의 위치를 대신 사용했습니다.${
                q.twins.length ? ` 상관계수·표준편차비가 ${q.twins.map(esc).join(", ")}과(와) 같습니다.` : ""
              }`
          )
          .join("<br>")}</div>`
      : "";
    const rows = D.modelIds
      .map((m) => {
        const q = pts.find((x) => x.m === m);
        const ob = D.metricObj(o.period, o.stat, m) || {};
        const S = q ? CONFIG.sources[q.src] : null;
        return `<tr data-model="${esc(m)}" tabindex="0" class="${m === state.sel ? "sel" : ""}"><td>${esc(m)}</td>
          <td class="num">${Fmt.raw(Data.num(ob.corr))}</td><td class="num">${Fmt.raw(Data.num(ob.sd_ratio))}</td>
          <td class="num">${q && q.crmse !== null ? (q.crmseComputed ? q.crmse.toFixed(3) + " (계산값)" : String(q.crmse)) : Fmt.NA}</td>
          <td class="num">${Fmt.raw(Data.num(ob.sd_mod))}</td><td>${S ? esc(S.label) : "—"}</td></tr>`;
      })
      .join("");
    $("#taylor-table").innerHTML = `<div class="table-scroll"><table class="data"><thead><tr><th>모델</th><th>상관계수</th><th>표준편차비</th><th>centred RMSE [${esc(D.units)}]</th><th>모델 표준편차 [${esc(D.units)}]</th><th>출처</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">ERA5 공간 표준편차 = ${Fmt.raw(D.refSd(o.period, o.stat))} ${esc(D.units)}</p>`;
  }

  function rank() {
    const D = state.D,
      o = state.o.rank;
    Charts.rankBars($("#ch-rank"), D, state.sel, o, toggleModel);
    const R = D.meta.ranking || {};
    $("#rank-note").innerHTML = `<h3>순위 기준</h3>
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
        return `<th><button class="sort" data-sort="${k}" aria-sort="${o.sortKey === k ? (o.sortDir > 0 ? "ascending" : "descending") : "none"}">${l}${s}</button></th>`;
      })
      .join("");
    const body = ms
      .map(
        (m) =>
          `<tr data-model="${esc(m)}" tabindex="0" class="${m === state.sel ? "sel" : ""}">${cols
            .map(([k]) => {
              const v = val(m, k);
              return k === "model" ? `<td><b>${esc(m)}</b></td>` : `<td class="num">${Fmt.raw(v)}</td>`;
            })
            .join("")}</tr>`
      )
      .join("");
    $("#rank-table").innerHTML = `<div class="table-scroll"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="muted small">${esc(Fmt.period(o.period))} 기준. NRMSE와 순위는 JSON 값 그대로입니다. 같은 값은 같은 순위(낮은 쪽)를 가집니다.</p>`;
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
    const n = Charts.meanExt($("#ch-meanext"), D, state.sel, o, toggleModel);
    const sp = D.summary(o.period)?.spearman_mean_vs_ext;
    const rho = Data.num(sp?.rho),
      p = Data.num(sp?.p);
    $("#meanext-stat").innerHTML = `<div class="big">Spearman ρ = ${rho === null ? Fmt.NA : rho}</div>
      <div>p = ${Fmt.p(p)}</div>
      <div class="muted small">${esc(Fmt.period(o.period))} · 모델 ${n}개 · 값은 JSON summary에 적힌 그대로입니다.</div>`;
  }

  function rankchange() {
    const D = state.D,
      o = state.o.rankchange;
    Charts.rankChange($("#ch-rankchange"), D, state.sel, o, toggleModel);
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
      ? `<h3>Entire 순위와의 Spearman ρ</h3><table class="data compact"><thead><tr><th>기간</th><th>평균장</th><th>극값장</th></tr></thead><tbody>${rows}</tbody></table><p class="muted small">JSON summary 값.</p>`
      : "";
  }

  function bias() {
    const D = state.D,
      o = state.o.bias;
    const r = Charts.bias($("#ch-bias"), D, state.sel, o, toggleModel);
    $("#bias-count").innerHTML = `<b>${r.total}개 중 ${r.n}개 값 있음</b> · ${esc(Fmt.period(o.period))} · ${esc(Fmt.stat(o.stat))}${
      r.n === 0 ? ` <span class="badge">이 기간·통계량은 모델별 편의 자료가 없습니다</span>` : ""
    }`;
    $("#bias-med").innerHTML =
      r.med === null
        ? ""
        : `<p>세로 점선은 JSON <code>summary.${esc(o.period)}.median.${esc(o.stat)}.bias</code> 값(${r.med} ${esc(D.units)})입니다. 어떤 모델 집합의 중앙값인지는 JSON에 적혀 있지 않습니다.</p>`;
  }

  function resolution() {
    const D = state.D,
      o = state.o.resolution;
    const yLabel = (resYOptions().find(([v]) => v === o.y) || [, o.y])[1];
    const rows = Charts.resolution($("#ch-resolution"), D, state.sel, { ...o, yLabel }, toggleModel);
    const xName = { mean: "격자 간격 평균 (계산값)", lon: "경도 간격", lat: "위도 간격" }[o.x];
    const body = rows
      .slice()
      .sort((a, b) => a.x - b.x || a.m.localeCompare(b.m))
      .map((r) => `<tr data-model="${esc(r.m)}" tabindex="0" class="${r.m === state.sel ? "sel" : ""}"><td>${esc(r.m)}</td><td>${esc(r.inst)}</td><td class="num">${+r.x.toFixed(4)}</td><td class="num">${Fmt.raw(r.y)}</td></tr>`)
      .join("");
    $("#resolution-table").innerHTML = `<div class="table-scroll"><table class="data"><thead><tr><th>모델</th><th>기관</th><th>${xName} (°)</th><th>${esc(yLabel)}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
