import {audioPreferences} from '../audio-director.js';
export function audioControlsMarkup(settings) {
 const prefs=audioPreferences(settings);
 const channels=[['musicVolume','音乐','沿街的旋律，回忆里的灯火'],['voiceVolume','对白','每位街坊，都有自己的声音'],['effectsVolume','音效与环境','脚步、翻页、收音机与细雨']];
 return `<section class="audio-preferences" aria-label="声音平衡"><div class="audio-preferences-heading"><span>把声音调到舒服的位置</span><button id="voice-preview" ${settings.sound?'':'disabled'}>听一听阿遥</button></div>${channels.map(([key,label,description])=>`<label class="audio-channel"><span><strong>${label}</strong><small>${description}</small></span><input type="range" min="0" max="100" step="1" value="${Math.round(prefs[key]*100)}" data-audio-channel="${key}" aria-label="${label}音量"/><output data-audio-value="${key}">${Math.round(prefs[key]*100)}%</output></label>`).join('')}<label class="voice-auto"><input id="set-voice-auto" type="checkbox" ${prefs.voiceAuto?'checked':''}/><span>自动读出对白<small>也可以随时点“听这句”，故事由你翻页。</small></span></label></section>`;
}
