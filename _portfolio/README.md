# 포트폴리오 소스

루트 `index.html`, `work/*/`, `assets/`, `sitemap.xml`은 이 폴더에서 **자동 생성**됩니다. 직접 고치지 말고 아래 파일을 고친 뒤 빌드하세요.

| 파일 | 내용 |
|---|---|
| `site.json` | 첫 화면 문구, 숫자, 분야 이름, '그 밖의 작업', '작업 방식' |
| `projects.json` | 프로젝트별 요약·문제·기능·동작 흐름·핵심 코드·화면 캡쳐 |
| `img/*.webp` | 캡쳐 이미지 (`이름.webp` 원본, `이름-t.webp` 카드용 썸네일) |
| `style.css`, `portfolio.js` | 디자인과 필터·테마 전환 |

```bash
python3 _portfolio/build.py   # 빌드 (Python 3 표준 라이브러리만 사용)
```

프로젝트 순서는 `projects.json` 배열 순서와 같습니다. 화면이 없는 프로젝트는 `"cover": "nuance"`처럼 `build.py`의 COVERS 그림을 씁니다.

## 자동 추가 (`.github/workflows/portfolio-sync.yml`)

매일 09:17(KST), 이 저장소에 새 폴더가 push될 때, 또는 Actions 탭에서 직접 실행할 때 돕니다.

1. `sync/discover.py` — 포트폴리오에 없는 리포·Pages 폴더를 찾습니다.
   - 공개 리포: 자동 후보 (토픽 `no-portfolio`를 붙이면 제외)
   - 비공개 리포: 토픽 `portfolio`를 붙인 것만 (코드 링크·발췌 없이 구조만 실림)
   - 이미 있는 것, `site.json`의 `ignore` 목록, 포크·보관 리포는 제외
2. `sync/add_project.py` — 리포를 받아 Claude Code(`claude -p`, 지시문은 `sync/prompt.md`)로 항목을 만들고, 데모가 있으면 `sync/shot.mjs`로 캡쳐합니다. 코드 발췌가 실제 파일과 80% 이상 일치하지 않으면 버립니다.
3. `build.py`로 다시 빌드하고 `portfolio-sync` 브랜치로 PR을 올립니다. **Merge해야 공개됩니다.**

특정 리포만 넣으려면 Actions → 포트폴리오 자동 추가 → Run workflow에서 이름을 적습니다. 한 번에 최대 3개까지 처리합니다.

필요한 Secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `PORTFOLIO_READ_TOKEN`(모든 리포 Contents 읽기 전용)
