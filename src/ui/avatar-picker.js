import {AVATARS,getAvatarOption} from '../avatar-catalog.js';

export function avatarPickerMarkup(context,selected) {
  const choice=getAvatarOption(selected);
  return `<section class="avatar-picker" data-avatar-picker="${context}" aria-label="选择主角形象">
    <div class="avatar-picker-heading"><span>THE ONE RETURNING HOME</span><h3>以你的模样，回到江城。</h3></div>
    <fieldset class="avatar-options"><legend class="avatar-sr-only">主角形象</legend>${AVATARS.map(option=>`<label class="avatar-option" data-avatar-option="${option.id}">
      <input type="radio" name="avatar-${context}" value="${option.id}" ${choice.id===option.id?'checked':''} aria-label="${option.label}"/>
      <span class="avatar-card"><span class="avatar-card-art"><img src="${option.portrait}" alt="${option.label}阿遥的游戏角色预览" width="360" height="440"/><span class="avatar-selection-mark" aria-hidden="true">✓</span></span><span class="avatar-card-label"><strong>${option.label}</strong><span class="avatar-choice-state">${choice.id===option.id?'已选择':'选择'}</span></span><span class="avatar-description">${option.description}</span></span>
    </label>`).join('')}</fieldset>
    <p class="avatar-picker-status" role="status" aria-live="polite">${choice.label} · 阿遥，街坊们都这样叫你。</p>
    <p class="avatar-picker-note">两种形象，同一段归乡故事。随时可在设置中更换。</p>
  </section>`;
}

export function syncAvatarPickers({selected,pending=null,error=false}) {
  const choice=getAvatarOption(selected);
  for(const picker of document.querySelectorAll('[data-avatar-picker]')){
    picker.setAttribute('aria-busy',String(Boolean(pending)));
    for(const input of picker.querySelectorAll('input[type=radio]')){
      input.checked=input.value===choice.id;
      input.disabled=Boolean(pending);
      const label=input.closest('.avatar-option');
      label.classList.toggle('loading',input.value===pending);
      label.querySelector('.avatar-choice-state').textContent=input.value===pending?'准备中…':input.checked?'已选择':'选择';
    }
    picker.querySelector('.avatar-picker-status').textContent=pending?`正在准备${getAvatarOption(pending).label}…`:error?'形象暂未载入，请再次选择重试。':`${choice.label} · 阿遥，街坊们都这样叫你。`;
    picker.classList.toggle('has-error',error);
  }
}
