# CMIP6 ScenarioMIP _ Model performance evaluate

CMIP6 전지구 기후모델(GCM) 21개가 북서태평양의 해면기압(psl)을 얼마나 잘 재현하는지 ERA5와 비교 평가한 결과를,
웹 브라우저에서 클릭하며 살펴볼 수 있게 만든 정적 뷰어입니다.

> ⚠ **임시(PROVISIONAL) 자료**: 지금 들어 있는 값은 원본 결과 파일이 아니라 분석 그림과 출력값에서 옮겨 적은 것입니다.
> 나중에 원본 결과로 다시 만든 JSON으로 교체할 예정입니다.

- **사이트 주소**: <https://csi051230-art.github.io/1102/>
- **로컬 미리보기**: `view.bat`을 더블클릭하면 <http://localhost:8000/>이 열립니다 (Python 3 필요).

## 연구 개요

| 항목 | 내용 |
|---|---|
| 변수 | 해면기압 psl [hPa] |
| 모델 | CMIP6 GCM 21개, historical, r1i1p1f1, 일자료 |
| 기준 자료 | ERA5 일평균 (시간자료 → 일평균) |
| 기간 | 1979-01-01 ~ 2014-12-31 (36년) |
| 영역 | 북서태평양 115.3–149.1°E, 20.6–51.9°N |
| 비교 방법 | 각 모델의 원래 격자에서 통계량을 구한 뒤 약 1.9° 공통 격자(19×26 = 494점)로 쌍선형 보간, cos(위도) 면적가중 |
| 구분 기간 | Entire(전체), JJA(6–8월), June, July, August |
| 통계량 | mean(평균), p5, p1(5·1 백분위), min(최솟값) |
| 지표 | NRMSE(= RMSE ÷ ERA5 공간 표준편차), 상관계수, 표준편차비, centred RMSE, 편의, 순위 |

## 뷰어 화면

| 탭 | 내용 |
|---|---|
| 개요 | 연구 설명, 영역 지도, 분석 설정, 모델 정보 표 (자료 생성일은 화면 위쪽에 표시) |
| Portrait plot | 모델 × 통계량 NRMSE 격자 (기간 선택) |
| Taylor diagram | 상관계수·표준편차비·centred RMSE. **전체(Entire) 기간만** 그림. 모델마다 다른 색이며, 같은 기관 모델끼리 비슷한 색 |
| 순위 | 평균장·극값장·종합·순위합 기준 막대와 정렬 가능한 표 |
| 평균장 대 극값장 | mean NRMSE 대 극값장 NRMSE 산점도와 Spearman ρ, p |
| 기간별 순위 변화 | Entire → JJA → 6·7·8월 순위를 선으로 연결 |
| 편의 | 모델별 편의 막대 (값이 없는 모델은 "자료 없음") |
| 해상도 대 성능 | 원래 격자 간격 대 NRMSE·순위 (참고용 탐색 그림) |

### 사용법
- 위쪽 메뉴에서 **변수**, **기간**, **통계량**을 고릅니다.
- 그림의 점·막대·칸이나 표의 행을 **클릭하면 그 모델이 모든 그림에서 강조**되고, 다시 클릭하면 해제됩니다.
  "모델 강조" 메뉴에서 골라도 됩니다.
- 마우스를 올리면(휴대폰은 탭) 값이 보입니다. 칸·막대 위 숫자는 반올림해 표시하고, 툴팁에는 JSON 값을 그대로 보여 줍니다.
- 오른쪽 위 버튼으로 밝은 모드·어두운 모드·자동(시스템 설정)을 바꿉니다.
- 같은 구조의 JSON을 **화면에 끌어다 놓거나 "JSON 열기"** 로 열면 그 파일로 바꿔 볼 수 있습니다.
  파일은 브라우저 안에서만 읽으며 어디에도 전송되지 않습니다. "기본 자료로"를 누르면 돌아옵니다.

## 자료의 임시 성격과 출처 구분

`docs/data/viewer_data.json`은 `tools/p9_viewer_data_from_transcript.py`가 만든 임시 자료입니다.
원본 분석 코드와 원자료(CMIP6, ERA5)는 이 저장소에 없습니다.

| 항목 | 값이 있는 범위 |
|---|---|
| NRMSE, 순위 | 21개 모델, 모든 기간·통계량 |
| 상관계수, 표준편차비, centred RMSE | Entire: 21개 모델 / JJA: 상관계수·표준편차비 8개 모델 (min 상관계수만 15개), centred RMSE 없음 / 6·7·8월: 없음 |
| 편의, RMSE | Entire·JJA의 8개 모델만 |
| 공간 격자값 | 없음 |

Entire 기간의 Taylor 값에는 `taylor_source`로 출처가 적혀 있습니다
(`printed` = 출력값, `digitized` = 그림 추출 ±0.01, `digitized_occluded` = 일부 가려짐 ±0.02~0.03,
`digitized_hidden` = 완전히 가려져 덮은 마커 위치를 대신 사용).
원본 결과로 교체하면 모두 출력값이 되므로, 뷰어는 출처를 따로 표시하지 않습니다.
단, `digitized_hidden`인 점은 실제 위치가 아니므로 ✕ 마커와 경고 문구로 구분합니다.

현재 `digitized_hidden`은 min 통계량의 EC-Earth3 하나이며, 상관계수·표준편차비가 EC-Earth3-Veg-LR과 같습니다.

**뷰어는 JSON 값을 바꾸거나 보간·추정하지 않습니다.** 빈 값(null)은 0으로 그리지 않고 "자료 없음"으로 표시합니다.
JSON 값에서 정의상 계산되는 것만 화면에서 계산하며, 그 경우 "계산값"이라고 표시합니다.
- 해상도 대 성능의 "경도·위도 평균" 격자 간격 = (경도 간격 + 위도 간격) ÷ 2
- 순위의 "순위 합" = 평균장 순위 + 극값장 순위
- centred RMSE가 비어 있고 상관계수 r·표준편차비 k·ERA5 표준편차 σ가 있을 때: σ·√(1 + k² − 2kr)
  (현재 자료에서는 Taylor diagram을 그리는 Entire의 centred RMSE가 모두 들어 있어 이 계산이 쓰이지 않습니다)

## JSON 교체 방법 (원본 결과로 갱신)

1. 원본 결과가 있는 PC에서 `p8_viewer_data.py`로 **같은 구조**의 `viewer_data.json`을 만듭니다.
2. 교체 전에 사이트나 `view.bat` 화면에 새 파일을 끌어다 놓아 미리 확인할 수 있습니다.
3. 그 파일로 `docs/data/viewer_data.json`을 덮어씁니다.
4. 커밋하고 push하면 몇 분 안에 사이트에 반영됩니다.
   ```bash
   git add docs/data/viewer_data.json
   git commit -m "Replace provisional data with original results"
   git push
   ```
5. 자료를 만든 스크립트도 `tools/`에 함께 넣어 출처를 남겨 주세요.

뷰어가 읽는 주요 키: `meta`(제목, data_status, generated, variable, region, …), `models`, `periods`, `stats`,
`reference_sd`, `metrics[기간][통계량][모델]`, `rankings[기간][모델]`, `summary[기간]`.

### 변수 추가 (uas, vas 등)
`docs/data/`에 같은 구조의 JSON(예: `viewer_data_uas.json`)을 넣고 `docs/data/datasets.json`에 한 줄을 추가하면
변수 메뉴에 나타납니다. 변수 이름과 단위는 각 JSON의 `meta.variable`에서 읽습니다.
```json
{ "datasets": [
  { "id": "psl", "file": "data/viewer_data.json" },
  { "id": "uas", "file": "data/viewer_data_uas.json" }
] }
```
Taylor diagram을 그릴 기간은 `docs/js/config.js`의 `taylorPeriods`에서 바꿉니다.

## 폴더 구조

```
docs/                     GitHub Pages 배포 소스
  index.html, css/, js/   뷰어 (config.js 설정, data.js 자료 접근, charts.js 그림, app.js 화면)
  data/viewer_data.json   뷰어 자료 (이 파일만 바꾸면 갱신)
  data/datasets.json      변수 목록
  vendor/                 Plotly.js 4.2.0, 해안선 topojson (외부 CDN 없이 동작)
  .nojekyll
tools/p9_viewer_data_from_transcript.py   임시 JSON을 만든 스크립트 (출처 기록용)
view.bat                  로컬 미리보기
```

## 사용한 외부 자료와 라이선스

| 구성요소 | 버전·출처 | 라이선스 |
|---|---|---|
| Plotly.js | **4.2.0** 고정. npm `plotly.js-dist-min@4.2.0` (https://cdn.jsdelivr.net/npm/plotly.js-dist-min@4.2.0/plotly.min.js) | MIT (`docs/vendor/plotly-4.2.0/LICENSE`) |
| 해안선 `world_50m.json` | Natural Earth 1:50m 기반 topojson. npm `plotly.js@2.35.3`의 `dist/topojson/world_50m.json` (https://cdn.jsdelivr.net/npm/plotly.js@2.35.3/dist/topojson/world_50m.json, sane-topojson으로 생성). Plotly 4.x 패키지에는 이 파일이 들어 있지 않아 2.35.3 배포본에서 가져왔습니다 | Natural Earth 자료: public domain / plotly.js·sane-topojson: MIT |

두 파일은 2026-11-01에 받아 저장소에 포함했으며, 사이트는 외부 CDN을 부르지 않습니다.

## 인용

`CITATION.cff`를 참고하세요. GitHub 저장소 화면의 "Cite this repository"에서도 볼 수 있습니다.
현재 자료는 임시 자료이므로, 인용할 때 버전(`1.0-provisional`)과 접속 날짜를 함께 적어 주세요.

- 코드: MIT License
- 평가 결과 자료(`docs/data/*.json`): CC BY 4.0
- 자세한 내용은 `LICENSE`를 보세요.

## 공개 범위 안내

이 저장소는 **Private**이지만, GitHub Pages 사이트(<https://csi051230-art.github.io/1102/>)는
**주소를 아는 누구나 로그인 없이 볼 수 있습니다.** `docs/` 폴더에 들어간 파일(JSON 포함)은 모두 공개된다고 생각하세요.
공개하면 안 되는 자료는 `docs/`에 넣지 마세요.
