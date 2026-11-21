// 界面风格：ink（东方雅致，默认）/ cyber（赛博科技）。同步脚本，首屏前设置，避免闪烁；选择只存本机浏览器。
// 赛博（深色）主题下，自动把各页面样式里写死的浅色背景 / 深色文字 / 浅灰边框映射为主题色，
// 生成一份覆盖样式（只改颜色，不改布局；语义色保留色相、调亮后保证可读）。
(() => {
	const KEY = 'ui-theme', THEMES = ['ink', 'cyber'], root = document.documentElement;
	let theme = root.dataset.theme || 'ink';
	try { theme = localStorage.getItem(KEY) || theme; } catch {}
	root.dataset.theme = THEMES.includes(theme) ? theme : 'ink';
	// 只显示图标模式已预留：需要时设置 root.dataset.btnMode = 'icon'（当前按用户要求保持图标加文字）

	const ctx = (() => { try { return new OffscreenCanvas(1, 1).getContext('2d'); } catch { return document.createElement('canvas').getContext('2d'); } })();
	const parse = (value) => {
		if (!value || /var\(|currentcolor|inherit|transparent/i.test(value)) return null;
		ctx.fillStyle = '#010203'; ctx.fillStyle = value; const c = ctx.fillStyle;
		if (c === '#010203' && !/^#010203$/i.test(value)) return null;
		let r, g, b, a = 1;
		if (c[0] === '#') [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
		else [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number);
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		return { a, lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, sat: max ? (max - min) / max : 0, css: value };
	};
	const bgFor = (c) => c.sat < 0.14 ? (c.lum > 0.95 ? 'var(--t-surface)' : 'var(--t-surface-2)') : `color-mix(in srgb, ${c.css} 16%, #0d1528)`;
	// 页面自定义的颜色变量：深色 → 主题文字色，浅色 → 主题面板色，彩色按亮度调整
	function convertVars(style) {
		const out = [];
		for (const name of style) {
			if (!name.startsWith('--') || name.startsWith('--t-') || name.startsWith('--ui-') || name.startsWith('--i-')) continue;
			const c = parse(style.getPropertyValue(name).trim());
			if (!c || c.a < 0.4) continue;
			if (c.lum < 0.5) out.push(`${name}:${c.sat < 0.2 ? (c.lum < 0.3 ? 'var(--t-ink)' : 'var(--t-muted)') : `color-mix(in srgb, ${c.css} 60%, #fff)`}`);
			else if (c.lum > 0.78) out.push(`${name}:${c.sat < 0.14 ? (c.lum > 0.95 ? 'var(--t-surface)' : c.lum > 0.88 ? 'var(--t-surface-2)' : 'var(--t-line)') : `color-mix(in srgb, ${c.css} 18%, #0d1528)`}`);
		}
		return out;
	}
	function convert(style, rootOnly) {
		const out = convertVars(style), imp = (p) => (style.getPropertyPriority(p) ? ' !important' : '');
		if (rootOnly) return out.join(';');
		const bg = parse(style.backgroundColor);
		if (bg && bg.a > 0.4 && bg.lum > 0.78) out.push(`background-color:${bgFor(bg)}${imp('background-color')}`);
		const img = style.backgroundImage;
		if (img && img.includes('gradient')) {
			const stops = (img.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/gi) || []).map(parse).filter(Boolean);
			if (stops.length && stops.every((s) => s.lum > 0.78 || s.a < 0.2)) out.push(`background-image:none${imp('background-image')}`, `background-color:${bgFor(stops.find((s) => s.a >= 0.2) || stops[0])}${imp('background-image')}`);
		}
		const fg = parse(style.color);
		if (fg && fg.lum < 0.5) out.push(`color:${fg.sat < 0.2 ? (fg.lum < 0.3 ? 'var(--t-ink)' : 'var(--t-muted)') : `color-mix(in srgb, ${fg.css} 55%, #fff)`}${imp('color')}`);
		for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
			const bc = parse(style[`border${side}Color`]);
			if (bc && bc.lum > 0.75 && bc.sat < 0.25) out.push(`border-${side.toLowerCase()}-color:var(--t-line)${imp(`border-${side.toLowerCase()}-color`)}`);
		}
		return out.join(';');
	}
	// 给每个选择器加上 html[data-theme=cyber] 前缀（按顶层逗号拆分，保留伪元素）
	function scope(selectorText) {
		const parts = []; let depth = 0, start = 0;
		for (let i = 0; i < selectorText.length; i++) {
			const ch = selectorText[i];
			if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
			else if (ch === ',' && !depth) { parts.push(selectorText.slice(start, i)); start = i + 1; }
		}
		parts.push(selectorText.slice(start));
		return parts.map((p) => { p = p.trim(); return /^(html|:root)(?![\w-])/.test(p) ? p.replace(/^(html|:root)/, 'html[data-theme=cyber]') : 'html[data-theme=cyber] ' + p; }).join(',');
	}
	function collect(rules, list) {
		for (const rule of rules) {
			if (rule.selectorText && rule.style) {
				// 菜单遮罩图标的填充由 theme.css 的分组色与悬停色负责。
				// 壳层旧规则里的浅色 background 是旧图标底板，不能映射后覆盖新 glyph。
				if (/\.nav-entry::before\b/.test(rule.selectorText)) continue;
				const rootOnly = /^\s*(html|:root|body)(\s*,\s*(html|:root|body))*\s*$/.test(rule.selectorText); // 页面底色由主题层负责，只转换变量
				const body = convert(rule.style, rootOnly);
				if (body) list.push(`${scope(rule.selectorText)}{${body}}`);
			} else if (rule.cssRules && (rule.media || rule.conditionText)) {
				const inner = []; collect(rule.cssRules, inner);
				if (inner.length) list.push(`@${rule.media ? 'media' : 'supports'} ${rule.conditionText || rule.media.mediaText}{${inner.join('')}}`);
			}
		}
	}
	let sheet = null;
	function applyAuto() {
		if (!document.adoptedStyleSheets) return;
		const others = document.adoptedStyleSheets.filter((s) => s !== sheet);
		if (root.dataset.theme !== 'cyber') { document.adoptedStyleSheets = others; return; }
		const list = [];
		for (const s of document.styleSheets) {
			if (/\/assets\/styles\/theme\.css/.test(s.href || '')) continue;
			try { collect(s.cssRules, list); } catch {}
		}
		sheet = sheet || new CSSStyleSheet();
		sheet.replaceSync(list.map((r) => { try { new CSSStyleSheet().replaceSync(r); return r; } catch { return ''; } }).join('\n'));
		document.adoptedStyleSheets = [...others, sheet];
	}
	// 尽早生成一次（减少赛博主题首屏的浅色闪烁），全部资源加载后再补一次
	document.addEventListener('DOMContentLoaded', applyAuto);
	addEventListener('load', () => { applyAuto(); setTimeout(applyAuto, 1500); });

	// ---------- 分段选择：选中项背后的滑动高亮 ----------
	const SEG = 'aside.sidebar nav:not(#navigation),aside.side nav,.health-frame>nav,.view-toggle,[role=group]:has(> button[aria-pressed]),.home-filter,.range-options,.filters,.section-tabs,#navigation,#domains,.tabs,[role=tablist],.pick';
	const ON = '.selected,.active,.on,[aria-pressed=true],[aria-selected=true],[aria-current=page],[aria-current=true]';
	function placeSeg(box) {
		const on = [...box.children].find((el) => el.matches(ON));
		if (!on) { box.style.setProperty('--seg-o', '0'); return; }
		box.style.setProperty('--seg-x', on.offsetLeft + 'px');
		box.style.setProperty('--seg-y', on.offsetTop + 'px');
		box.style.setProperty('--seg-w', on.offsetWidth + 'px');
		box.style.setProperty('--seg-h', on.offsetHeight + 'px');
		box.style.setProperty('--seg-o', '1');
	}
	// ---------- 按钮：按文字配专属图标（只加属性，不改内容与事件） ----------
	const ICONS = [[/新建|新增|添加|追加|登记|^[＋+]/, 'plus'], [/保存|存档|暂存/, 'save'], [/删除|移除|清空/, 'trash'], [/关闭|取消|^[×✕]$/, 'x'],
		[/完成|确认|确定|通过|标记/, 'check'], [/同步/, 'sync'], [/刷新|重新|重试|最新化/, 'refresh'], [/搜索|查找|查询/, 'search'], [/规则/, 'filter'], [/分类|标签|Tag/i, 'tag'], [/下载|导出/, 'down'],
		[/上传|导入/, 'up'], [/设置|配置|偏好/, 'gear'], [/筛选|过滤/, 'filter'], [/合并/, 'merge'], [/上一|前一/, 'left'], [/下一|后一|更多|进入|查看|打开/, 'right'],
		[/显示|隐藏|预览|展开|收起/, 'eye'], [/草稿/, 'draft'], [/链接|关联/, 'link'], [/开始|练习|考试|生成|继续/, 'play'], [/编辑|修改|改名/, 'pen'], [/日记/, 'book'],
		[/提醒/, 'bell'], [/日历|日期/, 'calendar'], [/时间|历史|记录/, 'clock'], [/行情|指标|PE/, 'trend'], [/bug/i, 'bug'], [/种子/, 'seed'], [/改善/, 'fountain'], [/需求|想法|建议/, 'idea'], [/留言|评论/, 'chat'], [/列表/, 'list'], [/看板|网格/, 'grid'], [/题库/, 'book'], [/订阅|会员/, 'card'], [/号码|手机/, 'phone'], [/Key|密钥/i, 'key'], [/事项|待办/, 'aim'], [/^记录$/, 'pen']];
	const SKIP = 'header.unified-header *,#site-drawer *,.cal-date,.cal-event,.cal-more,.name,.finish-check,.home-more,.item-title,.more-button,.self-notes-title-trigger,.nav-item,[role=tab],[class*=cell],[class*=hm-],[class*=tile],.brand,.x,svg *';
	// ---------- 子页面侧栏菜单：每项专属图标 + 滑动高亮 ----------
	const MENU = 'aside.sidebar nav:not(#navigation),aside.side nav,.health-frame>nav';
	const MENU_ICONS = [[/历史|学习记录/, 'clock'], [/题库|知识库/, 'book'], [/AI|分析|报告/, 'trend'], [/数据与交接|交接|导出/, 'up'], [/建模/, 'net'],
		[/架构|实例/, 'layers'], [/申请|追加/, 'plus'], [/题目|关联/, 'link'], [/Tag|标签/i, 'tag'], [/待办/, 'aim'], [/首页|总览/, 'home'], [/项目/, 'sprout'],
		[/平台|数据源/, 'grid'], [/记录/, 'pen'], [/身体|状况/, 'heart'], [/考试|模拟/, 'cap']];
	function decorateMenus(scopeEl) {
		for (const box of scopeEl.querySelectorAll(MENU)) {
			box.classList.add('t-menu-box');
			for (const item of box.children) {
				if (!item.matches('a,button')) continue;
				const text = item.textContent.replace(/\s+/g, ' ').trim();
				const ico = ([...MENU_ICONS, ...ICONS].find(([re]) => re.test(text)) || [, 'dot'])[1];
				if (item.dataset.ico !== ico) item.dataset.ico = ico;
				item.classList.add('t-menu');
				const first = item.firstElementChild;
				if (first && item.textContent.trim().length > first.textContent.trim().length && (first.tagName === 'svg' || (first.textContent.trim().length <= 2 && !/[一-鿿A-Za-z]/.test(first.textContent)))) first.classList.add('t-old-ico');
			}
		}
	}
	// 共用按钮抽屉：只包裹普通文本，复用已有快捷按钮标签，不改操作事件。
	const contentControl = (el) => !!el.closest('svg') || el.matches('.list>*,.rows>*,ul>*,ol>*,[role=list]>*') || [...(el.parentElement?.classList || [])].some(name => /(?:^|-)list$/.test(name)) || el.matches('.chart-card,.chart-scroll,.dashboard-stat,.portal,.parent-link,#viewParent,.item,.item-title,.self-notes-title-trigger,[role=img],[role=listitem],[role=row],[role=cell],[role=columnheader],[aria-sort]') || [...el.classList].some(name => /(?:^|-)([a-z]*card|summary|tile|row|item|leaf)$/i.test(name)) || !!el.querySelector('h1,h2,h3,h4,figure,table,canvas,.chart-heading') || (!!el.querySelector('strong') && !!el.querySelector('small,p'));
	const tagControl = (el) => el.matches('.chip,.tag,.tag-chip,.tag-pill,.exp-tag,.exp-tagbtn,.exp-tagitem,.exp-scope-chip,.exp-filter-chip,[data-tag-id]') || !!el.closest('.tag-menu,.tag-chips,.tag-tree,.study-tag-picker,.study-tag-tree,.study-tag-row,.exp-tagmenu,.exp-taglist,.exp-occ-tags,.exp-kw-chips');
	const listOptionControl = (el) => el.matches('[role=option]') || !!el.closest('[role=listbox]');
	const menuControl = (el) => el.matches('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[data-nav]') || !!el.closest('nav,aside,header.unified-header,#site-drawer,[role=menu],[role=menubar]');
	function choiceControl(el) {
		if (el.matches('[role=option],[role=tab],[role=radio],[role=treeitem],button[aria-pressed],button[aria-selected],[data-term-id],[data-severity],[data-remove-body],[data-remove-symptom]') || el.closest(SEG + ',[role=listbox],[role=radiogroup],.choices,.options,.chips,.severity-row')) return true;
		for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) if ([...node.classList].some(name => /(?:^|-)(tabs|choices|options|switch|switcher)$/.test(name))) return true;
		return false;
	}
	// class 切换的隐藏标签也要在首次可见时测量；得到宽度后立即停止观察。
	const labelVisibility = new ResizeObserver((entries) => {
		for (const {target,contentRect} of entries) if (contentRect.width > 0) expandLabel(target);
	});
	function expandLabel(el, label) {
		if (tagControl(el) || choiceControl(el) || menuControl(el)) { labelVisibility.unobserve(el); return; }
		if (!label) {
			label = el.querySelector(':scope > .t-expand-label');
			if (!label) {
				const labels = [...el.children].filter((node) => !node.matches('svg,img,i,[aria-hidden=true],[class*=icon],.count,.badge') && !node.querySelector('svg,img,input,button') && /[一-鿿A-Za-z]/.test(node.textContent));
				if (labels.length === 1) label = labels[0];
			}
			if (!label && [...el.childNodes].every((node) => node.nodeType === 3)) {
				label = document.createElement('span');
				while (el.firstChild) label.append(el.firstChild);
				el.append(label);
			}
			if (!label) {
				const texts = [...el.childNodes].filter((node) => node.nodeType === 3 && /[一-鿿A-Za-z]/.test(node.textContent));
				if (texts.length === 1) { label = document.createElement('span'); el.insertBefore(label, texts[0]); label.append(texts[0]); }
			}
		}
		if (!label) return;
		label.classList.add('t-expand-label');
		el.classList.add('t-expand');
		if (parseFloat(getComputedStyle(label).fontSize) === 0) label.style.fontSize = '14px';
		const name = el.dataset.label || label.textContent.trim();
		if (!el.hasAttribute('aria-label') || el.getAttribute('aria-label') === el.dataset.tAutoAria) { el.setAttribute('aria-label', name); el.dataset.tAutoAria = name; }
		if (!el.title || el.title === el.dataset.tAutoTitle) { el.title = name; el.dataset.tAutoTitle = name; }
		const range = document.createRange();
		range.selectNodeContents(label);
		const width = Math.ceil(range.getBoundingClientRect().width);
		if (!width) { labelVisibility.observe(el); return; }
		labelVisibility.unobserve(el);
		const value = width + 'px';
		if (el.style.getPropertyValue('--t-label-width') !== value) el.style.setProperty('--t-label-width', value);
		// 收起时保留首字：按实际字形宽度裁切，英文不会露出半截第二个字母
		const text = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) }).nextNode();
		if (text) {
			const start = text.data.search(/\S/), end = start + (String.fromCodePoint(text.data.codePointAt(start)).length);
			range.setStart(text, start); range.setEnd(text, end);
			el.style.setProperty('--t-first-width', Math.ceil(range.getBoundingClientRect().width) + 'px');
		}
		if (!el.querySelector(':scope > .t-expand-surface')) { const surface = document.createElement('span'); surface.className = 't-expand-surface'; surface.setAttribute('aria-hidden', 'true'); el.prepend(surface); }
	}
	// 连续动作共用稳定的外层占位；内层按钮失焦后实际收拢，不留下各自的空槽。
	const actionGroupSizes = new ResizeObserver(entries => {
		for (const {target} of entries) {
			if (!target.isConnected) { actionGroupSizes.unobserve(target); continue; }
			target.classList.toggle('t-action-group-fit', target.clientWidth + 1 >= parseFloat(target.style.getPropertyValue('--t-group-width')));
		}
	});
	function groupActions(scopeEl) {
		const action = el => el?.matches('button,a.button,a.btn,a.home-quick,[role=button]') && !el.matches(SKIP) && !contentControl(el) && !tagControl(el) && !choiceControl(el) && !menuControl(el);
		// 被动态重用为目录/选项的控件不能继续困在旧动作占位中。
		for (const group of scopeEl.querySelectorAll('.t-action-group')) {
			if ([...group.children].every(action)) continue;
			actionGroupSizes.unobserve(group); delete group.dataset.tGroupObserved;
			if (group.tagName === 'SPAN') group.replaceWith(...group.childNodes);
			else { group.classList.remove('t-action-group', 't-action-group-fit'); group.style.removeProperty('--t-group-width'); }
		}
		for (const button of scopeEl.querySelectorAll('.t-expand')) {
			const parent = button.parentElement;
			if (parent.classList.contains('t-action-group')) continue;
			const children = [...parent.children];
			if (['flex','inline-flex'].includes(getComputedStyle(parent).display) && children.every(action) && ![...parent.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) parent.classList.add('t-action-group');
			else {
				const group = document.createElement('span'); group.className = 't-action-group';
				let first = button; while (action(first.previousElementSibling)) first = first.previousElementSibling;
				parent.insertBefore(group, first);
				while (action(group.nextElementSibling)) group.append(group.nextElementSibling);
			}
		}
		for (const group of scopeEl.querySelectorAll('.t-action-group')) {
			const children = [...group.children], style = getComputedStyle(group);
			const gap = parseFloat(style.columnGap) || 8;
			let width = Math.max(0, children.length - 1) * gap;
			for (const button of children) {
				if (button.classList.contains('t-expand')) {
					const compact = button.dataset.act === 'plus' ? 78 : 66;
					const full = Math.max(compact, (parseFloat(button.style.getPropertyValue('--t-label-width')) || 0) + 56);
					button.style.setProperty('--t-compact-width', compact + 'px'); button.style.setProperty('--t-full-width', full + 'px'); width += full;
				} else width += button.offsetWidth;
			}
			width += (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
			group.style.setProperty('--t-group-width', Math.ceil(width) + 'px');
			group.classList.toggle('t-action-group-fit', group.clientWidth + 1 >= width);
			if (!group.dataset.tGroupObserved) { group.dataset.tGroupObserved = '1'; actionGroupSizes.observe(group); }
		}
	}
	const holdAction = event => {
		const button = event.target.closest?.('.t-action-group>.t-expand'); if (!button) return;
		const group = button.parentElement; clearTimeout(group.tCollapseTimer);
		button.classList.add('t-action-open');
	};
	const releaseActions = event => {
		const group = event.target.closest?.('.t-action-group'); if (!group) return;
		clearTimeout(group.tCollapseTimer);
		group.tCollapseTimer = setTimeout(() => {
			if ([...group.children].some(button => button.matches(':hover,:focus-visible'))) return;
			for (const button of group.children) button.classList.remove('t-action-open');
		}, 100);
	};
	document.addEventListener('pointerover', holdAction); document.addEventListener('focusin', holdAction);
	document.addEventListener('pointerout', releaseActions); document.addEventListener('focusout', releaseActions);
	function clampLists(scopeEl) {
		const controls = 'button,a,input,select,textarea,[contenteditable],svg,img,table,ul,ol,details';
		for (const cell of scopeEl.querySelectorAll('td,th,[role=cell],[role=columnheader]')) {
			if (!cell.textContent.trim() || cell.closest('form,[contenteditable]') || cell.querySelector(':scope > .t-list-text')) continue;
			if (!cell.querySelector(controls)) {
				const text = document.createElement('div'); text.className = 't-list-text';
				while (cell.firstChild) text.append(cell.firstChild); cell.append(text);
			} else {
				for (const child of cell.children) if (!child.matches('button,input,select,textarea,[contenteditable],svg,img') && !child.querySelector(controls) && child.textContent.trim()) child.classList.add('t-list-text');
			}
		}
		const rows = new Set(scopeEl.querySelectorAll('li,[role=listitem],[role=row],.list>*,.rows>*,.record,.item,.item-card,.knowledge-item,.question-row,.plan-card,.exp-rec-row,.exp-rulecard,.reminder-row,.planner-tree-row,.catalog-row'));
		for (const container of scopeEl.querySelectorAll('[class]')) if ([...container.classList].some(name => /(?:^|-)list$/.test(name))) for (const child of container.children) rows.add(child);
		for (const row of rows) {
			if (row.closest('form,[contenteditable],nav,header.unified-header,#site-drawer')) continue;
			if (row.textContent.trim() && !row.querySelector(controls + ',p,h2,h3,h4,strong,small,time,span,div') && !row.matches('.t-list-text')) {
				const text = document.createElement('span'); text.className = 't-list-text';
				while (row.firstChild) text.append(row.firstChild); row.append(text);
			}
			for (const field of row.querySelectorAll('p,h2,h3,h4,strong,small,time,span,div')) {
				const nestedFields = field.matches('p,h2,h3,h4') ? 'p,h2,h3,h4,div' : 'p,h2,h3,h4,strong,small,time,span,div';
				if (!field.textContent.trim() || field.closest('.t-list-text') || field.querySelector(nestedFields) || field.matches('.t-expand-label,.t-expand-surface') || field.querySelector(controls)) continue;
				const action = field.closest('button,a,[role=button]');
				if (action && action !== row && !contentControl(action)) continue;
				field.classList.add('t-list-text');
			}
		}
	}
	function decorate(scopeEl) {
		decorateMenus(scopeEl);
		clampLists(scopeEl);
		// 所有带文字的操作按钮共享首页胶囊皮肤；导航和数据格保留各自语义布局。
		for (const el of scopeEl.querySelectorAll('button,a.button,a.btn,a.home-quick,[role=button],input[type=button],input[type=submit],input[type=reset]')) {
			el.classList.toggle('t-tree-entry', [...el.classList].some(name => /(?:^|-)leaf$/.test(name)));
			if (contentControl(el)) { el.classList.remove('t-action-skin', 't-btn', 't-expand'); el.querySelector(':scope > .t-expand-surface')?.remove(); continue; }
			const text = el.matches('input') ? el.value : el.textContent;
			const dataControl = el.matches('.cal-date,.cal-event,.cal-more,.name,.finish-check,.home-more,.item-title,.more-button,.self-notes-title-trigger,[class*=cell],[class*=hm-],[class*=tile],.brand,.x') || menuControl(el) || listOptionControl(el);
			el.classList.toggle('t-action-skin', !dataControl && /[一-鿿A-Za-z]/.test(text));
		}
		for (const box of scopeEl.querySelectorAll(SEG)) {
			if (box.closest('header.unified-header,#site-drawer') || box.children.length < 2) continue;
			if (!box.classList.contains('t-seg')) { box.classList.add('t-seg'); new MutationObserver(() => placeSeg(box)).observe(box, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected', 'aria-current'] }); }
			placeSeg(box);
		}
		for (const el of scopeEl.querySelectorAll('button,a.button,a.btn,a.home-quick,[role=button]')) {
			if (contentControl(el)) continue;
			// Tag值是内容，不按动作名称缩略；动态插入和曾被装饰的Tag也保持可读。
			if (tagControl(el) || choiceControl(el) || menuControl(el)) { el.classList.add('t-value-visible'); el.classList.toggle('t-tag-value', tagControl(el)); el.classList.remove('t-btn', 't-expand'); el.querySelector(':scope > .t-expand-surface')?.remove(); labelVisibility.unobserve(el); el.style.removeProperty('--t-label-width'); continue; }
			// 已有图标和标签的操作入口仅接入抽屉，不重画其图标或改动链接。
			if (el.matches('.home-quick') || el.querySelector('.ci-shortcut-label')) {
				expandLabel(el, el.querySelector('.ci-shortcut-label') || undefined); continue;
			}
			if (el.matches(SKIP) || el.closest('.t-seg')) continue;
			const ownIcon = el.querySelector(':scope>svg,:scope>img,:scope>i,:scope>[aria-hidden=true]:not(.t-expand-surface),:scope>[class*=icon]') || (el.children.length && [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() && !/[一-鿿A-Za-z]/.test(node.textContent)));
			if (ownIcon) { expandLabel(el); continue; }
			// 图标已表达含义：去掉文字首尾的装饰符号（＋ ↻ → 等），只动这两个字符
			for (const node of new Set([el.firstChild, el.lastChild])) {
				if (node?.nodeType !== 3) continue;
				let cleaned = node.textContent;
				if (node === el.firstChild) cleaned = cleaned.replace(/^\s*[＋+✓✔✦✧★☆▶▷►↻↺→←↗↘›»▴▾]+\s*/, '');
				if (node === el.lastChild) cleaned = cleaned.replace(/\s*[↻→›»▴▾]+\s*$/, '');
				if (cleaned !== node.textContent && cleaned.trim()) node.textContent = cleaned;
			}
			const shown = el.textContent.replace(/\s+/g, ' ').trim();
			// 已去掉动作词的按钮：沿用记录的完整名称继续判断
			const text = el.dataset.short === shown && el.dataset.full ? el.dataset.full : shown;
			if (!text || text.length > 80 || !/[一-鿿A-Za-z]/.test(text)) { el.classList.remove('t-btn'); continue; }
			// 新增类按钮：先加号表示动作，再用功能自己的图标（新建提醒 → ＋ 铃铛 新建提醒）
			const act = /^(新建|新增|添加|追加|登记|记录)/.test(text);
			const rest = act ? text.replace(/^(新建|新增|添加|追加|登记|记录)\s*/, '') : text;
			const func = rest === '记录' ? 'pen' : (ICONS.find(([re, name]) => name !== 'plus' && re.test(rest)) || [])[1];
			const ico = act ? func || 'plus' : (ICONS.find(([re]) => re.test(text)) || [, 'dot'])[1];
			if (el.dataset.ico !== ico) el.dataset.ico = ico;
			if (act && func) el.dataset.act = 'plus'; else delete el.dataset.act;
			// 加号已表示动作：按钮上只留功能名（新建提醒 → 提醒），完整名称保留给读屏和悬停提示
			if (act && func && shown === text) {
				const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
				const short = node && node.textContent.replace(/^\s*(新建|新增|添加|追加|登记|记录)\s*/, '');
				if (short && short.trim()) {
					el.dataset.full = text;
					if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
					if (!el.title) el.title = text;
					node.textContent = short;
					el.dataset.short = el.textContent.replace(/\s+/g, ' ').trim();
				}
			}
			if (el.dataset.label !== text) el.dataset.label = text;
			if (!el.classList.contains('t-btn')) {
				const before = getComputedStyle(el, '::before').content;
				if (before && before !== 'none' && before !== 'normal') { expandLabel(el); continue; } // 保留自身装饰，但仍接入抽屉
				el.classList.add('t-btn');
			}
			expandLabel(el);
		}
		groupActions(scopeEl);
	}
	// ---------- 动效：滚动浮现、点击涟漪、页头滚动状态 ----------
	const REVEAL = 'main :is(.card,.panel,.dashboard-stat,.portal,.home-card,.reminder-row,.tile,.stat,article.item,.list > article,.chart-card,.phone-card,.stats > article)';
	const seen = new IntersectionObserver((entries) => {
		for (const { target, isIntersecting } of entries) if (isIntersecting) show(target);
	}, { rootMargin: '0px 0px -6% 0px' });
	function show(el) {
		if (!el.classList.contains('t-reveal') || el.classList.contains('t-in')) return;
		seen.unobserve(el); el.classList.add('t-in');
		// 浮现结束后去掉浮现类，恢复元素自身的悬停过渡
		setTimeout(() => { el.classList.remove('t-reveal', 't-in'); el.style.removeProperty('--t-delay'); }, 950 + (parseInt(el.style.getPropertyValue('--t-delay')) || 0));
	}
	// 兜底：已在可视区内的元素不依赖观察器，下一帧直接浮现
	const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
	function reveal(scopeEl) {
		for (const el of scopeEl.querySelectorAll(REVEAL)) {
			if (el.dataset.tReveal || el.closest('dialog,[hidden]')) continue;
			el.dataset.tReveal = '1';
			const index = [...el.parentElement.children].indexOf(el);
			el.style.setProperty('--t-delay', Math.min(index, 6) * 40 + 'ms');
			el.classList.add('t-reveal');
			seen.observe(el);
			requestAnimationFrame(() => requestAnimationFrame(() => { if (inView(el)) show(el); }));
		}
	}
	const RIPPLE = '.t-btn,.t-menu,.t-seg>button,.t-seg>a,.dashboard-stat,#home .portal';
	document.addEventListener('pointerdown', (event) => {
		const el = event.target.closest?.(RIPPLE);
		if (!el || el.matches(':disabled,[aria-disabled=true]') || el.closest('[inert],fieldset:disabled,[aria-disabled=true]')) return;
		const r = el.getBoundingClientRect();
		el.style.setProperty('--t-rx', event.clientX - r.left + 'px');
		el.style.setProperty('--t-ry', event.clientY - r.top + 'px');
		el.classList.remove('t-ripple'); void el.offsetWidth; el.classList.add('t-ripple');
		const finish = (event) => {
			if (event.target !== el || !['t-ripple', 't-press'].includes(event.animationName)) return;
			el.classList.remove('t-ripple'); el.removeEventListener('animationend', finish);
		};
		el.addEventListener('animationend', finish);
	}, { passive: true });
	const onScroll = () => root.classList.toggle('t-scrolled', scrollY > 8);
	addEventListener('scroll', onScroll, { passive: true });

	let pending = 0;
	const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; decorate(document); reveal(document); }); };
	document.addEventListener('DOMContentLoaded', () => {
		decorate(document);
		reveal(document);
		onScroll();
		document.fonts?.ready.then(schedule);
		// 输入框、可编辑区域内的打字不触发重扫，避免编辑时反复全页扫描
		const typing = (m) => (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('[contenteditable],textarea,input');
		new MutationObserver((list) => { if (list.some((m) => !typing(m))) schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden'] });
		addEventListener('resize', () => document.querySelectorAll('.t-seg').forEach(placeSeg));
	});

	document.addEventListener('click', (event) => {
		const button = event.target.closest('.theme-toggle');
		if (!button) return;
		const next = root.dataset.theme === 'cyber' ? 'ink' : 'cyber';
		const swap = () => { root.dataset.theme = next; applyAuto(); };
		try { localStorage.setItem(KEY, next); } catch {}
		// 支持页面过渡的浏览器：从按钮位置圆形扩散揭开新风格；否则用颜色渐变过渡
		if (document.startViewTransition) {
			const r = button.getBoundingClientRect();
			root.style.setProperty('--vt-x', r.left + r.width / 2 + 'px');
			root.style.setProperty('--vt-y', r.top + r.height / 2 + 'px');
			root.classList.add('t-theme-vt');
			document.startViewTransition(swap).finished.finally(() => root.classList.remove('t-theme-vt'));
			return;
		}
		root.classList.add('theme-switching');
		swap();
		setTimeout(() => root.classList.remove('theme-switching'), 500);
	});
})();
