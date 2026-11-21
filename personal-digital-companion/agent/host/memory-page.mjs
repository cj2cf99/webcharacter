export {memoryScript} from './memory-reader.mjs';
export const memoryHtml=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>绯月手记</title><link rel="stylesheet" href="/assets/companion/memory.css"><script type="module" src="/assets/companion/memory.js"></script></head><body><header></header>  <main>
    <section class="cover" aria-labelledby="cover-title">
      <div class="cover-copy"><small>绯月的私人手帐</small><h1 id="cover-title" tabindex="0"><span class="feiyue-journal-mark" aria-hidden="true"></span>绯月手记</h1><p id="archiveSummary"></p>
      </div>
      <div class="cover-art" aria-hidden="true"><i class="moon"></i><i class="orbit"></i><img src="/assets/companion/journal-portrait.png" alt="" decoding="async"></div>
    </section>

    <div class="workspace" id="workspace">
      <section class="collection" aria-label="记忆档案">
        <div class="tabs" aria-label="档案类型"><a id="diaryTab" href="#diary">日记</a><a id="nagTab" href="#nag">小唠叨</a></div>
        <div class="filters"><label class="search"><i aria-hidden="true"></i><input id="search" type="search" placeholder="搜索标题、关键词或标签" aria-label="搜索索引"></label><select id="filter" aria-label="筛选标签或来源"></select></div>
        <label class="mobile-date">东京日期 <input type="date" id="mobileDate"></label>
        <div class="list-head"><span id="listCaption"></span><span>东京时间 JST</span></div>
        <div id="rows" aria-live="polite"></div>
        <nav id="pages" aria-label="列表分页"><button id="prev">上一页</button><span id="pageInfo"></span><button id="next">下一页</button></nav>
      </section>
      <aside>
        <section class="calendar sheet"><h2>翻到那一天</h2><div class="month-picker"><button id="earlier" aria-label="上个月">‹</button><input type="month" id="month" aria-label="选择月份"><button id="later" aria-label="下个月">›</button></div><div class="week" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="calendar"></div><div class="calendar-foot"><button id="clearDate">清除日期</button></div></section></aside>
    </div>
  </main>
  <dialog id="reader" class="modal"><div class="modal-head"><span id="readerLabel"></span><button class="x" data-dismiss aria-label="关闭详情">×</button></div><article id="article" aria-live="polite"></article></dialog>
  <dialog id="origin" class="modal" aria-labelledby="originLabel"><div class="modal-head"><span id="originLabel">原记录</span><button data-dismiss id="returnOrigin">返回</button></div><article id="originBody" aria-live="polite"></article></dialog>
</body></html>`;
export const memoryStyle=`* {box-sizing:border-box}
[hidden] {display:none!important}
body {margin:0;color:var(--t-ink);background:var(--t-bg);font:15px/1.55 var(--ui-font)}
button,input,select,textarea {font:inherit}
button,select {cursor:pointer}
button:disabled {cursor:default;opacity:.45}
main {max-width:1090px;margin:24px auto 60px;padding:0 24px}
.cover {position:relative;isolation:isolate;overflow:hidden;color:#fff4dc;background:linear-gradient(108deg,#263e37 15%,#3b5144 65%,#747955);border-radius:15px;min-height:196px;box-shadow:var(--t-shadow)}
.cover::before {content:"";position:absolute;inset:9px;border:1px solid #e2d4a44a;border-radius:9px;pointer-events:none}
.cover-copy {position:relative;z-index:2;padding:22px 6%}
.cover small,.cover-note,.list-head,.section-head>span,.studio small,.modal-head>span,.calendar-foot {font-size:12px;letter-spacing:.07em}
.cover small {color:#e0ddc8}
body[data-shell-page] main .cover h1 {font:600 clamp(36px,4vw,54px)/1.2 var(--t-font-title);letter-spacing:.12em;margin:7px 0 3px;color:#fff4dc;-webkit-text-fill-color:#fff4dc;background:none;text-shadow:none}
html[data-theme] body[data-shell-page] main #cover-title {font-size:clamp(34px,4.3vw,58px);line-height:1.25;margin:8px 0}

.cover p {margin:0;font:16px/1.7 var(--t-font-title);letter-spacing:.08em}
.cover-art {position:absolute;inset:0 0 0 52%;pointer-events:none;overflow:hidden}
.cover-art img {position:absolute;width:226px;right:20%;top:0;filter:drop-shadow(0 10px 15px #20261c44);transform:rotate(2deg)}
.moon,.orbit {position:absolute;border-radius:50%;width:228px;height:228px;top:18px;right:23%;background:linear-gradient(125deg,#f1dfb9,#ccaa7a)}
.orbit {width:340px;height:340px;top:-36px;right:11%;background:none;border:1px solid #e3cf9d70;box-shadow:0 0 0 9px #e9d5b00c,0 0 0 36px #e9d5b013}
html[data-theme=cyber] .cover {background:linear-gradient(112deg,#11152d,#283456 72%,#364969)}
.workspace {display:grid;grid-template-columns:minmax(0,1fr) 274px;gap:22px;align-items:start;margin-top:22px}
.collection,.sheet {background:var(--t-surface);border:1px solid var(--t-line);border-radius:13px;box-shadow:var(--t-shadow)}
.collection {padding:0 22px 16px;min-width:0}
.tabs {display:flex;gap:25px;border-bottom:1px solid var(--t-line)}
.tabs a {padding:15px 3px 11px;color:var(--t-muted);font-weight:600;text-decoration:none;border-bottom:3px solid transparent}
.tabs a[aria-current=page] {color:var(--t-brand-ink);border-color:var(--t-brand)}
.filters {display:flex;gap:9px;margin:15px 0 11px}
.mobile-date {display:none}
.search {display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.search,.filters select {border:1px solid var(--t-line);background:var(--t-bg);color:var(--t-ink);border-radius:8px;padding:7px 11px}
.search:focus-within {outline:2px solid var(--t-brand)}
.search i {width:17px;height:17px;flex:none;background:var(--t-muted);mask:var(--i-search) center/contain no-repeat}
.search input {background:none;border:0;outline:0;color:inherit;min-width:0;width:100%;font-size:14px}
.filters select {max-width:36%;font-size:14px}
.list-head,.section-head,.calendar-foot,.modal-head,#pages {display:flex;align-items:center;justify-content:space-between;gap:12px}
.list-head {color:var(--t-muted);padding:0 0 7px}
.entry {display:grid;grid-template-columns:44px minmax(0,1fr) 15px;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--t-line);text-decoration:none;color:var(--t-ink)}
.entry:hover,.entry:focus-visible {background:var(--t-brand-soft)}
.stamp {display:flex;flex-direction:column;align-items:center;color:var(--t-brand-ink);font-variant-numeric:tabular-nums}
.stamp b {font:600 24px/1 var(--t-font-title)}
.stamp small {font-size:10px;color:var(--t-muted)}
.entry strong,.entry .meta,.entry .synopsis {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entry strong {font-size:16px;line-height:1.45}
.meta,.synopsis {font-size:12px;line-height:1.5;color:var(--t-muted)}
.entry .meta {color:var(--t-brand-ink)}
.chevron {color:var(--t-muted)}
#pages {justify-content:center;border-top:1px solid var(--t-line);padding-top:13px;font-size:13px}
aside {display:grid;gap:14px}
.sheet {padding:18px}
.sheet h2 {font:600 19px/1.45 var(--t-font-title);margin:0}
.week,#calendar {display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:2px}
.week {color:var(--t-muted);font-size:11px}
#calendar .cal-date {position:relative;min-width:0;padding:5px 0;border:0;border-radius:6px;background:transparent;color:var(--t-ink);font:13px/1.6 var(--ui-font)}
#calendar .cal-date:disabled {color:var(--t-muted)}
#calendar .cal-date[aria-pressed=true] {background:var(--t-brand-ink);color:var(--t-surface)}
#calendar .cal-date.known::after,.calendar-foot i {content:"";display:block;width:4px;height:4px;border-radius:50%;background:var(--t-gold)}
#calendar .cal-date::after {position:absolute;left:calc(50% - 2px);bottom:2px}
.calendar-foot {border-top:1px solid var(--t-line);margin-top:10px;padding-top:10px}
.calendar-foot span {display:flex;align-items:center;gap:5px}
.modal {width:min(600px,calc(100vw - 24px));max-height:88dvh;margin:auto;padding:0;color:var(--t-ink);background:var(--t-surface);border:1px solid var(--t-line);border-radius:15px;box-shadow:0 18px 80px #1114}
.modal::backdrop {background:#14242085;backdrop-filter:blur(3px)}
.modal-head {position:sticky;top:0;z-index:1;background:var(--t-surface);padding:10px 18px;border-bottom:1px solid var(--t-line)}
.x {font-size:21px;line-height:1;width:34px;height:34px;border:0;border-radius:50%;color:var(--t-ink);background:var(--t-bg)}
#article {padding:18px 24px 24px}
#article h2 {font:600 27px/1.35 var(--t-font-title);margin:0 0 8px}
#article h3 {font-size:15px;margin:18px 0 4px}
#article p {margin:5px 0}
#originBody {padding:18px 24px 24px}
#originBody dl {display:grid;grid-template-columns:auto 1fr;gap:7px 16px}
#originBody dt {color:var(--t-muted)}
#originBody dd {margin:0}
#originBody .open-thread:focus {outline:2px solid var(--t-gold);outline-offset:2px}
.badges {display:flex;flex-wrap:wrap;gap:6px}
.thought,.open-thread {margin:14px 0 0;border-left:3px solid var(--t-accent);padding:9px 12px;background:var(--t-accent-soft);border-radius:0 7px 7px 0}
.open-thread {border-color:var(--t-gold);background:var(--t-bg)}
.exchange {padding:7px 10px;border-left:2px solid var(--t-line)}
.empty {padding:25px 0;text-align:center}
@media(max-width:760px){
  main {padding:0 12px;margin-top:12px}
  .workspace {grid-template-columns:1fr;gap:10px;margin-top:12px}
  aside {grid-row:1;grid-template-columns:1fr}
  .calendar {display:none}
  .mobile-date {display:flex;align-items:center;gap:8px;margin:4px 0 10px;font-size:12px;color:var(--t-muted)}
  .mobile-date input {padding:3px 7px;color:var(--t-ink);background:var(--t-surface);border:1px solid var(--t-line);border-radius:6px;min-width:0}
  .collection {padding:0 13px 12px}
  .cover {min-height:160px}
  .cover-copy {padding:16px 20px}
  .cover-art {left:58%}
  .cover-art img {width:140px;right:-13px;top:15px}
  .moon {width:125px;height:125px;right:0}
  .orbit {width:175px;height:175px;right:-30px;top:2px}
  .cover p {font-size:13px;max-width:200px}
  .entry {gap:7px;grid-template-columns:34px minmax(0,1fr) 11px}
  .modal {max-height:92dvh}
}

#article p,#originBody p{white-space:pre-wrap;overflow-wrap:anywhere} .thread-focus{outline:2px solid var(--t-accent,currentColor)} .calendar input{max-width:100%;min-width:0;padding:.45em}.month-picker{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:10px}.month-picker button{border:0;background:transparent;color:inherit;font-size:20px} .entry .synopsis,.entry .meta,.entry strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block} .entry>span:nth-child(2){min-width:0} .filters .search{width:100%}
body[data-shell-page] main, .modal {
  --t-surface:#fffaf4; --t-ink:#402c38; --t-muted:#796370; --t-brand-ink:#823d61; --t-line:#dfcbd1; --t-brand-soft:#f6e7eb;
}
html[data-theme=cyber] body[data-shell-page] :is(main,.modal) {
  --t-surface:#2c2735; --t-ink:#f1e5e2; --t-muted:#c9b2bf; --t-brand-ink:#edbdcf; --t-line:#544353; --t-brand-soft:#40323f;
}
body[data-shell-page] {background:#f6f0eb}
html[data-theme=cyber] body {background:#201d29}

main .cover {min-height:180px;border-radius:5px 18px 18px 5px;background:linear-gradient(100deg,#563246,#824c67 64%,#b7828f);box-shadow:inset 6px 0 0 #442f3e,0 5px 18px #66374c25}
main .cover::before {inset:8px 8px 8px 13px;border:1px dashed #edd1be80;border-radius:2px 11px 11px 2px}
main .cover-copy {padding:27px 5.8%}
main .cover small {color:#f4dcce;font:13px/1.6 var(--t-font-title);letter-spacing:.16em}
main .cover-art {inset:0 0 0 51%;background-color:transparent!important;background-image:radial-gradient(2px 2px at 13% 27%,#ffe9ca 96%,transparent),radial-gradient(2px 2px at 77% 69%,#ffe9ca 96%,transparent),radial-gradient(1px 1px at 90% 20%,#fff 95%,transparent)}
main .cover-art img {width:auto;height:115%;right:22%;top:4%;filter:drop-shadow(2px 6px 5px #482b3c55);transform:rotate(2deg)}
main .moon {width:152px;height:152px;top:22px;right:19%;background:linear-gradient(135deg,#ffebd1,#ddab9e)}
main .orbit {width:225px;height:225px;top:-12px;right:14%}
main .collection,.sheet,.modal {background:var(--t-surface);color:var(--t-ink);border:1px solid var(--t-line);box-shadow:0 4px 13px #51394b13}
main .collection {border-radius:4px 14px 14px 4px;border-left:4px double var(--t-line)}
main .tabs {gap:5px;padding:9px 0 0}
main .tabs a {border-radius:7px 7px 0 0;padding:7px 16px;color:var(--t-muted);border:0}
main .tabs a[aria-current=page] {background:var(--t-brand-soft);box-shadow:inset 0 -2px var(--t-brand-ink);color:var(--t-brand-ink)}
main .entry {gap:15px;padding:12px 5px;border-top:1px dashed var(--t-line);transition:background .18s}
main .entry strong {font:600 17px/1.55 var(--t-font-title);color:var(--t-ink)}
main .stamp {border-radius:8px 8px 4px 4px;padding:6px 2px;border-top:3px solid var(--t-brand-ink);background:var(--t-brand-soft)}
main .search,main .filters select,main .mobile-date input {background:var(--t-surface);color:var(--t-ink);border-color:var(--t-line)}
html[data-theme] body[data-shell-page] main .filters :is(input,select) {background:var(--t-surface)!important;color:var(--t-ink)!important;border-color:var(--t-line)!important}
html[data-theme] body[data-shell-page] main .filters input {border:0!important;box-shadow:none!important}
html[data-theme] body[data-shell-page] main .filters input::placeholder {color:var(--t-muted);opacity:1}
main .sheet {border-radius:4px 14px 12px 8px;position:relative}
main .sheet::before {content:"";position:absolute;top:0;right:20px;width:14px;height:24px;background:var(--t-brand-ink);clip-path:polygon(0 0,100% 0,100% 100%,50% 76%,0 100%)}
.calendar h2 {padding-right:24px}
main #calendar .cal-date[aria-pressed=true] {color:var(--t-surface)}
main:has(#nagTab[aria-current]) .entry {margin:7px 0;padding:9px;border:1px solid var(--t-line);border-radius:14px 14px 14px 3px}
main:has(#nagTab[aria-current]) .stamp {border:0;border-radius:50%}
.modal .modal-head {background:var(--t-surface);color:var(--t-brand-ink)}
.modal article {font:16px/1.85 var(--t-font-title);background:var(--t-surface)}
.modal .thought,.modal .exchange {color:var(--t-ink);background:var(--t-brand-soft);border-left:2px solid var(--t-brand-ink)}
.modal .txt-files {margin-block:10px 0;padding-inline-start:1.25rem;overflow-wrap:anywhere}
html[data-theme=cyber] main .cover {background:linear-gradient(105deg,#231e36,#40324a 68%,#65516a)}
html[data-theme=cyber] main .moon {background:linear-gradient(130deg,#ffddad,#d6ac81)}
html[data-theme=cyber] main .collection {border:1px solid var(--t-line);border-radius:14px}
html[data-theme=cyber] main .stamp {background:transparent;border:0;border-right:1px solid var(--t-line);border-radius:0}
@media(max-width:760px){
  main .cover {min-height:144px} main .cover-copy {padding:19px 20px}
  main .cover-art {left:56%} main .cover-art img {right:4%}
  main .moon {width:120px;height:120px;right:-4%} main .orbit {right:-20%}
  main .entry {gap:9px}
}

`;
