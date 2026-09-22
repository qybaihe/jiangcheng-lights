import {
  getResident, getResidentTopic, RESIDENT_PHASE_LABELS, normalizeResidentProgress,
  hasHeardResidentTopic, updateResidentProgress, createResidentChatState, transitionResidentChat,
} from '../resident-stories.js';
import {memoryForResidentTopic} from '../wuhan-memories.js';
import {memoryCardMarkup,mountMemoryInspection} from './memory-art.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
let instanceCount = 0;

/**
 * Bottom-of-world chat, with no scene replacement or automatic advancement.
 * onHeard(residentId, topicId) fires only after the last line is acknowledged.
 * onSpeak(residentId, text) tracks the visible speaker; (null, '') clears it.
 * The host owns persistence, Escape, and its Enter/Space shortcut. On shortcuts,
 * preventDefault() before advance() so a focused button is not activated twice.
 */
export function mountResidentChat(root, {residentId, state, onClose, onHeard, onSpeak} = {}) {
  const person = getResident(residentId);
  if (!person) throw new RangeError(`Unknown resident: ${residentId}`);
  if (!root?.ownerDocument) throw new TypeError('A resident chat root element is required.');
  const doc = root.ownerDocument;
  const prefix = `resident-chat-${++instanceCount}`;
  let session = createResidentChatState(residentId, state);
  let progress = normalizeResidentProgress(state?.residents);
  let disposed = false;
  let lastTopicId = null;
  const section = doc.createElement('section');
  section.className = 'resident-chat';
  section.setAttribute('role', 'dialog');
  section.setAttribute('aria-modal', 'true');
  section.setAttribute('aria-labelledby', `${prefix}-name`);
  section.dataset.residentId = person.id;
  section.innerHTML = `
    <header class="resident-chat-header">
      <div class="resident-chat-identity">
        <span class="resident-chat-seal" aria-hidden="true">${escapeHTML(person.monogram)}</span>
        <div class="resident-chat-person">
          <span class="resident-chat-kicker">街坊闲谈 <i aria-hidden="true">·</i> ${escapeHTML(RESIDENT_PHASE_LABELS[session.phase])}</span>
          <h2 id="${prefix}-name">${escapeHTML(person.name)}<small>${escapeHTML(person.role)}</small></h2>
          <p>${escapeHTML(person.detail)}</p>
        </div>
      </div>
      <button type="button" class="resident-chat-close" data-resident-action="close" aria-label="结束和${escapeHTML(person.name)}的聊天"><span>结束聊天</span><i aria-hidden="true">×</i></button>
    </header>
    <div class="resident-chat-content" tabindex="0" aria-label="闲谈内容，可滚动阅读">
      <div class="resident-chat-line-panel" data-resident-line-panel>
        <div class="resident-chat-line-meta"><span data-resident-line-title></span><span data-resident-line-count></span></div>
        <p class="resident-chat-line" data-resident-line aria-live="polite" aria-atomic="true"></p>
        <div class="resident-chat-dots" data-resident-dots aria-hidden="true"></div><div class="town-voice"><button type="button" data-town-voice-replay>听这句</button><span data-town-voice-status aria-live="polite"></span></div>
      </div>
      <div class="resident-chat-topic-panel" data-resident-topic-panel hidden>
        <div class="resident-chat-topic-heading"><h3>想聊点什么？</h3><span data-resident-heard-count></span></div>
        <div class="resident-chat-topics">
          ${person.topics.map((item, index) => `<button type="button" class="resident-chat-topic" data-resident-action="topic" data-resident-topic="${escapeHTML(item.id)}"><span class="resident-chat-topic-index" aria-hidden="true">0${index + 1}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.teaser)}</small><span class="resident-chat-topic-bottom"><span data-resident-topic-status></span><i aria-hidden="true">↗</i></span></button>`).join('')}
        </div>
      </div>
    </div>
    <footer class="resident-chat-footer">
      <span class="resident-chat-hint" data-resident-hint></span>
      <div class="resident-chat-actions">
        <button type="button" class="resident-chat-back" data-resident-action="back" hidden>先换个话题</button>
        <button type="button" class="resident-chat-next" data-resident-action="advance"><span data-resident-next-label></span><i aria-hidden="true">→</i></button>
      </div>
    </footer>`;
  root.replaceChildren(section);
  const memoryHolder=doc.createElement('div');
  memoryHolder.className='resident-memory-holder';root.append(memoryHolder);
  const memoryInspection=mountMemoryInspection(memoryHolder);
  let picturedMemoryId=null;

  const find = selector => section.querySelector(selector);
  const content = find('.resident-chat-content');
  const nextButton = find('[data-resident-action="advance"]');
  const backButton = find('[data-resident-action="back"]');
  const topicButtons = [...section.querySelectorAll('[data-resident-topic]')];
  const focus = element => element?.focus({preventScroll:true});

  function render() {
    if (disposed) return;
    const inTopics = session.screen === 'topics';
    const story = getResidentTopic(person.id, session.topicId);
    const picture=story?memoryForResidentTopic(person.id,story.id):null;
    if(picturedMemoryId!==(picture?.id??null)){
      memoryInspection.close({focus:false});picturedMemoryId=picture?.id??null;
      memoryHolder.innerHTML=picture?memoryCardMarkup(picture.id,{collected:hasHeardResidentTopic(progress,person.id,story.id)}):'';
    }
    section.dataset.screen = session.screen;
    section.dataset.lineIndex = String(session.lineIndex);
    section.dataset.topicId = session.topicId || '';
    find('[data-resident-line-panel]').hidden = inTopics;
    find('[data-resident-topic-panel]').hidden = !inTopics;
    nextButton.hidden = inTopics;
    backButton.hidden = session.screen !== 'story';
    content.scrollTop = 0;
    if (inTopics) {
      const heardCount = progress.heard[person.id]?.length || 0;
      find('[data-resident-heard-count]').textContent = `听过 ${heardCount} / ${person.topics.length}`;
      find('[data-resident-hint]').textContent = '挑一件想听的旧事 · 听过的也能再聊';
      for (const button of topicButtons) {
        const heard = hasHeardResidentTopic(progress, person.id, button.dataset.residentTopic);
        button.classList.toggle('is-heard', heard);
        button.querySelector('[data-resident-topic-status]').textContent = heard ? '✓ 听过，再聊聊' : '听听这件事';
      }
      onSpeak?.(null, '');
      focus(topicButtons.find(button => button.dataset.residentTopic === lastTopicId)
        || topicButtons.find(button => !button.classList.contains('is-heard')) || topicButtons[0]);
    } else {
      const text = story ? story.lines[session.lineIndex] : person.greetings[session.phase];
      find('[data-resident-line-title]').textContent = story ? story.title : '见面，先问个好';
      find('[data-resident-line-count]').textContent = story ? `${session.lineIndex + 1} / ${story.lines.length}` : '';
      find('[data-resident-line]').textContent = text;
      find('[data-resident-dots]').innerHTML = story ? story.lines.map((_, index) => `<i class="${index <= session.lineIndex ? 'is-read' : ''}"></i>`).join('') : '';
      find('[data-resident-hint]').innerHTML = story ? '<kbd>Enter</kbd><span>／</span><kbd>Space</kbd> 下一句 · 听完收入记忆画廊' : '就在眼前的巷子里，慢慢聊几句';
      find('[data-resident-next-label]').textContent = !story ? '问问巷里的旧事' : session.lineIndex === story.lines.length - 1 ? '听完了，聊别的' : '下一句';
      onSpeak?.(person.id, text, {phase:session.phase,topicId:story?.id??null,index:session.lineIndex});
      focus(nextButton);
    }
  }

  function dispatch(event) {
    if (disposed) return false;
    const result = transitionResidentChat(session, event);
    if (event.type === 'topic') lastTopicId = result.session?.topicId || lastTopicId;
    const changed = JSON.stringify(result.session) !== JSON.stringify(session);
    session = result.session;
    if (result.heard) {
      progress = updateResidentProgress(progress, {type:'topic-complete', ...result.heard});
      // No write occurs on topic selection, its last-line display, back, or close.
      onHeard?.(result.heard.residentId, result.heard.topicId);
    }
    if (changed) render();
    return changed;
  }

  function close() {
    if (disposed) return false;
    session = transitionResidentChat(session, {type:'close'}).session;
    dispose();
    onClose?.();
    return true;
  }

  function advance() {
    if (disposed) return false;
    if(memoryInspection.isInspecting())return memoryInspection.close();
    const active = section.contains(doc.activeElement) ? doc.activeElement.closest('[data-resident-action]') : null;
    if (active?.dataset.residentAction === 'close') return close();
    if (active?.dataset.residentAction === 'back') return dispatch({type:'back'});
    if (session.screen === 'topics') {
      const topicId = active?.dataset.residentTopic;
      return topicId ? dispatch({type:'topic', topicId}) : false;
    }
    return dispatch({type:'advance'});
  }

  function handleClick(event) {
    const button = event.target.closest?.('[data-resident-action]');
    if (!button || !section.contains(button)) return;
    const type = button.dataset.residentAction;
    if (type === 'close') close();
    else dispatch({type, topicId:button.dataset.residentTopic});
  }

  function handleKeydown(event) {
    if (session.screen !== 'topics' || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = topicButtons.indexOf(doc.activeElement);
    if (index < 0 || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const selected = event.key === 'Home' ? 0 : event.key === 'End' ? topicButtons.length - 1
      : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + topicButtons.length) % topicButtons.length;
    focus(topicButtons[selected]);
    topicButtons[selected].scrollIntoView?.({block:'nearest', inline:'nearest'});
  }

  function stopPointer(event) { event.stopPropagation(); }

  function dispose() {
    if (disposed) return;
    disposed = true;
    section.removeEventListener('click', handleClick);
    section.removeEventListener('keydown', handleKeydown);
    section.removeEventListener('pointerdown', stopPointer);
    memoryInspection.dispose();memoryHolder.remove();
    section.remove();
    onSpeak?.(null, '');
  }

  section.addEventListener('click', handleClick);
  section.addEventListener('keydown', handleKeydown);
  section.addEventListener('pointerdown', stopPointer);
  render();
  return {advance, dispose};
}
