/* 자료 읽기와 접근. 값은 바꾸지 않는다: 숫자가 아니면 모두 null(자료 없음)로 다룬다. */
"use strict";

const Data = (() => {
  const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

  function validate(d) {
    const errors = [];
    if (!d || typeof d !== "object") return ["JSON 최상위가 객체가 아닙니다."];
    if (!Array.isArray(d.models) || !d.models.length) errors.push("models 배열이 없습니다.");
    if (!Array.isArray(d.periods) || !d.periods.length) errors.push("periods 배열이 없습니다.");
    if (!Array.isArray(d.stats) || !d.stats.length) errors.push("stats 배열이 없습니다.");
    if (!d.metrics || typeof d.metrics !== "object") errors.push("metrics 객체가 없습니다.");
    if (!d.rankings || typeof d.rankings !== "object") errors.push("rankings 객체가 없습니다.");
    return errors;
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  async function loadIndex() {
    try {
      const idx = await fetchJSON(CONFIG.datasetsIndex);
      if (Array.isArray(idx.datasets) && idx.datasets.length) return idx.datasets;
    } catch (e) {
      console.warn("datasets.json을 읽지 못해 기본 파일을 사용합니다:", e.message);
    }
    return [CONFIG.fallbackDataset];
  }

  // 자료 접근기. 모든 함수가 값이 없으면 null을 돌려준다.
  function wrap(d, sourceLabel) {
    const modelIds = d.models.map((m) => m.id);
    const modelById = Object.fromEntries(d.models.map((m) => [m.id, m]));
    const meta = d.meta || {};
    const v = meta.variable || {};
    return {
      raw: d,
      sourceLabel,
      meta,
      varName: v.name || "?",
      varLong: v.long_name || v.name || "?",
      units: v.units || "",
      models: d.models,
      modelIds,
      model: (id) => modelById[id],
      periods: d.periods,
      stats: d.stats,
      metricObj: (p, s, m) => d.metrics?.[p]?.[s]?.[m] ?? null,
      metric(p, s, m, k) {
        const o = d.metrics?.[p]?.[s]?.[m];
        return o ? num(o[k]) : null;
      },
      rank(p, m, k) {
        const o = d.rankings?.[p]?.[m];
        return o ? num(o[k]) : null;
      },
      refSd: (p, s) => num(d.reference_sd?.[p]?.[s]),
      summary: (p) => d.summary?.[p] ?? null,
    };
  }

  return { num, validate, fetchJSON, loadIndex, wrap };
})();

/* 표시용 보조 함수 */
const Fmt = {
  NA: "자료 없음",
  n(x, nd = 2) {
    return x === null || x === undefined ? Fmt.NA : x.toFixed(nd);
  },
  // JSON 값을 반올림 없이 그대로 보여줄 때 사용
  raw(x) {
    return x === null || x === undefined ? Fmt.NA : String(x);
  },
  p(x) {
    if (x === null || x === undefined) return Fmt.NA;
    return x.toFixed(4); // JSON 값 그대로 (0.0000은 JSON에 0으로 적힌 값)
  },
  period: (p) => CONFIG.periodLabels[p] || p,
  stat: (s) => CONFIG.statLabels[s] || s,
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  },
};
