/* 선택한 모델만으로 순위와 Spearman ρ를 다시 계산한다.
   JSON의 원래 값(NRMSE, 상관계수, 편의 등)은 다시 계산하지 않는다.

   계산 방식은 원래 연구(tools/p9_viewer_data_from_transcript.py)와 같다.
   · 순위: NRMSE 오름차순(1 = 최상). 값이 같으면 같은 순위(낮은 숫자).
   · 평균장·극값장 순위만 예외: 값이 같아도 JSON의 원래 순위가 다르면 그 순서를 따른다
     (원래 스크립트도 반올림 때문에 생긴 동점을 원본 순서로 풀었다).
   · 종합 순위: JSON의 overall_nrmse(= (평균장 + 극값장) / 2)로 순위만 다시 매긴다. 동점은 같은 순위.
   · 순위합 순위: 다시 매긴 평균장 순위 + 극값장 순위로 순위를 매긴다. 동점은 같은 순위.
   · Spearman ρ, p: scipy.stats.spearmanr와 같은 방법. 동점은 평균 순위, 순위끼리 피어슨 상관,
     p는 t분포(자유도 n − 2) 양측. 저장 형식에 맞춰 ρ는 소수 셋째, p는 넷째 자리로 반올림한다. */
"use strict";

const Subset = (() => {
  const MIN_RANK = 2; // 순위: 모델 2개 이상
  const MIN_SPEARMAN = 3; // Spearman: 모델 3개 이상

  // 값 오름차순, 같은 값이면 원래 순위 순. 같은 값 + 같은 원래 순위면 같은 순위.
  function rankRule(ids, val, orig) {
    const list = ids.filter((m) => val(m) !== null);
    const o = (m) => (orig(m) === null ? Infinity : orig(m));
    list.sort((a, b) => val(a) - val(b) || o(a) - o(b));
    const out = {};
    list.forEach((m, i) => {
      const prev = list[i - 1];
      out[m] = prev !== undefined && val(m) === val(prev) && o(m) === o(prev) ? out[prev] : i + 1;
    });
    return out;
  }

  // 한 기간의 순위 4종을 다시 매긴다. ids가 MIN_RANK 미만이면 모두 null.
  function ranks(D, p, ids) {
    const R = (m, k) => D.rank(p, m, k);
    const res = {};
    ids.forEach((m) => (res[m] = { mean_rank: null, ext_rank: null, overall_rank: null, ranksum_rank: null }));
    if (ids.length < MIN_RANK) return res;
    const rm = rankRule(ids, (m) => R(m, "mean_nrmse"), (m) => R(m, "mean_rank"));
    const re = rankRule(ids, (m) => R(m, "ext_nrmse"), (m) => R(m, "ext_rank"));
    const none = () => 0; // 원래 순서로 풀지 않음 (동점 = 같은 순위)
    const ro = rankRule(ids, (m) => R(m, "overall_nrmse"), none);
    const sum = (m) => (rm[m] === undefined || re[m] === undefined ? null : rm[m] + re[m]);
    const rs = rankRule(ids, sum, none);
    ids.forEach((m) => {
      res[m].mean_rank = rm[m] ?? null;
      res[m].ext_rank = re[m] ?? null;
      res[m].overall_rank = ro[m] ?? null;
      res[m].ranksum_rank = rs[m] ?? null;
    });
    return res;
  }

  /* ---------- Spearman ---------- */
  function avgRank(x) {
    const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
    const r = new Array(x.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && x[idx[j + 1]] === x[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }
  function pearson(a, b) {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n,
      mb = b.reduce((s, v) => s + v, 0) / n;
    let sab = 0,
      saa = 0,
      sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return saa === 0 || sbb === 0 ? null : sab / Math.sqrt(saa * sbb);
  }
  // 로그 감마 (Lanczos)
  function lgamma(z) {
    const g = 7,
      c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  // 정규화된 불완전 베타 함수 (연분수)
  function betacf(a, b, x) {
    const FPMIN = 1e-300;
    let c = 1,
      d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-16) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  const round = (x, nd) => Number(x.toFixed(nd));

  // 짝을 이룬 값(둘 다 있는 모델만)으로 ρ와 p. MIN_SPEARMAN 미만이면 null.
  function spearman(ids, fa, fb) {
    const a = [],
      b = [];
    ids.forEach((m) => {
      const x = fa(m),
        y = fb(m);
      if (x !== null && y !== null) {
        a.push(x);
        b.push(y);
      }
    });
    const n = a.length;
    if (n < MIN_SPEARMAN) return null;
    const r = pearson(avgRank(a), avgRank(b));
    if (r === null) return null;
    const df = n - 2;
    let p;
    if (Math.abs(r) >= 1) p = 0;
    else {
      const t = r * Math.sqrt(df / (1 - r * r));
      p = ibeta(df / 2, 0.5, df / (df + t * t));
    }
    return { rho: round(r, 3), p: round(p, 4), n };
  }

  // 한 기간의 summary를 다시 계산. 중앙값은 원래 연구와 같은 값을 낼 수 없어 null로 둔다.
  function summary(D, p, ids) {
    const R = (pp, m, k) => D.rank(pp, m, k);
    const out = {
      spearman_mean_vs_ext: spearman(ids, (m) => R(p, m, "mean_nrmse"), (m) => R(p, m, "ext_nrmse")),
      median: null,
      recalculated: true,
    };
    const first = D.periods[0];
    if (p !== first) {
      out.spearman_vs_entire_mean = spearman(ids, (m) => R(p, m, "mean_nrmse"), (m) => R(first, m, "mean_nrmse"));
      out.spearman_vs_entire_ext = spearman(ids, (m) => R(p, m, "ext_nrmse"), (m) => R(first, m, "ext_nrmse"));
    }
    return out;
  }

  /* 선택한 모델만 보이는 자료 보기. 전체를 선택하면 원래 자료를 그대로 돌려준다(JSON 값 사용).
     원래 자료(D)의 함수는 바꾸지 않고, 보기 객체에서만 모델 목록·순위·summary를 바꿔 끼운다. */
  function view(D, ids) {
    const keep = D.modelIds.filter((m) => ids.includes(m));
    if (keep.length === D.modelIds.length) return D;
    const rankCache = {},
      sumCache = {};
    const rk = (p) => (rankCache[p] = rankCache[p] || ranks(D, p, keep));
    return Object.assign(Object.create(D), {
      subset: true,
      allModelIds: D.modelIds,
      modelIds: keep,
      models: D.models.filter((m) => keep.includes(m.id)),
      rank(p, m, k) {
        if (!keep.includes(m)) return null;
        if (k.endsWith("_rank")) return rk(p)[m]?.[k] ?? null;
        return D.rank(p, m, k);
      },
      summary(p) {
        return (sumCache[p] = sumCache[p] || summary(D, p, keep));
      },
    });
  }

  return { view, ranks, summary, spearman, MIN_RANK, MIN_SPEARMAN };
})();
