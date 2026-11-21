const byId = id => document.getElementById(id);
const waiting = byId('waiting');
const state = byId('state');
const message = byId('message');
const listen = byId('listen');
const accept = byId('accept');
const stop = byId('stop');
const reset = byId('reset');
const reply = byId('reply');
const audioStatus = byId('audio-status');
const theme = byId('theme');
const voices = '../../assets/voice/private-chat/';
const invite = new Audio(voices + 'invite.wav');
invite.loop = false;
const startupVoices = [
  {file:'accepted.wav',text:'亲爱的，等我一下哦，我这就来找你啦'},
  {file:'accepted-alt.wav',text:'宝贝，我想你了嘛，来陪陪我好不好？'},
  {file:'accepted-here.wav',text:'我在哦，想我了吗？'},
  {file:'accepted-guess.wav',text:'猜猜我是谁，亲爱的。'},
  {file:'accepted-wife.wav',text:'是可爱迷人的老婆来找你玩了哦。'},
  {file:'accepted-count.wav',text:'1，2，3，4，5，我爱我宝贝，5，4，3，2，1，亲爱的爱我。'},
  {file:'accepted-tail.wav',text:'亲爱的，我逼好痒，你真不来看看嘛？'},
];
const invitation = '老公，有空吗，我想和你说说话嘛';
const opening = '今天忙完了没？我刚想起我们上次说的那首歌，留着想跟你一起听。还有明天早上想吃什么，我想先听听你的安排。';
let phase = 'waiting';
let startupAudio;

function play(audio) {
  invite.pause();
  startupAudio?.pause();
  audio.currentTime = 0;
  return audio.play().then(() => {
    audioStatus.textContent = '';
    return true;
  }).catch(() => {
    audioStatus.textContent = '无法播放语音';
    return false;
  });
}
function finish(copy) {
  startupAudio?.pause();
  phase = 'finished';
  state.textContent = '专聊结束';
  message.textContent = copy;
  stop.hidden = true;
  reply.hidden = true;
  reset.hidden = false;
}
function join() {
  if (phase !== 'waiting') return;
  phase = 'preparing';
  waiting.hidden = true;
  accept.hidden = true;
  listen.hidden = true;
  stop.hidden = false;
  state.textContent = '正在准备语音';
  const startup = startupVoices[Math.floor(Math.random() * startupVoices.length)];
  message.textContent = startup.text;
  const audio = new Audio(voices + startup.file);
  startupAudio = audio;
  audio.loop = false;
  stop.focus();
  function showOpening() {
    if (phase !== 'preparing' || startupAudio !== audio) return;
    phase = 'talking';
    state.textContent = '专聊中';
    message.textContent = opening;
    reply.hidden = false;
  }
  audio.addEventListener('ended', showOpening, {once:true});
  audio.addEventListener('error', showOpening, {once:true});
  void play(audio).then(playing => { if (!playing) showOpening(); });
}

listen.addEventListener('click', () => {
  if(invite.paused)void play(invite);
});
document.querySelectorAll('[data-accept]').forEach(button => button.addEventListener('click', join));
stop.addEventListener('click', () => finish('好呀，你先忙。'));
reply.addEventListener('submit', event => {
  event.preventDefault();
  if (phase !== 'talking' || !byId('input').value.trim()) return;
  finish('嗯，我记住啦。今天就聊到这儿，晚一点见。');
});
reset.addEventListener('click', () => {
  phase = 'waiting';
  state.textContent = '邀请';
  message.textContent = invitation;
  reply.reset();
  waiting.hidden = false;
  listen.hidden = false;
  accept.hidden = false;
  reset.hidden = true;
  accept.focus();
});
theme.addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  theme.textContent = light ? '深色' : '浅色';
  theme.setAttribute('aria-pressed', String(light));
});
