import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { parseArticle, parseCover, ready } = require('../magazine.js');
// Expose only the pure serializer in an isolated Node evaluation. The shipped
// public API stays unchanged; this exercises the real save/reload grammar.
const source = readFileSync(new URL('../magazine.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} }, URL };
runInNewContext(source.replace('  return api;\n}));', '  api.serialize = serialize;\n  api.readPieces = readPieces;\n  return api;\n}));'), sandbox);
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

test('머리 칸 첫 그림만 대표 그림이고 다음 그림은 본문', () => {
  const a = parseArticle('제목: 물음\n그림: https://example.org/a.png | 대표\n그림: 본문 자리\n문단\n기자: 이것은 본문이다.');
  assert.equal(a.hero.caption, '대표'); assert.equal(a.blocks[0].type, 'figure'); assert.equal(a.blocks[2].text, '기자: 이것은 본문이다.');
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
    }
  });
}

console.log(`\n${passed}개 시험 통과`);
