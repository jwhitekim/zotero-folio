# Folio 디자인 레퍼런스

Folio 서재형 UI 개편에서 참고한 서비스·타이포그래피·브랜드 가이드와 실제 반영 내용 정리.

## 1. 서재형 제품 레퍼런스

### BookLore

- [BookLore 저장소](https://github.com/booklore-app/BookLore)
- [BookLore 프론트엔드 시스템](https://deepwiki.com/booklore-app/BookLore/3-frontend-system)

책을 **shelf(선반)** 단위로 묶고, 표지 그리드와 리스트 보기를 오갈 수 있는 구조 참고.
Folio에서는 좌측 사이드바 상단 라벨, 서가 헤더, 표지 카드 그리드, 컬렉션 미리보기로 번역.

### Bookshelf

- [Bookshelf 저장소](https://github.com/BookshelfApp/Bookshelf)

책을 수직으로 쌓아 보여주는 bookshelf/coverflow 메타포 참고. Folio 홈의 장식용 책 더미와
최근 자료 선반은 해당 메타포를 연구 자료에 맞게 단순화한 결과.

### Paperlib · Wren

- [Paperlib 저장소](https://github.com/Future-Scholars/paperlib)
- [Wren 저장소](https://github.com/The-Future-Forge/wren)

Paperlib의 논문 중심 정보 밀도와 Wren의 로컬 우선 연구 라이브러리 방향 참고. 다만 Folio의
시각 언어와 데이터 모델은 Paperlib·Wren 코드를 복제하지 않고 독립적으로 구성.

## 2. 타이포그래피 레퍼런스

### Pretendard — UI와 본문

- [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard)

한글 UI에서 획의 균형과 숫자 가독성이 안정적이고, variable font로 굵기 조절이 가능한 점을
채택 이유로 반영. 현재 `web/index.html`에서 웹폰트를 로드하며, 네트워크 미가용 시 시스템
sans-serif로 폴백.

적용 범위:

- 내비게이션, 버튼, 검색, 메타데이터
- 통계 숫자와 계정 정보
- 본문 설명과 리스트 카드

### Maru Buri — 서재의 편집적 제목

- [Maru Buri 공식 안내](https://hangeul.naver.com/maruproject_11)

화면용 본문 글꼴로 설계되어 긴 제목에서 책·출판물 같은 인상을 주고, 작은 크기에서도 획이
뭉개지지 않는 점 참고. 정보 탐색 속도가 떨어지지 않도록 전체 UI가 아니라 페이지 제목, 섹션
제목, 생성 표지의 제목에만 제한적으로 사용.

## 3. 색상·접근성 레퍼런스

### NYPL(New York Public Library) 브랜드 가이드

- [NYPL 스타일 가이드](https://nypl.github.io/NYPLBase/styleguide/styleguide__branding.html)

따뜻한 회색/백색 바탕을 기본으로 두고, 브랜드 색을 제한적으로 사용하는 원칙 참고. 링크와
강조색은 텍스트 대비 확보, 빨강은 경고·기부 등 특정 의미로 예약하는 방식도 반영.

### USWDS(America Web Design System) Typography

- [U.S. Web Design System — Typography](https://designsystem.digital.gov/components/typography/)

화면에서 읽기 쉬운 sans-serif 본문과 용도에 따른 serif 제목의 조합, line-height와 정보
밀도 조절 원칙 참고.

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

초기 검토안인 Ink Green은 다른 제품(Veloo)의 시각 언어와 겹칠 수 있어 제외. 최종 강조색은
연구 서비스에서 익숙한 블루 계열을 낮은 채도로 조정한 **Library Cobalt**로 변경. NYPL
브랜드 가이드의 블루 사용 사례처럼 따뜻한 중성 바탕 위에서만 제한적으로 사용하며, 의미
전달은 색상만으로 하지 않고 아이콘·텍스트·선택 상태를 함께 사용.

## 5. 구현 위치

- 폰트 로드: [`web/index.html`](../web/index.html)
- 전역 색상·타이포그래피 토큰: [`web/src/app.css`](../web/src/app.css)
- 사이드바: [`web/src/components/TabBar.svelte`](../web/src/components/TabBar.svelte)
- 홈 서재 화면: [`web/src/pages/HomeDashboard.svelte`](../web/src/pages/HomeDashboard.svelte)
- 표지 카드: [`web/src/components/PaperCard.svelte`](../web/src/components/PaperCard.svelte)
- 리스트/그리드 전환: [`web/src/pages/PapersList.svelte`](../web/src/pages/PapersList.svelte)

문서 목적: 특정 오픈소스 프로젝트의 UI 복제가 아니라, 서가 구조·정보 밀도·타이포그래피·
색상 원칙을 Folio에 맞게 재해석한 근거 기록.

## 7. 가이드 페이지(`/guide`) 리디자인 레퍼런스

2026-09 가이드 페이지 개편에서는 일반적인 둥근 카드 나열 대신, 인쇄 매거진과 리서치
저널의 편집 레이아웃을 참고했다.

### Editorial Magazine Layout

- [Agence Wagner — Editorial / Magazine Layout](https://agencewagner.com/en/webdesigns/Editorial_Magazine_Layout/guide/)
- [UI Style Guide — Editorial Grid / Magazine](https://www.uistyleguide.com/style/editorial-grid-magazine)
- [Vikilinks — Editorial Web Design](https://vikilinks.com.au/editorial-web-design)

참고한 원칙:

- 좌우 폭이 다른 비대칭 그리드로 긴 페이지의 시선 흐름 형성
- 큰 제목과 작은 캡션·번호 병용으로 문서 구조 인지 속도 향상
- 카드마다 그림자와 큰 라운드를 반복하지 않고, 얇은 규칙선과 여백으로 섹션 구분
- 설명글은 본문을 길게 늘이지 않고, 이미지와 짧은 문장으로 기능 핵심만 전달

### 가이드 페이지에 반영한 내용

- 히어로 영역은 좌측 타이포그래피와 우측 이미지가 만나는 비대칭 스플릿으로 구성.
- 각 섹션은 `번호/제목/짧은 설명/기능 이미지`의 편집 단위로 재구성.
- 연결, 논문 목록, 하이라이트, 독립 메모, 컬렉션, 검색에 서로 다른 GPT 생성 이미지를 사용.
- 섹션 컨테이너의 부유감은 제거하고, `border-top`과 넉넉한 수직 간격으로 긴 리서치 문서의
  리듬을 형성.
- 모바일에서는 동일한 순서를 유지하되 이미지가 텍스트 위로 이동하도록 반응형 처리.

### 이미지 에셋

- [guide-editorial.png](../web/public/images/guide-editorial.png) — 가이드 페이지 히어로
- [guide-sync.png](../web/public/images/guide-sync.png) — Zotero 연결
- [guide-paper.png](../web/public/images/guide-paper.png) — 논문 목록
- [guide-highlight.png](../web/public/images/guide-highlight.png) — 원문 읽기와 필기
- [guide-note.png](../web/public/images/guide-note.png) — 독립 메모
- [guide-folder.png](../web/public/images/guide-folder.png) — 컬렉션
- [guide-search.png](../web/public/images/guide-search.png) — 검색

### 최종 선택안

검토 후 최종 방향은 **Research Journal** 콘셉트로 확정. 로그인은 연구 노트의 첫 장처럼
구성하고, 가이드 페이지는 좌측 목차와 우측 본문이 이어지는 긴 편집 문서로 구성. 이미지는 화면을
채우는 목적이 아니라, 실제 연구 맥락(읽기·표시·기록·정리) 설명에 사용.

## 6. 강조색 적용 감사 기준

주요 인터랙션과 브랜드 표면은 `--accent*` 토큰만 사용하도록 점검.

- 사이드바, 활성 탭, 검색 포커스, 링크, 버튼, 배지, 통계 강조
- 로그인 화면과 데스크톱 서재 셸
- 라이트/다크 모드의 강조색 변형
- 홈의 책 더미와 논문 표지는 자료 구분용 독립 팔레트 적용

흰색 텍스트, `--danger` 계열 오류/삭제 상태, 목재 선반과 표지의 장식용 보조색은 강조색과
의미가 다른 색으로 분리. 특히 `generated-cover`의 clay·forest·ink·ochre·plum·sage는
서로 다른 자료를 빠르게 식별하기 위한 색상.

## 8. 로그인·가이드 페이지 구조 재설계 조사

### 문제 정의: “AI스러움”의 실체

최근 디자인 비평에서 말하는 AI스러운 화면은 AI 도구 사용 여부보다, 구체적인 제품
맥락 없이 반복되는 평균적 선택의 조합을 뜻함.

참고 자료:

- [925 Studios — AI Slop Fonts and Gradients](https://www.925studios.co/blog/ai-slop-design-tells)
- [Joshua Snoddy — Why Do AI-Generated Websites All Look the Same?](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/)
- [InterfaceKit — Why AI-generated websites all look the same](https://blog.interfacekit.io/why-ai-generated-websites-all-look-the-same)
- [Developers Digest — AI Design Slop Patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)
- [Creative Bloq — Everything looks the same. Now what?](https://www.creativebloq.com/ai/everything-looks-the-same-now-what)

반복적으로 지적되는 패턴:

- 중앙 정렬 히어로 또는 예측 가능한 좌측 카피·우측 이미지 분할
- 동일한 크기의 기능 카드 3개와 아이콘 반복
- 모든 요소에 같은 큰 라운드, 얇은 테두리, 부드러운 그림자 적용
- 제품 맥락과 무관한 그라디언트, 글로우, 유리 효과, 공중에 떠 있는 3D 오브젝트
- 모든 섹션이 `제목 > 짧은 설명 > 이미지/카드` 순서를 반복하는 구성
- 누구에게나 적용 가능한 추상적인 마케팅 문구

각 요소의 개별 사용 자체는 문제가 아님. 문제는 정보 우선순위와 제품 고유의
사용 흐름 없이 나열된 패턴들이 한꺼번에 쓰여, 다른 서비스로 교체해도 성립하는 화면이
된다는 점.

### 구조와 시각 스타일의 관계

전문적인 타이포그래피와 이미지가 익숙한 웹 구조를 개선할 수는 있지만, Folio의 현재 문제는
스타일만으로 해결하기 어려움. 로그인과 가이드 페이지 모두 일반적인 SaaS 랜딩 페이지의 문법을 먼저
따르는 구조이기 때문.

| 화면 | 기존 관습적 구조 | 재설계 기준 |
| --- | --- | --- |
| 로그인 | 브랜드 소개 패널 + 독립 로그인 카드 + 기능 3개 | 연구 공간의 첫 장 + 단일 CTA + 짧은 신뢰 정보 |
| 가이드 페이지 | 히어로 + 같은 형식의 기능 섹션 반복 | 실제 사용 여정을 따라 장면마다 구성이 달라지는 편집 문서 |

### 검토한 시각적 대안

#### 1. Research Journal — 채택

- 로그인은 한 장의 연구 노트 표지처럼 구성
- 가이드 페이지는 `연결 > 탐색 > 읽기 > 표시 > 기록 > 검색`의 시간 순서로 전개
- 종이의 사용 흔적, 밑줄, 접힌 모서리, 색인 탭 등 실제 연구 행위를 이미지 소재로 사용
- GPT 이미지는 장식이 아니라 해당 장면의 의미를 전달하는 편집 이미지로 사용
- 이미지 안에는 가짜 텍스트를 생성하지 않고 제목과 캡션은 실제 HTML로 배치

Folio의 개인 연구·읽기·기록이라는 정체성을 가장 직접적으로 표현하고, 기존 Library Cobalt와
Maru Buri를 유지할 수 있다는 점에서 채택.

#### 2. Archive Index — 보류

서류철, 분류 번호, 색인 카드와 도서관 라벨을 중심으로 구성하는 방향. Zotero와의 연결은 잘
표현하지만 전체 제품이 자료 관리 도구로만 보이고, Folio의 읽기·사유 경험이 약해질 수 있음.

#### 3. Product Evidence — 보조 원칙으로 채택

GPT 이미지 대신 실제 Folio 화면을 중심으로 기능을 증명하는 방향. 가이드 페이지의 조작 설명에는
효과적이므로 하이라이트, 필기, 메모처럼 정확한 사용법이 필요한 장면에 실제 UI 캡처를
혼합. 로그인에서는 정보량이 많아질 수 있어 제한적으로 사용.

### 편집 디자인 레퍼런스

- [Agence Wagner — Editorial / Magazine Layout](https://agencewagner.com/en/webdesigns/Editorial_Magazine_Layout/guide/)
- [UI Style Guide — Editorial Grid / Magazine](https://www.uistyleguide.com/style/editorial-grid-magazine)
- [Awwwards — Asymmetrical Layout](https://www.awwwards.com/inspiration/asymmetrical-layout-marga-navarro)
- [Design Lexicon — Editorial Web Design](https://freedesignmd.com/lexicon/editorial-web-design)

적용할 원칙:

- 대칭 카드 그리드 대신 비대칭 열과 크기가 다른 이미지로 장면마다 리듬 형성
- 장식 컨테이너보다 기준선, 여백, 페이지 번호, 캡션으로 정보 관계 표현
- 본문을 모두 박스에 넣지 않고 지면 전체를 하나의 구성 단위로 사용
- 사용자가 훑어볼 때 섹션 번호와 동사만으로 전체 흐름을 이해하게 함
- 모바일에서는 데스크톱 구성을 축소하지 않고, 장면 순서를 유지한 단일 열 서사로 재배치

### 로그인 구조 명세

기존의 `좌측 소개 영역 + 우측 로그인 카드`를 폐기.

1. 상단: Folio 워드마크와 작은 문서 번호
2. 중앙: 핵심 문장, 연구 노트 이미지, 제품 설명을 하나의 표지 구성으로 배치
3. 하단: Zotero 로그인 CTA(Call To Action), OAuth 보안 안내, 가이드 페이지 링크
4. 기능 카드 3개와 별도 로그인 카드 컨테이너는 사용하지 않음

GPT 이미지는 한 장만 사용. 완벽하게 정돈된 스톡 사진이나 추상 3D 대신 실제 종이 섬유,
연필 압력, 접힌 모서리처럼 사람의 사용 흔적이 드러나는 이미지를 선택.

### 가이드 페이지 구조 명세

기존의 `히어로 + 같은 모양의 섹션 카드 반복`을 폐기.

1. 도입부: 가이드 페이지 제목과 전체 사용 흐름을 보여주는 인덱스
2. 연결: 큰 이미지와 짧은 원칙 설명
3. 탐색: 가로 지면과 목록 관련 설명
4. 읽기·표시: 실제 제품 화면을 포함할 수 있는 넓은 작업 장면
5. 기록: 큰 인용문과 독립 메모 이미지
6. 정리·검색: 두 기능을 비교하는 분할 지면
7. 마무리: Zotero로 돌아가는 데이터 관계 요약

각 장면은 이미지 위치·비율·텍스트 열 수가 달라야 함. 목차 추가만으로는 구조 개편
완료로 보지 않으며, 기존 섹션 마크업에 스타일을 덧씌우는 방식도 피함.

### 완료 판단 기준

- 두 페이지 기존 최상위 마크업 구조의 실제 교체 여부
- 로그인에서 소개 패널과 로그인 카드 이분법의 소멸 여부
- 가이드 페이지에서 동일한 `.guide-section` 반복의 소멸 여부
- 이미지 제거 후에도 Folio 정보 순서·성격과 다른 SaaS 페이지 간 구분 가능 여부
- 각 GPT 이미지의 구체적 기능·연구 행위 설명 여부
- 데스크톱과 모바일 각각의 의도된 독립 구성 여부

위 기준을 통과한 뒤에만 구조 재설계 완료로 기록.
