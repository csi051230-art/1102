# -*- coding: utf-8 -*-
"""
p9_viewer_data_from_transcript.py — 원본 결과 파일 없이 만드는 임시(provisional) viewer_data.json

원본 결과(H:\\Anaylsis(byClaude)\\psl_eval\\results)에 접근할 수 없을 때를 위한 대체판.
값은 모두 실제 계산 결과를 그림·출력에서 옮겨 적은 것 (임의 값 없음):
  · 통계량별 NRMSE (mean·p5·p1·min): portrait plot 값, 소수 둘째 자리
  · 평균장·극한장 NRMSE: 순위 막대·출력 값, 소수 셋째 자리
  · Entire 상관·표준편차비: 21개 모델 전부 (Taylor diagram 값, 8개는 출력값, 나머지는 그림에서 마커 위치 추출)
    → sd_mod, crmse 는 이 값에서 계산. taylor_source 로 출처 표시
  · 그 밖의 기간 상관·편의·표준편차비·RMSE: 출력했던 8개 모델만, 나머지는 null
  · 공통 격자 지도(fields): 없음
원본에 접근할 수 있게 되면 p8_viewer_data.py 로 다시 만들어 이 파일을 교체할 것 (JSON 구조 동일).
사용: python p9_viewer_data_from_transcript.py <출력 json 경로>
"""
import sys, json, datetime
import numpy as np
from scipy.stats import spearmanr

MODELS = ["ACCESS-CM2", "ACCESS-ESM1-5", "AWI-ESM-1-REcoM", "CMCC-CM2-SR5", "CMCC-ESM2", "CanESM5",
          "EC-Earth3", "EC-Earth3-Veg", "EC-Earth3-Veg-LR", "GFDL-ESM4", "IITM-ESM", "INM-CM4-8",
          "INM-CM5-0", "IPSL-CM6A-LR", "KACE-1-0-G", "KIOST-ESM", "MIROC6", "MPI-ESM1-2-HR",
          "MPI-ESM1-2-LR", "MRI-ESM2-0", "NESM3"]
PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
           "#bcbd22", "#17becf", "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173", "#5254a3",
           "#a55194", "#bd9e39", "#ad494a", "#8ca252", "#000000"]
PERIODS = ["Entire", "JJA", "June", "July", "August"]
STATS = ["mean", "p5", "p1", "min"]

# ---------------- 모델 정보 (ESGF psl_day historical 파일 전역속성·좌표) ----------------
# institution_id, nlon, nlat, dlon, dlat, nominal, grid_label, calendar
INFO = {
 "ACCESS-CM2": ("CSIRO-ARCCSS", 192, 144, 1.875, 1.25, "250 km", "gn", "proleptic_gregorian"),
 "ACCESS-ESM1-5": ("CSIRO", 192, 145, 1.875, 1.25, "250 km", "gn", "proleptic_gregorian"),
 "AWI-ESM-1-REcoM": ("AWI", 192, 96, 1.875, 1.8652, "250 km", "gn", "proleptic_gregorian"),
 "CanESM5": ("CCCma", 128, 64, 2.8125, 2.7905, "500 km", "gn", "365_day"),
 "CMCC-CM2-SR5": ("CMCC", 288, 192, 1.25, 0.9424, "100 km", "gn", "365_day"),
 "CMCC-ESM2": ("CMCC", 288, 192, 1.25, 0.9424, "100 km", "gn", "365_day"),
 "EC-Earth3": ("EC-Earth-Consortium", 512, 256, 0.7031, 0.7018, "100 km", "gr", "proleptic_gregorian"),
 "EC-Earth3-Veg": ("EC-Earth-Consortium", 512, 256, 0.7031, 0.7018, "100 km", "gr", "proleptic_gregorian"),
 "EC-Earth3-Veg-LR": ("EC-Earth-Consortium", 320, 160, 1.125, 1.1215, "250 km", "gr", "proleptic_gregorian"),
 "GFDL-ESM4": ("NOAA-GFDL", 288, 180, 1.25, 1.0, "100 km", "gr1", "noleap"),
 "IITM-ESM": ("CCCR-IITM", 192, 94, 1.875, 1.9047, "250 km", "gn", "julian"),
 "INM-CM4-8": ("INM", 180, 120, 2.0, 1.5, "100 km", "gr1", "365_day"),
 "INM-CM5-0": ("INM", 180, 120, 2.0, 1.5, "100 km", "gr1", "365_day"),
 "IPSL-CM6A-LR": ("IPSL", 144, 143, 2.5, 1.2676, "250 km", "gr", "gregorian"),
 "KACE-1-0-G": ("NIMS-KMA", 192, 144, 1.875, 1.25, "250 km", "gr", "360_day"),
 "KIOST-ESM": ("KIOST", 192, 96, 1.875, 1.8947, "250 km", "gr1", "365_day"),
 "MIROC6": ("MIROC", 256, 128, 1.4062, 1.4008, "250 km", "gn", "gregorian"),
 "MPI-ESM1-2-HR": ("MPI-M", 384, 192, 0.9375, 0.9351, "100 km", "gn", "proleptic_gregorian"),
 "MPI-ESM1-2-LR": ("MPI-M", 192, 96, 1.875, 1.8652, "250 km", "gn", "proleptic_gregorian"),
 "MRI-ESM2-0": ("MRI", 320, 160, 1.125, 1.1215, "100 km", "gn", "proleptic_gregorian"),
 "NESM3": ("NUIST", 192, 96, 1.875, 1.8652, "250 km", "gn", "standard"),
}
INST = {"CSIRO-ARCCSS": ("Commonwealth Scientific and Industrial Research Organisation / Australian Research Council Centre of Excellence for Climate System Science", "Australia"),
        "CSIRO": ("Commonwealth Scientific and Industrial Research Organisation", "Australia"),
        "AWI": ("Alfred Wegener Institute, Helmholtz Centre for Polar and Marine Research", "Germany"),
        "CMCC": ("Fondazione Centro Euro-Mediterraneo sui Cambiamenti Climatici", "Italy"),
        "CCCma": ("Canadian Centre for Climate Modelling and Analysis", "Canada"),
        "EC-Earth-Consortium": ("EC-Earth Consortium", "Europe"),
        "NOAA-GFDL": ("NOAA Geophysical Fluid Dynamics Laboratory", "USA"),
        "CCCR-IITM": ("Centre for Climate Change Research, Indian Institute of Tropical Meteorology", "India"),
        "INM": ("Institute for Numerical Mathematics, Russian Academy of Science", "Russia"),
        "IPSL": ("Institut Pierre-Simon Laplace", "France"),
        "NIMS-KMA": ("National Institute of Meteorological Sciences / Korea Meteorological Administration", "Korea"),
        "KIOST": ("Korea Institute of Ocean Science and Technology", "Korea"),
        "MIROC": ("JAMSTEC, AORI (Univ. of Tokyo), NIES, and RIKEN R-CCS", "Japan"),
        "MPI-M": ("Max Planck Institute for Meteorology", "Germany"),
        "MRI": ("Meteorological Research Institute", "Japan"),
        "NUIST": ("Nanjing University of Information Science and Technology", "China")}

# ---------------- 통계량별 NRMSE (portrait plot, 소수 둘째 자리) ----------------
# 각 기간: mean, p5, p1, min
NR = {
 #                  Entire                      JJA                        June                       July                        August
 "CMCC-ESM2":       [(.68,.35,.31,.69),  (.36,.30,.65,1.04), (.34,.48,.63,1.21), (.40,.26,.49,1.10), (.55,.47,.86,.96)],
 "CMCC-CM2-SR5":    [(.68,.38,.35,.81),  (.36,.46,.72,1.02), (.25,.58,.79,1.22), (.45,.49,.64,1.09), (.66,.61,.79,.96)],
 "ACCESS-CM2":      [(.78,.45,.39,.90),  (.47,.67,.76,.92),  (.42,.61,.76,1.00), (.40,.51,.67,1.08), (.72,.81,.70,.85)],
 "KACE-1-0-G":      [(.88,.54,.47,1.02), (.51,.85,.84,1.10), (.33,.59,.85,1.19), (.50,.57,.66,.97),  (1.03,1.20,.82,.99)],
 "ACCESS-ESM1-5":   [(.53,.64,.66,.78),  (.44,1.09,1.02,.85),(.34,.48,.52,.88),  (.36,.81,1.11,.84), (1.04,1.53,.80,.81)],
 "MPI-ESM1-2-HR":   [(.32,.50,.48,1.33), (.47,.30,.90,1.50), (.24,.41,.56,1.21), (.51,.48,.66,1.24), (.93,1.19,1.56,1.59)],
 "MRI-ESM2-0":      [(.66,.70,.72,.89),  (.38,.83,1.08,1.07),(.52,1.02,1.21,1.46),(.35,.50,.61,1.06), (.54,.63,.73,.86)],
 "GFDL-ESM4":       [(.43,.61,.67,1.06), (.56,.49,.68,1.23), (.50,.65,.81,1.30), (.57,.51,.66,1.13), (.68,.72,1.06,1.11)],
 "IITM-ESM":        [(2.07,.73,.65,.98), (.62,.70,.82,.98),  (.88,.52,.48,1.00), (.50,.74,.99,1.15), (.69,.81,.73,.89)],
 "EC-Earth3-Veg":   [(.43,.55,.61,1.22), (.34,.49,.81,1.32), (.31,.66,.80,1.23), (.34,.41,.65,1.26), (.59,.49,.88,1.11)],
 "MIROC6":          [(1.62,.87,.64,.95), (1.04,.96,1.01,1.27),(1.11,1.03,.94,1.07),(.70,.64,.64,1.16),(1.39,1.22,1.20,1.29)],
 "EC-Earth3-Veg-LR":[(.45,.54,.70,1.26), (.35,.45,.95,1.49), (.32,.68,.97,1.28), (.36,.38,.70,1.32), (.47,.54,1.18,1.35)],
 "EC-Earth3":       [(.49,.58,.65,1.27), (.38,.41,.86,1.43), (.29,.57,.76,1.28), (.36,.35,.64,1.39), (.62,.47,1.10,1.27)],
 "MPI-ESM1-2-LR":   [(.43,.60,.69,1.32), (.55,.50,.96,1.61), (.31,.58,.61,1.10), (.57,.52,.81,1.55), (.91,.89,1.30,1.48)],
 "CanESM5":         [(.54,.83,.63,1.15), (.88,.94,.89,1.21), (.61,.73,.75,.97),  (.79,.79,.84,1.29), (1.43,.99,.80,1.07)],
 "NESM3":           [(.55,.80,.82,1.23), (.79,.95,.81,1.16), (.57,.96,1.27,1.35),(.94,1.14,1.11,1.07),(.84,.83,.99,1.34)],
 "KIOST-ESM":       [(2.56,1.21,.88,.87),(2.11,1.45,1.47,.97),(1.70,1.10,1.40,1.41),(1.88,1.46,1.53,1.14),(2.71,2.09,1.47,1.02)],
 "INM-CM5-0":       [(.62,.45,.82,1.76), (.39,.91,1.92,2.13),(.26,.47,.67,1.51), (.60,1.15,1.89,2.28),(.43,1.35,1.99,1.92)],
 "AWI-ESM-1-REcoM": [(.55,.77,1.07,1.70),(1.10,1.13,1.91,2.06),(.64,.74,.72,1.41),(1.07,1.04,1.46,1.89),(1.74,2.15,2.32,2.00)],
 "INM-CM4-8":       [(.54,.57,.99,2.00), (.49,1.21,2.31,2.31),(.33,.60,.76,1.58), (.64,1.32,2.11,2.48),(.54,1.81,2.33,2.12)],
 "IPSL-CM6A-LR":    [(1.24,1.10,1.30,1.78),(.56,1.01,1.93,2.08),(.70,1.03,1.18,1.72),(.48,.80,1.42,1.92),(.67,1.70,2.09,1.91)],
}

# ---------------- 평균장·극한장 NRMSE (소수 셋째 자리) ----------------
# (mean, ext) for Entire, JJA, June, July, August
ME = {
 "CMCC-ESM2":       [(.676,.450),(.358,.662),(.343,.772),(.400,.616),(.547,.763)],
 "CMCC-CM2-SR5":    [(.679,.515),(.364,.736),(.250,.864),(.454,.740),(.661,.787)],
 "ACCESS-CM2":      [(.784,.577),(.467,.783),(.417,.789),(.403,.752),(.716,.786)],
 "KACE-1-0-G":      [(.885,.675),(.508,.932),(.330,.876),(.498,.736),(1.030,1.007)],
 "ACCESS-ESM1-5":   [(.526,.692),(.441,.985),(.340,.630),(.356,.918),(1.037,1.047)],
 "MPI-ESM1-2-HR":   [(.319,.770),(.471,.903),(.243,.723),(.507,.790),(.928,1.448)],
 "MRI-ESM2-0":      [(.664,.772),(.375,.992),(.523,1.229),(.352,.725),(.540,.739)],
 "GFDL-ESM4":       [(.430,.780),(.559,.801),(.501,.922),(.566,.767),(.683,.966)],
 "IITM-ESM":        [(2.074,.788),(.622,.834),(.880,.666),(.502,.962),(.694,.812)],
 "EC-Earth3-Veg":   [(.429,.790),(.340,.872),(.308,.900),(.341,.772),(.586,.828)],
 "MIROC6":          [(1.625,.823),(1.037,1.081),(1.108,1.010),(.703,.813),(1.388,1.238)],
 "EC-Earth3-Veg-LR":[(.449,.832),(.346,.964),(.324,.978),(.361,.801),(.468,1.022)],
 "EC-Earth3":       [(.493,.833),(.381,.901),(.292,.871),(.358,.794),(.624,.947)],
 "MPI-ESM1-2-LR":   [(.430,.872),(.545,1.023),(.308,.764),(.571,.962),(.909,1.223)],
 "CanESM5":         [(.544,.872),(.885,1.012),(.613,.818),(.786,.975),(1.433,.952)],
 "NESM3":           [(.551,.951),(.788,.972),(.572,1.191),(.940,1.108),(.836,1.050)],
 "KIOST-ESM":       [(2.558,.985),(2.108,1.298),(1.698,1.303),(1.882,1.378),(2.710,1.525)],
 "INM-CM5-0":       [(.625,1.012),(.392,1.650),(.262,.882),(.597,1.774),(.426,1.754)],
 "AWI-ESM-1-REcoM": [(.550,1.180),(1.096,1.701),(.644,.956),(1.069,1.466),(1.743,2.160)],
 "INM-CM4-8":       [(.540,1.185),(.494,1.944),(.335,.981),(.639,1.972),(.544,2.090)],
 "IPSL-CM6A-LR":    [(1.235,1.397),(.557,1.672),(.702,1.311),(.484,1.378),(.669,1.900)],
}
# 동점(셋째 자리 반올림)일 때 원본 순위 (Entire 평균장: EC-Earth3-Veg 2, MPI-ESM1-2-LR 3, GFDL-ESM4 4 / 극한장: EC-Earth3-Veg-LR 12, EC-Earth3 13, MPI-ESM1-2-LR 14, CanESM5 15)
TIEBREAK = {("Entire", "mean"): ["MPI-ESM1-2-HR", "EC-Earth3-Veg", "MPI-ESM1-2-LR", "GFDL-ESM4"],
            ("Entire", "ext"): ["EC-Earth3-Veg-LR", "EC-Earth3", "MPI-ESM1-2-LR", "CanESM5"]}

# ---------------- 일부 모델의 기타 지표 (출력값) ----------------
# corr, sd_ratio, bias(hPa), rmse(hPa), nrmse
EXTRA = {
 "KIOST-ESM": {"Entire": {"mean": (.89,1.35,3.72,3.84,2.56), "p5": (.75,.90,2.77,3.37,1.21), "p1": (.77,1.00,1.96,3.05,.88), "min": (.77,.85,5.19,7.64,.87)},
               "JJA": {"mean": (.57,.98,4.51,5.01,2.11), "p5": (.32,.82,2.41,3.59,1.45), "p1": (.21,1.05,1.75,3.62,1.47), "min": (.59,.74,3.71,7.09,.97)}},
 "IITM-ESM": {"Entire": {"mean": (.62,1.36,2.67,3.12,2.07), "p5": (.82,.63,1.17,2.04,.73), "p1": (.83,.75,1.14,2.27,.65), "min": (.72,.69,6.10,8.61,.98)},
              "JJA": {"mean": (.95,.87,1.25,1.48,.62), "p5": (.73,.67,.41,1.74,.70), "p1": (.71,.81,.96,2.00,.82), "min": (.76,.55,5.18,7.21,.98)}},
 "MIROC6": {"Entire": {"mean": (.86,1.13,-2.28,2.44,1.62), "p5": (.95,1.23,-2.13,2.44,.87), "p1": (.91,1.15,-1.51,2.24,.64), "min": (.61,.71,4.53,8.35,.95)},
            "JJA": {"mean": (.94,1.32,-2.16,2.46,1.04), "p5": (.90,1.31,-1.86,2.38,.96), "p1": (.59,1.14,-.67,2.48,1.01), "min": (.09,.48,4.96,9.29,1.27)}},
 "IPSL-CM6A-LR": {"Entire": {"mean": (.75,1.64,-.81,1.86,1.24), "p5": (.91,1.85,-1.17,3.08,1.10), "p1": (.86,2.04,-.84,4.53,1.30), "min": (.17,1.53,5.20,15.65,1.78)},
                  "JJA": {"mean": (.91,1.27,.03,1.32,.56), "p5": (.87,1.72,.51,2.49,1.01), "p1": (.45,2.03,1.66,4.74,1.93), "min": (-.39,1.21,7.11,15.26,2.08)}},
 "MPI-ESM1-2-HR": {"Entire": {"mean": (.97,1.20,.04,.48,.32), "p5": (.93,1.17,-.72,1.40,.50), "p1": (.97,1.36,-.44,1.67,.48), "min": (.34,1.03,5.52,11.62,1.33)},
                   "JJA": {"mean": (.89,.96,.25,1.12,.47), "p5": (.96,1.02,.10,.75,.30), "p1": (.76,1.17,1.15,2.22,.90), "min": (-.02,.60,6.86,11.03,1.50)}},
 "CMCC-ESM2": {"Entire": {"mean": (.95,1.33,.69,1.02,.68), "p5": (.95,.94,-.37,.97,.35), "p1": (.96,1.01,-.54,1.07,.31), "min": (.73,.84,.35,6.08,.69)},
               "JJA": {"mean": (.97,1.07,.55,.85,.36), "p5": (.97,1.02,-.40,.73,.30), "p1": (.78,.95,-.12,1.59,.65), "min": (.29,.67,1.33,7.66,1.04)}},
 "INM-CM4-8": {"Entire": {"mean": (.88,1.02,-.34,.81,.54), "p5": (.96,1.20,1.22,1.59,.57), "p1": (.92,1.45,2.53,3.43,.99), "min": (.23,1.09,13.40,17.57,2.00)},
               "JJA": {"mean": (.96,1.14,.84,1.17,.49), "p5": (.95,1.25,2.78,2.99,1.21), "p1": (.65,1.30,5.12,5.68,2.31), "min": (-.38,.64,13.63,16.95,2.31)}},
 "AWI-ESM-1-REcoM": {"Entire": {"mean": (.93,1.26,.36,.83,.55), "p5": (.95,1.66,.10,2.16,.77), "p1": (.92,1.90,.24,3.71,1.07), "min": (.18,1.35,6.36,14.89,1.70)},
                     "JJA": {"mean": (.91,1.37,2.16,2.60,1.10), "p5": (.94,1.69,1.89,2.78,1.13), "p1": (.64,1.84,3.12,4.70,1.91), "min": (-.37,.95,9.47,15.14,2.06)}},
}
# JJA min 상관이 음수인 모델(출력값), 나머지 값 미상
JJA_MIN_CORR = {"AWI-ESM-1-REcoM": -.36720, "CanESM5": .03685, "EC-Earth3": -.01861, "EC-Earth3-Veg": .02290,
                "EC-Earth3-Veg-LR": -.11935, "GFDL-ESM4": .03978, "INM-CM4-8": -.37906, "INM-CM5-0": -.31483,
                "IPSL-CM6A-LR": -.38764, "MIROC6": .08789, "MPI-ESM1-2-HR": -.02061, "MPI-ESM1-2-LR": -.14442}

# Entire Taylor diagram 값: (corr, sd_ratio, source)
#  printed = 출력값(소수 둘째 자리), digitized = taylor_psl_entire.png(2280×2100)에서 마커 색으로 위치 추출(오차 약 ±0.01),
#  digitized_occluded = 다른 마커에 일부 가려진 경우(±0.02~0.03), digitized_hidden = 완전히 가려져 덮은 마커(EC-Earth3-Veg-LR) 위치 사용
TAYLOR_ENTIRE = {
 "mean": {
  "ACCESS-CM2": (0.899, 1.153, "digitized"),
  "ACCESS-ESM1-5": (0.938, 1.027, "digitized"),
  "AWI-ESM-1-REcoM": (0.93, 1.26, "printed"),
  "CMCC-CM2-SR5": (0.932, 1.272, "digitized"),
  "CMCC-ESM2": (0.95, 1.33, "printed"),
  "CanESM5": (0.955, 1.333, "digitized_occluded"),
  "EC-Earth3": (0.959, 1.312, "digitized"),
  "EC-Earth3-Veg": (0.965, 1.269, "digitized_occluded"),
  "EC-Earth3-Veg-LR": (0.958, 1.209, "digitized"),
  "GFDL-ESM4": (0.96, 1.275, "digitized"),
  "IITM-ESM": (0.62, 1.36, "printed"),
  "INM-CM4-8": (0.88, 1.02, "printed"),
  "INM-CM5-0": (0.895, 1.001, "digitized"),
  "IPSL-CM6A-LR": (0.75, 1.64, "printed"),
  "KACE-1-0-G": (0.83, 1.048, "digitized"),
  "KIOST-ESM": (0.89, 1.35, "printed"),
  "MIROC6": (0.86, 1.13, "printed"),
  "MPI-ESM1-2-HR": (0.97, 1.2, "printed"),
  "MPI-ESM1-2-LR": (0.954, 1.244, "digitized"),
  "MRI-ESM2-0": (0.915, 1.363, "digitized"),
  "NESM3": (0.944, 1.158, "digitized"),
 },
 "p5": {
  "ACCESS-CM2": (0.961, 0.754, "digitized"),
  "ACCESS-ESM1-5": (0.917, 0.807, "digitized"),
  "AWI-ESM-1-REcoM": (0.95, 1.66, "printed"),
  "CMCC-CM2-SR5": (0.946, 0.853, "digitized"),
  "CMCC-ESM2": (0.95, 0.94, "printed"),
  "CanESM5": (0.962, 0.985, "digitized"),
  "EC-Earth3": (0.929, 1.208, "digitized_occluded"),
  "EC-Earth3-Veg": (0.939, 1.126, "digitized_occluded"),
  "EC-Earth3-Veg-LR": (0.941, 1.196, "digitized"),
  "GFDL-ESM4": (0.866, 1.112, "digitized"),
  "IITM-ESM": (0.82, 0.63, "printed"),
  "INM-CM4-8": (0.96, 1.2, "printed"),
  "INM-CM5-0": (0.921, 1.15, "digitized_occluded"),
  "IPSL-CM6A-LR": (0.91, 1.85, "printed"),
  "KACE-1-0-G": (0.908, 0.759, "digitized"),
  "KIOST-ESM": (0.75, 0.9, "printed"),
  "MIROC6": (0.95, 1.23, "printed"),
  "MPI-ESM1-2-HR": (0.93, 1.17, "printed"),
  "MPI-ESM1-2-LR": (0.936, 1.346, "digitized"),
  "MRI-ESM2-0": (0.969, 1.215, "digitized"),
  "NESM3": (0.822, 0.942, "digitized"),
 },
 "p1": {
  "ACCESS-CM2": (0.974, 0.861, "digitized"),
  "ACCESS-ESM1-5": (0.929, 0.818, "digitized"),
  "AWI-ESM-1-REcoM": (0.92, 1.9, "printed"),
  "CMCC-CM2-SR5": (0.958, 0.919, "digitized"),
  "CMCC-ESM2": (0.96, 1.01, "printed"),
  "CanESM5": (0.947, 1.151, "digitized"),
  "EC-Earth3": (0.952, 1.431, "digitized"),
  "EC-Earth3-Veg": (0.954, 1.37, "digitized"),
  "EC-Earth3-Veg-LR": (0.948, 1.473, "digitized"),
  "GFDL-ESM4": (0.911, 1.35, "digitized"),
  "IITM-ESM": (0.83, 0.75, "printed"),
  "INM-CM4-8": (0.92, 1.45, "printed"),
  "INM-CM5-0": (0.896, 1.435, "digitized"),
  "IPSL-CM6A-LR": (0.86, 2.04, "printed"),
  "KACE-1-0-G": (0.951, 0.762, "digitized"),
  "KIOST-ESM": (0.77, 1.0, "printed"),
  "MIROC6": (0.91, 1.15, "printed"),
  "MPI-ESM1-2-HR": (0.97, 1.36, "printed"),
  "MPI-ESM1-2-LR": (0.952, 1.512, "digitized"),
  "MRI-ESM2-0": (0.96, 1.276, "digitized"),
  "NESM3": (0.915, 1.248, "digitized"),
 },
 "min": {
  "ACCESS-CM2": (0.588, 0.812, "digitized"),
  "ACCESS-ESM1-5": (0.699, 0.789, "digitized"),
  "AWI-ESM-1-REcoM": (0.18, 1.35, "printed"),
  "CMCC-CM2-SR5": (0.647, 0.811, "digitized"),
  "CMCC-ESM2": (0.73, 0.84, "printed"),
  "CanESM5": (0.443, 0.844, "digitized"),
  "EC-Earth3": (0.403, 1.106, "digitized_hidden"),
  "EC-Earth3-Veg": (0.438, 1.069, "digitized"),
  "EC-Earth3-Veg-LR": (0.403, 1.106, "digitized"),
  "GFDL-ESM4": (0.462, 0.995, "digitized"),
  "IITM-ESM": (0.72, 0.69, "printed"),
  "INM-CM4-8": (0.23, 1.09, "printed"),
  "INM-CM5-0": (0.267, 1.069, "digitized"),
  "IPSL-CM6A-LR": (0.17, 1.53, "printed"),
  "KACE-1-0-G": (0.52, 0.669, "digitized"),
  "KIOST-ESM": (0.77, 0.85, "printed"),
  "MIROC6": (0.61, 0.71, "printed"),
  "MPI-ESM1-2-HR": (0.34, 1.03, "printed"),
  "MPI-ESM1-2-LR": (0.383, 1.176, "digitized"),
  "MRI-ESM2-0": (0.589, 0.969, "digitized"),
  "NESM3": (0.357, 1.131, "digitized"),
 },
}

# ERA5 공간 표준편차 (hPa)
REF_SD = {"Entire": (1.50, 2.79, 3.48, 8.77), "JJA": (2.38, 2.47, 2.46, 7.33),
          "June": (2.75, 3.38, 3.79, 5.10), "July": (2.84, 2.88, 2.86, 5.77), "August": (1.93, 2.08, 3.40, 8.24)}
# 모델 중앙값: nrmse, corr, bias
MED = {"Entire": {"mean": (.551, .931, .35), "p5": (.603, .936, -.80), "p1": (.656, .946, -.97), "min": (1.150, .443, 4.53)},
       "JJA": {"mean": (.494, .934, .21), "p5": (.828, .938, -.465), "p1": (.902, .700, .135), "min": (1.232, .040, 4.234)},
       "June": {"mean": (.343, .954, .14), "p5": (.607, .946, -1.26), "p1": (.765, .902, -1.73), "min": (1.233, .502, -.80)},
       "July": {"mean": (.502, .924, .36), "p5": (.568, .929, -.24), "p1": (.702, .791, -.20), "min": (1.157, .187, 2.67)},
       "August": {"mean": (.694, .854, .15), "p5": (.893, .811, .38), "p1": (1.063, .627, 2.42), "min": (1.113, .436, 5.74)}}
SD_RATIO_MED = {"Entire": (1.26, 1.14, 1.28, 1.00), "JJA": (1.04, 1.00, 1.05, .64)}

def rank_min(vals, order_hint=None):
    """NRMSE 오름차순 순위 (동점 = 같은 순위). order_hint 가 있으면 원본 순위대로 동점 해소"""
    s = sorted(vals.items(), key=lambda kv: (kv[1], order_hint.index(kv[0]) if order_hint and kv[0] in order_hint else 99))
    out, prev, prev_rank = {}, None, 0
    for i, (m, v) in enumerate(s, 1):
        tie = (prev is not None and v == prev and not (order_hint and m in order_hint))
        out[m] = prev_rank if tie else i
        prev, prev_rank = v, out[m]
    return out

def build(path):
    models = []
    for m, c in zip(MODELS, PALETTE):
        iid, nlon, nlat, dlon, dlat, nom, gl, cal = INFO[m]; full, ctry = INST[iid]
        models.append({"id": m, "institution_id": iid, "institution": full, "country": ctry,
                       "grid_points": {"lon": nlon, "lat": nlat}, "resolution_deg": {"lon": dlon, "lat": dlat},
                       "nominal_resolution": nom, "grid_label": gl, "calendar": cal, "variant_label": "r1i1p1f1", "color": c})

    metrics = {}
    for pi, p in enumerate(PERIODS):
        metrics[p] = {}
        for si, s in enumerate(STATS):
            metrics[p][s] = {}
            for m in MODELS:
                d = {"nrmse": NR[m][pi][si], "rmse": None, "crmse": None, "bias": None, "corr": None, "sd_ratio": None,
                     "sd_mod": None}
                ex = EXTRA.get(m, {}).get(p, {}).get(s)
                if ex:
                    d.update(corr=ex[0], sd_ratio=ex[1], bias=ex[2], rmse=ex[3])
                if p == "Entire":   # Taylor diagram 값 (전 모델)
                    cr, sr, src = TAYLOR_ENTIRE[s][m]
                    ref = REF_SD["Entire"][si]
                    d.update(corr=cr, sd_ratio=sr, sd_mod=round(sr * ref, 3),
                             crmse=round(ref * (1 + sr * sr - 2 * sr * cr) ** 0.5, 3), taylor_source=src)
                if p == "JJA" and s == "min" and m in JJA_MIN_CORR:
                    d["corr"] = round(JJA_MIN_CORR[m], 3)
                metrics[p][s][m] = d

    rankings, summary = {}, {}
    for pi, p in enumerate(PERIODS):
        mean = {m: ME[m][pi][0] for m in MODELS}; ext = {m: ME[m][pi][1] for m in MODELS}
        over = {m: round((mean[m] + ext[m]) / 2, 4) for m in MODELS}
        rm = rank_min(mean, TIEBREAK.get((p, "mean"))); re_ = rank_min(ext, TIEBREAK.get((p, "ext")))
        ro = rank_min(over); rs = rank_min({m: rm[m] + re_[m] for m in MODELS})
        rankings[p] = {m: {"mean_nrmse": mean[m], "mean_rank": rm[m], "ext_nrmse": ext[m], "ext_rank": re_[m],
                           "overall_nrmse": over[m], "overall_rank": ro[m], "ranksum_rank": rs[m]} for m in MODELS}
        rho, pv = spearmanr([mean[m] for m in MODELS], [ext[m] for m in MODELS])
        sm = {"spearman_mean_vs_ext": {"rho": round(float(rho), 3), "p": round(float(pv), 4)},
              "median": {s: {"nrmse": MED[p][s][0], "corr": MED[p][s][1], "bias": MED[p][s][2],
                             "sd_ratio": SD_RATIO_MED[p][si] if p in SD_RATIO_MED else None}
                         for si, s in enumerate(STATS)}}
        if p != "Entire":
            for k, lab in ((0, "mean"), (1, "ext")):
                rho, pv = spearmanr([ME[m][pi][k] for m in MODELS], [ME[m][0][k] for m in MODELS])
                sm[f"spearman_vs_entire_{lab}"] = {"rho": round(float(rho), 3), "p": round(float(pv), 4)}
        summary[p] = sm

    out = {
        "meta": {
            "title": "CMIP6 GCM sea-level pressure (psl) reproducibility over the Northwest Pacific",
            "version": "1.0-provisional",
            "data_status": ("PROVISIONAL: values transcribed from the analysis figures and printed outputs. "
                            "Per-statistic NRMSE has 2 decimals; mean/ext NRMSE 3 decimals. "
                            "Entire: corr and sd_ratio for all 21 models (Taylor diagram; printed values for 8 models, others digitized from the figure, "
                            "see metrics[...][...][model].taylor_source), sd_mod and crmse derived from them. "
                            "Other periods: corr/bias/sd_ratio/rmse for 8 models only (others null). bias/rmse: 8 models only. No spatial fields. "
                            "Regenerate with p8_viewer_data.py from the original results to replace this file."),
            "generated": datetime.date.today().isoformat(),
            "variable": {"name": "psl", "long_name": "sea-level pressure", "units": "hPa"},
            "reference": "ERA5 daily mean (hourly → daily)",
            "experiment": "historical, r1i1p1f1, daily",
            "period": "1979-01-01/2014-12-31 (36 years)",
            "region": {"lon": [115.3125, 149.0625], "lat": [20.625, 51.875],
                       "common_grid": "19 (lon) × 26 (lat) = 494 points, bilinear interpolation of native-grid statistics",
                       "weights": "cos(latitude)"},
            "periods": {"Entire": "all days 1979–2014", "JJA": "all June–August days pooled",
                        "June": "all June days pooled", "July": "all July days pooled", "August": "all August days pooled"},
            "stats": {"mean": "mean", "p5": "5th percentile (low-pressure tail)", "p1": "1st percentile",
                      "min": "minimum (single day)"},
            "metrics": {"nrmse": "RMSE / spatial SD of ERA5 (lower is better)", "rmse": "area-weighted RMSE [hPa]",
                        "crmse": "centred RMSE [hPa]", "bias": "area-weighted mean bias, model − ERA5 [hPa]",
                        "corr": "area-weighted spatial correlation", "sd_ratio": "spatial SD model / ERA5",
                        "sd_mod": "spatial SD of model [hPa]"},
            "ranking": {"mean": "rank of psl mean NRMSE",
                        "ext": "rank of the arithmetic mean of p5, p1, min NRMSE",
                        "overall": "rank of (mean NRMSE + ext NRMSE) / 2",
                        "ranksum": "rank of (mean_rank + ext_rank), sensitivity only",
                        "order": "ascending NRMSE (1 = best); ties share the lowest rank"},
            "qc": "GCM days with domain-mean psl < 985 hPa or > 1035 hPa removed (AWI-ESM-1-REcoM: 36 days, none in JJA)",
            "model_selection": "models with psl, uas, vas for historical, SSP1-2.6, SSP2-4.5, SSP5-8.5 (20) + IPSL-CM6A-LR",
            "notes": ["NRMSE denominators differ between periods; compare RMSE or correlation across periods.",
                      "min is a single-day value and is dominated by tropical cyclones in summer; interpret with care."],
        },
        "models": models,
        "periods": PERIODS,
        "stats": STATS,
        "reference_sd": {p: dict(zip(STATS, REF_SD[p])) for p in PERIODS},
        "metrics": metrics,
        "rankings": rankings,
        "summary": summary,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, allow_nan=False)
    return out

if __name__ == "__main__":
    o = build(sys.argv[1])
    print("saved", sys.argv[1])
