// 仅用于预览：所有提交结果都是模拟的。
const params = new URLSearchParams(location.search);
const view = params.get('v') || 'a', sim = params.get('sim') || 'part';
const app = document.querySelector('#app');
const tomorrow = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo'}).format(Date.now() + 86400000);
const link = '3f2a9c1e';
const wait = ms => new Promise(done => setTimeout(done, ms));

const fields = `
  <label class="cn-field">标题<input id="title" maxlength="200" required value="发现一个好用的截图工具"></label>
  <label class="cn-field">说明<textarea id="note" maxlength="1500">回来试一下能不能替换现在的截屏流程</textarea></label>
  <label class="cn-field">网址<input id="url" type="url" placeholder="https://" value="https://example.com/tool"></label>`;
const row = (id, name, option) => `<div class="cn-row"><input type="checkbox" id="${id}" checked aria-label="生成${name}">
  <label class="cn-name" for="${id}">${name}</label>${option}</div>`;
const extras = `
  ${row('reminder', '事项提醒', `<input class="cn-option" type="date" value="${tomorrow}" aria-label="提醒日期">`)}
  ${row('resource', '鱼与熊掌', '<select class="cn-option" aria-label="资源分类"><option>奇思妙想</option><option>其他</option><option>工具/网站</option><option>GitHub</option></select>')}
  ${row('record', '随手记', '<select class="cn-option" aria-label="随手记分类"><option>奇思妙想</option><option>个人感悟</option><option>成长不停止</option></select>')}
  <label class="cn-field">目标电脑<select><option>任一电脑</option><option>书房主机</option></select></label>
  <span class="cn-locked" title="本页固定开启"><b>🔔</b> 绯月本地提醒 🔒</span>`;
const tail = '<div class="cn-submit"><button type="submit" id="submit">提交登记</button></div><ul class="cn-results" id="results" aria-live="polite"></ul>';

if (view === 'entry') {
  app.innerHTML = `<h1>绯月任务管理</h1><div class="companion-content"><section><div class="companion-section-top">
    <div class="companion-section-heading"><h2>单条任务</h2><div class="companion-actions">
      <button type="button" class="t-btn" id="go" data-static-action="create">登记提醒</button>
      <button type="button" class="t-btn" data-static-action="create">新建任务</button>
      <button type="button" class="t-btn" data-static-action="refresh">刷新</button></div></div></div>
    <p class="cn-entry-note">「登记提醒」进入专用页面；按钮沿用主站默认的收起与悬停展开。</p></section></div>`;
  app.querySelector('#go').onclick = () => { location.search = '?v=a'; };
} else {
  app.className = 'companion-page cn-' + view;
  app.innerHTML = `<h1>登记提醒</h1><form id="form" class="cn-layout">${view === 'a'
    ? `<div class="cn-card">${fields}${extras}${tail}</div>`
    : `<div class="cn-card">${fields}</div><div class="cn-card">${extras}${tail}</div>`}</form>`;
  const results = app.querySelector('#results'), submit = app.querySelector('#submit');
  const line = name => {
    const li = document.createElement('li');
    li.className = 'cn-result';
    li.innerHTML = '<span class="cn-icon" aria-hidden="true"></span><span><strong></strong></span>';
    li.querySelector('strong').textContent = name;
    results.append(li);
    return li;
  };
  const finish = (li, ok, detail, retry) => {
    li.dataset.state = ok ? 'ok' : 'fail';
    li.querySelector('.cn-icon').textContent = ok ? '✓' : '!';
    const body = li.children[1];
    body.querySelectorAll('a,small,.cn-error').forEach(node => node.remove());
    li.querySelector('button')?.remove();
    const node = document.createElement(!ok ? 'code' : detail.startsWith('/') ? 'a' : 'small');
    node.textContent = (ok ? ' ' : '') + detail;
    if (!ok) node.className = 'cn-error'; else if (detail.startsWith('/')) node.href = '#';
    body.append(node);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = '重试'; button.onclick = retry; li.append(button);
    }
  };
  app.querySelector('#form').onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true; results.replaceChildren();
    const task = line('下发给绯月'); task.dataset.state = 'wait'; await wait(600);
    if (sim === 'task') {
      finish(task, false, '建任务 · HTTP 500 · D1_ERROR: database is locked: SQLITE_BUSY');
      submit.disabled = false; return;
    }
    finish(task, true, '任务已建立');
    for (const [id, name, path] of [['reminder', '事项提醒', '/reminders'], ['resource', '鱼与熊掌', '/resources/'], ['record', '随手记', '/records/']]) {
      if (!app.querySelector('#' + id).checked) continue;
      const li = line(name); li.dataset.state = 'wait'; await wait(500);
      const ok = () => finish(li, true, path + '?link=' + link);
      if (sim === 'part' && id === 'resource') {
        finish(li, false, '写入鱼与熊掌 · HTTP 500 · D1_ERROR: table rl_resources has no column named link_id', async () => {
          li.dataset.state = 'wait'; li.querySelector('.cn-icon').textContent = ''; await wait(700); li.querySelector('button')?.remove(); ok();
        });
      } else ok();
    }
  };
}
