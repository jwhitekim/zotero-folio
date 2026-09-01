# Folio 디자인 레퍼런스

Folio의 이번 서재형 UI 개편에서 참고한 서비스·타이포그래피·브랜드 가이드와 실제 반영 내용을 정리한 문서입니다.

## 1. 서재형 제품 레퍼런스

### BookLore

- [BookLore 저장소](https://github.com/booklore-app/BookLore)
- [BookLore 프론트엔드 시스템](https://deepwiki.com/booklore-app/BookLore/3-frontend-system)

책을 **shelf(선반)** 단위로 묶고, 표지 그리드와 리스트 보기를 오갈 수 있는 구조를 참고했습니다. Folio에서는 이를 `MY LIBRARY` 사이드바, 서가 헤더, 표지 카드 그리드, 컬렉션 미리보기로 번역했습니다.

### Bookshelf

- [Bookshelf 저장소](https://github.com/BookshelfApp/Bookshelf)

책을 수직으로 쌓아 보여주는 bookshelf/coverflow 메타포를 참고했습니다. Folio 홈의 장식용 책 더미와 최근 자료 선반은 이 메타포를 연구 자료에 맞게 단순화한 것입니다.

### Paperlib · Wren

- [Paperlib 저장소](https://github.com/Future-Scholars/paperlib)
- [Wren 저장소](https://github.com/The-Future-Forge/wren)

Paperlib의 논문 중심 정보 밀도와 Wren의 로컬 우선 연구 라이브러리 방향을 참고했습니다. 다만 Folio의 시각 언어와 데이터 모델은 두 프로젝트의 코드를 복제하지 않고 독립적으로 구성했습니다.

## 2. 타이포그래피 레퍼런스

### Pretendard — UI와 본문

- [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard)

한글 UI에서 획의 균형과 숫자 가독성이 안정적이고, variable font로 굵기 조절이 가능한 점을 채택 이유로 삼았습니다. 현재 `web/index.html`에서 웹폰트를 불러오며, 네트워크가 unavailable한 경우 시스템 sans-serif로 폴백합니다.

적용 범위:

- 내비게이션, 버튼, 검색, 메타데이터
- 통계 숫자와 계정 정보
- 본문 설명과 리스트 카드

### Maru Buri — 서재의 편집적 제목

- [Maru Buri 공식 안내](https://hangeul.naver.com/maruproject_11)

화면용 본문 글꼴로 설계되어 긴 제목에서 책·출판물 같은 인상을 주고, 작은 크기에서도 획이 뭉개지지 않는 점을 참고했습니다. 정보 탐색 속도를 떨어뜨리지 않도록 전체 UI가 아니라 페이지 제목, 섹션 제목, 생성 표지의 제목에만 제한적으로 사용합니다.

## 3. 색상·접근성 레퍼런스

### NYPL 브랜드 가이드

- [NYPL 스타일 가이드](https://nypl.github.io/NYPLBase/styleguide/styleguide__branding.html)

따뜻한 회색/백색 바탕을 기본으로 두고, 브랜드 색을 제한적으로 사용하는 원칙을 참고했습니다. 링크와 강조색은 텍스트 대비를 확보하고, 빨강을 경고·기부 등 특정 의미에 예약하는 방식도 반영했습니다.

### USWDS Typography

- [U.S. Web Design System — Typography](https://designsystem.digital.gov/components/typography/)

화면에서 읽기 쉬운 sans-serif 본문과 용도에 따른 serif 제목의 조합, line-height와 정보 밀도 조절 원칙을 참고했습니다.

## 4. Folio에 적용한 최종 토큰

| 용도 | 값 | 설명 |
| --- | --- | --- |
| 기본 배경 | `#F3F0E9` | 종이처럼 따뜻한 ivory 바탕 |
| 카드 표면 | `#FFFDF8` | 본문 영역과 카드의 높은 명도 |
| 기본 텍스트 | `#28251F` | 순수 검정보다 부드러운 ink |
| 보조 텍스트 | `#625D53` | 설명·메타데이터 |
| 강조색 | `#315A8A` | Library Cobalt. 링크, 선택 상태, 주요 버튼 |
| 강조 진한색 | `#203B60` | hover·사이드바·강한 대비 |
| 강조 연한색 | `#EAF0F6` | 배지, 선택 배경, 보조 패널 |
| 구분선 | `#E5DED1` | 따뜻한 중성 border |

초기 검토안인 Ink Green은 다른 제품(Veloo)의 시각 언어와 겹칠 수 있어 제외했습니다. 최종 강조색은 연구 서비스에서 익숙한 블루 계열을 낮은 채도로 조정한 **Library Cobalt**로 변경했습니다. NYPL 브랜드 가이드의 블루 사용 사례처럼 따뜻한 중성 바탕 위에서만 제한적으로 사용하며, 의미 전달은 색상만으로 하지 않고 아이콘·텍스트·선택 상태를 함께 사용합니다.

## 5. 구현 위치

- 폰트 로드: [`web/index.html`](../web/index.html)
- 전역 색상·타이포그래피 토큰: [`web/src/app.css`](../web/src/app.css)
- 사이드바: [`web/src/components/TabBar.svelte`](../web/src/components/TabBar.svelte)
- 홈 서재 화면: [`web/src/pages/HomeDashboard.svelte`](../web/src/pages/HomeDashboard.svelte)
- 표지 카드: [`web/src/components/PaperCard.svelte`](../web/src/components/PaperCard.svelte)
- 리스트/그리드 전환: [`web/src/pages/PapersList.svelte`](../web/src/pages/PapersList.svelte)

이 문서는 특정 오픈소스 프로젝트의 UI를 그대로 복제하기 위한 것이 아니라, 서가 구조·정보 밀도·타이포그래피·색상 원칙을 Folio에 맞게 재해석한 근거를 남기기 위한 문서입니다.

## 6. 강조색 적용 감사 기준

주요 인터랙션과 브랜드 표면은 `--accent*` 토큰만 사용하도록 점검했습니다.

- 사이드바, 활성 탭, 검색 포커스, 링크, 버튼, 배지, 통계 강조
- 로그인 화면과 데스크톱 서재 셸
- 라이트/다크 모드의 강조색 변형
- 홈의 책 더미와 논문 표지는 자료 구분을 위한 독립 팔레트를 사용

흰색 텍스트, `--danger` 계열 오류/삭제 상태, 목재 선반과 표지의 장식용 보조색은 강조색과 의미가 다른 색으로 분리했습니다. 특히 `generated-cover`의 clay·forest·ink·ochre·plum·sage는 서로 다른 자료를 빠르게 식별하기 위한 색상입니다.
