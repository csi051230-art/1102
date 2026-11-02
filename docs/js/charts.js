/* 그림 그리기. 각 함수는 (div, 자료, 선택 상태, 옵션)을 받아 Plotly로 그린다.
   null 값은 그리지 않고, 필요한 곳에는 '자료 없음'을 글자로 표시한다. */
"use strict";

const Charts = (() => {
  function theme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return {
      dark: document.documentElement.dataset.resolvedTheme === "dark",
      surface: g("--surface-1"),
      plane: g("--page"),
      text1: g("--text-primary"),
      text2: g("--text-secondary"),
      muted: g("--text-muted"),
      grid: g("--grid"),
      axis: g("--axis"),
      border: g("--border-solid"),
      series: g("--series-1"),
      seriesSoft: g("--series-1-soft"),
      accent: g("--accent"),
      pos: g("--div-pos"),
      neg: g("--div-neg"),
      land: g("--land"),
      coast: g("--coast"),
      ocean: g("--ocean"),
      seq: g("--seq").split(",").map((s) => s.trim()),
      font: g("--font"),
    };
  }

  // 강조 모델 이름표: 강조 색으로 칠한 굵은 글씨
  const selTick = (S, m) => (S.has(m) ? `<span style="color:${S.color(m)}"><b>▶ ${m}</b></span>` : m);

  const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;

  function axis(t, extra = {}) {
    return Object.assign(
      {
        gridcolor: t.grid,
        linecolor: t.axis,
        zerolinecolor: t.axis,
        tickfont: { color: t.text2, size: 11 },
        title: { font: { color: t.text2, size: 12 } },
        automargin: true,
      },
      extra
    );
  }

  function layout(t, extra = {}) {
    return Object.assign(
      {
        paper_bgcolor: t.surface,
        plot_bgcolor: t.surface,
        font: { family: t.font, color: t.text2, size: 12 },
        margin: { l: 10, r: 16, t: 12, b: 10 },
        hoverlabel: { bgcolor: t.surface, bordercolor: t.border, font: { color: t.text1, family: t.font, size: 12 } },
        showlegend: false,
        dragmode: false,
      },
      extra
    );
  }

  const plotConfig = () => ({
    responsive: true,
    displaylogo: false,
    scrollZoom: false,
    topojsonURL: CONFIG.topojsonURL,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines"],
  });

  // 클릭한 점의 customdata 첫 값이 모델 id다.
  function bindClick(gd, onModel) {
    gd.removeAllListeners?.("plotly_click");
    gd.on("plotly_click", (ev) => {
      const pt = ev.points && ev.points[0];
      if (!pt) return;
      const cd = pt.customdata;
      const id = Array.isArray(cd) ? cd[0] : cd;
      if (typeof id === "string" && id) onModel(id);
    });
  }

  function draw(gd, traces, lay, onModel) {
    Plotly.react(gd, traces, lay, plotConfig());
    if (onModel) bindClick(gd, onModel);
  }

  /* ---------- 1. 연구 영역 지도 ---------- */
  // box: 적용한 평가 영역 { lat, lon }. 없으면 JSON meta.region
  function regionMap(gd, D, box) {
    const t = theme();
    const r = box || D.meta.region || {};
    const traces = [];
    let lonRange = [95, 170],
      latRange = [5, 65];
    if (Array.isArray(r.lon) && Array.isArray(r.lat)) {
      const [x0, x1] = r.lon,
        [y0, y1] = r.lat;
      // 경계를 잘게 나눠 위·경도선을 따라 그린다 (대권 곡선 방지)
      const N = 40,
        lon = [],
        lat = [];
      const seg = (a, b, c, d) => {
        for (let i = 0; i < N; i++) {
          lon.push(a + ((b - a) * i) / N);
          lat.push(c + ((d - c) * i) / N);
        }
      };
      seg(x0, x1, y0, y0);
      seg(x1, x1, y0, y1);
      seg(x1, x0, y1, y1);
      seg(x0, x0, y1, y0);
      lon.push(x0);
      lat.push(y0);
      traces.push({
        type: "scattergeo",
        lon,
        lat,
        mode: "lines",
        line: { color: t.accent, width: 2 },
        hoverinfo: "text",
        text: `평가 영역: ${x0}–${x1}°E, ${y0}–${y1}°N`,
        name: "평가 영역",
      });
      const pad = 18;
      lonRange = [x0 - pad, x1 + pad];
      latRange = [y0 - pad * 0.7, y1 + pad * 0.5];
    }
    const lay = layout(t, {
      height: isNarrow() ? 300 : 380,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      geo: {
        projection: { type: "mercator" },
        resolution: 50,
        lonaxis: { range: lonRange, showgrid: true, gridcolor: t.grid, dtick: 10 },
        lataxis: { range: latRange, showgrid: true, gridcolor: t.grid, dtick: 10 },
        showcoastlines: true,
        coastlinecolor: t.coast,
        coastlinewidth: 0.8,
        showland: true,
        landcolor: t.land,
        showocean: true,
        oceancolor: t.ocean,
        showcountries: true,
        countrycolor: t.axis,
        showframe: true,
        framecolor: t.axis,
        bgcolor: t.surface,
      },
    });
    draw(gd, traces, lay);
  }

  /* ---------- 2. Portrait plot ---------- */
  function portrait(gd, D, S, opt, onModel) {
    const t = theme();
    const p = opt.period;
    const order = opt.order.slice();
    const stats = D.stats;
    const z = [],
      text = [],
      cd = [];
    // 색 범위: 모든 기간·통계량에서 같은 범위 (0 ~ 전체 최댓값)
    let zmax = 0;
    D.periods.forEach((pp) =>
      D.stats.forEach((s) =>
        D.modelIds.forEach((m) => {
          const v = D.metric(pp, s, m, "nrmse");
          if (v !== null) zmax = Math.max(zmax, v);
        })
      )
    );
    order.forEach((m) => {
      const row = [],
        tr = [],
        cr = [];
      stats.forEach((s) => {
        const v = D.metric(p, s, m, "nrmse");
        row.push(v);
        tr.push(v === null ? "" : v.toFixed(2));
        cr.push([m, Fmt.stat(s), Fmt.raw(v)]);
      });
      z.push(row);
      text.push(tr);
      cd.push(cr);
    });
    const xs = stats.map(Fmt.stat);
    const n = t.seq.length;
    const colorscale = t.seq.map((c, i) => [i / (n - 1), c]);
    const traces = [
      {
        type: "heatmap",
        x: xs,
        y: order,
        z,
        text,
        customdata: cd,
        texttemplate: "%{text}",
        textfont: { size: isNarrow() ? 10 : 12 },
        colorscale,
        zmin: 0,
        zmax: zmax || 1,
        xgap: 2,
        ygap: 2,
        hoverongaps: false,
        colorbar: {
          title: { text: "NRMSE", side: "right", font: { color: t.text2 } },
          tickfont: { color: t.text2 },
          outlinewidth: 0,
          thickness: 12,
        },
        hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]}<br>NRMSE = %{customdata[2]}<extra></extra>",
      },
    ];
    // 빈 칸은 0이 아니라 '자료 없음'으로 적는다
    const ann = [];
    order.forEach((m, i) =>
      stats.forEach((s, j) => {
        if (z[i][j] === null)
          ann.push({ x: xs[j], y: m, text: "자료 없음", showarrow: false, font: { size: 10, color: t.muted } });
      })
    );
    const shapes = S.list
      .filter((m) => order.includes(m))
      .map((m) => {
        const i = order.indexOf(m);
        return { type: "rect", xref: "paper", x0: 0, x1: 1, yref: "y", y0: i - 0.5, y1: i + 0.5, line: { color: S.color(m), width: 3 } };
      });
    const lay = layout(t, {
      height: Math.max(420, order.length * (isNarrow() ? 24 : 28) + 80),
      margin: { l: 10, r: 10, t: 10, b: 10 },
      xaxis: axis(t, { side: "top", showgrid: false, fixedrange: true }),
      yaxis: axis(t, {
        autorange: "reversed",
        showgrid: false,
        fixedrange: true,
        tickmode: "array",
        tickvals: order,
        ticktext: order.map((m) => selTick(S, m)),
      }),
      annotations: ann,
      shapes,
    });
    draw(gd, traces, lay, onModel);
  }

  /* ---------- 3. Taylor diagram ---------- */
  // 모델별 색: 자료 순서(이름순)대로 색상환을 한 바퀴 돌며 모델마다 다른 색을 준다.
  // 같은 기관(형제 모델)은 이웃하므로 비슷한 색이 되고, 그 안에서는 밝은 색 → 어두운 색 순으로 구분한다.
  function modelColors(D) {
    const famOf = (m) => {
      const id = D.model(m)?.institution_id || m;
      return CONFIG.familyAlias[id] || id;
    };
    // 색은 전체 모델 순서로 정한다 (모델을 골라 숨겨도 색이 바뀌지 않게)
    const ids = D.allModelIds || D.modelIds;
    const members = {};
    ids.forEach((m) => (members[famOf(m)] = members[famOf(m)] || []).push(m));
    const N = ids.length;
    const color = {};
    const dark = document.documentElement.dataset.resolvedTheme === "dark";
    ids.forEach((m, i) => {
      const h = N > 1 ? (335 * i) / (N - 1) : 0;
      const sib = members[famOf(m)];
      const j = sib.indexOf(m),
        n = sib.length;
      // 어두운 모드에서는 바탕이 짙으므로 조금 밝게
      const l = (n > 1 ? 62 - (22 * j) / (n - 1) : 52) + (dark ? 6 : 0);
      color[m] = `hsl(${h.toFixed(1)}, 60%, ${l.toFixed(1)}%)`;
    });
    return color;
  }

  function taylorPoints(D, p, s) {
    const ref = D.refSd(p, s);
    const pts = [];
    D.modelIds.forEach((m) => {
      const r = D.metric(p, s, m, "corr");
      const k = D.metric(p, s, m, "sd_ratio");
      if (r === null || k === null) return;
      const o = D.metricObj(p, s, m) || {};
      const srcKey = CONFIG.sources[o.taylor_source] ? o.taylor_source : "unknown";
      let crmse = D.metric(p, s, m, "crmse");
      let crmseComputed = false;
      if (crmse === null && ref !== null) {
        // 정의식: E' = σ_ref · sqrt(1 + k² − 2 k r)
        crmse = ref * Math.sqrt(Math.max(0, 1 + k * k - 2 * k * r));
        crmseComputed = true;
      }
      pts.push({ m, r, k, crmse, crmseComputed, sdMod: D.metric(p, s, m, "sd_mod"), src: srcKey, rawSrc: o.taylor_source ?? null });
    });
    // 같은 (r, k) 값을 가진 다른 모델 찾기 (덮인 점 안내용)
    pts.forEach((a) => {
      a.twins = pts.filter((b) => b !== a && b.r === a.r && b.k === a.k).map((b) => b.m);
    });
    return { pts, ref };
  }

  function taylor(gd, D, S, opt, onModel) {
    const t = theme();
    const { pts } = taylorPoints(D, opt.period, opt.stat);
    const deg = (r) => (Math.acos(Math.max(-1, Math.min(1, r))) * 180) / Math.PI;
    const hasNeg = pts.some((q) => q.r < 0);
    const kMax = Math.max(1.5, ...pts.map((q) => q.k)) * 1.08;
    const traces = [];

    // centred RMSE 등치선 (σ_ref로 정규화, 중심 = 기준점)
    const levels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].filter((c) => c < kMax + 1);
    const lblR = [],
      lblT = [],
      lblTx = [];
    levels.forEach((c) => {
      const rr = [],
        th = [];
      for (let i = 0; i <= 180; i++) {
        const ph = (Math.PI * i) / 180;
        const x = 1 + c * Math.cos(ph),
          y = c * Math.sin(ph);
        const R = Math.hypot(x, y),
          T = (Math.atan2(y, x) * 180) / Math.PI;
        if (R <= kMax && T <= (hasNeg ? 180 : 90)) {
          rr.push(R);
          th.push(T);
        } else {
          rr.push(null);
          th.push(null);
        }
      }
      traces.push({ type: "scatterpolar", r: rr, theta: th, mode: "lines", line: { color: t.muted, width: 1, dash: "dot" }, hoverinfo: "skip", connectgaps: false });
      const ph = (Math.PI * 2) / 3;
      const x = 1 + c * Math.cos(ph),
        y = c * Math.sin(ph);
      const R = Math.hypot(x, y),
        T = (Math.atan2(y, x) * 180) / Math.PI;
      if (R <= kMax && T <= (hasNeg ? 180 : 90)) {
        lblR.push(R);
        lblT.push(T);
        lblTx.push(String(c));
      }
    });
    traces.push({ type: "scatterpolar", r: lblR, theta: lblT, mode: "text", text: lblTx, textfont: { color: t.muted, size: 10 }, hoverinfo: "skip" });
    // 기준 표준편차 호 (표준편차비 = 1)
    const arcT = [];
    for (let i = 0; i <= (hasNeg ? 180 : 90); i++) arcT.push(i);
    traces.push({ type: "scatterpolar", r: arcT.map(() => 1), theta: arcT, mode: "lines", line: { color: t.text2, width: 1, dash: "dash" }, hoverinfo: "skip" });

    // 점 색 = 모델별 색 (같은 기관끼리 비슷한 색)
    const colors = modelColors(D);
    const colorOf = (m) => colors[m] || t.muted;
    const hover = (q) => [
      q.m,
      Fmt.raw(q.r),
      Fmt.raw(q.k),
      q.crmse === null ? Fmt.NA : (q.crmseComputed ? q.crmse.toFixed(3) : String(q.crmse)) + ` ${D.units}` + (q.crmseComputed ? " (계산값)" : ""),
      q.sdMod === null ? Fmt.NA : `${q.sdMod} ${D.units}`,
      q.src === "digitized_hidden"
        ? `<br><b>⚠ 표시 위치는 실제 위치가 아닙니다.</b>${q.twins.length ? `<br>같은 값: ${q.twins.join(", ")}` : ""}`
        : "",
    ];
    const hoverTpl =
      "<b>%{customdata[0]}</b><br>상관계수 = %{customdata[1]}<br>표준편차비 = %{customdata[2]}<br>centred RMSE = %{customdata[3]}<br>모델 공간 표준편차 = %{customdata[4]}%{customdata[5]}<extra></extra>";
    // 실제 위치가 아닌 점(digitized_hidden)만 ✕로 구분하고, 나머지는 모두 속이 찬 원
    const markerOf = (g, size, ring) => ({
      symbol: g.map((q) => (q.src === "digitized_hidden" ? "x" : "circle")),
      size,
      color: g.map((q) => colorOf(q.m)),
      line: { color: ring ? t.text1 : t.surface, width: ring ? 2.5 : 1 },
    });
    const others = pts.filter((q) => !S.has(q.m));
    traces.push({
      type: "scatterpolar",
      r: others.map((q) => q.k),
      theta: others.map((q) => deg(q.r)),
      mode: "markers",
      marker: markerOf(others, 11, false),
      opacity: S.size ? 0.35 : 1,
      customdata: others.map(hover),
      hovertemplate: hoverTpl,
    });
    // 선택 모델 강조 (여러 개)
    pts
      .filter((q) => S.has(q.m))
      .forEach((sp) =>
      traces.push({
        type: "scatterpolar",
        r: [sp.k],
        theta: [deg(sp.r)],
        mode: "markers+text",
        text: [sp.m + (sp.src === "digitized_hidden" ? " (실제 위치 아님)" : "")],
        textposition: "top right",
        textfont: { color: t.text1, size: 12 },
        marker: markerOf([sp], 17, true),
        customdata: [hover(sp)],
        hovertemplate: hoverTpl,
      })
    );
    // 기준점 (ERA5)
    traces.push({
      type: "scatterpolar",
      r: [1],
      theta: [0],
      mode: "markers+text",
      text: ["ERA5"],
      textposition: "bottom center",
      textfont: { color: t.text1 },
      marker: { symbol: "star", size: 15, color: t.text1 },
      hovertemplate: "ERA5 (기준)<extra></extra>",
      name: "ERA5",
    });

    traces.forEach((tr) => (tr.showlegend = tr.showlegend === true));
    const corrTicks = hasNeg ? [-1, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.8, 0.9, 0.95, 0.99, 1] : [0, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1];
    // 모델 범례는 그림 아래 HTML 목록으로 따로 그린다 (app.js)
    const lay = layout(t, {
      height: isNarrow() ? 440 : 600,
      margin: { l: 40, r: 40, t: 34, b: 55 },
      polar: {
        bgcolor: t.surface,
        sector: [0, hasNeg ? 180 : 90],
        radialaxis: {
          range: [0, kMax],
          gridcolor: t.grid,
          linecolor: t.axis,
          tickfont: { color: t.text2 },
          title: { text: "표준편차비 (모델 / ERA5)", font: { color: t.text2 } },
          angle: 0,
        },
        angularaxis: {
          direction: "counterclockwise",
          rotation: 0,
          tickmode: "array",
          tickvals: corrTicks.map(deg),
          ticktext: corrTicks.map(String),
          gridcolor: t.grid,
          linecolor: t.axis,
          tickfont: { color: t.text2 },
        },
      },
      annotations: [
        { text: "호의 눈금 = 상관계수", xref: "paper", yref: "paper", x: 0.12, xanchor: "left", y: 1.05, showarrow: false, font: { color: t.text2, size: 11 } },
      ],
    });
    draw(gd, traces, lay, onModel);
    return pts;
  }

  /* ---------- 4. 순위 막대 ---------- */
  function rankBars(gd, D, S, opt, onModel) {
    const t = theme();
    const p = opt.period;
    const B = CONFIG.rankBases[opt.basis];
    const rows = D.modelIds.map((m) => {
      let v = B.nrmse ? D.rank(p, m, B.nrmse) : null;
      if (!B.nrmse) {
        const a = D.rank(p, m, "mean_rank"),
          b = D.rank(p, m, "ext_rank");
        v = a === null || b === null ? null : a + b; // 정의상 계산 (순위 합)
      }
      return { m, v, rank: D.rank(p, m, B.rank) };
    });
    rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.m.localeCompare(b.m));
    const xLabel = B.nrmse ? `${B.label} NRMSE` : "평균장 순위 + 극값장 순위 (계산값)";
    const traces = [
      {
        type: "bar",
        orientation: "h",
        y: rows.map((r) => r.m),
        x: rows.map((r) => r.v),
        marker: { color: rows.map((r) => (S.has(r.m) ? S.color(r.m) : S.size ? t.seriesSoft : t.series)), line: { color: t.surface, width: 1 } },
        // 막대 끝에는 값 (NRMSE는 소수 둘째 자리, 순위 합은 정수). 순위는 y축 순서와 툴팁에 있다.
        text: rows.map((r) => (r.v === null ? "" : B.nrmse ? r.v.toFixed(2) : String(r.v))),
        textposition: "outside",
        textfont: { color: t.text2, size: 11 },
        cliponaxis: false,
        customdata: rows.map((r) => [r.m, r.v === null ? Fmt.NA : B.nrmse ? Fmt.raw(r.v) : `${r.v} (계산값)`, r.rank === null ? Fmt.NA : r.rank]),
        hovertemplate: `<b>%{customdata[0]}</b><br>${xLabel} = %{customdata[1]}<br>순위 = %{customdata[2]}<extra></extra>`,
      },
    ];
    const ann = rows
      .filter((r) => r.v === null)
      .map((r) => ({ x: 0, y: r.m, xanchor: "left", text: "자료 없음", showarrow: false, font: { size: 10, color: t.muted } }));
    const lay = layout(t, {
      height: Math.max(420, rows.length * 24 + 80),
      bargap: 0.35,
      margin: { l: 10, r: 40, t: 10, b: 10 },
      xaxis: axis(t, { title: { text: xLabel }, rangemode: "tozero", fixedrange: true }),
      yaxis: axis(t, {
        autorange: "reversed",
        fixedrange: true,
        tickmode: "array",
        tickvals: rows.map((r) => r.m),
        ticktext: rows.map((r) => selTick(S, r.m)),
      }),
      annotations: ann,
    });
    draw(gd, traces, lay, onModel);
  }

  /* ---------- 5. 평균장 대 극값장 ---------- */
  function meanExt(gd, D, S, opt, onModel) {
    const t = theme();
    const p = opt.period;
    const rows = D.modelIds
      .map((m) => ({ m, x: D.rank(p, m, "mean_nrmse"), y: D.rank(p, m, "ext_nrmse"), rx: D.rank(p, m, "mean_rank"), ry: D.rank(p, m, "ext_rank") }))
      .filter((r) => r.x !== null && r.y !== null);
    const all = rows.flatMap((r) => [r.x, r.y]);
    const lo = 0,
      hi = Math.max(...all, 0.1) * 1.08;
    const pt = (rs, color, size, labels) => ({
      type: "scatter",
      mode: labels ? "markers+text" : "markers",
      x: rs.map((r) => r.x),
      y: rs.map((r) => r.y),
      text: labels ? rs.map((r) => r.m) : undefined,
      textposition: "top center",
      textfont: { color: t.text1 },
      marker: { color, size, line: { color: t.surface, width: 1.5 } },
      customdata: rs.map((r) => [r.m, Fmt.raw(r.x), Fmt.raw(r.y), r.rx ?? Fmt.NA, r.ry ?? Fmt.NA]),
      hovertemplate: "<b>%{customdata[0]}</b><br>평균장 NRMSE = %{customdata[1]} (%{customdata[3]}위)<br>극값장 NRMSE = %{customdata[2]} (%{customdata[4]}위)<extra></extra>",
    });
    const traces = [
      { type: "scatter", mode: "lines", x: [lo, hi], y: [lo, hi], line: { color: t.muted, dash: "dot", width: 1 }, hoverinfo: "skip" },
      pt(rows.filter((r) => !S.has(r.m)), S.size ? t.seriesSoft : t.series, 10, false),
      ...rows.filter((r) => S.has(r.m)).map((r) => pt([r], S.color(r.m), 14, true)),
    ];
    const lay = layout(t, {
      height: isNarrow() ? 380 : 520,
      margin: { l: 10, r: 20, t: 10, b: 10 },
      xaxis: axis(t, { title: { text: "평균장 NRMSE (mean)" }, range: [lo, hi], fixedrange: true }),
      yaxis: axis(t, { title: { text: "극값장 NRMSE (p5·p1·min 평균)" }, range: [lo, hi], fixedrange: true }),
      annotations: [{ x: hi * 0.97, y: hi * 0.97, text: "1:1", showarrow: false, font: { color: t.muted, size: 11 }, xanchor: "right" }],
    });
    draw(gd, traces, lay, onModel);
    return rows.length;
  }

  /* ---------- 6. 기간별 순위 변화 ---------- */
  function rankChange(gd, D, S, opt, onModel) {
    const t = theme();
    const key = CONFIG.rankBases[opt.basis].rank;
    const xs = D.periods.map(Fmt.period);
    const traces = [];
    const mk = (m, hi) => {
      const ys = D.periods.map((p) => D.rank(p, m, key));
      return {
        type: "scatter",
        mode: hi ? "lines+markers+text" : "lines+markers",
        x: xs,
        y: ys,
        text: hi ? ys.map((v) => (v === null ? "" : String(v))) : undefined,
        textposition: "top center",
        textfont: { color: t.text1, size: 12 },
        line: { color: hi ? S.color(m) : S.size ? t.grid : t.series, width: hi ? 3 : 1.5 },
        marker: { size: hi ? 10 : 6, color: hi ? S.color(m) : S.size ? t.grid : t.series },
        opacity: hi || !S.size ? (hi ? 1 : 0.55) : 1,
        connectgaps: false,
        customdata: ys.map((v, i) => [m, Fmt.period(D.periods[i]), v === null ? Fmt.NA : v]),
        hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]}: %{customdata[2]}위<extra></extra>",
      };
    };
    D.modelIds.filter((m) => !S.has(m)).forEach((m) => traces.push(mk(m, false)));
    S.list.filter((m) => D.modelIds.includes(m)).forEach((m) => traces.push(mk(m, true)));
    // 강조한 선이 여러 개일 때 구분되도록 오른쪽 끝에 모델 이름
    const lastP = D.periods[D.periods.length - 1];
    const ann = S.list
      .filter((m) => D.rank(lastP, m, key) !== null)
      .map((m) => ({
        x: xs[xs.length - 1],
        y: D.rank(lastP, m, key),
        text: m,
        xanchor: "left",
        xshift: 12,
        showarrow: false,
        font: { color: S.color(m), size: 11 },
      }));
    const nModels = D.modelIds.length;
    const lay = layout(t, {
      height: isNarrow() ? 440 : 560,
      margin: { l: 10, r: S.size ? 130 : 20, t: 20, b: 10 },
      hovermode: "closest",
      xaxis: axis(t, { fixedrange: true, showgrid: false }),
      yaxis: axis(t, { title: { text: `${CONFIG.rankBases[opt.basis].label} 순위 (1 = 최상)` }, autorange: false, range: [nModels + 0.8, 0.2], dtick: 2, fixedrange: true }),
      annotations: ann,
    });
    draw(gd, traces, lay, onModel);
  }

  /* ---------- 7. 편의 ---------- */
  function bias(gd, D, S, opt, onModel) {
    const t = theme();
    const { period: p, stat: s } = opt;
    let rows = D.modelIds.map((m) => ({ m, v: D.metric(p, s, m, "bias"), rmse: D.metric(p, s, m, "rmse") }));
    if (opt.sort === "value") rows.sort((a, b) => (a.v === null) - (b.v === null) || (a.v ?? 0) - (b.v ?? 0));
    const have = rows.filter((r) => r.v !== null);
    const traces = [
      {
        type: "bar",
        orientation: "h",
        y: have.map((r) => r.m),
        x: have.map((r) => r.v),
        marker: {
          color: have.map((r) => (S.has(r.m) ? S.color(r.m) : r.v >= 0 ? t.pos : t.neg)),
          line: { color: have.map((r) => (S.has(r.m) ? t.text1 : t.surface)), width: have.map((r) => (S.has(r.m) ? 2 : 1)) },
        },
        text: have.map((r) => r.v.toFixed(2)),
        textposition: "outside",
        cliponaxis: false,
        textfont: { color: t.text2, size: 11 },
        customdata: have.map((r) => [r.m, Fmt.raw(r.v), r.rmse === null ? Fmt.NA : `${r.rmse} ${D.units}`]),
        hovertemplate: `<b>%{customdata[0]}</b><br>편의 = %{customdata[1]} ${D.units}<br>RMSE = %{customdata[2]}<extra></extra>`,
      },
    ];
    // 값이 없는 모델은 막대 없이 '자료 없음' 글자만 (y축에는 남긴다)
    const missing = rows.filter((r) => r.v === null);
    traces.push({
      type: "scatter",
      mode: "markers",
      x: missing.map(() => null),
      y: missing.map((r) => r.m),
      marker: { size: 1, color: "rgba(0,0,0,0)" },
      customdata: missing.map((r) => [r.m]),
      hovertemplate: "<b>%{customdata[0]}</b><br>자료 없음<extra></extra>",
    });
    const vals = have.map((r) => r.v);
    const med = Data.num(D.summary(p)?.median?.[s]?.bias);
    const ext = Math.max(1, ...vals.map(Math.abs), med === null ? 0 : Math.abs(med)) * 1.25;
    // 왼쪽 끝에 적어 0 위치의 막대·선과 헷갈리지 않게 한다
    const ann = missing.map((r) => ({ x: -ext, y: r.m, text: "자료 없음", showarrow: false, xanchor: "left", font: { size: 10, color: t.muted } }));
    const shapes = [];
    if (med !== null) {
      shapes.push({ type: "line", x0: med, x1: med, yref: "paper", y0: 0, y1: 1, line: { color: t.text2, dash: "dash", width: 1.5 } });
      ann.push({ x: med, yref: "paper", y: 1.0, yanchor: "bottom", text: `summary 중앙값 ${med}`, showarrow: false, font: { size: 11, color: t.text2 } });
    }
    const lay = layout(t, {
      height: Math.max(440, rows.length * 24 + 90),
      bargap: 0.35,
      margin: { l: 10, r: 30, t: 30, b: 10 },
      xaxis: axis(t, { title: { text: `편의 (모델 − ERA5, ${D.units})` }, range: [-ext, ext], zeroline: true, zerolinewidth: 1.5, fixedrange: true }),
      yaxis: axis(t, {
        autorange: "reversed",
        fixedrange: true,
        categoryorder: "array",
        categoryarray: rows.map((r) => r.m),
        tickmode: "array",
        tickvals: rows.map((r) => r.m),
        ticktext: rows.map((r) => selTick(S, r.m)),
      }),
      annotations: ann,
      shapes,
    });
    draw(gd, traces, lay, onModel);
    return { n: have.length, total: rows.length, med };
  }

  return { theme, regionMap, portrait, taylor, taylorPoints, modelColors, rankBars, meanExt, rankChange, bias };
})();
