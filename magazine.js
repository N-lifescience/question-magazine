/* 질문 잡지 렌더러 — ES2018, dependencies: none */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.QuestionMagazine = api;
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DEFAULT_RULES = [
    '무엇을 물을지는 기자가 정한다.',
    'AI가 알려 준 사실은 원래 자료에서 다시 확인한다.',
    'AI로 쓴 문장은 자기 말로 고쳐 쓴다.',
    'AI를 쓴 곳은 취재 노트에 밝힌다.'
  ];
  var ROLES = '내가 겪은 일|겪은 일|그래서 생긴 질문|질문|흔히 하는 말|원리|과정|근거|예외|내 경험 다시 보기|경험 다시 보기|생활 속 적용|남은 궁금증';
  var ROLE_RE = new RegExp('^(?:\\((?:' + ROLES + ')\\)\\s*[:：-]?|(?:' + ROLES + ')\\s*★?\\s*[:：-])\\s*');
  var ARTICLE_KEYS = {
    '꼭지': 'section', '분야': 'section', '영역': 'section', '갈래': 'section',
    '제목': 'title', '기사 제목': 'title', '부제': 'subtitle', '작은 제목': 'subtitle', '한 줄 요약': 'subtitle',
    '기자': 'author', '글쓴이': 'author', '글': 'author', '이름': 'author', '필명': 'author',
    '그림': 'hero', '사진': 'hero', '이미지': 'hero', '기자의 말': 'authorNote', '쓰면서 바뀐 생각': 'authorNote'
  };
  var COVER_KEYS = { '잡지': 'name', '영문': 'english', '호': 'issue', '학교': 'school', '문구': 'tagline',
    '그림': 'hero', '사진': 'hero', '이미지': 'hero', '대표 질문': 'question', '색': 'color', '만든 날': 'date' };

  function linesOf(text) {
    return String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  }
  function undecorate(text) { return text.replace(/\*+/g, '').replace(/★/g, '').trim(); }
  function keyValue(line) {
    var match = line.trim().replace(/^[-*]\s+/, '').match(/^([^:：]+)[:：]\s*(.*)$/);
    return match ? { key: undecorate(match[1]).replace(/^[-\s]+|[-\s]+$/g, ''), value: undecorate(match[2]) } : null;
  }
  function cleanText(text) {
    return undecorate(text)
      .replace(/^(?:\(\d+\)|\[\d+\]|\d+[.)](?!\d)|[①-⑳])\s*|^\d+\s+/, '')
      .replace(ROLE_RE, '').replace(/^\[[^\]\d]+\]\s*/, '').trim();
  }
  function safeImageURL(value) {
    var url = String(value || '').trim();
    if (/^data:image\/[a-z0-9.+-]+(?:;[^,\s]*)?,/i.test(url)) return url;
    if (!/^https:\/\//i.test(url)) return '';
    try { var parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname ? url : ''; }
    catch (error) { return ''; }
  }
  function parseFigure(value) {
    // Read the closing parenthesis as a balanced pair: signed URLs and data
    // images may contain parentheses of their own.
    value = value.trim();
    var markdown = value.match(/^!\[([^\]]*)\]\(/);
    if (markdown) {
      var start = markdown[0].length, depth = 1, end = start;
      for (; end < value.length; end += 1) {
        var ch = value[end];
        if (ch === '(') depth += 1;
        if (ch === ')' && --depth === 0) break;
      }
      if (!depth) {
        var rest = value.slice(end + 1).trim();
        if (!rest || rest[0] === '|') return { src: safeImageURL(value.slice(start, end)), caption: undecorate(rest ? rest.slice(1) : markdown[1]) };
      }
    }
    var separator = value.indexOf('|');
    var address = separator < 0 ? value.trim() : value.slice(0, separator).trim();
    var looksLikeURL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(address);
    return { src: safeImageURL(address), caption: undecorate(separator >= 0 ? value.slice(separator + 1) : looksLikeURL ? '' : address) };
  }
  function figureLine(line) {
    if (/^!\[[^\]]*\]\(/.test(line)) return parseFigure(line);
    var kv = keyValue(line);
    return kv && ARTICLE_KEYS[kv.key] === 'hero' ? parseFigure(kv.value) : null;
  }
  function isSources(line) { return /^(?:#{1,3}\s*)?(?:\[출처\]|출처\s*[:：]?|참고 자료\s*[:：]?)\s*$/.test(undecorate(line)); }
  function isNote(line) { return /^\[취재 노트\]\s*$/.test(undecorate(line)); }
  function isSpecial(line) {
    return /^(?:#{1,3}\s+|>\s*|\[상자\]|\[쉽게 보기\])/.test(undecorate(line)) || isNote(line) || isSources(line) || !!figureLine(line);
  }
  function parseArticle(text) {
    var article = { kind: 'article', section: '', title: '', subtitle: '', author: '', hero: null,
      authorNote: '', blocks: [], notes: [], sources: [] };
    var lines = linesOf(text), header = true, mode = '', box = null, easy = null, sourceMap = {};
    var headerFigures = [], subheadings = 0, secondSubheading = -1;
    function addSource(source) {
      var normalized = undecorate(source).replace(/\s+/g, ' ').trim();
      if (!normalized) return 0;
      var index = article.sources.indexOf(normalized);
      if (index === -1) { article.sources.push(normalized); index = article.sources.length - 1; }
      return index + 1;
    }
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (/^```/.test(line)) return;
      if (!line) { if (mode === 'box' || mode === 'notes' || mode === 'easy') mode = ''; box = null; easy = null; return; }
      var picture = figureLine(line);
      if (mode === 'easy' && picture) { easy.panels.push(picture); return; }
      if (/^\[쉽게 보기\]/.test(undecorate(line))) {
        easy = { type: 'easy', title: undecorate(line).replace(/^\[쉽게 보기\]\s*/, ''), panels: [] };
        article.blocks.push(easy); mode = 'easy'; header = false; return;
      }
      if (isSources(line)) { mode = 'sources'; header = false; return; }
      if (isNote(line)) { mode = 'notes'; header = false; return; }
      if (/^\[상자\]/.test(undecorate(line))) {
        box = { type: 'box', title: undecorate(line).replace(/^\[상자\]\s*/, ''), lines: [] };
        article.blocks.push(box); mode = 'box'; header = false; return;
      }
      var kv = keyValue(line), key = kv && Object.prototype.hasOwnProperty.call(ARTICLE_KEYS, kv.key) ? ARTICLE_KEYS[kv.key] : null;
      // A late metadata line fills a missing field without becoming prose or a
      // source. Existing fields win once the body has started.
      if (key && key !== 'hero') {
        if (header || !article[key]) article[key] = kv.value;
        return;
      }
      if (mode === 'sources' && !isSpecial(line)) {
        var marker = line.match(/^(?:\[(\d+)\]|(\d+)[.)])\s*/);
        var number = addSource(line.replace(/^(?:\d+[.)]|\[\d+\]|-)\s*/, ''));
        if (marker) sourceMap[marker[1] || marker[2]] = number;
        return;
      }
      if (mode === 'notes' && kv) { article.notes.push({ key: kv.key, value: kv.value }); return; }
      if (mode === 'box' && !isSpecial(line)) {
        box.lines.push({ bullet: /^-\s/.test(line), text: cleanText(line.replace(/^-\s+/, '')) }); return;
      }
      mode = '';
      if (header && picture) {
        if (!article.hero) article.hero = picture;
        else headerFigures.push(Object.assign({ type: 'figure' }, picture));
        return;
      }
      header = false;
      if (picture) article.blocks.push(Object.assign({ type: 'figure' }, picture));
      else if (/^#{1,3}\s+/.test(line)) {
        if (/^##\s+/.test(line) && ++subheadings === 2) secondSubheading = article.blocks.length;
        article.blocks.push({ type: 'heading', text: cleanText(line.replace(/^#{1,3}\s+/, '')) });
      }
      else if (/^>/.test(line)) article.blocks.push({ type: 'quote', text: cleanText(line.replace(/^>\s*/, '')) });
      else { var body = cleanText(line); if (body) article.blocks.push({ type: 'paragraph', text: body }); }
    });
    if (headerFigures.length) {
      var insertion = secondSubheading, paragraphs = 0;
      if (insertion < 0) {
        insertion = article.blocks.length;
        article.blocks.some(function (block, index) {
          if (block.type === 'paragraph' && ++paragraphs === 3) { insertion = index + 1; return true; }
          return false;
        });
      }
      article.blocks.splice.apply(article.blocks, [insertion, 0].concat(headerFigures));
    }
    // Reserve explicit source numbers first, then collect inline citations. This
    // makes [1] stable even when an inline citation precedes the final source list.
    function references(value) {
      var saved = [], result = '', start = 0;
      for (var i = 0; i < value.length; i += 1) {
        if (value[i] !== '(' && value[i] !== '[') continue;
        var marker = value.slice(i + 1).match(/^(?:출처|참고)\s*[:：]\s*/);
        if (!marker) continue;
        var contentStart = i + 1 + marker[0].length, stack = [value[i]], end = contentStart;
        for (; end < value.length; end += 1) {
          var ch = value[end];
          if (ch === '(' || ch === '[') stack.push(ch);
          else if ((ch === ')' && stack[stack.length - 1] === '(') || (ch === ']' && stack[stack.length - 1] === '[')) {
            stack.pop(); if (!stack.length) break;
          }
        }
        if (stack.length) continue;
        var number = addSource(value.slice(contentStart, end)); saved.push(number ? '[' + number + ']' : '');
        result += value.slice(start, i) + '\u0000' + (saved.length - 1) + '\u0000'; start = end + 1; i = end;
      }
      result += value.slice(start);
      result = result.replace(/\[(\d+)\]/g, function (_, number) { return '[' + (sourceMap[number] || number) + ']'; });
      return result.replace(/\u0000(\d+)\u0000/g, function (_, index) { return saved[Number(index)]; });
    }
    article.blocks.forEach(function (block) {
      if (block.text) block.text = references(block.text);
      if (block.lines) block.lines.forEach(function (line) { line.text = references(line.text); });
    });
    article.notes.forEach(function (note) { note.value = references(note.value); });
    return article;
  }
  function parseCover(text) {
    var cover = { kind: 'cover', name: '질문 잡지', english: '', issue: '', school: '', tagline: '',
      hero: null, question: '', color: '#1F5F8B', date: '', sectionNames: Object.create(null), principles: [] };
    var principles = false;
    linesOf(text).forEach(function (raw) {
      var line = raw.trim();
      if (!line || /^```/.test(line)) return;
      if (/^!\[[^\]]*\]\(/.test(line)) { cover.hero = parseFigure(line); principles = false; return; }
      var kv = keyValue(line);
      if (kv && kv.key === 'AI 원칙') { principles = true; if (kv.value) cover.principles.push(kv.value); return; }
      if (kv && kv.key === '꼭지 이름') {
        principles = false;
        var split = kv.value.indexOf('=');
        if (split > 0) cover.sectionNames[kv.value.slice(0, split).trim()] = kv.value.slice(split + 1).trim();
      } else if (kv && Object.prototype.hasOwnProperty.call(COVER_KEYS, kv.key)) {
        principles = false;
        var key = COVER_KEYS[kv.key];
        if (key === 'hero') cover.hero = parseFigure(kv.value);
        else if (key === 'color') { if (/^#[0-9a-f]{6}$/i.test(kv.value)) cover.color = kv.value; }
        else cover[key] = kv.value;
      } else if (principles) cover.principles.push(undecorate(line.replace(/^[-*]\s+/, '')));
    });
    if (!cover.principles.length) cover.principles = DEFAULT_RULES.slice();
    return cover;
  }

  var resolveReady;
  var api = { ready: new Promise(function (resolve) { resolveReady = resolve; }), parseArticle: parseArticle, parseCover: parseCover,
    get imagesReady() { return api.ready.then(function () { return state.queue; }).then(waitForImages); },
    audit: audit, add: add, render: render };
  var browser = typeof document !== 'undefined' && typeof window !== 'undefined';
  var state = { pieces: [], pages: [], failures: [], bleed: false, sequence: 0, mounted: false, queue: Promise.resolve(), cover: null, fontStyles: Promise.resolve() };
  var imageJobs = new WeakMap(), imageCache = new Map(), imagePending = new Set(), figureViews = new Map(), unsavedImages = new WeakSet();
  var stage, status, message, orderPanel, fileInput, printStyle;
  var scriptURL = browser && document.currentScript ? document.currentScript.src || 'magazine.js' : 'magazine.js';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function sectionColor(section) { return section === '사회과학' ? '#1F5F8B' : section === '자연과학' ? '#C8622A' : '#4A5A3C'; }
  function sectionName(section) {
    return state.cover.sectionNames[section] || (section === '사회과학' ? '사람과 사회의 물음표' : section === '자연과학' ? '몸과 자연의 물음표' : section || '그 밖의 질문');
  }
  function articleChars(article) {
    return article.blocks.map(function (block) { return block.text || (block.lines || []).map(function (line) { return line.text; }).join(''); }).join('').replace(/\[\d+\]/g, '').length;
  }
  function articleQuestion(article) {
    var paragraphs = article.blocks.filter(function (block) { return block.type === 'paragraph'; });
    var last = paragraphs.length ? paragraphs[paragraphs.length - 1].text.trim() : '';
    // A decimal point is not a sentence boundary. Include a closing quote when
    // the first sentence is quoted, but never pick a later question instead.
    var first = last.match(/^.*?(?:[!?！？。]|\.(?=["'”’」』]?(?:\s|$))|$)["'”’」』]?/);
    return first && /[?？]["'”’」』]?$/.test(first[0]) ? first[0] : article.title || '제목 없는 기사';
  }
  function easyGroups(article) { return (article.blocks || []).filter(function (block) { return block.type === 'easy'; }); }
  function easyPanelCount(article) { return easyGroups(article).reduce(function (count, group) { return count + group.panels.length; }, 0); }
  function pieceFigures(piece) {
    var figures = piece.hero ? [{ model: piece.hero, limit: 1600 }] : [];
    (piece.blocks || []).forEach(function (block) {
      if (block.type === 'figure') figures.push({ model: block, limit: 900 });
      if (block.type === 'easy') block.panels.forEach(function (panel) { figures.push({ model: panel, limit: 900 }); });
    });
    return figures;
  }
  function hasArticleImages(article) { return pieceFigures(article).some(function (entry) { return !!safeImageURL(entry.model.src); }); }
  function inline(node, value, citations) {
    var pattern = citations === false ? /(?:https:\/\/|www\.)[^\s<>]+/gi : /\[(\d+)\]/g;
    var last = 0, match;
    while ((match = pattern.exec(value))) {
      node.appendChild(document.createTextNode(value.slice(last, match.index)));
      if (citations === false) {
        var address = match[0], label = Array.from(address.replace(/^https:\/\//i, '').replace(/^www\./i, ''));
        var link = element('a', '', label.length > 38 ? label.slice(0, 36).join('') + '…' : label.join(''));
        link.href = /^www\./i.test(address) ? 'https://' + address : address;
        link.title = address; link.rel = 'noreferrer'; node.appendChild(link);
      } else { var sup = element('sup', 'qm-reference', match[1]); sup.setAttribute('aria-label', '출처 ' + match[1]); node.appendChild(sup); }
      last = pattern.lastIndex;
    }
    node.appendChild(document.createTextNode(value.slice(last)));
  }

  var CSS = `
    :root { --qm-width:210mm; --qm-height:297mm; --qm-bleed:0mm; }
    * { box-sizing:border-box; }
    body.qm-app { margin:0; color:#222820; background:#e7e8e5; font-family:'Pretendard Variable',Pretendard,sans-serif; word-break:keep-all; overflow-wrap:anywhere; }
    .qm-toolbar { padding:18px max(16px,calc((100% - 1040px)/2)); background:#fff; border-bottom:1px solid #c9cec5; }
    .qm-toolbar h1 { margin:0 0 14px; font-size:22px; line-height:1.3; }
    .qm-tools { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
    .qm-app button,.qm-app .qm-bleed { min-height:44px; font:inherit; font-size:16px; line-height:1.4; }
    .qm-app button { padding:10px 14px; background:#fff; color:#263228; border:1px solid #a7b0a6; border-radius:4px; cursor:pointer; word-break:keep-all; }
    .qm-app button:hover { background:#eef2eb; }
    .qm-app button:disabled { opacity:.5; cursor:default; }
    .qm-app button.qm-primary { background:#253e2d; color:#fff; border-color:#253e2d; }
    .qm-app :focus-visible { outline:3px solid #be5c23; outline-offset:3px; }
    .qm-app ::selection { background:#f5d3b8; color:#18241a; }
    .qm-bleed { display:flex; align-items:center; gap:8px; padding:8px; cursor:pointer; }
    .qm-bleed input { width:20px; height:20px; accent-color:#253e2d; }
    .qm-hint,.qm-status,.qm-message { margin:12px 0 0; font-size:16px; line-height:1.6; }
    .qm-status[data-error='true'] { color:#a1211b; font-weight:700; }
    .qm-message:empty { display:none; }
    .qm-copy { display:block; box-sizing:border-box; width:100%; min-height:160px; margin:8px 0 0; padding:10px 12px; font:15px/1.6 system-ui,sans-serif; word-break:keep-all; overflow-wrap:anywhere; }
    .qm-order { margin-top:16px; }
    .qm-order[hidden] { display:none; }
    .qm-order ol { list-style:none; padding:0; margin:12px 0; }
    .qm-order li { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 0; border-top:1px solid #d5dbd1; }
    .qm-order-name { flex:1 1 240px; min-width:0; font-size:16px; }
    .qm-stage { padding:24px 12px 48px; }
    .qm-shell { position:relative; margin:0 auto 24px; overflow:hidden; }
    .qm-sheet { position:relative; width:var(--qm-width); height:var(--qm-height); padding:calc(18mm + var(--qm-bleed)) calc(16mm + var(--qm-bleed)) calc(20mm + var(--qm-bleed)); background:#fff; transform-origin:top left; color:#222820; font-family:'Noto Serif KR',serif; font-size:9.5pt; line-height:1.7; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
    .qm-sheet h1,.qm-sheet h2,.qm-sheet h3,.qm-sans { font-family:'Pretendard Variable',Pretendard,sans-serif; text-wrap:balance; }
    .qm-sheet h1 { font-size:29pt; line-height:1.22; letter-spacing:-.025em; margin:3mm 0; }
    .qm-sheet h2 { font-size:28pt; line-height:1.25; margin:0 0 9mm; }
    .qm-inner { height:100%; min-height:0; position:relative; }
    .qm-running { position:absolute; top:calc(8mm + var(--qm-bleed)); left:calc(16mm + var(--qm-bleed)); right:calc(16mm + var(--qm-bleed)); font:8pt/1.4 'Pretendard Variable',sans-serif; color:#525e50; }
    .qm-folio { position:absolute; bottom:calc(8mm + var(--qm-bleed)); right:calc(16mm + var(--qm-bleed)); font:9pt/1.2 'Pretendard Variable',sans-serif; }
    .qm-sheet[data-even='true'] .qm-folio { right:auto; left:calc(16mm + var(--qm-bleed)); }
    .qm-band { margin:0 0 4mm; padding:2mm 3mm; background:var(--qm-color); color:#fff; font:700 9pt/1.5 'Pretendard Variable',sans-serif; }
    .qm-subtitle { margin:3mm 0; font:12pt/1.55 'Pretendard Variable',sans-serif; color:#50584e; }
    .qm-byline { margin:3mm 0 5mm; font:8.5pt/1.5 'Pretendard Variable',sans-serif; }
    .qm-article-head { padding-bottom:4mm; }
    .qm-columns { column-count:2; column-gap:7mm; column-fill:auto; width:100%; text-align:left; }
    .qm-columns > p { margin:0 0 3mm; orphans:2; widows:2; }
    .qm-columns .qm-continuation { text-indent:0; }
    .qm-heading { font-size:12pt; line-height:1.45; margin:4mm 0 2mm; break-after:avoid; break-inside:avoid; color:var(--qm-color); }
    .qm-heading:first-child { margin-top:0; }
    .qm-reference { color:var(--qm-color); font:700 6.5pt/0 'Pretendard Variable',sans-serif; padding-left:.5mm; }
    .qm-figure { margin:0 0 4mm; break-inside:avoid; text-align:left; }
    .qm-image-frame { position:relative; width:100%; aspect-ratio:4/3; overflow:hidden; cursor:pointer; background:#eff1ed; }
    .qm-hero .qm-image-frame { height:80mm; aspect-ratio:auto; }
    .qm-image-frame img { display:block; width:100%; height:100%; object-fit:cover; }
    .qm-image-frame img[hidden] { display:none; }
    .qm-figure[data-empty='true'] .qm-image-frame,.qm-figure[data-broken='true'] .qm-image-frame { background:repeating-linear-gradient(135deg,#eef0eb 0,#eef0eb 3mm,#e3e7df 3mm,#e3e7df 3.5mm); }
    .qm-image-help { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:5mm; gap:3mm; text-align:center; font:10pt/1.6 'Pretendard Variable',sans-serif; color:#3d4b38; }
    .qm-image-help[hidden] { display:none; }
    .qm-image-help .qm-screen-only { font-size:16px; }
    .qm-figure figcaption { font-size:7.5pt; line-height:1.55; margin-top:1.5mm; }
    .qm-easy-bottom { position:absolute; inset:auto 0 0; }
    .qm-easy-strip { height:85mm; padding-bottom:5mm; break-inside:avoid; }
    .qm-easy-strip h3 { margin:0 0 3mm; color:var(--qm-color); font:700 12pt/1.4 'Pretendard Variable',sans-serif; }
    .qm-easy-panels { display:grid; gap:4mm; align-items:start; }
    .qm-easy-panels .qm-figure { margin:0; min-width:0; }
    .qm-easy-panels .qm-image-frame { aspect-ratio:1; max-width:52mm; margin-inline:auto; }
    .qm-easy-panels figcaption { font:700 12pt/1.35 'Pretendard Variable',sans-serif; text-align:center; }
    .qm-easy-panels .qm-image-help { padding:2mm; gap:1mm; font-size:9pt; }
    .qm-easy-panels .qm-screen-only { font-size:9pt; }
    .qm-quote { break-inside:avoid; color:var(--qm-color); font-size:13pt; line-height:1.6; border-block:1px solid currentColor; padding:4mm 0; margin:3mm 0 5mm; text-align:left; }
    .qm-box { break-inside:avoid; background:var(--qm-tint); padding:4mm; margin:0 0 4mm; font-size:8.5pt; line-height:1.65; text-align:left; }
    .qm-box h3 { margin:0 0 2mm; font-size:10pt; color:var(--qm-color); }
    .qm-box p { margin:1mm 0; }
    .qm-box ul { padding-left:4mm; margin:2mm 0; }
    .qm-source { margin:0 0 2mm; padding-left:5mm; font-size:6.5pt; line-height:1.35; overflow-wrap:anywhere; text-align:left; }
    .qm-source.qm-continuation { list-style:none; }
    .qm-source a { color:inherit; text-decoration-thickness:1px; text-underline-offset:2px; }
    .qm-compact .qm-hero .qm-image-frame { height:64mm; }
    .qm-compact .qm-columns .qm-figure .qm-image-frame { aspect-ratio:16/10; }
    .qm-compact .qm-source { font-size:6.2pt; }
    .qm-compact .qm-quote { font-size:12pt; }
    .qm-article-question { position:absolute; left:0; right:0; display:flex; flex-direction:column; justify-content:center; gap:4mm; padding:6mm; background:var(--qm-tint); text-align:center; font-family:'Pretendard Variable',sans-serif; }
    .qm-article-question p { margin:0; }
    .qm-article-question-label { color:var(--qm-color); font-size:8pt; line-height:1.4; }
    .qm-article-question h3 { margin:0; font-size:18pt; font-weight:700; line-height:1.4; }
    .qm-article-question-prompt { font-size:9pt; line-height:1.5; text-wrap:pretty; }
    .qm-cover { --qm-color:#1f5f8b; padding-top:calc(5mm + var(--qm-bleed)); }
    .qm-cover .qm-inner { display:flex; flex-direction:column; z-index:2; pointer-events:none; }
    .qm-cover-masthead { flex:none; min-height:55mm; padding-block:5mm; }
    .qm-cover-name { color:var(--qm-color); font-size:43pt !important; line-height:1.15 !important; margin:3mm 0 5mm !important; }
    .qm-cover-english { font:700 10pt/1.4 'Pretendard Variable',sans-serif; letter-spacing:.08em; margin:0; }
    .qm-cover-meta { font:10pt/1.7 'Pretendard Variable',sans-serif; margin:0; }
    .qm-cover > .qm-figure { position:absolute; inset:calc(60mm + var(--qm-bleed)) 0 0; margin:0; }
    .qm-cover > .qm-figure figcaption { display:none; }
    .qm-cover .qm-image-frame { height:100%; aspect-ratio:auto; }
    .qm-cover .qm-image-frame:focus-visible { outline-offset:-4px; }
    .qm-cover .qm-image-help { padding-inline:calc(12mm + var(--qm-bleed)); }
    .qm-cover::before { content:''; position:absolute; inset:0 0 auto; height:calc(60mm + var(--qm-bleed)); background:#f8f6f0; }
    .qm-cover-questions { margin-top:auto; padding:6mm; background:rgba(255,255,255,.92); border-radius:3mm; }
    .qm-cover-questions h2 { font-size:12pt; margin:0 0 3mm; }
    .qm-cover-question,.qm-cover-item { display:flex; align-items:baseline; gap:3mm; margin:2mm 0; font-family:'Pretendard Variable',sans-serif; }
    .qm-cover-question { font-size:22pt; line-height:1.35; }
    .qm-cover-item { font-size:12pt; line-height:1.4; }
    .qm-question-dot { flex:none; width:2.5mm; height:2.5mm; border-radius:50%; background:var(--qm-color); }
    .qm-cover-tagline { margin:0; padding-top:4mm; font-size:11pt; line-height:1.5; }
    .qm-cover-strip { position:absolute; inset:0 0 auto; z-index:3; height:5mm; background:var(--qm-color); }
    .qm-flow { height:100%; }
    .qm-toc-group { font:700 12pt/1.5 'Pretendard Variable',sans-serif; color:var(--qm-color); margin:6mm 0 3mm; break-after:avoid; }
    .qm-toc-row { display:grid; grid-template-columns:minmax(0,1fr) 18mm; gap:5mm; padding:3mm 0; border-bottom:1px solid #dce0d7; break-inside:avoid; }
    .qm-toc-row strong { display:block; font:700 12pt/1.45 'Pretendard Variable',sans-serif; }
    .qm-toc-row small { display:block; font-size:8pt; margin-top:1mm; }
    .qm-toc-number { text-align:right; align-self:center; font:10pt/1.5 'Pretendard Variable',sans-serif; font-variant-numeric:tabular-nums; }
    .qm-note-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:3mm; align-content:start; }
    .qm-note-card { min-width:0; background:var(--qm-tint); padding:3mm; }
    .qm-note-card h3 { margin:0 0 1mm; font-size:11pt; line-height:1.3; color:var(--qm-color); }
    .qm-note-card p { margin:1.5mm 0 0; font-size:9pt; line-height:1.55; }
    .qm-note-card small { display:block; font:8pt/1.4 'Pretendard Variable',sans-serif; }
    .qm-writing-lines { height:175mm; margin-top:10mm; background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(12mm - 1px),#bfc8b9 calc(12mm - 1px),#bfc8b9 12mm); }
    .qm-back h3 { font-size:13pt; margin:8mm 0 3mm; color:var(--qm-color); }
    .qm-back p,.qm-back li { font-size:10pt; line-height:1.85; }
    .qm-back ul { padding-left:5mm; }
    .qm-credit { border-top:1px solid #bfc8b9; padding-top:5mm; margin-top:12mm; }
    .qm-empty { max-width:640px; margin:40px auto; font-size:18px; line-height:1.7; }
    .qm-measuring .qm-sheet { transform:none !important; }
    @media (max-width:480px) { .qm-toolbar { padding:16px 12px; } .qm-tools { align-items:stretch; } .qm-tools button { flex:1 1 130px; } .qm-stage { padding:16px 8px 32px; } }
    @media print {
      html,body.qm-app { margin:0; padding:0; background:#fff; }
      .qm-toolbar,.qm-screen-only { display:none !important; }
      .qm-stage { padding:0; }
      .qm-shell { width:var(--qm-width) !important; height:var(--qm-height) !important; margin:0; break-after:page; page-break-after:always; }
      .qm-shell:last-child { break-after:auto; page-break-after:auto; }
      .qm-sheet { transform:none !important; margin:0; }
      .qm-image-frame { cursor:default; }
      .qm-figure[data-empty='true'] .qm-image-frame,.qm-figure[data-broken='true'] .qm-image-frame { background:#f5f6f3; }
      .qm-image-help { font-size:10pt; }
      .qm-figure:focus-visible { outline:none; }
    }
  `;

  function installStyles() {
    var style = element('style'); style.textContent = CSS; document.head.appendChild(style);
    printStyle = element('style'); document.head.appendChild(printStyle);
    state.fontStyles = Promise.all([
      'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
      'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&display=swap'
    ].map(function (href) {
      return new Promise(function (resolve) {
        var link = element('link'); link.rel = 'stylesheet'; link.href = href;
        link.addEventListener('load', resolve, { once: true }); link.addEventListener('error', resolve, { once: true }); document.head.appendChild(link);
      });
    }));
  }
  function tint(color) { return 'rgb(' + [1, 3, 5].map(function (i) { return Math.round(parseInt(color.slice(i, i + 2), 16) * .08 + 255 * .92); }).join(',') + ')'; }
  function applyColor(node, color) { node.style.setProperty('--qm-color', color); node.style.setProperty('--qm-tint', tint(color)); }
  function makePage(kind, piece, running) {
    var shell = element('div', 'qm-shell'), paper = element('section', 'qm-sheet qm-' + kind), inner = element('div', 'qm-inner');
    paper.dataset.kind = kind; paper.setAttribute('aria-label', (piece && piece.title) || running || '잡지 쪽');
    applyColor(paper, piece ? sectionColor(piece.section) : state.cover.color);
    if (running) paper.appendChild(element('div', 'qm-running', running));
    paper.appendChild(inner); paper.appendChild(element('span', 'qm-folio'));
    shell.appendChild(paper); stage.appendChild(shell);
    var page = { shell: shell, paper: paper, inner: inner, kind: kind, piece: piece || null };
    state.pages.push(page); return page;
  }
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result)); }; reader.onerror = function () { reject(new Error('그림 파일을 읽지 못했습니다.')); }; reader.readAsDataURL(file);
    });
  }
  function trackImage(promise) {
    imagePending.add(promise);
    promise.then(function () { imagePending.delete(promise); }, function () { imagePending.delete(promise); });
    return promise;
  }
  async function waitForImages() {
    // Include work added while an earlier batch was still running.
    while (imagePending.size) await Promise.all(Array.from(imagePending));
  }
  function shrinkImage(src, limit) {
    return new Promise(function (resolve, reject) {
      var image = new Image(), timer = setTimeout(function () { finish(new Error('그림을 읽지 못했습니다. 다른 그림을 골라 주세요.')); }, 8000);
      function finish(error, url) { clearTimeout(timer); image.onload = null; image.onerror = null; if (error) reject(error); else resolve(url); }
      image.onerror = function () { finish(new Error('그림을 읽지 못했습니다. 다른 그림을 골라 주세요.')); };
      image.onload = function () {
        try {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('그림 크기를 읽지 못했습니다.');
          var ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight)), canvas = element('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          var context = canvas.getContext('2d'); if (!context) throw new Error('그림을 바꾸지 못했습니다. 다시 골라 주세요.');
          context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
          var url = canvas.toDataURL('image/jpeg', .85);
          if (!/^data:image\/jpeg[,;]/i.test(url)) throw new Error('그림을 바꾸지 못했습니다. 다시 골라 주세요.');
          finish(null, url);
        } catch (error) { finish(error); }
      };
      image.src = src;
    });
  }
  function fetchImage(src, limit) {
    var key = limit + ':' + src;
    if (!imageCache.has(key)) imageCache.set(key, (async function () {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 8000);
      try {
        var response = await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok || !safeImageURL(response.url)) throw new Error('그림 주소를 열지 못했습니다.');
        var blob = await response.blob(); if (!/^image\//i.test(blob.type)) throw new Error('그림 주소를 확인해 주세요.');
        return await shrinkImage(await readImage(blob), limit);
      } finally { clearTimeout(timer); }
    }()).catch(function (error) { imageCache.delete(key); throw error; }));
    return imageCache.get(key);
  }
  function updateFigureViews(model) {
    return Promise.all(Array.from(figureViews.get(model) || []).filter(function (view) { return view.figure.isConnected; }).map(function (view) { return view.update(); }));
  }
  function prepareImages(retry) {
    state.pieces.forEach(function (piece) { pieceFigures(piece).forEach(function (entry) {
      var model = entry.model, src = safeImageURL(model.src), previous = imageJobs.get(model);
      if (!/^https:/i.test(src) || previous && previous.src === src && (previous.pending || !retry)) return;
      unsavedImages.add(model);
      var job = { src: src, pending: true }; imageJobs.set(model, job);
      job.promise = trackImage((async function () {
        var url = null;
        try { url = await fetchImage(src, entry.limit); } catch (error) { /* Keep the original address for display and saving. */ }
        job.pending = false;
        if (imageJobs.get(model) !== job || model.src !== src) return;
        // Remember the agent's https address so 「AI에게 보낼 말 복사」 can hand it back.
        if (url) { model.remote = src; model.src = url; }
        await updateFigureViews(model); refreshStatus();
      }()));
    }); });
  }
  function htmlAttribute(attrs, name) {
    var pattern = /(?:^|\s)([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, match;
    while ((match = pattern.exec(attrs))) { if (match[1].toLowerCase() === name.toLowerCase()) return match[2] || match[3] || match[4] || ''; }
    return '';
  }
  function droppedImageURL(transfer) {
    var addresses = transfer.getData('text/uri-list').split(/\r?\n/).filter(function (line) { return line.trim()[0] !== '#'; });
    // Read just img/src without constructing an HTML document or loading any of
    // its resources. Decode URL attribute entities without inserting user HTML.
    var html = transfer.getData('text/html'), tags = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<img\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi, match;
    while ((match = tags.exec(html))) {
      if (match[1] == null) continue;
      addresses.push(htmlAttribute(match[1], 'src').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, function (entity) {
        var named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }, lower = entity.toLowerCase();
        if (named[lower]) return named[lower];
        var number = lower[2] === 'x' ? parseInt(lower.slice(3, -1), 16) : Number(lower.slice(2, -1));
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
      }));
    }
    return addresses.map(safeImageURL).find(function (url) { return /^https:/i.test(url); }) || '';
  }
  function replaceFigure(model, input, limit) {
    if (!input) return Promise.resolve();
    // Changing the job token also prevents a slow earlier fetch/drop from
    // overwriting the picture most recently chosen for this slot.
    var token = { src: model.src, pending: true }; imageJobs.set(model, token);
    return trackImage((async function () {
      try {
        var external = typeof input === 'string', url;
        if (external) {
          var src = safeImageURL(input);
          if (!/^https:/i.test(src)) throw new Error('https 그림 주소를 골라 주세요.');
          url = await fetchImage(src, limit);
        } else {
          var mime = input.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' })[(input.name || '').split('.').pop().toLowerCase()];
          if (!mime || !/^image\//.test(mime)) throw new Error('그림 파일을 골라 주세요.');
          url = await shrinkImage(await readImage(input.slice(0, input.size, mime)), limit);
        }
        if (imageJobs.get(model) !== token) return;
        model.remote = external ? src : ''; model.src = url; token.pending = false;
        if (external) unsavedImages.add(model); else unsavedImages.delete(model);
        await updateFigureViews(model);
        // Only the attribution changes; fixed image frames need no repagination.
        updateBylines(); refreshStatus(); announce('그림을 넣었습니다.');
      } catch (error) {
        token.pending = false;
        if (imageJobs.get(model) === token) { await updateFigureViews(model); refreshStatus(); announce('그림을 넣지 못했습니다. 그림 파일을 골라 다시 넣어 주세요.'); }
      }
    }()));
  }
  function figureNode(model, hero) {
    var figure = element('figure', 'qm-figure' + (hero ? ' qm-hero' : ''));
    var frame = element('div', 'qm-image-frame');
    var limit = hero ? 1600 : 900;
    frame.tabIndex = 0; frame.setAttribute('role', 'button'); frame.setAttribute('aria-label', (model.caption || '그림') + ' — 그림 고르기');
    frame.title = '눌러서 다른 그림 파일로 바꾸거나, 다른 탭의 그림을 끌어다 놓으세요.';
    function choose() {
      var input = element('input'); input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', function () { replaceFigure(model, input.files[0], limit); }); input.click();
    }
    frame.addEventListener('click', choose);
    frame.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    frame.addEventListener('dragover', function (event) { event.preventDefault(); event.stopPropagation(); });
    frame.addEventListener('drop', function (event) {
      event.preventDefault(); event.stopPropagation();
      var transfer = event.dataTransfer, input = transfer.files[0] || droppedImageURL(transfer);
      if (input) replaceFigure(model, input, limit); else announce('그림 파일이나 다른 탭의 https 그림을 끌어다 놓아 주세요.');
    });
    var help = element('div', 'qm-image-help');
    help.appendChild(element('span', '', model.caption || '그림 자리'));
    var hint = element('span', 'qm-screen-only', '그림 파일이나 다른 탭의 그림을 여기에 끌어다 놓으세요. 눌러서 골라도 됩니다.'); help.appendChild(hint);
    var img = element('img'); img.alt = model.caption; img.referrerPolicy = 'no-referrer'; img.hidden = true;
    function loaded() {
      figure.dataset.broken = 'false'; img.hidden = false; help.hidden = true;
      var paper = figure.closest('.qm-cover');
      if (paper) paper.dataset.orientation = img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape';
      refreshStatus();
    }
    img.addEventListener('error', function () { figure.dataset.broken = 'true'; img.hidden = true; help.hidden = false; refreshStatus(); });
    img.addEventListener('load', loaded);
    frame.appendChild(img); frame.appendChild(help);
    figure.appendChild(frame);
    if (model.caption) figure.appendChild(element('figcaption', '', model.caption));
    var view = { figure: figure, update: function () {
      var src = safeImageURL(model.src), job = imageJobs.get(model), pending = job && job.pending && job.src === src;
      figure.dataset.empty = String(!src); figure.dataset.broken = 'false';
      hint.textContent = pending ? '그림을 불러오고 있습니다.' : '그림 파일이나 다른 탭의 그림을 여기에 끌어다 놓으세요. 눌러서 골라도 됩니다.';
      if (!src || pending) { img.hidden = true; img.removeAttribute('src'); help.hidden = false; return Promise.resolve(); }
      img.src = src;
      // Wait only on the image path; draw()/ready never await this promise.
      return typeof img.decode === 'function' ? img.decode().then(loaded, function () {}) : Promise.resolve();
    } };
    if (!figureViews.has(model)) figureViews.set(model, new Set()); figureViews.get(model).add(view);
    trackImage(view.update());
    return figure;
  }
  function blockNode(block) {
    var node;
    if (block.type === 'figure') return figureNode(block, false);
    if (block.type === 'heading') return element('h3', 'qm-heading', block.text);
    if (block.type === 'box' || block.type === 'notes') {
      node = element('aside', 'qm-box'); node.appendChild(element('h3', '', block.title));
      var list = null;
      block.lines.forEach(function (line) {
        if (line.bullet) { if (!list) { list = element('ul'); node.appendChild(list); } var item = element('li'); inline(item, line.text); list.appendChild(item); }
        else { list = null; var p = element('p'); inline(p, line.text); node.appendChild(p); }
      });
      return node;
    }
    if (block.type === 'source') {
      node = element('ol', 'qm-source' + (block.continuation ? ' qm-continuation' : '')); node.start = block.number;
      var li = element('li'); inline(li, block.text, false); node.appendChild(li); return node;
    }
    node = element(block.type === 'quote' ? 'blockquote' : 'p', block.type === 'quote' ? 'qm-quote' : block.continuation ? 'qm-continuation' : '');
    inline(node, block.text); return node;
  }
  function overflows(node) { return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1; }
  function contentArea(node, bounds) {
    return Array.from(node.children).reduce(function (area, child) {
      // These containers have a fixed height even when only one line is used.
      if (['qm-columns', 'qm-flow', 'qm-note-grid'].some(function (name) { return child.classList.contains(name); })) return area + contentArea(child, bounds);
      return area + Array.from(child.getClientRects()).reduce(function (sum, rect) {
        var width = Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left));
        var height = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
        return sum + width * height;
      }, 0);
    }, 0);
  }
  function fillRatio(page, bodyOnly) {
    var node = bodyOnly ? page.columns : page.inner;
    var bounds = node.getBoundingClientRect(), capacity = bounds.width * bounds.height;
    if (!capacity) return 0;
    var area = contentArea(node, bounds);
    if (!bodyOnly && page.kind === 'cover') {
      var artwork = page.paper.querySelector('.qm-figure');
      if (artwork) area += contentArea(artwork, bounds);
    }
    return Math.min(1, area / capacity);
  }
  function firstRect(node) {
    var range = document.createRange(); range.selectNodeContents(node);
    var rects = Array.from(range.getClientRects()).filter(function (rect) { return rect.width && rect.height; });
    return rects[0] || node.getBoundingClientRect();
  }
  function columnIndex(columns, rect) {
    var bounds = columns.getBoundingClientRect(), scale = bounds.width / columns.clientWidth;
    var gap = parseFloat(getComputedStyle(columns).columnGap) * scale;
    var stride = (bounds.width + gap) / 2;
    return Math.floor((rect.left - bounds.left + 1) / stride);
  }
  function keepHeadings(columns) {
    Array.from(columns.children).forEach(function (node) { if (node.classList.contains('qm-heading')) node.style.breakBefore = ''; });
    Array.from(columns.children).forEach(function (node) {
      if (!node.classList.contains('qm-heading') || !node.nextElementSibling) return;
      var heading = node.getBoundingClientRect(), next = firstRect(node.nextElementSibling);
      if (columnIndex(columns, heading) !== columnIndex(columns, next)) node.style.breakBefore = 'column';
    });
  }
  function fits(columns) { keepHeadings(columns); return !overflows(columns); }
  function bylineText(article) { return '글 ' + (article.author || '익명') + (hasArticleImages(article) ? ' · 그림 AI 생성' : ''); }
  function updateBylines() {
    state.pages.forEach(function (page) { var node = page.piece && page.inner.querySelector('.qm-byline'); if (node) node.textContent = bylineText(page.piece); });
  }
  function easyNode(groups, bottom) {
    var wrapper = element('div', bottom ? 'qm-easy-bands qm-easy-bottom' : 'qm-easy-bands');
    groups.forEach(function (group) {
      var strip = element('aside', 'qm-easy-strip');
      strip.appendChild(element('h3', '', group.title || '쉽게 보기'));
      var panels = element('div', 'qm-easy-panels'); panels.style.gridTemplateColumns = 'repeat(' + Math.max(1, group.panels.length) + ',minmax(0,1fr))';
      group.panels.forEach(function (panel, index) {
        var figure = figureNode(panel, false), caption = figure.querySelector('figcaption');
        if (!caption) { caption = element('figcaption'); figure.appendChild(caption); }
        caption.textContent = (['①', '②', '③', '④'][index] || '(' + (index + 1) + ')') + (panel.caption ? ' ' + panel.caption : ''); panels.appendChild(figure);
      });
      strip.appendChild(panels); wrapper.appendChild(strip);
    });
    return wrapper;
  }
  function sizeArticleColumns(page) {
    var head = page.inner.querySelector('.qm-article-head');
    page.bodyHeight = page.inner.clientHeight - (head ? head.offsetHeight : 0) - (page.easy ? page.easy.offsetHeight : 0);
    page.columns.style.height = Math.max(0, page.bodyHeight) + 'px';
  }
  function attachEasy(page, groups, bottom) {
    page.easy = easyNode(groups, bottom); page.inner.insertBefore(page.easy, page.columns); sizeArticleColumns(page);
  }
  function articlePage(article, first, firstPart, groups, compact) {
    var page = makePage('article', article, first ? '' : state.cover.name + ' · ' + (article.section || '질문'));
    if (compact) page.paper.classList.add('qm-compact');
    var head;
    if (first) {
      head = element('header', 'qm-article-head');
      var part = article.section === '사회과학' ? 'PART 1' : article.section === '자연과학' ? 'PART 2' : '';
      head.appendChild(element('div', 'qm-band', firstPart && part ? part + '  ' + sectionName(article.section) : article.section || '질문'));
      var title = element('h1', '', article.title || '제목 없는 기사'); head.appendChild(title);
      if (article.subtitle) head.appendChild(element('p', 'qm-subtitle', article.subtitle));
      head.appendChild(element('p', 'qm-byline', bylineText(article)));
      if (article.hero) head.appendChild(figureNode(article.hero, true));
      page.inner.appendChild(head);
      // Only reduce within the title range specified in SPEC, never shrink body type.
      if (title.offsetHeight > 115) title.style.fontSize = '26pt';
    }
    var columns = element('div', 'qm-columns'); page.inner.appendChild(columns);
    page.columns = columns;
    if (groups && groups.length) attachEasy(page, groups, false); else sizeArticleColumns(page);
    return page;
  }
  function splitParagraph(block, columns, pendingHeading) {
    // Keep exact separators: concatenating fragments reconstructs the original.
    var words = block.text.match(/\S+\s*/g) || [block.text];
    var low = 0, high = words.length, best = 0;
    while (low <= high) {
      var mid = Math.floor((low + high) / 2);
      var probe = blockNode(Object.assign({}, block, { text: words.slice(0, mid).join('') })); columns.appendChild(probe);
      var okay = mid > 0 && fits(columns);
      columns.removeChild(probe);
      if (okay) { best = mid; low = mid + 1; } else high = mid - 1;
    }
    if (best) {
      var candidate = blockNode(Object.assign({}, block, { text: words.slice(0, best).join('') })); columns.appendChild(candidate);
      var candidateFits = fits(columns);
      // Check this lower bound after the monotone fit search: rejecting short
      // probes inside the search could discard a larger, valid fragment.
      if (!candidateFits) best = 0;
      if (pendingHeading) {
        var prose = firstRect(candidate), h = pendingHeading.getBoundingClientRect();
        if (columnIndex(columns, prose) !== columnIndex(columns, h) || candidate.getBoundingClientRect().height < parseFloat(getComputedStyle(candidate).lineHeight) * 1.8) best = 0;
      }
      columns.removeChild(candidate);
    }
    return { head: words.slice(0, best).join(''), tail: words.slice(best).join('') };
  }
  function paginateArticle(article, firstPart, compact) {
    var groups = easyGroups(article), blocks = article.blocks.filter(function (block) { return block.type !== 'easy'; });
    if (article.notes.length) blocks.push({ type: 'notes', title: '취재 노트', lines: article.notes.map(function (note) { return { text: note.key + ': ' + note.value, bullet: false }; }) });
    if (article.sources.length) {
      blocks.push({ type: 'heading', text: '출처' });
      article.sources.forEach(function (text, index) { blocks.push({ type: 'source', text: text, number: index + 1 }); });
    }
    var page = articlePage(article, true, firstPart, null, compact), firstPage = page, pageCount = 1, pending = [];
    function nextPage() { pageCount += 1; page = articlePage(article, false, false, pageCount === 2 ? groups : null, compact); }
    function attachHeadings() { return pending.map(function (heading) { var node = blockNode(heading); page.columns.appendChild(node); return node; }); }
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block.type === 'heading') { pending.push(block); continue; }
      var headings = attachHeadings(), node = blockNode(block); page.columns.appendChild(node);
      if (fits(page.columns)) { pending = []; continue; }
      page.columns.removeChild(node);
      var fragment = null;
      if (block.type === 'paragraph' || block.type === 'source') fragment = splitParagraph(block, page.columns, headings[headings.length - 1]);
      if (fragment && fragment.head && fragment.tail) {
        page.columns.appendChild(blockNode(Object.assign({}, block, { text: fragment.head })));
        pending = []; blocks[i] = Object.assign({}, block, { text: fragment.tail, continuation: true }); nextPage(); i -= 1; continue;
      }
      headings.forEach(function (heading) { page.columns.removeChild(heading); });
      if (page.columns.children.length || page.inner.querySelector('.qm-article-head') || page.easy) { nextPage(); i -= 1; continue; }
      // An indivisible block taller than a whole column cannot satisfy the spec.
      // Preserve it and report it; never silently drop text or loop forever.
      attachHeadings(); page.columns.appendChild(node); pending = [];
      state.failures.push((article.title || '제목 없는 기사') + ': 한 단에 들어가지 않는 덩어리가 있습니다.');
      if (i < blocks.length - 1) nextPage();
    }
    if (pending.length) {
      attachHeadings();
      if (overflows(page.columns)) state.failures.push((article.title || '제목 없는 기사') + ': 마지막 소제목이 넘칩니다.');
    }
    if (groups.length && pageCount === 1) {
      // Test the complete one-page article with the bottom band reserved. If it
      // no longer fits, keep the article intact and put the band on a new page.
      attachEasy(firstPage, groups, true);
      if (!fits(firstPage.columns) || firstPage.bodyHeight < 0) {
        firstPage.easy.remove(); firstPage.easy = null; sizeArticleColumns(firstPage); keepHeadings(firstPage.columns); nextPage();
      }
    }
  }
  function renderArticle(article, firstPart) {
    var start = state.pages.length, failureStart = state.failures.length;
    paginateArticle(article, firstPart, false);
    var regular = state.pages.slice(start), failures = state.failures.slice(failureStart);
    if (regular.length < 2 || fillRatio(regular[regular.length - 1], true) >= .35) return;
    // Keep the first layout intact until a measured compact trial saves a page.
    regular.forEach(function (page) { page.shell.remove(); });
    state.pages.splice(start); state.failures.splice(failureStart);
    var useCompact = false;
    try {
      paginateArticle(article, firstPart, true);
      var compact = state.pages.slice(start);
      useCompact = compact.length < regular.length && state.failures.length === failureStart && !compact.some(function (page) {
        return overflows(page.columns) || overflows(page.inner) || page.bodyHeight < 0;
      });
    } catch (error) { /* A failed trial must not damage the original layout. */ }
    if (!useCompact) {
      state.pages.splice(start).forEach(function (page) { page.shell.remove(); });
      state.failures.splice(failureStart);
      regular.forEach(function (page) { stage.appendChild(page.shell); state.pages.push(page); });
      Array.prototype.push.apply(state.failures, failures);
      addArticleQuestion(regular[regular.length - 1], article);
    }
    figureViews.forEach(function (views, model) {
      views.forEach(function (view) { if (!view.figure.isConnected) views.delete(view); });
      if (!views.size) figureViews.delete(model);
    });
  }
  function addArticleQuestion(page, article) {
    if (page.questionCard || page.bodyHeight < 0 || overflows(page.columns) || overflows(page.inner)) return;
    var bounds = page.columns.getBoundingClientRect(), inner = page.inner.getBoundingClientRect();
    var scale = bounds.width / page.columns.clientWidth, mm = 96 / 25.4;
    if (!(scale > 0)) return;
    var bottom = Array.from(page.columns.children).reduce(function (used, node) {
      var margin = (parseFloat(getComputedStyle(node).marginBottom) || 0) * scale;
      return Array.from(node.getClientRects()).reduce(function (end, rect) {
        return rect.width && rect.height ? Math.max(end, rect.bottom + margin) : end;
      }, used);
    }, bounds.top);
    var top = (bottom - inner.top) / scale + 4 * mm;
    var height = (bounds.bottom - inner.top) / scale - top;
    if (height < 60 * mm) return;
    // Keep the measured columns unchanged: shortening them would reflow text
    // into the reserved space. The full-width band is their positioned sibling.
    var card = element('aside', 'qm-article-question');
    card.style.top = top + 'px'; card.style.height = height + 'px';
    card.appendChild(element('p', 'qm-article-question-label', '기자가 남긴 질문'));
    card.appendChild(element('h3', '', articleQuestion(article)));
    card.appendChild(element('p', 'qm-article-question-prompt', '여러분의 생각은? 독자 질문함에 적어 주세요.'));
    page.inner.appendChild(card);
    if (overflows(card) || overflows(page.inner)) { card.remove(); return; }
    page.questionCard = card;
  }

  function orderedArticles() {
    var articles = state.pieces.filter(function (piece) { return piece.kind === 'article'; });
    var sections = ['여는 글', '사회과학', '자연과학'];
    articles.forEach(function (piece) { if (sections.indexOf(piece.section) === -1) sections.push(piece.section); });
    return sections.reduce(function (all, section) { return all.concat(articles.filter(function (piece) { return piece.section === section; })); }, []);
  }
  function coverQuestions(cover, articles) {
    var candidates = articles.filter(function (article) { return article.section === '사회과학' || article.section === '자연과학'; });
    var question = cover.question || (candidates[0] || {}).title;
    return candidates.filter(function (article) { return article.title !== question; }).slice(0, 5);
  }
  function renderCover(cover, articles) {
    var page = makePage('cover'); page.paper.appendChild(element('div', 'qm-cover-strip'));
    if (cover.hero) {
      var artwork = figureNode(cover.hero, true), caption = artwork.querySelector('figcaption');
      if (caption) caption.remove(); page.paper.insertBefore(artwork, page.inner);
    }
    var masthead = element('header', 'qm-cover-masthead');
    masthead.appendChild(element('p', 'qm-cover-english', cover.english));
    masthead.appendChild(element('h1', 'qm-cover-name', cover.name));
    masthead.appendChild(element('p', 'qm-cover-meta', [cover.issue, cover.school].filter(Boolean).join(' | ')));
    page.inner.appendChild(masthead);
    var questions = element('section', 'qm-cover-questions'); questions.appendChild(element('h2', '', '이번 호 질문'));
    var featured = cover.question ? articles.find(function (article) { return article.title === cover.question; }) || { title: cover.question, section: '' }
      : articles.find(function (article) { return article.section === '사회과학' || article.section === '자연과학'; });
    function questionRow(article, primary) {
      var row = element(primary ? 'h3' : 'p', primary ? 'qm-cover-question' : 'qm-cover-item');
      var dot = element('span', 'qm-question-dot'); dot.style.setProperty('--qm-color', sectionColor(article.section)); dot.setAttribute('aria-hidden', 'true');
      row.appendChild(dot); row.appendChild(element('span', '', article.title || '제목 없는 기사')); questions.appendChild(row);
    }
    if (featured) questionRow(featured, true);
    coverQuestions(cover, articles).forEach(function (article) { questionRow(article, false); });
    if (cover.tagline) questions.appendChild(element('p', 'qm-cover-tagline', cover.tagline));
    page.inner.appendChild(questions);
    page.paper.querySelector('.qm-folio').hidden = true;
  }
  function flowPage(kind, title, grid) {
    var page = makePage(kind, null, state.cover.name);
    var titleNode = element('h2', '', title); page.inner.appendChild(titleNode);
    var flow = element('div', grid ? 'qm-note-grid' : 'qm-flow'); page.inner.appendChild(flow);
    // Explicit height lets scrollHeight reveal overflowing static front matter too.
    flow.style.height = Math.max(0, page.inner.clientHeight - titleNode.offsetHeight - parseFloat(getComputedStyle(titleNode).marginBottom)) + 'px';
    page.flow = flow; return page;
  }
  function renderContents(articles) {
    var page = flowPage('contents', '차례'), current = null;
    articles.forEach(function (article) {
      var group = article.section !== current ? element('h3', 'qm-toc-group', (article.section === '사회과학' ? 'PART 1  ' : article.section === '자연과학' ? 'PART 2  ' : '') + sectionName(article.section)) : null;
      var row = element('div', 'qm-toc-row'), label = element('div');
      label.appendChild(element('strong', '', article.title || '제목 없는 기사')); label.appendChild(element('small', '', (article.author || '익명') + (easyPanelCount(article) ? ' / 쉽게 보기 ' + easyPanelCount(article) + '컷' : '')));
      row.appendChild(label); var number = element('span', 'qm-toc-number', '000–000'); number.dataset.articleId = article.id; row.appendChild(number);
      if (group) page.flow.appendChild(group); page.flow.appendChild(row);
      if (overflows(page.flow)) {
        page.flow.removeChild(row); if (group) page.flow.removeChild(group);
        page = flowPage('contents', '차례, 이어서');
        page.flow.appendChild(group || element('h3', 'qm-toc-group', sectionName(article.section) + ' (계속)')); page.flow.appendChild(row);
      }
      current = article.section;
    });
  }
  function renderAuthorNotes(articles) {
    var withNotes = articles.filter(function (article) { return article.authorNote; }); if (withNotes.length < 2) return;
    var page = flowPage('author-notes', '기자의 말', true);
    withNotes.forEach(function (article) {
      if (page.flow.children.length === 8) page = flowPage('author-notes', '기자의 말, 이어서', true);
      var card = element('article', 'qm-note-card'); applyColor(card, sectionColor(article.section));
      card.appendChild(element('h3', '', article.author || '익명')); card.appendChild(element('small', '', article.title)); card.appendChild(element('p', '', article.authorNote));
      page.flow.appendChild(card);
      if (overflows(page.flow) && page.flow.children.length > 1) { page.flow.removeChild(card); page = flowPage('author-notes', '기자의 말, 이어서', true); page.flow.appendChild(card); }
    });
  }
  function renderFiller(reader) {
    var page = makePage(reader ? 'questions' : 'memo', null, state.cover.name);
    page.inner.appendChild(element('h2', '', reader ? '독자 질문함' : '메모'));
    if (reader) page.inner.appendChild(element('p', '', '다음 호에서 함께 살펴볼 질문을 적어 주세요. 일상에서 궁금했던 일도 좋습니다.'));
    page.inner.appendChild(element('div', 'qm-writing-lines'));
  }
  function renderBack(articles) {
    var page = makePage('back', null, state.cover.name);
    page.inner.appendChild(element('h2', '', '질문을 모은 사람들'));
    var sections = [];
    articles.forEach(function (article) { if (sections.indexOf(article.section) < 0) sections.push(article.section); });
    sections.forEach(function (section) {
      page.inner.appendChild(element('h3', '', section || '그 밖의 질문'));
      var names = [];
      articles.filter(function (a) { return a.section === section; }).forEach(function (a) { (a.author || '익명').split(',').forEach(function (name) { name = name.trim(); if (name && names.indexOf(name) < 0) names.push(name); }); });
      page.inner.appendChild(element('p', '', names.join(', ')));
    });
    page.inner.appendChild(element('h3', '', 'AI 사용 원칙'));
    var list = element('ul'); state.cover.principles.forEach(function (rule) { list.appendChild(element('li', '', rule)); }); page.inner.appendChild(list);
    if (state.cover.date) page.inner.appendChild(element('p', '', state.cover.date));
    page.inner.appendChild(element('p', 'qm-credit', '이 잡지는 마주온 에이전트 「질문을 학교 잡지로!」와 함께 만들었습니다.'));
  }
  function scalePages() {
    if (!stage) return;
    var computed = getComputedStyle(stage), available = stage.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);
    state.pages.forEach(function (page) {
      var width = page.paper.offsetWidth, height = page.paper.offsetHeight;
      var scale = Math.min(1, Math.max(0, available / width));
      page.paper.style.transform = 'scale(' + scale + ')'; page.shell.style.width = width * scale + 'px'; page.shell.style.height = height * scale + 'px';
    });
  }
  async function draw() {
    if (!state.mounted) return;
    stage.classList.add('qm-measuring'); clear(stage); figureViews.clear(); state.pages = []; state.failures = [];
    document.documentElement.style.setProperty('--qm-bleed', state.bleed ? '3mm' : '0mm');
    document.documentElement.style.setProperty('--qm-width', state.bleed ? '216mm' : '210mm');
    document.documentElement.style.setProperty('--qm-height', state.bleed ? '303mm' : '297mm');
    printStyle.textContent = '@page { size:' + (state.bleed ? '216mm 303mm' : 'A4') + '; margin:0; }';
    // Wait after the font links are installed. Explicit loads also cover text
    // whose face has not yet been used by a previous render.
    await state.fontStyles;
    if (document.fonts) {
      var glyphs = '질문 잡지 이번 호 질문 쉽게 보기 ①②③④ 차례 이어서 계속 기자의 말 출처 취재 노트 독자 질문함 메모 질문을 모은 사람들 사람과 사회의 물음표 몸과 자연의 물음표 그 밖의 질문 AI 사용 원칙 이 잡지는 마주온 에이전트 질문을 학교 잡지로 함께 만들었습니다. 글 그림 AI 생성 익명 제목 없는 기사 기자가 남긴 질문 여러분의 생각은? 독자 질문함에 적어 주세요. 다음 호에서 함께 살펴볼 질문을 적어 주세요. 일상에서 궁금했던 일도 좋습니다. 그림 파일이나 다른 탭의 그림을 여기에 끌어다 놓으세요. 눌러서 골라도 됩니다. 그림을 불러오고 있습니다. 컷 PART 1 PART 2' + DEFAULT_RULES.join('') + state.pieces.map(function (piece) {
        return [piece.title, piece.name, piece.section, piece.subtitle, piece.author, piece.authorNote, piece.tagline, piece.question, piece.english, piece.issue, piece.school, piece.date, piece.hero && piece.hero.caption]
          .concat(Object.keys(piece.sectionNames || {}).map(function (section) { return section + piece.sectionNames[section]; }))
          .concat((piece.blocks || []).map(function (block) { return [block.text, block.caption, block.title].filter(Boolean).join('') + (block.lines || []).map(function (line) { return line.text; }).join('') + (block.panels || []).map(function (panel) { return panel.caption; }).join(''); }))
          .concat((piece.notes || []).map(function (note) { return note.key + note.value; })).concat(piece.sources || [], piece.principles || []).filter(Boolean).join('');
      }).join('') || '질문 잡지';
      glyphs = Array.from(new Set(Array.from(glyphs))).join('');
      await Promise.all([
        document.fonts.load('400 9.5pt "Noto Serif KR"', glyphs), document.fonts.load('700 9.5pt "Noto Serif KR"', glyphs),
        document.fonts.load('400 16px "Pretendard Variable"', glyphs), document.fonts.load('700 29pt "Pretendard Variable"', glyphs)
      ]).catch(function () {});
      await document.fonts.ready;
    }
    var articles = orderedArticles(), explicit = state.pieces.find(function (piece) { return piece.kind === 'cover'; });
    state.cover = explicit || parseCover('');
    if (!explicit && articles.length) { state.cover.question = articles[0].title; state.cover.hero = articles[0].hero; }
    state.hasCover = !!explicit || articles.length > 1;
    // Frames have fixed dimensions, so image conversion proceeds independently
    // of pagination and updates the current views when each picture is ready.
    prepareImages(false);
    if (!articles.length) stage.appendChild(element('p', 'qm-empty', '기사 파일을 더하거나 이 화면에 끌어다 놓아 주세요.'));
    else {
      if (state.hasCover) renderCover(state.cover, articles);
      if (state.pieces.length > 1) renderContents(articles);
      var opening = articles.filter(function (a) { return a.section === '여는 글'; });
      opening.forEach(function (article) { try { renderArticle(article, false); } catch (error) { state.failures.push(article.title + ': 기사를 그리지 못했습니다. ' + error.message); } });
      renderAuthorNotes(articles);
      var seen = [];
      articles.filter(function (a) { return a.section !== '여는 글'; }).forEach(function (article) {
        try { renderArticle(article, seen.indexOf(article.section) < 0); } catch (error) { state.failures.push(article.title + ': 기사를 그리지 못했습니다. ' + error.message); }
        seen.push(article.section);
      });
      if (state.hasCover) { var padding = (4 - (state.pages.length + 1) % 4) % 4; for (var n = 0; n < padding; n += 1) renderFiller(n === 0); renderBack(articles); }
    }
    state.pages.forEach(function (page, index) { page.paper.dataset.page = String(index + 1); page.paper.dataset.even = String((index + 1) % 2 === 0); page.paper.querySelector('.qm-folio').textContent = String(index + 1); });
    Array.from(stage.querySelectorAll('.qm-toc-number')).forEach(function (node) {
      var numbers = state.pages.filter(function (page) { return page.piece && page.piece.id === node.dataset.articleId; }).map(function (page) { return Number(page.paper.dataset.page); });
      node.textContent = numbers.length ? String(numbers[0]) + (numbers.length > 1 ? '–' + numbers[numbers.length - 1] : '') : '—';
    });
    stage.classList.remove('qm-measuring'); scalePages(); updateOrder(); refreshStatus();
  }
  function render() {
    if (!browser) return Promise.resolve();
    state.queue = state.queue.catch(function () {}).then(draw);
    return state.queue;
  }
  function audit() {
    var result = { pages: state.pages.length, pieces: [], overflow: [], emptyFigures: 0, brokenImages: [], errors: state.failures.slice(), warnings: [] };
    state.pieces.forEach(function (piece) {
      var numbers = state.pages.filter(function (page) { return piece.kind === 'cover' ? page.kind === 'cover' : page.piece === piece; }).map(function (page) { return Number(page.paper.dataset.page); });
      result.pieces.push({ kind: piece.kind, title: piece.title || piece.name || '', section: piece.section || '', pages: numbers, chars: piece.kind === 'article' ? articleChars(piece) : 0, easyPanels: easyPanelCount(piece) });
      if (piece.kind === 'article') {
        if (!piece.title) result.errors.push('제목 없는 기사가 있습니다.');
        if (!numbers.length && state.mounted) result.errors.push((piece.title || '제목 없는 기사') + ': 그리지 못한 기사입니다.');
        if (numbers.length > 3) result.warnings.push(piece.title + ': 기사가 3쪽을 넘습니다.');
        if (!piece.sources.length && (piece.section === '사회과학' || piece.section === '자연과학')) result.warnings.push((piece.title || '제목 없는 기사') + ': 출처가 없습니다.');
        easyGroups(piece).forEach(function (group) { if (group.panels.length < 2 || group.panels.length > 4) result.warnings.push((piece.title || '제목 없는 기사') + ': 쉽게 보기 그림은 2~4컷으로 넣어 주세요. 현재 ' + group.panels.length + '컷입니다.'); });
      }
    });
    state.pages.forEach(function (page) {
      if (['questions', 'memo', 'back'].indexOf(page.kind) < 0 && !page.questionCard && fillRatio(page, false) < .15) {
        result.warnings.push(page.paper.dataset.page + '쪽: 거의 빈 쪽입니다.');
      }
    });
    if (stage) {
      state.pages.forEach(function (page) {
        var reasons = [];
        if (page.columns && overflows(page.columns)) reasons.push('본문 2단 상자 넘침');
        // Cover artwork intentionally reaches past the inner text margins.
        if (page.kind === 'cover' ? page.inner.scrollHeight > page.inner.clientHeight + 1 : overflows(page.inner)) reasons.push('쪽 안쪽 상자 넘침');
        if (overflows(page.paper)) reasons.push('쪽 상자 넘침');
        // Client rects catch positioned text and column fragments that scroll
        // metrics alone can miss. Both bounds are measured in the same scale.
        if (page.easy && overflows(page.easy)) reasons.push('쉽게 보기 띠 넘침');
        if (page.easy && Array.from(page.easy.querySelectorAll('.qm-easy-strip')).some(overflows)) reasons.push('쉽게 보기 컷 넘침');
        var bounds = page.paper.getBoundingClientRect(), walker = document.createTreeWalker(page.paper, 4), textNode;
        while ((textNode = walker.nextNode())) {
          if (!textNode.textContent.trim() || !textNode.parentElement.getClientRects().length) continue;
          var range = document.createRange(); range.selectNodeContents(textNode);
          if (Array.from(range.getClientRects()).some(function (rect) { return rect.width && rect.height && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1); })) { reasons.push('쪽 밖으로 넘친 글'); break; }
        }
        if (reasons.length) result.overflow.push({ page: Number(page.paper.dataset.page), kind: page.kind, title: page.piece ? page.piece.title : '', reasons: reasons });
      });
      result.emptyFigures = stage.querySelectorAll('.qm-figure[data-empty="true"]').length;
      Array.from(stage.querySelectorAll('.qm-figure img')).forEach(function (img) {
        if (img.getAttribute('src') && img.complete && !img.naturalWidth) result.brokenImages.push({ src: img.getAttribute('src'), page: Number(img.closest('.qm-sheet').dataset.page) });
      });
    }
    result.overflow.forEach(function (item) { result.errors.push(item.page + '쪽: ' + item.reasons.join(', ')); });
    if (result.emptyFigures) result.warnings.push('빈 그림 자리가 ' + result.emptyFigures + '개 있습니다.');
    if (result.brokenImages.length) result.warnings.push('불러오지 못한 그림이 ' + result.brokenImages.length + '개 있습니다.');
    if (state.hasCover && result.pages % 4) result.warnings.push('전체 쪽수가 4의 배수가 아닙니다.');
    if (hasUnsavedImages()) result.warnings.push('그림 주소는 7일 뒤 사라져요. 「잡지 파일로 저장」으로 그림을 파일 안에 넣어 두세요.');
    return result;
  }
  function refreshStatus() {
    if (!status || !state.mounted || stage.classList.contains('qm-measuring')) return;
    var report = audit(), articles = state.pieces.filter(function (piece) { return piece.kind === 'article'; }).length;
    status.dataset.error = String(report.errors.length > 0);
    status.textContent = report.pages + '쪽 / 기사 ' + articles + '개 / 빈 그림 자리 ' + report.emptyFigures + '개' + (report.overflow.length ? ' / 넘침 ' + report.overflow.length + '쪽' : '') + (report.errors.length ? ' / 오류 ' + report.errors.length + '개' : '') + (report.brokenImages.length ? ' / 못 읽은 그림 ' + report.brokenImages.length + '개' : '') + (hasUnsavedImages() ? ' — 그림 주소는 7일 뒤 사라져요. 「잡지 파일로 저장」으로 그림을 파일 안에 넣어 두세요.' : '');
    status.title = report.errors.concat(report.warnings).join('\n');
  }
  function announce(text) { if (message) message.textContent = text; }
  function merge(piece) {
    var index = state.pieces.findIndex(function (old) { return piece.kind === old.kind && (piece.kind === 'cover' || piece.title === old.title && piece.author === old.author); });
    piece.id = index >= 0 ? state.pieces[index].id : 'piece-' + (++state.sequence);
    if (index >= 0) state.pieces[index] = piece; else state.pieces.push(piece);
  }
  function scriptText(script) {
    var text = script.textContent;
    return script.getAttribute('data-qm-encoding') === 'uri' ? decodeURIComponent(text) : text;
  }
  // 저장본의 data-qm-remote(그림 차례대로 원래 주소, 없으면 -)를 그림 모델에 되돌린다.
  function restoreRemote(piece, value) {
    var list = String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').split(/\s+/);
    pieceFigures(piece).forEach(function (entry, index) { if (/^https:\/\//i.test(list[index] || '')) entry.model.remote = list[index]; });
    return piece;
  }
  function readPieces(text, html) {
    if (html || /<script\b/i.test(text)) {
      // Extract only raw script text. Parsing arbitrary imported HTML into a
      // document could load its img/iframe resources even in an inert document.
      var scripts = /<!--[\s\S]*?-->|<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
      var pieces = [], match;
      while ((match = scripts.exec(text))) {
        if (!match[1]) continue;
        var type = htmlAttribute(match[1], 'type').toLowerCase();
        if (type !== 'text/x-article' && type !== 'text/x-cover') continue;
        var raw = htmlAttribute(match[1], 'data-qm-encoding') === 'uri' ? decodeURIComponent(match[2].trim()) : match[2];
        pieces.push(restoreRemote(type === 'text/x-cover' ? parseCover(raw) : parseArticle(raw), htmlAttribute(match[1], 'data-qm-remote')));
      }
      if (pieces.length) return pieces;
      if (html) throw new Error('기사 글이 든 파일을 골라 주세요.');
    }
    return [linesOf(text).some(function (line) { var kv = keyValue(line); return kv && kv.key === '잡지'; }) ? parseCover(text) : parseArticle(text)];
  }
  function add(text) {
    if (!browser) return Promise.reject(new Error('add는 브라우저에서 사용할 수 있습니다.'));
    try { readPieces(String(text), false).forEach(merge); } catch (error) { announce(error.message); return Promise.reject(error); }
    return render();
  }
  async function importFiles(files) {
    var imported = 0, failed = [];
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      if (!/\.(?:html?|txt|md)$/i.test(file.name)) { failed.push(file.name + ': html, txt, md 파일을 골라 주세요.'); continue; }
      try {
        var text = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result)); }; reader.onerror = reject; reader.readAsText(file); });
        readPieces(text, /\.html?$/i.test(file.name)).forEach(function (piece) { merge(piece); imported += 1; });
      } catch (error) { failed.push(file.name + ': 파일을 읽지 못했습니다.'); }
    }
    await render(); announce('조각 ' + imported + '개를 더했습니다.' + (failed.length ? ' ' + failed.join(' ') : ''));
  }
  function button(text, action, className) {
    var node = element('button', className || '', text); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function updateOrder() {
    if (!orderPanel) return;
    clear(orderPanel); orderPanel.appendChild(element('p', 'qm-hint', '같은 꼭지 안에서 차례가 바뀝니다. 표지와 꼭지는 정해진 순서로 나옵니다.'));
    var list = element('ol'); orderPanel.appendChild(list);
    var displayed = state.pieces.filter(function (p) { return p.kind === 'cover'; }).concat(orderedArticles());
    displayed.forEach(function (piece) {
      var row = element('li'), peers = displayed.filter(function (p) { return p.kind === piece.kind && p.section === piece.section; }), position = peers.indexOf(piece);
      row.appendChild(element('span', 'qm-order-name', (piece.kind === 'cover' ? '표지' : piece.section || '질문') + ' | ' + (piece.title || piece.name || '제목 없음')));
      function move(offset) {
        var other = peers[position + offset]; if (!other) return;
        var a = state.pieces.indexOf(piece), b = state.pieces.indexOf(other); state.pieces[a] = other; state.pieces[b] = piece;
        render().then(function () { announce('차례를 바꿨습니다.'); });
      }
      var up = button('위', function () { move(-1); }), down = button('아래', function () { move(1); });
      up.disabled = position === 0; down.disabled = position === peers.length - 1;
      up.setAttribute('aria-label', (piece.title || piece.name) + ' 위로'); down.setAttribute('aria-label', (piece.title || piece.name) + ' 아래로');
      row.appendChild(up); row.appendChild(down);
      row.appendChild(button('빼기', function () { state.pieces.splice(state.pieces.indexOf(piece), 1); render().then(function () { announce('조각을 뺐습니다.'); }); })); list.appendChild(row);
    });
  }
  function allFigures() {
    return state.pieces.reduce(function (figures, piece) { return figures.concat(pieceFigures(piece).map(function (entry) { return entry.model; })); }, []);
  }
  function hasUnsavedImages() { return allFigures().some(function (model) { return /^https:/i.test(model.src) || unsavedImages.has(model); }); }
  function serialize(piece) {
    function picture(model) { return '그림: ' + model.src + ' | ' + model.caption; }
    if (piece.kind === 'cover') {
      var cover = ['잡지: ' + piece.name, '영문: ' + piece.english, '호: ' + piece.issue, '학교: ' + piece.school, '문구: ' + piece.tagline];
      if (piece.hero) cover.push(picture(piece.hero));
      cover.push('대표 질문: ' + piece.question, '색: ' + piece.color);
      Object.keys(piece.sectionNames).forEach(function (section) { cover.push('꼭지 이름: ' + section + ' = ' + piece.sectionNames[section]); });
      cover.push('만든 날: ' + piece.date, 'AI 원칙:'); piece.principles.forEach(function (rule) { cover.push('- ' + rule); }); return cover.join('\n');
    }
    var lines = ['꼭지: ' + piece.section, '제목: ' + piece.title, '부제: ' + piece.subtitle, '기자: ' + piece.author];
    if (piece.hero) lines.push(picture(piece.hero));
    if (piece.authorNote) lines.push('기자의 말: ' + piece.authorNote);
    lines.push('');
    // End metadata before a leading body figure so reload does not relocate it.
    if (piece.blocks.length && piece.blocks[0].type === 'figure') lines.push('[문단]');
    piece.blocks.forEach(function (block) {
      if (block.type === 'figure') lines.push(picture(block));
      else if (block.type === 'easy') { lines.push('[쉽게 보기] ' + block.title); block.panels.forEach(function (panel) { lines.push(picture(panel)); }); lines.push(''); }
      else if (block.type === 'box') { lines.push('[상자] ' + block.title); block.lines.forEach(function (line) { lines.push((line.bullet ? '- ' : '') + '[문단] ' + line.text); }); lines.push(''); }
      // An unknown label is stripped LAST by cleanText. It shields canonical
      // prose from being mistaken for a header, number, role, or block marker
      // on reload, using the existing grammar rather than a second file format.
      else lines.push((block.type === 'heading' ? '## ' : block.type === 'quote' ? '> ' : '') + '[문단] ' + block.text);
    });
    if (piece.notes.length) { lines.push('', '[취재 노트]'); piece.notes.forEach(function (note) { lines.push(note.key + ': ' + note.value); }); }
    if (piece.sources.length) { lines.push('', '출처:'); piece.sources.forEach(function (source, index) { lines.push((index + 1) + '. ' + source); }); }
    return lines.join('\n');
  }
  // 에이전트 4단계 문법 그대로의 글(학생이 붙여 넣어 '이 줄만 고쳐 줘'라고 할 때 쓴다).
  // serialize와 달리 [문단] 방패를 달지 않고, 파일 안 그림(data:)은 원래 https 주소로 돌려놓는다.
  function agentText(piece) {
    function address(model) { return /^data:/i.test(model.src || '') ? (model.remote || '(파일 안 그림)') : model.src; }
    function picture(model) { return '그림: ' + address(model) + (model.caption ? ' | ' + model.caption : ''); }
    function put(lines, key, value) { if (value) lines.push(key + ': ' + value); }
    var lines = [];
    if (piece.kind === 'cover') {
      put(lines, '잡지', piece.name); put(lines, '호', piece.issue); put(lines, '문구', piece.tagline);
      if (piece.hero) lines.push(picture(piece.hero));
      put(lines, '대표 질문', piece.question); return lines.join('\n');
    }
    put(lines, '꼭지', piece.section); put(lines, '제목', piece.title); put(lines, '부제', piece.subtitle); put(lines, '기자', piece.author);
    if (piece.hero) lines.push(picture(piece.hero));
    put(lines, '기자의 말', piece.authorNote);
    var lastParagraph = -1;
    piece.blocks.forEach(function (block) {
      if (block.type === 'figure') lines.push(picture(block));
      // 덩어리 뒤 빈 줄: 없으면 다음 그림 줄이 쉽게 보기의 넷째 컷으로 붙는다.
      else if (block.type === 'easy') { lines.push('[쉽게 보기] ' + block.title); block.panels.forEach(function (panel) { lines.push(picture(panel)); }); lines.push(''); }
      else if (block.type === 'box') { lines.push('[상자] ' + block.title); block.lines.forEach(function (line) { lines.push((line.bullet ? '- ' : '') + line.text); }); lines.push(''); }
      // 출처 번호만 있는 문단('[8]')은 따로 두면 다시 읽을 때 표시로 지워진다. 가장 가까운 앞 문단 끝에 붙인다.
      else if (block.type === 'paragraph' && /^(?:\s*\[\d+\])+\s*$/.test(block.text) && lastParagraph >= 0) lines[lastParagraph] += ' ' + block.text.trim();
      else { lines.push((block.type === 'heading' ? '## ' : block.type === 'quote' ? '> ' : '') + block.text); if (block.type === 'paragraph') lastParagraph = lines.length - 1; }
    });
    if (piece.notes.length) { lines.push('[취재 노트]'); piece.notes.forEach(function (note) { lines.push(note.key + ': ' + note.value); }); }
    if (piece.sources.length) { lines.push('출처:'); piece.sources.forEach(function (source, index) { lines.push((index + 1) + '. ' + source); }); }
    return lines.join('\n');
  }
  function copyText() {
    var articles = orderedArticles(), cover = state.pieces.find(function (piece) { return piece.kind === 'cover'; });
    var parts = articles.length ? articles.map(function (piece) { return '[지금 기사 글]\n' + agentText(piece); }) : cover ? ['[지금 표지 글]\n' + agentText(cover)] : [];
    return parts.length ? parts.join('\n\n') + '\n\n고칠 곳: ' : '';
  }
  async function copyForAI() {
    var text = copyText();
    if (!text) { announce('복사할 글이 없습니다.'); return; }
    try { await navigator.clipboard.writeText(text); announce('복사했습니다. 에이전트 대화에 붙여 넣고 「고칠 곳:」 뒤에 고칠 것을 적어 주세요.'); }
    catch (error) {
      // 클립보드를 막은 브라우저에서는 글을 보여 주고 직접 복사하게 한다.
      var area = document.querySelector('.qm-copy') || element('textarea', 'qm-copy');
      area.readOnly = true; area.value = text; area.setAttribute('aria-label', 'AI에게 보낼 말');
      if (!area.isConnected) message.after(area);
      area.focus(); area.select(); announce('아래 글을 모두 골라 복사한 뒤 에이전트 대화에 붙여 넣어 주세요.');
    }
  }
  async function saveMagazine(event) {
    var control = event.currentTarget; control.disabled = true; announce('그림을 담아 잡지 파일을 만들고 있습니다.');
    try {
      await state.queue;
      prepareImages(true); await waitForImages();
      var html = element('html'); html.lang = 'ko'; var head = element('head'), body = element('body');
      var meta = element('meta'); meta.setAttribute('charset', 'utf-8'); head.appendChild(meta);
      var viewport = element('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'; head.appendChild(viewport);
      var name = (state.cover && state.hasCover ? state.cover.name : (orderedArticles()[0] || {}).title) || '질문 잡지';
      head.appendChild(element('title', '', name)); var loader = element('script'); loader.setAttribute('src', scriptURL); head.appendChild(loader);
      body.dataset.qmBleed = String(state.bleed);
      state.pieces.forEach(function (piece) {
        var script = element('script'); script.type = piece.kind === 'cover' ? 'text/x-cover' : 'text/x-article';
        var raw = serialize(piece);
        // Raw-text script elements cannot contain their own HTML closing tag.
        // URI encoding is marked and decoded on import; no user HTML is executed.
        if (/<\/script/i.test(raw)) { script.setAttribute('data-qm-encoding', 'uri'); raw = encodeURIComponent(raw); }
        // 파일 안에 넣은 그림의 원래 https 주소(그림 차례대로, 없으면 -). 「AI에게 보낼 말 복사」가 다시 쓴다.
        var remotes = pieceFigures(piece).map(function (entry) { return /^data:/i.test(entry.model.src || '') && entry.model.remote ? entry.model.remote : '-'; });
        if (remotes.some(function (value) { return value !== '-'; })) script.setAttribute('data-qm-remote', remotes.join(' '));
        script.textContent = '\n' + raw + '\n'; body.appendChild(script);
      });
      html.appendChild(head); html.appendChild(body);
      var blobURL = URL.createObjectURL(new Blob(['<!doctype html>\n' + html.outerHTML], { type: 'text/html;charset=utf-8' }));
      var link = element('a'); link.href = blobURL; link.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').slice(0, 100) + '.html'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(blobURL); }, 1000);
      allFigures().forEach(function (model) { if (/^data:image\//i.test(model.src)) unsavedImages.delete(model); }); refreshStatus();
      announce('잡지 파일을 저장했습니다.' + (allFigures().some(function (figure) { return /^https:/i.test(figure.src); }) ? ' 담지 못한 그림은 원래 주소로 남겼습니다.' : ''));
    } catch (error) { announce('파일을 저장하지 못했습니다. 다시 눌러 주세요.'); }
    finally { control.disabled = false; }
  }
  function mount() {
    try {
      var initial = Array.from(document.querySelectorAll('script[type="text/x-cover"],script[type="text/x-article"]'));
      initial.forEach(function (script) { merge(restoreRemote(script.type === 'text/x-cover' ? parseCover(scriptText(script)) : parseArticle(scriptText(script)), script.getAttribute('data-qm-remote'))); });
      state.bleed = document.body.dataset.qmBleed === 'true'; installStyles(); clear(document.body); document.body.className = 'qm-app'; document.documentElement.lang = 'ko';
      var toolbar = element('header', 'qm-toolbar'); toolbar.appendChild(element('h1', '', '질문 잡지'));
      var tools = element('div', 'qm-tools'); toolbar.appendChild(tools);
      fileInput = element('input'); fileInput.type = 'file'; fileInput.multiple = true; fileInput.accept = '.html,.htm,.txt,.md'; fileInput.hidden = true;
      fileInput.addEventListener('change', function () { importFiles(Array.from(fileInput.files)); fileInput.value = ''; }); toolbar.appendChild(fileInput);
      tools.appendChild(button('기사 더하기', function () { fileInput.click(); }, 'qm-primary'));
      var order = button('차례 고치기', function () { orderPanel.hidden = !orderPanel.hidden; order.setAttribute('aria-expanded', String(!orderPanel.hidden)); });
      order.setAttribute('aria-expanded', 'false'); order.setAttribute('aria-controls', 'qm-order'); tools.appendChild(order);
      tools.appendChild(button('잡지 파일로 저장', saveMagazine));
      tools.appendChild(button('AI에게 보낼 말 복사', copyForAI));
      tools.appendChild(button('인쇄', function () { state.queue.then(function () { window.print(); }); }));
      var label = element('label', 'qm-bleed'), checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = state.bleed;
      checkbox.addEventListener('change', function () { state.bleed = checkbox.checked; render(); }); label.appendChild(checkbox); label.appendChild(document.createTextNode('도련 3mm')); tools.appendChild(label);
      toolbar.appendChild(element('p', 'qm-hint', '인쇄 창에서 용지 A4, 여백 없음, 배경 그래픽 켜기'));
      status = element('p', 'qm-status', '쪽을 나누고 있습니다.'); status.setAttribute('role', 'status'); toolbar.appendChild(status);
      message = element('p', 'qm-message'); message.setAttribute('aria-live', 'polite'); toolbar.appendChild(message);
      orderPanel = element('section', 'qm-order'); orderPanel.id = 'qm-order'; orderPanel.hidden = true; orderPanel.setAttribute('aria-label', '차례 고치기'); toolbar.appendChild(orderPanel);
      document.body.appendChild(toolbar); stage = element('main', 'qm-stage'); document.body.appendChild(stage); state.mounted = true;
      document.body.addEventListener('dragover', function (event) { event.preventDefault(); });
      document.body.addEventListener('drop', function (event) { event.preventDefault(); importFiles(Array.from(event.dataTransfer.files)); });
      window.addEventListener('resize', scalePages);
      render().then(function () { resolveReady(api); }, function (error) { state.failures.push('잡지를 그리지 못했습니다. ' + error.message); announce('잡지를 그리지 못했습니다. 기사 파일을 확인해 주세요.'); resolveReady(api); });
    } catch (error) { state.failures.push('시작하지 못했습니다. ' + error.message); resolveReady(api); }
  }
  if (browser) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else Promise.resolve().then(mount);
  } else resolveReady(api);
  return api;
}));
