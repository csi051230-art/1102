/* 뷰어 설정: 화면 문구와 표시 규칙. 자료 값은 여기 두지 않는다. */
"use strict";

const CONFIG = {
  datasetsIndex: "data/datasets.json",
  fallbackDataset: { id: "default", file: "data/viewer_data.json" },
  topojsonURL: "vendor/topojson/",

  // 개요 [분석 설정]에 JSON 대신 보여줄 문구. null로 두면 JSON meta 값을 쓴다.
  overview: {
    reference: "ERA5",
    region: "14~54°N, 114~154°E",
    commonGrid: "1.875°×1.25° = 494 points",
  },

  // 개요 설명에 쓰는 변수의 한국어 이름. 없으면 JSON meta.variable.long_name을 쓴다.
  varNames: {
    psl: "해면기압",
    uas: "지상 동서풍",
    vas: "지상 남북풍",
  },

  // 비슷한 기관을 한 묶음으로 보는 규칙 (Taylor diagram 색). institution_id → 묶음 이름.
  // 여기 없는 institution_id는 그 자체가 묶음 이름이다. 같은 묶음의 모델은 비슷한 색에서 밝기만 다르다.
  familyAlias: {
    "CSIRO-ARCCSS": "CSIRO",
  },

  // Taylor diagram을 그릴 기간. 원본 결과로 교체한 뒤 다른 기간도 그리려면 여기에 추가한다.
  taylorPeriods: ["Entire"],

  periodLabels: {
    Entire: "전체 (Entire)",
    JJA: "여름 (JJA)",
    June: "6월 (June)",
    July: "7월 (July)",
    August: "8월 (August)",
  },
  statLabels: {
    mean: "평균 (mean)",
    p5: "5백분위 (p5)",
    p1: "1백분위 (p1)",
    min: "최솟값 (min)",
  },

  // Taylor 값 출처. JSON에 없는 출처 이름은 'unknown' 규칙으로 표시한다.
  sources: {
    printed: {
      label: "출력값",
      symbol: "circle",
      error: "분석 코드가 출력한 값 (그림 추출 오차 없음)",
    },
    digitized: {
      label: "그림 추출값",
      symbol: "circle-open",
      error: "그림에서 마커 위치를 추출 (±0.01)",
    },
    digitized_occluded: {
      label: "추출값 · 일부 가려짐",
      symbol: "diamond-open",
      error: "다른 마커에 일부 가려진 상태에서 추출 (±0.02~0.03)",
    },
    digitized_hidden: {
      label: "추출 불가 · 덮은 마커 위치 사용",
      symbol: "x-open",
      error: "완전히 가려져 덮은 마커의 위치를 대신 사용 — 실제 위치가 아님",
    },
    unknown: {
      label: "출처 미표기",
      symbol: "square-open",
      error: "JSON에 출처(taylor_source)가 적혀 있지 않음",
    },
  },

  rankBases: {
    overall: { label: "종합", nrmse: "overall_nrmse", rank: "overall_rank" },
    mean: { label: "평균장", nrmse: "mean_nrmse", rank: "mean_rank" },
    ext: { label: "극값장", nrmse: "ext_nrmse", rank: "ext_rank" },
    ranksum: { label: "순위합", nrmse: null, rank: "ranksum_rank" },
  },

  tabs: [
    { id: "overview", label: "개요" },
    { id: "portrait", label: "Portrait plot" },
    { id: "taylor", label: "Taylor diagram" },
    { id: "rank", label: "순위" },
    { id: "rankchange", label: "순위 변화" },
    { id: "meanext", label: "평균장-극한장 관계" },
    { id: "bias", label: "편의" },
    { id: "resolution", label: "해상도 대 성능" },
  ],
};
