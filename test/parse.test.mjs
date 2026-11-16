import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { parseArticle, parseCover, ready, imagesReady } = require('../magazine.js');
// Expose only the pure serializer in an isolated Node evaluation. The shipped
// public API stays unchanged; this exercises the real save/reload grammar.
const source = readFileSync(new URL('../magazine.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, URL };
const helpers = ['serialize', 'readPieces', 'droppedImageURL', 'pieceFigures', 'hasArticleImages', 'coverQuestions', 'articleQuestion', 'addArticleQuestion', 'state', 'prepareImages', 'shrinkImage', 'replaceFigure', 'unsavedImages', 'hasUnsavedImages', 'inline', 'fillRatio', 'renderArticle', 'renderCover', 'renderAuthorNotes'];
const expose = helpers.map(name => '  api.' + name + ' = ' + name + ';').join('\n') + '\n  api.setSurface = function (surface) { stage = surface; };';
runInNewContext(source.replace('  return api;\n}));', expose + '\n  return api;\n}));'), sandbox);
const serialize = sandbox.module.exports.serialize;
const readPieces = sandbox.module.exports.readPieces;
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('통과:', name);
}
const body = text => parseArticle('제목: 물음\n' + text);

test('DOM 없이 CommonJS로 불러오며 ready도 풀린다', () => {
  assert.equal(typeof parseArticle, 'function');
  assert.equal(typeof ready.then, 'function');
});
await ready;
await imagesReady;

test('머리 칸의 모든 같은 뜻 키와 전각 쌍점', () => {
  for (const key of ['꼭지', '분야', '영역', '갈래']) assert.equal(parseArticle(`${key}： 자연과학`).section, '자연과학');
  for (const key of ['제목', '기사 제목']) assert.equal(parseArticle(`${key}: 왜?`).title, '왜?');
  for (const key of ['부제', '작은 제목', '한 줄 요약']) assert.equal(parseArticle(`${key}: 한 줄`).subtitle, '한 줄');
  for (const key of ['기자', '글쓴이', '글', '이름', '필명']) assert.equal(parseArticle(`${key}: 별, 달`).author, '별, 달');
  for (const key of ['기자의 말', '쓰면서 바뀐 생각']) assert.equal(parseArticle(`${key}: 달라졌다.`).authorNote, '달라졌다.');
  for (const key of ['그림', '사진', '이미지']) assert.equal(parseArticle(`${key}: https://example.org/a.png | 그림`).hero.src, 'https://example.org/a.png');
});

test('별표와 줄표로 감싼 머리 칸', () => {
  const a = parseArticle('- **분야**： 사회과학\n*제목*: 왜?\n**기자:** 별\n-부제-: 짧게');
  assert.equal(a.section, '사회과학'); assert.equal(a.title, '왜?'); assert.equal(a.author, '별'); assert.equal(a.subtitle, '짧게');
});

test('빈 줄 없는 문단, BOM, CRLF, 코드 울타리', () => {
  const a = parseArticle('\uFEFF```text\r\n제목: 물음\r\n첫 문단\r\n둘째 문단\r\n\r\n```');
  assert.deepEqual(a.blocks.map(b => b.text), ['첫 문단', '둘째 문단']);
});

test('번호의 모든 꼴과 역할 이름을 뗀다', () => {
  for (const prefix of ['1 ', '1. ', '1)', '(1)', '① ', '[1] ']) assert.equal(body(prefix + '원리 - 빛이 퍼진다.').blocks[0].text, '빛이 퍼진다.');
  for (const role of ['내가 겪은 일', '겪은 일', '그래서 생긴 질문', '질문', '흔히 하는 말', '원리', '과정', '근거', '예외', '내 경험 다시 보기', '경험 다시 보기', '생활 속 적용', '남은 궁금증']) {
    assert.equal(body(role + '★: **빛이 퍼진다.**').blocks[0].text, '빛이 퍼진다.');
  }
  assert.equal(body('(원리) 빛이 퍼진다.').blocks[0].text, '빛이 퍼진다.');
});

test('문장 속 수치와 역할 단어는 보존한다', () => {
  assert.equal(body('2026년의 질문은 원리와 과정에 관한 것이다.').blocks[0].text, '2026년의 질문은 원리와 과정에 관한 것이다.');
  assert.equal(body('1.5cm 차이가 있다.').blocks[0].text, '1.5cm 차이가 있다.');
  assert.equal(body('질문을 다시 쓴다.').blocks[0].text, '질문을 다시 쓴다.');
});

test('알 수 없는 꼬리표만 떼고 내용은 남긴다', () => {
  assert.equal(body('[관찰 기록] 빛이 보인다.').blocks[0].text, '빛이 보인다.');
  assert.equal(body('빛[2]이 보인다.').blocks[0].text, '빛[2]이 보인다.');
});

test('세 종류 소제목, 따옴글과 본문 그림', () => {
  const a = body('# 첫째\n문단\n## 둘째\n> 물음은 남는다.\n### 셋째\n사진: 틀만 있는 그림');
  assert.deepEqual(a.blocks.map(b => b.type), ['heading', 'paragraph', 'heading', 'quote', 'heading', 'figure']);
  assert.equal(a.blocks[5].caption, '틀만 있는 그림');
});

test('마지막 본문 문단의 첫 문장이 물음이면 그 문장만 고른다', () => {
  const a = body('처음 문단이다.\n## 남은 물음\n어떤 조건에서 달라질까? 다음에는 직접 재 보고 싶다.\n> 따옴글은 마지막 본문이 아니다.\n[쉽게 보기] 쉽게\n그림: 하나\n그림: 둘\n[취재 노트]\nAI 사용: 확인했다.\n출처:\n1. 자료');
  assert.equal(sandbox.module.exports.articleQuestion(a), '어떤 조건에서 달라질까?');
  assert.equal(sandbox.module.exports.articleQuestion(parseArticle(serialize(a))), '어떤 조건에서 달라질까?');
});

test('마지막 문단 첫 문장이 물음이 아니면 뒤에 물음이 있어도 기사 제목을 고른다', () => {
  const select = sandbox.module.exports.articleQuestion;
  for (const text of ['알게 되었다. 그런데 왜 그럴까?', '아직 모르겠다! 왜일까?', '마침표 없는 맺음말', '']) {
    assert.equal(select(body('앞 문단은 왜일까?\n' + (text || '## 본문 없는 끝'))), text ? '물음' : '앞 문단은 왜일까?');
  }
  assert.equal(select(body('## 제목만 있다\n> 물음인가?\n출처:\n1. 자료')), '물음');
});

test('첫 문장을 고를 때 소수점과 닫는 따옴표를 보존하고 앞 문단의 질문은 고르지 않는다', () => {
  const select = sandbox.module.exports.articleQuestion;
  assert.equal(select(body('1.5cm는 어디로 갔을까? 뒤 문장이다.')), '1.5cm는 어디로 갔을까?');
  assert.equal(select(body('“왜 달라질까?” 다음 문장이다.')), '“왜 달라질까?”');
  assert.equal(select(body('앞 문단은 왜일까?\n마지막 문단은 평서문이다.')), '물음');
});

test('머리 칸 첫 그림만 대표 그림이고 나머지는 본문 끝, 늦은 기자 줄은 머리 칸', () => {
  const a = parseArticle('제목: 물음\n그림: https://example.org/a.png | 대표\n그림: 본문 자리\n문단\n기자: 이것은 본문이다.');
  assert.equal(a.hero.caption, '대표'); assert.deepEqual(a.blocks.map(b => b.type), ['paragraph', 'figure']);
  assert.equal(a.author, '이것은 본문이다.');
});

// Six short, self-contained articles with the same header shape as the imported
// magazine. Regression tests deliberately do not read anything under samples/.
const sixArticles = Array.from({ length: 6 }, (_, i) => `꼭지: ${i < 3 ? '사회과학' : '자연과학'}
제목: 질문 ${i + 1}
부제: 함께 살펴본 일
기자: 필명 ${i + 1}
그림: ![대표 그림](https://example.org/hero-${i}.jpg)
그림: ![본문 그림](https://example.org/body-${i}.jpg) | 관찰한 장면
기자의 말: 자료를 읽고 생각 ${i + 1}을 바꿨다.
## 궁금해진 순간
처음 관찰한 일이다.
다시 살펴보았다.
## 알아본 까닭
근거를 찾아보았다.
## 남은 질문
다음에 알아볼 일이다.`);

test('두 그림 뒤 기자의 말이 있는 여섯 기사 모두 authorNote와 둘째 소제목 앞 그림을 보존한다', () => {
  const articles = sixArticles.map(parseArticle);
  assert.equal(articles.length, 6);
  articles.forEach((a, i) => {
    assert.equal(a.authorNote, `자료를 읽고 생각 ${i + 1}을 바꿨다.`);
    assert.equal(a.hero.src, `https://example.org/hero-${i}.jpg`);
    const second = a.blocks.findIndex(b => b.text === '알아본 까닭');
    assert.equal(a.blocks[second - 1].type, 'figure');
    assert.equal(a.blocks[second - 1].src, `https://example.org/body-${i}.jpg`);
    assert.ok(!a.blocks.some(b => b.text?.startsWith('기자의 말:')));
    assert.deepEqual(parseArticle(serialize(a)), a);
  });
});

test('머리 칸 그림은 여러 장이어도 끝나지 않고 순서대로 둘째 ## 앞에 옮긴다', () => {
  const a = parseArticle('그림: 대표\n사진: 둘째\n이미지: 셋째\n\n기자: 별\n제목: 물음\n부제: 짧게\n기자의 말: 달라졌다.\n# 큰 제목\n### 작은 제목\n## 첫째\n문단\n## 둘째\n문단');
  assert.equal(a.author, '별'); assert.equal(a.title, '물음'); assert.equal(a.subtitle, '짧게'); assert.equal(a.authorNote, '달라졌다.');
  assert.deepEqual(a.blocks.map(b => b.text || b.caption), ['큰 제목', '작은 제목', '첫째', '문단', '둘째', '셋째', '둘째', '문단']);
  assert.deepEqual(a.blocks.slice(4, 6).map(b => b.type), ['figure', 'figure']);
});

test('##가 둘 미만이면 머리 칸 추가 그림을 셋째 문단 뒤에 넣는다', () => {
  for (const heading of ['', '# 제목\n', '## 제목\n', '### 제목\n### 다음\n']) {
    const a = parseArticle('그림: 대표\n그림: 추가\n' + heading + '첫 문단\n> 따옴글\n둘째 문단\n셋째 문단\n넷째 문단');
    const index = a.blocks.findIndex(b => b.type === 'figure');
    assert.equal(a.blocks[index - 1].text, '셋째 문단');
    assert.equal(a.blocks[index + 1].text, '넷째 문단');
  }
});

test('셋째 문단도 없으면 추가 그림은 끝에 두고 본문 그림은 옮기지 않는다', () => {
  const a = parseArticle('그림: 대표\n그림: 머리 추가\n첫 문단\n그림: 본문 자리\n둘째 문단');
  assert.deepEqual(a.blocks.map(b => b.text || b.caption), ['첫 문단', '본문 자리', '둘째 문단', '머리 추가']);
  const empty = parseArticle('그림: 대표\n그림: 추가\n기자의 말: 달라졌다.');
  assert.deepEqual(parseArticle(serialize(empty)), empty);
});

test('본문 중간의 알려진 머리 키는 빈 칸만 채우고 문단으로 만들지 않는다', () => {
  for (const [key, field] of [['기자의 말', 'authorNote'], ['부제', 'subtitle'], ['기자', 'author'], ['꼭지', 'section'], ['제목', 'title']]) {
    const a = parseArticle(`첫 문단\n${key}: 값\n다음 문단\n${key}: 덮어쓰지 않을 값\n${key}:`);
    assert.equal(a[field], '값'); assert.deepEqual(a.blocks.map(b => b.text), ['첫 문단', '다음 문단']);
    const filled = parseArticle(`${key}: 원래 값\n본문\n${key}: 다른 값`);
    assert.equal(filled[field], '원래 값'); assert.equal(filled.blocks.length, 1);
  }
});

test('출처 뒤의 늦은 머리 키도 출처 목록에 섞이지 않는다', () => {
  const a = body('본문\n출처:\n1. 자료\n기자의 말: 다시 생각했다.\n부제: 뒤늦은 요약');
  assert.equal(a.authorNote, '다시 생각했다.'); assert.equal(a.subtitle, '뒤늦은 요약');
  assert.deepEqual(a.sources, ['자료']);
});

test('머리 칸 다음에 본문 그림부터 나오는 저장본도 위치와 대표 그림을 보존한다', () => {
  const a = parseArticle('제목: 그림\n[문단]\n그림: 본문 자리\n첫 문단\n## 첫째\n문단\n## 둘째\n문단');
  assert.equal(a.hero, null); assert.equal(a.blocks[0].type, 'figure');
  assert.deepEqual(parseArticle(serialize(a)), a);
});

test('세 가지 inline 출처를 모으고 중복은 한 번만', () => {
  const a = body('하나(출처: 기관, 자료, https://example.org/one) 둘[출처: 기관, 자료, https://example.org/one] 셋(참고: 다른 자료).');
  assert.deepEqual(a.sources, ['기관, 자료, https://example.org/one', '다른 자료']);
  assert.equal(a.blocks[0].text, '하나[1] 둘[1] 셋[2].');
});

test('명시 출처 번호를 먼저 예약하고 중복 번호를 연결한다', () => {
  const a = body('기존[2]과 새것(출처: 새 자료)과 기존[3].\n출처:\n1. 첫 자료\n2) 같은 자료\n[3] 같은 자료');
  assert.deepEqual(a.sources, ['첫 자료', '같은 자료', '새 자료']);
  assert.equal(a.blocks[0].text, '기존[2]과 새것[3]과 기존[2].');
});

test('출처 안의 괄호 연도와 대괄호를 온전히 모은다', () => {
  const a = body('근거(출처: 연구 (1985), 자료 [개정판], https://example.org/a_(b)). 다음[참고: 기관 (2020), https://example.org/next].');
  assert.deepEqual(a.sources, ['연구 (1985), 자료 [개정판], https://example.org/a_(b)', '기관 (2020), https://example.org/next']);
  assert.equal(a.blocks[0].text, '근거[1]. 다음[2].');
});

test('닫히지 않은 출처 표기는 지우지 않는다', () => {
  const a = body('글(출처: 닫히지 않은 자료');
  assert.equal(a.blocks[0].text, '글(출처: 닫히지 않은 자료'); assert.deepEqual(a.sources, []);
});

test('색 상자는 빈 줄과 다음 덩어리에서 끝난다', () => {
  const a = body('[상자] 살펴보기\n설명\n- 첫 항목\n- 둘째 항목\n\n문단\n[상자] 다시\n설명\n## 다음\n본문');
  assert.deepEqual(a.blocks[0], { type: 'box', title: '살펴보기', lines: [{ bullet: false, text: '설명' }, { bullet: true, text: '첫 항목' }, { bullet: true, text: '둘째 항목' }] });
  assert.deepEqual(a.blocks.map(b => b.type), ['box', 'paragraph', 'box', 'heading', 'paragraph']);
});

test('취재 노트와 출처 목록', () => {
  const a = body('문단\n[취재 노트]\n처음 질문： 왜?\n바뀐 질문: 어떻게?\nAI 사용: 출처 찾기\n출처:\n1. 하나\n2) 둘\n[3] 셋\n- 넷');
  assert.equal(a.notes.length, 3); assert.deepEqual(a.notes[0], { key: '처음 질문', value: '왜?' });
  assert.deepEqual(a.sources, ['하나', '둘', '셋', '넷']); assert.equal(a.blocks.length, 1);
});

test('출처 목록 표제의 모든 꼴', () => {
  for (const marker of ['출처:', '출처：', '[출처]', '## 출처', '참고 자료:']) assert.deepEqual(body('문단\n' + marker + '\n- 자료').sources, ['자료']);
});

test('상자와 취재 노트의 inline 출처도 모은다', () => {
  const a = body('[상자] 안내\n설명(출처: 하나)\n\n[취재 노트]\nAI 사용: 확인(참고: 둘)');
  assert.deepEqual(a.sources, ['하나', '둘']); assert.equal(a.notes[0].value, '확인[2]');
});

test('표지의 모든 칸과 꼭지 이름, 사용자 AI 원칙', () => {
  const c = parseCover('잡지: 물음\n영문: QUESTION\n호: 창간호\n학교: ○○고등학교\n문구: 함께 묻자\n그림: https://example.org/c.png | 표지\n대표 질문: 왜?\n색: #123aBC\n꼭지 이름: 사회과학 = 사람의 질문\n꼭지 이름: 자연과학 = 자연의 질문\n만든 날: 2026년 12월\nAI 원칙:\n- 확인한다.\n- 밝힌다.');
  assert.equal(c.name, '물음'); assert.equal(c.english, 'QUESTION'); assert.equal(c.issue, '창간호'); assert.equal(c.school, '○○고등학교');
  assert.equal(c.hero.caption, '표지'); assert.equal(c.question, '왜?'); assert.equal(c.color, '#123aBC'); assert.equal(c.date, '2026년 12월');
  assert.equal(c.sectionNames['사회과학'], '사람의 질문'); assert.equal(c.sectionNames['자연과학'], '자연의 질문'); assert.deepEqual(c.principles, ['확인한다.', '밝힌다.']);
});

test('표지 기본값과 위험한 색', () => {
  const c = parseCover('색: red; background:url(https://example.org)');
  assert.equal(c.name, '질문 잡지'); assert.equal(c.color, '#1F5F8B'); assert.equal(c.principles.length, 4);
  assert.equal(parseCover('AI 원칙:\n').principles.length, 4);
});

test('위험한 그림 주소는 모두 빈 자리', () => {
  for (const url of ['http://example.org/a.png', 'javascript:alert(1)', 'file:///private/a.png', '//example.org/a.png', 'data:text/html,<script>', 'https://', 'blob:https://example.org/x']) {
    assert.equal(parseArticle('그림: ' + url + ' | 설명').hero.src, '');
    assert.equal(body('문단\n그림: ' + url + ' | 설명').blocks[1].src, '');
    assert.equal(parseCover('그림: ' + url + ' | 설명').hero.src, '');
  }
});

test('https와 data 이미지, 설명만 있는 그림', () => {
  for (const url of ['https://example.org/a.png?x=1&y=2', 'data:image/svg+xml,%3Csvg/%3E', 'data:image/png;base64,YQ==']) assert.equal(parseArticle('그림: ' + url + ' | 설명').hero.src, url);
  assert.deepEqual(parseArticle('그림: 설명뿐').hero, { src: '', caption: '설명뿐' });
});

test('HTML 같은 사용자 글도 문자열로 보존한다', () => {
  const a = body('<img src=x onerror=alert(1)> & 문장');
  assert.equal(a.blocks[0].text, '<img src=x onerror=alert(1)> & 문장');
});

test('파서는 반복 호출과 이전 결과의 변경에 영향받지 않는다', () => {
  const a = parseArticle('제목: 물음\n문장(출처: 하나)'); a.sources.push('다른 자료');
  assert.deepEqual(parseArticle('제목: 물음\n문장(출처: 하나)').sources, ['하나']);
  assert.equal(parseArticle(null).blocks.length, 0);
  assert.equal(parseCover(undefined).principles.length, 4);
});

test('저장 뒤 머리 칸, 역할, 번호처럼 보이는 본문을 보존한다', () => {
  const a = body('[관찰 기록] 기자: 별이 말했다.\n[관찰 기록] 원리 - 빛이 퍼진다.\n[관찰 기록] 2026 기록\n[관찰 기록] ## 설명\n[관찰 기록] > 말\n[관찰 기록] [또 다른 꼬리표] 내용\n## [관찰 기록] 원리 - 소제목\n> [관찰 기록] 1. 인용\n[상자] 제목\n[관찰 기록] 질문: 값\n- [관찰 기록] 원리 - 항목');
  assert.deepEqual(parseArticle(serialize(a)), a);
  assert.deepEqual(parseArticle(serialize(parseArticle(serialize(a)))), a);
});

test('저장 뒤 빈 그림의 URL 같은 설명과 출처 번호를 보존한다', () => {
  const a = parseArticle('제목: 물음\n그림: | https://example.org/is-a-caption\n본문[2](출처: 새 자료).\n그림: | 설명 | 뒤\n[취재 노트]\nAI 사용: 자료 읽기\n출처:\n1. 첫 자료\n2. 둘째 자료');
  assert.deepEqual(parseArticle(serialize(a)), a);
});

test('표지도 저장 후 같은 내용으로 돌아온다', () => {
  const c = parseCover('잡지: 물음\n그림: | https://example.org/caption\n꼭지 이름: 자연과학 = 자연의 질문\nAI 원칙:\n- 확인한다.');
  assert.deepEqual(parseCover(serialize(c)), c);
});

test('가져오기는 댓글과 실행 스크립트를 건너뛰고 기사 글만 읽는다', () => {
  const html = '<!-- <script type="text/x-article">제목: 숨은 기사</script> --><img src="http://example.org/tracker"><script>throw Error("실행 금지")</script><script data-note="a > b" type=text/x-article>제목: 첫 기사\n문단</script><script type=\'text/x-cover\'>잡지: 표지</script>';
  const pieces = readPieces(html, true);
  assert.equal(pieces.length, 2); assert.equal(pieces[0].title, '첫 기사'); assert.equal(pieces[1].name, '표지');
});

test('닫는 script 태그가 있는 글도 URI로 저장하면 온전히 돌아온다', () => {
  const a = body('태그 </script>도 사용자 글이다.');
  const html = '<script type="text/x-article" data-qm-encoding="uri">\n' + encodeURIComponent(serialize(a)) + '\n</script>';
  assert.equal(readPieces(html, true)[0].blocks[0].text, a.blocks[0].text);
});

test('기사 글의 script 예시는 HTML 파일로 오인하지 않는다', () => {
  const pieces = readPieces('제목: 태그\n<script>는 사용자 글이다.\n<script>문자열</script>도 글이다.', false);
  assert.equal(pieces[0].title, '태그'); assert.equal(pieces[0].blocks[0].text, '<script>는 사용자 글이다.');
  assert.equal(pieces[0].blocks[1].text, '<script>문자열</script>도 글이다.');
  assert.throws(() => readPieces('<script>실행 코드</script>', true));
  assert.equal(readPieces('**잡지:** 표지\n호: 창간호', false)[0].kind, 'cover');
});

const majounURL = 'https://elicebackendstorage.blob.core.windows.net/helpy-agent/agents/tool-outputs/image/a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5.jpg?se=2026-01-01T00%3A00%3A00Z&sp=r&sv=2026-02-06&sr=b&sig=TESTSIGNATURE0000000000000000000000000000000%3D';
test('실제 마주온 주소를 두 Markdown 그림 꼴에서 온전히 꺼낸다', () => {
  for (const [line, caption] of [['![설명](' + majounURL + ')', '설명'], ['그림: ![generated image](' + majounURL + ') | 쉬운 설명', '쉬운 설명']]) {
    assert.deepEqual(parseArticle('제목: 그림\n' + line).hero, { src: majounURL, caption });
    assert.equal(body('본문\n' + line).blocks[1].src, majounURL);
    assert.equal(parseCover(line).hero.src, majounURL);
  }
});

test('Markdown 주소의 괄호와 설명 뒤의 괄호, 세로줄을 구별한다', () => {
  const url = 'https://example.org/image_(one).jpg?x=(2)&y=3';
  assert.deepEqual(parseArticle('그림: ![원래 설명](' + url + ') | 바꾼 설명 (모형) | 뒤').hero, { src: url, caption: '바꾼 설명 (모형) | 뒤' });
  assert.equal(parseArticle('![도형](data:image/svg+xml,%3Csvg/%3E)').hero.src, 'data:image/svg+xml,%3Csvg/%3E');
});

test('Markdown 안의 위험한 주소도 빈 자리로 거른다', () => {
  for (const url of ['http://example.org/a.jpg', 'javascript:alert(1)', 'file:///a.png', 'data:text/html,test', '//example.org/a.jpg']) {
    assert.deepEqual(parseArticle('![설명](' + url + ')').hero, { src: '', caption: '설명' });
    assert.equal(parseCover('그림: ![설명](' + url + ') | 표지').hero.src, '');
  }
});

test('쉽게 보기의 2~4컷, 빈 그림과 세 가지 그림 줄을 받는다', () => {
  const a = body('[쉽게 보기] 동생에게 설명하면\n그림: ' + majounURL + ' | 첫째\n![둘째](data:image/svg+xml,%3Csvg/%3E)\n그림: | 셋째\n사진: 넷째\n\n다음 문단');
  assert.equal(a.hero, null);
  assert.deepEqual(a.blocks.map(b => b.type), ['easy', 'paragraph']);
  assert.equal(a.blocks[0].title, '동생에게 설명하면');
  assert.deepEqual(a.blocks[0].panels, [{ src: majounURL, caption: '첫째' }, { src: 'data:image/svg+xml,%3Csvg/%3E', caption: '둘째' }, { src: '', caption: '셋째' }, { src: '', caption: '넷째' }]);
});

test('쉽게 보기는 빈 줄이나 다음 덩어리에서 끝난다', () => {
  for (const next of ['## 소제목', '> 따옴글', '[상자] 상자\n안내', '[취재 노트]\nAI 사용: 확인', '출처:\n1. 자료', '[쉽게 보기] 다음\n그림: 셋\n그림: 넷', '일반 문단']) {
    const a = body('[쉽게 보기] 처음\n그림: 하나\n그림: 둘\n' + next);
    assert.equal(a.blocks[0].panels.length, 2, next);
  }
  const a = body('[쉽게 보기] 처음\n그림: 하나\n그림: 둘\n\n그림: 본문 그림');
  assert.equal(a.blocks[1].type, 'figure');
});

test('상자나 출처 다음의 쉽게 보기 표제를 본문으로 삼지 않는다', () => {
  for (const prefix of ['[상자] 안내\n문장', '출처:\n1. 자료']) {
    const a = body(prefix + '\n[쉽게 보기] 쉽게\n그림: 하나\n그림: 둘');
    assert.equal(a.blocks.at(-1).type, 'easy');
    assert.equal(a.blocks.at(-1).panels.length, 2);
  }
});

test('쉽게 보기의 빈 그림, Markdown과 사용자 문구를 저장해 다시 읽는다', () => {
  const a = body('[쉽게 보기] <제목>\n![<img src=x onerror=alert(1)>](' + majounURL + ')\n그림: | https://example.org/is-a-caption\n\n[문단] [쉽게 보기]는 본문 글이다.');
  assert.deepEqual(parseArticle(serialize(a)), a);
  assert.deepEqual(parseArticle(serialize(parseArticle(serialize(a)))), a);
});

test('기자 줄의 그림 표시는 실제 대표, 본문, 쉽게 보기 그림에만 붙는다', () => {
  const has = sandbox.module.exports.hasArticleImages;
  for (const text of ['그림: 빈 대표', '본문\n그림: 빈 그림', '[쉽게 보기] 쉽게\n그림: 하나\n그림: 둘', '문단']) assert.equal(has(body(text)), false);
  for (const text of ['그림: ' + majounURL, '본문\n그림: ' + majounURL, '[쉽게 보기] 쉽게\n그림: ' + majounURL + '\n그림: 둘']) assert.equal(has(body(text)), true);
});

test('audit은 쉽게 보기 컷 수를 싣고 범위를 벗어난 컷 수를 알린다', () => {
  const internal = sandbox.module.exports;
  for (const count of [0, 1, 2, 3, 4, 5, 6]) {
    internal.state.pieces = [body('[쉽게 보기] 쉽게\n' + Array.from({ length: count }, (_, i) => '그림: 컷 ' + i).join('\n'))];
    const report = internal.audit();
    assert.equal(report.pieces[0].easyPanels, count);
    assert.equal(report.warnings.some(w => w.includes('쉽게 보기')), count < 2 || count > 4);
  }
  internal.state.pieces = [];
});

const transfer = (uri = '', html = '') => ({ getData: type => type === 'text/uri-list' ? uri : type === 'text/html' ? html : '' });
test('다른 탭에서 끌어온 uri-list의 댓글과 위험한 주소를 건너뛴다', () => {
  const read = sandbox.module.exports.droppedImageURL;
  assert.equal(read(transfer('# 댓글\r\nhttp://example.org/a.jpg\r\n' + majounURL)), majounURL);
  assert.equal(read(transfer('javascript:alert(1)\nfile:///a.png')), '');
});

test('끌어온 HTML에서 img src만 꺼내고 주소의 HTML entity를 푼다', () => {
  const read = sandbox.module.exports.droppedImageURL;
  assert.equal(read(transfer('', '<img alt="그림 > 설명" src="https://example.org/a.jpg?x=1&amp;y=2&#x26;z=3">')), 'https://example.org/a.jpg?x=1&y=2&z=3');
  assert.equal(read(transfer('', '<!-- <img src="https://example.org/hidden"> --><script><img src="https://example.org/script"></script><img data-src="https://example.org/data" src=javascript:alert(1)><img src=\'' + majounURL + '\'>')), majounURL);
  assert.equal(read(transfer('', '<img alt=" src=\'https://example.org/false\' " src="http://example.org/unsafe">')), '');
});

test('표지의 나머지 질문은 대표 질문을 빼고 기사 제목을 최대 다섯 개 고른다', () => {
  const articles = Array.from({ length: 8 }, (_, i) => parseArticle('꼭지: 자연과학\n제목: 물음 ' + i));
  const selected = sandbox.module.exports.coverQuestions({ question: '물음 6' }, articles);
  assert.equal(selected.length, 5); assert.equal(selected[0].title, '물음 0');
  assert.ok(selected.every(a => a.title !== '물음 6'));
  assert.equal(new Set(selected).size, 5); assert.equal(articles[0].title, '물음 0');
});

test('표지 목록은 사회과학과 자연과학만 받고 같은 제목의 대표 질문을 모두 뺀다', () => {
  const articles = ['여는 글', '그 밖의 질문', '사회과학', '자연과학', '사회과학'].map((section, i) => parseArticle(`꼭지: ${section}\n제목: ${i === 4 ? '물음 2' : '물음 ' + i}`));
  const select = sandbox.module.exports.coverQuestions;
  assert.deepEqual(Array.from(select({ question: '물음 2' }, articles), a => a.title), ['물음 3']);
  assert.deepEqual(Array.from(select({ question: '' }, articles), a => a.title), ['물음 3']);
  assert.equal(select({ question: '별도 질문' }, articles).length, 3);
  assert.equal(select({ question: '' }, articles.slice(0, 2)).length, 0);
});

// A small DOM double checks the generated structure and safe text insertion.
// It does not measure browser layout or pretend to render CSS.
class TextElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.className = ''; this.style = { setProperty() {} }; }
  get classList() { return { contains: name => this.className.split(' ').includes(name) }; }
  get textContent() { return this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = [{ textContent: String(value) }]; }
  set innerHTML(value) { throw new Error('사용자 HTML 삽입 금지: ' + value); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentElement = null; return child; }
  insertBefore(child, before) { child.parentElement = this; this.children.splice(this.children.indexOf(before), 0, child); return child; }
  remove() { if (this.parentElement) { const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); this.parentElement = null; } }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  addEventListener() {}
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (!(child instanceof TextElement)) continue;
      if (selector[0] === '.' ? child.classList.contains(selector.slice(1)) : child.tagName === selector) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
sandbox.document = { createElement: tag => new TextElement(tag), createTextNode: text => ({ textContent: text }) };
sandbox.getComputedStyle = () => ({ marginBottom: '0px' });

test('출처 주소는 접두어를 떼고 38자를 넘으면 36자와 …로 표시하며 전체 링크와 title을 남긴다', () => {
  const inline = sandbox.module.exports.inline;
  for (const length of [38, 39, 80]) {
    const label = 'example.org/' + '가'.repeat(length - 12), address = 'https://www.' + label;
    const node = new TextElement('li'); inline(node, '자료, ' + address, false);
    const link = node.querySelector('a');
    assert.equal(link.textContent, length > 38 ? [...label].slice(0, 36).join('') + '…' : label);
    assert.equal(link.href, address); assert.equal(link.title, address);
  }
});

test('출처의 www 주소도 HTTPS 링크로 열고 사용자 HTML 같은 글은 텍스트로 둔다', () => {
  const node = new TextElement('li'), text = '<img src=x onerror=alert(1)> 자료 ';
  sandbox.module.exports.inline(node, text + 'www.example.org/a https://example.org/b', false);
  assert.equal(node.textContent, text + 'example.org/a example.org/b');
  assert.equal(node.querySelectorAll('img').length, 0);
  assert.equal(node.querySelectorAll('a')[0].href, 'https://www.example.org/a');
  assert.equal(node.querySelectorAll('a')[0].title, 'www.example.org/a');
});

test('표지는 머리 띠와 질문 카드로 묶고 설명 줄을 빼며 문구를 카드 안에 둔다', () => {
  const api = sandbox.module.exports, surface = new TextElement('main');
  const cover = parseCover('잡지: <물음>\n영문: QUESTION\n호: 첫 호\n학교: 우리 학교\n그림: https://example.org/landscape.jpg | 그림 설명\n대표 질문: 물음 2\n문구: 함께 묻자');
  const articles = ['여는 글', '사회과학', '자연과학', '그 밖의 질문'].map((section, i) => parseArticle(`꼭지: ${section}\n제목: 물음 ${i}`));
  api.state.cover = cover; api.state.pages = []; api.setSurface(surface);
  try {
    api.renderCover(cover, articles);
    const page = api.state.pages[0], head = page.inner.children[0], card = page.inner.children[1];
    assert.equal(head.className, 'qm-cover-masthead'); assert.ok(head.textContent.includes('<물음>'));
    assert.equal(card.className, 'qm-cover-questions'); assert.equal(card.querySelector('.qm-cover-question').textContent, '물음 2');
    assert.deepEqual(card.querySelectorAll('.qm-cover-item').map(node => node.textContent), ['물음 1']);
    assert.equal(card.querySelector('.qm-cover-tagline').textContent, '함께 묻자');
    assert.equal(page.paper.querySelector('figcaption'), null); assert.equal(page.paper.querySelector('.qm-cover-caption'), null);
    assert.equal(page.paper.querySelector('img').alt, '그림 설명');
    assert.equal(page.paper.querySelector('img').src, cover.hero.src);
  } finally { api.state.pages = []; api.setSurface(null); }
});

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const geometry = (rects, names = [], children = []) => ({
  children, classList: { contains: name => names.includes(name) }, getClientRects: () => rects, getBoundingClientRect: () => rects[0]
});

// Geometry doubles exercise the placement contract without rendering CSS.
function questionPage(remainingMM, scale = 1) {
  const mm = 96 / 25.4, height = 250 * mm, used = height - (remainingMM + 4) * mm;
  const inner = new TextElement('div');
  inner.getBoundingClientRect = () => rect(0, 0, 600 * scale, height * scale);
  const columns = geometry([rect(0, 0, 600 * scale, height * scale)], ['qm-columns'], [geometry([rect(0, 0, 280 * scale, used * scale)])]);
  Object.assign(columns, { clientWidth: 600, clientHeight: height, scrollWidth: 600, scrollHeight: height, style: { height: height + 'px' } });
  inner.appendChild(columns);
  return { inner, columns, bodyHeight: height };
}

test('질문 띠는 60mm부터 남은 높이를 쓰며 배율과 관계없이 2단 밖 아래에 놓인다', () => {
  const api = sandbox.module.exports;
  for (const scale of [1, .4]) {
    const page = questionPage(80, scale), originalHeight = page.columns.style.height;
    api.addArticleQuestion(page, body('마지막 물음은 무엇일까? 나머지 문장.'));
    assert.equal(page.questionCard.parentElement, page.inner);
    assert.equal(page.inner.children[0], page.columns);
    assert.equal(page.columns.style.height, originalHeight, '기존 단 높이를 바꿔 재배치하지 않는다');
    assert.ok(Math.abs(parseFloat(page.questionCard.style.height) - 80 * 96 / 25.4) < 1e-9);
    assert.ok(Math.abs(parseFloat(page.questionCard.style.top) - 170 * 96 / 25.4) < 1e-9);
    assert.equal(page.questionCard.querySelector('.qm-article-question-label').textContent, '기자가 남긴 질문');
    assert.equal(page.questionCard.querySelector('h3').textContent, '마지막 물음은 무엇일까?');
    assert.equal(page.questionCard.querySelector('.qm-article-question-prompt').textContent, '여러분의 생각은? 독자 질문함에 적어 주세요.');
    api.addArticleQuestion(page, body('또 넣을까?'));
    assert.equal(page.inner.children.length, 2, '중복 삽입을 막는다');
  }
  const exact = questionPage(60); api.addArticleQuestion(exact, body('물음?'));
  assert.ok(exact.questionCard);
  const small = questionPage(59.9); api.addArticleQuestion(small, body('물음?'));
  assert.equal(small.questionCard, undefined);
});

test('질문 띠는 두 단의 가장 아래 조각과 여백을 피하고 넘친 본문에는 넣지 않는다', () => {
  const api = sandbox.module.exports, page = questionPage(80);
  page.columns.children[0].getClientRects = () => [rect(0, 0, 280, 100), rect(320, 0, 280, 700)];
  sandbox.getComputedStyle = () => ({ marginBottom: '10px' });
  try {
    api.addArticleQuestion(page, body('물음?'));
    assert.equal(page.questionCard, undefined, '둘째 단 아래에는 60mm가 남지 않는다');
  } finally { sandbox.getComputedStyle = () => ({ marginBottom: '0px' }); }
  const overflow = questionPage(80); overflow.columns.scrollWidth += 10;
  api.addArticleQuestion(overflow, body('물음?'));
  assert.equal(overflow.questionCard, undefined);
});

test('질문 띠의 질문과 제목은 HTML처럼 보여도 textContent로만 넣는다', () => {
  const api = sandbox.module.exports;
  for (const text of ['<img src=x onerror=alert(1)> 왜일까?', '마지막은 평서문이다.']) {
    const page = questionPage(80), a = parseArticle('제목: <img src=x onerror=alert(2)>\n' + text);
    api.addArticleQuestion(page, a);
    assert.equal(page.questionCard.querySelector('h3').textContent, text.endsWith('?') ? text : a.title);
    assert.equal(page.questionCard.querySelectorAll('img').length, 0);
  }
});

test('질문 띠의 글이 남은 높이를 넘으면 카드를 거두고 본문을 보존한다', () => {
  const create = sandbox.document.createElement;
  sandbox.document.createElement = tag => {
    const node = create(tag);
    if (tag === 'aside') Object.assign(node, { clientHeight: 100, scrollHeight: 110 });
    return node;
  };
  try {
    const page = questionPage(80);
    sandbox.module.exports.addArticleQuestion(page, body('물음?'));
    assert.equal(page.questionCard, undefined);
    assert.deepEqual(page.inner.children, [page.columns]);
  } finally { sandbox.document.createElement = create; }
});

test('기자의 말은 한 쪽 최대 여덟 장이고 아홉째부터 다음 쪽으로 넘긴다', () => {
  const api = sandbox.module.exports, surface = new TextElement('main');
  const articles = Array.from({ length: 9 }, (_, i) => parseArticle(`제목: 물음 ${i}\n기자의 말: 달라진 생각 ${i}`));
  api.state.cover = parseCover(''); api.setSurface(surface);
  try {
    for (const count of [7, 8, 9]) {
      api.state.pages = []; surface.children = [];
      api.renderAuthorNotes(articles.slice(0, count));
      assert.deepEqual(Array.from(api.state.pages, page => page.flow.children.length), count <= 8 ? [count] : [8, 1]);
      if (count === 9) assert.equal(api.state.pages[1].inner.querySelector('h2').textContent, '기자의 말, 이어서');
    }
  } finally { api.state.pages = []; api.setSurface(null); }
});

test('기자의 말이 길어 여덟 장 전에 넘쳐도 순서대로 다음 쪽에 보존한다', () => {
  const api = sandbox.module.exports, surface = new TextElement('main'), create = sandbox.document.createElement;
  // Model two cards per page to exercise the measured overflow fallback.
  sandbox.document.createElement = tag => {
    const node = create(tag);
    Object.defineProperties(node, {
      clientHeight: { get: () => 100 },
      scrollHeight: { get() { return this.className === 'qm-note-grid' ? Math.ceil(this.children.length / 2) * 60 : 0; } }
    });
    return node;
  };
  api.state.cover = parseCover(''); api.state.pages = []; api.setSurface(surface);
  try {
    const articles = Array.from({ length: 5 }, (_, i) => parseArticle(`제목: 물음 ${i}\n기자의 말: 달라진 생각 ${i}`));
    api.renderAuthorNotes(articles);
    assert.deepEqual(Array.from(api.state.pages, page => page.flow.children.length), [2, 2, 1]);
    assert.deepEqual(Array.from(api.state.pages).flatMap(page => page.flow.children.map(card => card.querySelector('p').textContent)), articles.map(a => a.authorNote));
  } finally { sandbox.document.createElement = create; api.state.pages = []; api.setSurface(null); }
});

test('채움은 두 단의 실제 조각 넓이를 더하고 화면 배율이 바뀌어도 같다', () => {
  for (const scale of [1, .4]) {
    const r = (left, top, width, height) => rect(left * scale, top * scale, width * scale, height * scale);
    const columns = geometry([r(0, 0, 200, 100)], ['qm-columns'], [geometry([r(0, 0, 90, 100), r(110, 0, 90, 30)])]);
    assert.ok(Math.abs(sandbox.module.exports.fillRatio({ columns }, true) - .585) < 1e-9);
  }
});

test('고정 높이 흐름 상자와 2단의 빈 공간을 채움으로 세지 않는다', () => {
  const area = rect(0, 0, 200, 100);
  const flow = geometry([area], ['qm-flow'], [geometry([rect(0, 0, 200, 14)])]);
  const page = { kind: 'contents', inner: geometry([area], [], [flow]) };
  assert.equal(sandbox.module.exports.fillRatio(page, false), .14);
  flow.children = [geometry([rect(0, 0, 200, 10)]), geometry([rect(0, 90, 200, 30)])];
  assert.equal(sandbox.module.exports.fillRatio(page, false), .2, '쪽 바깥 넓이는 제외한다');
});

test('audit은 채움 15% 미만을 거의 빈 쪽으로 알리고 독자 질문함, 메모, 뒤표지는 뺀다', () => {
  const api = sandbox.module.exports;
  api.state.pieces = [];
  api.state.pages = ['article', 'contents', 'author-notes', 'cover', 'article', 'questions', 'memo', 'back'].map((kind, i) => ({
    kind, paper: { dataset: { page: String(i + 1) }, querySelector: () => null },
    inner: geometry([rect(0, 0, 100, 100)], [], [geometry([rect(0, 0, 100, i === 4 ? 15 : 14)])])
  }));
  try {
    const warnings = api.audit().warnings.filter(w => w.includes('거의 빈 쪽'));
    assert.deepEqual(Array.from(warnings), [1, 2, 3, 4].map(n => n + '쪽: 거의 빈 쪽입니다.'));
  } finally { api.state.pages = []; }
});

test('audit은 질문 띠가 있는 기사 쪽만 거의 빈 쪽 경고에서 뺀다', () => {
  const api = sandbox.module.exports;
  api.state.pieces = [];
  api.state.pages = [true, false].map((card, i) => ({
    kind: 'article', questionCard: card ? {} : null, paper: { dataset: { page: String(i + 1) } },
    inner: geometry([rect(0, 0, 100, 100)], [], [geometry([rect(0, 0, 100, 1)])])
  }));
  try { assert.deepEqual(Array.from(api.audit().warnings), ['2쪽: 거의 빈 쪽입니다.']); }
  finally { api.state.pages = []; }
});

// Isolate the real retry/rollback controller from browser measurements. The
// renderer is given synthetic pagination results; pixel layout remains manual.
function paginationTrial(options = {}) {
  const context = { module: { exports: {} }, URL };
  const setup = '\n  api.setPagination = function (paginate, fill, surface, card) { paginateArticle = paginate; fillRatio = fill; stage = surface; addArticleQuestion = card; };';
  runInNewContext(source.replace('  return api;\n}));', expose + setup + '\n  return api;\n}));'), context);
  const api = context.module.exports, surface = { children: [], appendChild(shell) { this.children.push(shell); } }, calls = [], cards = [], original = [], trial = [];
  const before = { shell: { remove() { throw new Error('다른 기사 쪽을 지웠다.'); } } };
  surface.appendChild(before.shell); api.state.pages = [before]; api.state.failures = ['이전 기사 오류'];
  api.setPagination((article, firstPart, compact) => {
    calls.push([article, firstPart, compact]);
    const pages = compact ? trial : original, count = compact ? options.compactCount ?? 1 : options.normalCount ?? 2;
    for (let i = 0; i < count; i++) {
      const node = { clientWidth: 100, clientHeight: 100, scrollWidth: compact && options.overflow ? 110 : 100, scrollHeight: 100 };
      const shell = { remove() { surface.children.splice(surface.children.indexOf(this), 1); } };
      const page = { shell, columns: node, inner: node, bodyHeight: compact && options.negativeHeight ? -1 : 100 };
      pages.push(page); api.state.pages.push(page); surface.appendChild(shell);
      if (compact && options.throws) throw new Error('시험 중 쪽 나누기 실패');
    }
    if (compact && options.trialFailure) api.state.failures.push('시험 중 오류');
    if (!compact && options.originalFailure) api.state.failures.push('기존 오류');
  }, (page, bodyOnly) => {
    assert.equal(page, original.at(-1)); assert.equal(bodyOnly, true); return options.fill ?? .34;
  }, surface, (page, article) => { cards.push({ page, article }); });
  const article = body('본문'); api.renderArticle(article, true);
  assert.equal(api.state.pages[0], before); assert.equal(surface.children[0], before.shell);
  assert.ok(calls.every(([piece, firstPart]) => piece === article && firstPart === true));
  assert.deepEqual(surface.children, Array.from(api.state.pages, page => page.shell));
  return { api, calls, cards, original, trial, article };
}

test('마지막 쪽 채움이 35% 미만이면 그 기사만 한 번 다시 나눠 줄어든 쪽수를 채택한다', () => {
  const { api, calls, trial } = paginationTrial();
  assert.deepEqual(calls.map(call => call[2]), [false, true]);
  assert.deepEqual(api.state.pages.slice(1), trial); assert.deepEqual(api.state.failures, ['이전 기사 오류']);
});

test('한 쪽 기사와 채움 35% 이상인 기사는 촘촘하게 다시 나누지 않는다', () => {
  for (const options of [{ normalCount: 1, fill: .01 }, { fill: .35 }, { fill: .8 }]) {
    const { api, calls, original } = paginationTrial(options);
    assert.equal(calls.length, 1); assert.deepEqual(api.state.pages.slice(1), original);
  }
});

test('쪽수가 그대로거나 오류, 넘침, 예외가 생긴 촘촘한 시안은 버리고 원래 쪽과 오류를 복원한다', () => {
  for (const options of [{ compactCount: 2 }, { compactCount: 3 }, { trialFailure: true }, { overflow: true }, { negativeHeight: true }, { throws: true }]) {
    const { api, calls, original } = paginationTrial({ ...options, originalFailure: true });
    assert.equal(calls.length, 2); assert.deepEqual(api.state.pages.slice(1), original);
    assert.deepEqual(api.state.failures, ['이전 기사 오류', '기존 오류']);
  }
});

test('질문 띠는 촘촘한 재분할로도 쪽이 줄지 않았을 때 복원된 마지막 쪽에만 시도한다', () => {
  for (const options of [{ compactCount: 2 }, { compactCount: 3 }, { throws: true }]) {
    const { cards, original, article } = paginationTrial(options);
    assert.deepEqual(cards, [{ page: original.at(-1), article }]);
  }
  for (const options of [{}, { normalCount: 1 }, { fill: .35 }]) {
    assert.deepEqual(paginationTrial(options).cards, []);
  }
});

// Exercise the asynchronous image pipeline with in-memory image/canvas/fetch
// doubles. These verify sizes, caching, saving and races, not browser layout.
async function asyncTest(name, fn) { await fn(); passed += 1; console.log('통과:', name); }
const internal = sandbox.module.exports, canvases = [];
let imageWidth = 2400, imageHeight = 1200;
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout; sandbox.AbortController = AbortController;
sandbox.Image = class {
  set src(value) { this.address = value; this.naturalWidth = imageWidth; this.naturalHeight = imageHeight; queueMicrotask(() => this.onload?.()); }
};
sandbox.FileReader = class {
  readAsDataURL(blob) { this.result = blob.dataURL; queueMicrotask(() => this.onload()); }
};
sandbox.document = { createElement: tag => {
  assert.equal(tag, 'canvas');
  const canvas = { getContext: () => ({ fillRect: (...rect) => { canvas.fill = rect; }, drawImage: image => { canvas.address = image.address; } }), toDataURL: (type, quality) => {
    canvas.type = type; canvas.quality = quality;
    return 'data:image/jpeg;base64,' + Buffer.from(canvas.width + 'x' + canvas.height + canvas.address).toString('base64');
  } };
  canvases.push(canvas); return canvas;
} };
const imageResponse = url => ({ ok: true, url, blob: async () => ({ type: 'image/jpeg', dataURL: 'data:image/jpeg;base64,' + Buffer.from(url).toString('base64') }) });

await asyncTest('쪽 나누기 ready는 그림을 기다리지 않고 imagesReady가 따로 기다린다', async () => {
  let release, finished = false;
  sandbox.fetch = url => new Promise(resolve => { release = () => resolve(imageResponse(url)); });
  const article = body('그림: https://example.org/slow.jpg'); internal.state.pieces = [article];
  internal.prepareImages(false);
  const waiting = internal.imagesReady.then(() => { finished = true; });
  await internal.ready; await Promise.resolve();
  assert.equal(finished, false); assert.match(article.hero.src, /^https:/);
  release(); await waiting;
  assert.match(article.hero.src, /^data:image\/jpeg;/); assert.equal(finished, true);
});

await asyncTest('표지와 대표는 1600px, 본문과 쉽게 보기는 900px JPEG 0.85로 담는다', async () => {
  const url = 'https://example.org/shared.jpg'; let requests = 0; canvases.length = 0;
  sandbox.fetch = async address => { requests += 1; return imageResponse(address); };
  const cover = parseCover('그림: ' + url), article = body('그림: ' + url + '\n본문\n그림: ' + url + '\n[쉽게 보기] 쉽게\n그림: ' + url + '\n그림: | 빈 컷');
  internal.state.pieces = [cover, article]; internal.prepareImages(false); await internal.imagesReady;
  assert.equal(requests, 2, '같은 주소와 크기의 변환은 한 번만 한다');
  assert.deepEqual(canvases.map(c => [c.width, c.height]).sort(), [[1600, 800], [900, 450]]);
  for (const canvas of canvases) { assert.equal(canvas.type, 'image/jpeg'); assert.equal(canvas.quality, .85); assert.deepEqual(canvas.fill, [0, 0, canvas.width, canvas.height]); }
  assert.match(article.hero.src, /^data:image\/jpeg;/); assert.equal(article.blocks[1].src, article.blocks[2].panels[0].src);
  assert.equal(article.hero.src, cover.hero.src);
  assert.equal(internal.hasUnsavedImages(), true, '메모리에 담아도 저장 전 경고는 남긴다');
  for (const piece of internal.state.pieces) assert.equal(serialize(piece).includes(url), false);
  const saved = internal.state.pieces.map(piece => piece.kind === 'cover' ? parseCover(serialize(piece)) : parseArticle(serialize(piece)));
  internal.state.pieces = saved;
  assert.equal(internal.hasUnsavedImages(), false, 'data URL을 담은 저장본을 열면 경고가 없다');
});

await asyncTest('작은 그림은 키우지 않고 세로 그림의 긴 변으로 줄인다', async () => {
  imageWidth = 400; imageHeight = 600; canvases.length = 0;
  await internal.shrinkImage('data:image/png;base64,YQ==', 900);
  assert.deepEqual([canvases[0].width, canvases[0].height], [400, 600]);
  imageWidth = 1200; imageHeight = 2400;
  await internal.shrinkImage('data:image/png;base64,Yg==', 900);
  assert.deepEqual([canvases[1].width, canvases[1].height], [450, 900]);
  imageWidth = 2400; imageHeight = 1200;
});

await asyncTest('fetch 실패는 원래 주소를 남기고 저장할 때 다시 받는다', async () => {
  let requests = 0;
  const article = body('그림: https://example.org/retry.jpg'); internal.state.pieces = [article];
  sandbox.fetch = async () => { requests += 1; throw new Error('CORS'); };
  internal.prepareImages(false); await internal.imagesReady;
  assert.equal(article.hero.src, 'https://example.org/retry.jpg'); assert.equal(internal.hasUnsavedImages(), true);
  internal.prepareImages(false); await internal.imagesReady; assert.equal(requests, 1);
  sandbox.fetch = async url => { requests += 1; return imageResponse(url); };
  internal.prepareImages(true); await internal.imagesReady;
  assert.equal(requests, 2); assert.match(article.hero.src, /^data:image\/jpeg;/);
});

await asyncTest('그림이 아닌 응답과 허용하지 않은 최종 주소는 담지 않는다', async () => {
  for (const [suffix, response] of [['mime', { ok: true, url: 'https://example.org/text', blob: async () => ({ type: 'text/html' }) }], ['redirect', { ok: true, url: 'http://example.org/insecure' }]]) {
    const article = body('그림: https://example.org/' + suffix); internal.state.pieces = [article];
    sandbox.fetch = async () => response; internal.prepareImages(false); await internal.imagesReady;
    assert.match(article.hero.src, /^https:/);
  }
});

await asyncTest('느린 처음 그림이 나중에 끌어놓은 그림을 덮어쓰지 않는다', async () => {
  let release;
  sandbox.fetch = url => url.endsWith('old.jpg') ? new Promise(resolve => { release = () => resolve(imageResponse(url)); }) : Promise.resolve(imageResponse(url));
  const article = body('그림: https://example.org/old.jpg'); internal.state.pieces = [article];
  internal.prepareImages(false);
  await internal.replaceFigure(article.hero, 'https://example.org/new.jpg', 1600);
  const latest = article.hero.src; release(); await internal.imagesReady;
  assert.match(latest, /^data:image\/jpeg;/); assert.equal(article.hero.src, latest);
});

await asyncTest('그림 파일을 끌어놓아도 같은 크기로 줄이고 실패하면 기존 그림을 지킨다', async () => {
  const article = body('본문\n그림: 빈 자리'); internal.state.pieces = [article]; canvases.length = 0;
  const picture = article.blocks[1];
  const file = { type: 'image/png', name: 'picture.png', size: 1, slice: () => ({ dataURL: 'data:image/png;base64,YQ==' }) };
  await internal.replaceFigure(picture, file, 900);
  assert.deepEqual([canvases[0].width, canvases[0].height], [900, 450]);
  const previous = picture.src;
  sandbox.fetch = async () => { throw new Error('CORS'); };
  await internal.replaceFigure(picture, 'https://example.org/failed-drop.jpg', 900);
  assert.equal(picture.src, previous);
  assert.equal(internal.hasUnsavedImages(), false);
});
internal.state.pieces = [];

// Example constraints are checked when the examples have been authored.
for (const filename of ['article.html', 'magazine.html']) {
  const html = readFileSync(new URL('../examples/' + filename, import.meta.url), 'utf8');
  test(filename + ': head의 로더와 예시 기사 분량', () => {
    assert.match(html, /<head>[\s\S]*<script src="\.\.\/magazine\.js"><\/script>[\s\S]*<\/head>/);
    const articles = [...html.matchAll(/<script type="text\/x-article">([\s\S]*?)<\/script>/g)].map(m => parseArticle(m[1]));
    assert.equal(articles.length, filename === 'article.html' ? 1 : 4);
    for (const article of articles) {
      const paragraphs = article.blocks.filter(b => b.type === 'paragraph');
      assert.equal(paragraphs.length, 10, article.title);
      for (const p of paragraphs) {
        const size = [...p.text.replace(/\[\d+\]/g, '')].length;
        assert.ok(size >= 200 && size <= 300, article.title + ': ' + size + '자');
      }
      assert.ok(article.sources.length > 0);
    }
    if (filename === 'article.html') {
      assert.match(articles[0].hero.src, /^data:image\/svg\+xml,/);
      assert.ok(articles[0].blocks.some(b => b.type === 'figure' && !b.src));
    } else {
      assert.equal((html.match(/type="text\/x-cover"/g) || []).length, 1);
      assert.deepEqual(articles.map(a => a.section).sort(), ['사회과학', '여는 글', '자연과학', '자연과학']);
      const easy = articles.filter(a => a.section === '자연과학').flatMap(a => a.blocks.filter(b => b.type === 'easy'));
      assert.equal(easy.length, 1); assert.equal(easy[0].panels.length, 3);
      for (const panel of easy[0].panels) assert.match(panel.src, /^data:image\/svg\+xml,/);
    }
  });
}

console.log(`\n${passed}개 시험 통과`);
