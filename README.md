# 질문 잡지

기사 글을 A4 잡지로 펼치는 의존성 없는 스크립트입니다. HTML의 `<head>`에서 `magazine.js`를 불러오면 표지, 차례와 2단 기사 쪽을 만듭니다. 화면에서 기사를 더하고 그림을 넣은 뒤 HTML로 저장하거나 인쇄할 수 있습니다.

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>질문 하나</title>
<script src="../magazine.js"></script>
</head>
<body>
<script type="text/x-article">
꼭지: 자연과학
제목: 태양과 더 가까워지면 여름이 올까?
기자: 햇살

## 질문의 시작
여기에 문단을 한 줄씩 씁니다.
</script>
</body>
</html>
```

한 파일에 `text/x-cover` 표지 하나와 `text/x-article` 기사 여러 개를 넣을 수 있습니다. 자세한 문법은 [SPEC.md](SPEC.md), 완성된 예시는 [기사 하나](examples/article.html)와 [잡지 한 권](examples/magazine.html)을 보세요. 예시 글은 공개 자료를 읽고 쓴 설명이며 실제 설문이나 현장 관측 결과가 아닙니다. 기자 이름은 필명입니다.

`[쉽게 보기] 제목` 아래에 그림 줄을 2~4개 쓰면 기사 둘째 쪽 맨 위에 가로 띠로 나옵니다. 짧은 기사는 첫 쪽 아래의 여유 공간을 쓰고, 자리가 없으면 새 쪽에 놓습니다. 빈 줄이나 다음 덩어리에서 끝나며, 주소를 비워 두면 그림 자리가 남습니다.

```text
[쉽게 보기] 동생에게 설명하면
그림: https://example.org/one.jpg | 빛이 모여요
그림: | 빛이 넓게 퍼져요
```

그림은 `![설명](https://…)`와 `그림: ![설명](https://…) | 새 설명`도 받습니다. 주소 그림은 처음 열 때 JPEG로 줄여 메모리에 담습니다(표지와 대표 그림 1600px, 나머지 900px 이내, 품질 0.85). 마주온 그림 주소는 7일 뒤 사라지므로 **「잡지 파일로 저장」을 눌러 그림을 HTML 안에 넣어 두세요.** 그림 자리에는 파일이나 다른 탭의 https 그림을 끌어다 놓을 수 있습니다.

설치나 빌드 없이 시험합니다.

```sh
node test/parse.test.mjs
node --check magazine.js
```

브라우저에서 `await QuestionMagazine.ready` 뒤 `QuestionMagazine.audit()`를 실행하면 실제 DOM의 넘침, 빈 그림과 출처 누락 등을 확인할 수 있습니다. `ready`는 쪽 나누기만 기다립니다. 그림 변환까지 기다리려면 `await QuestionMagazine.imagesReady`를 실행하세요. `pages`는 전체 쪽수, 각 `pieces[].pages`는 그 조각의 쪽 번호 배열, `pieces[].easyPanels`는 쉽게 보기 컷 수입니다. `emptyFigures`는 개수, `brokenImages`는 주소와 쪽 번호의 배열입니다. `add(text)`와 `render()`는 쪽 나누기가 끝나면 풀리는 Promise를 돌려줍니다. Node에서는 `require('./magazine.js')`로 순수 파서를 불러옵니다.

쪽은 축소 전 크기로 재고 화면 폭에 맞춰 줄입니다. 글꼴이나 주소 그림은 인터넷 연결이 필요합니다. 그림을 파일에 담지 못하면 저장한 HTML에 원래 주소를 남깁니다. 저장 파일은 처음 불러온 스크립트의 전체 주소를 사용합니다. 도련을 켜면 출력 용지는 216×303mm입니다.

이 환경에서는 브라우저와 인쇄 결과를 확인하지 않았습니다. 두 예시를 320px, 375px, 768px, 1024px와 PC 폭에서 열어 `audit()` 결과와 인쇄 미리 보기를 함께 확인하세요. 한 단보다 큰 통째 덩어리는 보존하고 오류로 알립니다.
