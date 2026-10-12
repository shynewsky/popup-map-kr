# popup-map-kr

대한민국에서 열리는 팝업스토어를 여러 공개 출처에서 수집하고, 동일한 팝업을 중복 제거한 뒤 JSON API와 지도에서 탐색하는 개인 프로젝트입니다.

- 지도: https://shynewsky.github.io/popup-map-kr/
- JSON API: https://shynewsky.github.io/popup-map-kr/api/v1/popups.json
- OpenAPI: https://shynewsky.github.io/popup-map-kr/openapi.yaml

## 현재 구현

- 대한민국 팝업 지도와 마커 클러스터
- 운영 중, 오픈 예정, 종료 상태 자동 계산
- 제목·장소 검색
- 지역·카테고리·상태 다중 필터
- 현재 지도 영역만 보기
- 팝업 상세 패널과 네이버지도·카카오맵 연결
- 출처, 자동 수집 여부, 신뢰도 표시
- 정적 JSON API 우선 구조
- ID와 핵심 필드 기반 중복·유효성 검사
- GitHub Actions 기반 Pages 자동 배포
- 매일 공개 팝업 목록 갱신 워크플로

## 데이터

초기 데이터는 공개 팝업 목록에서 운영 중·예정 항목을 구조화하고, OpenStreetMap Nominatim으로 주소를 좌표화했습니다. 각 레코드에는 원문 URL, 수집 상태, 신뢰도, 최종 확인 시각을 포함합니다.

자동 수집 데이터는 방문 전 반드시 원문을 확인해 주세요.

## 구조

```text
.
├─ index.html                     # 지도 웹 앱
├─ api/v1/popups.json             # 정적 읽기 API
├─ openapi.yaml                   # API 계약
├─ scripts/
│  ├─ refresh-dayforyou.mjs       # 공개 팝업 피드 갱신
│  └─ validate-data.mjs           # 스키마·중복·좌표 검증
└─ .github/workflows/
   ├─ pages.yml                   # 검증 후 GitHub Pages 배포
   └─ refresh-data.yml            # 매일 데이터 갱신
```

## 로컬 실행

별도 빌드 도구가 필요하지 않습니다. 저장소 루트에서 정적 파일 서버만 실행하면 됩니다.

```bash
python -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

데이터 검증:

```bash
node scripts/validate-data.mjs
```

데이터 수동 갱신:

```bash
node scripts/refresh-dayforyou.mjs
```

## API 예시

```js
const response = await fetch(
  'https://shynewsky.github.io/popup-map-kr/api/v1/popups.json'
);
const data = await response.json();
console.log(data.items);
```

현재 API는 GitHub Pages에서 제공하는 정적 JSON입니다. 데이터 구조와 지도 사용성을 먼저 검증한 뒤 동적 `bbox`, 날짜, 반경 조회 API로 확장할 예정입니다.

## 중복 기준

현재 완전 중복은 아래 조합으로 검사합니다.

```text
정규화된 제목 + 주소 + 시작일 + 종료일
```

같은 팝업이 여러 출처에서 발견되는 경우에는 삭제하지 않고 향후 하나의 대표 레코드에 출처를 합치는 구조로 확장합니다.

## 다음 단계

- 팝가·팝플리·백화점·브랜드 공식 페이지 등 출처 확대
- 출처별 어댑터와 canonical popup 병합
- 제목 유사도, 좌표 거리, 기간 중첩을 이용한 중복 판정
- 지도 영역 `bbox`를 받는 동적 API
- 데이터 정정·제보 기능

## License

코드는 MIT License로 공개합니다. 팝업 데이터와 이미지는 각 원출처의 조건을 따르며 레코드별 원문 링크를 제공합니다.
