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
