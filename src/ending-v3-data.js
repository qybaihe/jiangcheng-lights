// Additional ending calls. The true ending remains DIALOGUES.ending.
// These are present-day phone/voice-message conversations, never memory CG.
export const ENDING_DIALOGUES = {
 endingGood: [
  {id:'ending-good-checkin',who:'外公',text:'忙完了？',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-good-arrivals',who:'阿遥',text:'嗯。人都到了，饭也送过去了。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-good-eat',who:'外公',text:'那你快吃，莫放凉了。',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-good-stay',who:'阿遥',text:'我再住两天。明早去蔡姨那里过早。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-good-mianwo',who:'外公',text:'帮我看看，还有没有面窝。',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-good-together',who:'阿遥',text:'好。等你回来，我们一起去。',portrait:'player',time:'present',scope:'ending-branch'},
 ],
 endingNeutral: [
  {id:'ending-neutral-checkin',who:'外公',text:'回店了？',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-neutral-leave',who:'阿遥',text:'嗯。我得先回去了，还要上班。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-neutral-umbrella',who:'外公',text:'行。柜台底下有把伞，带着。',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-neutral-rest',who:'阿遥',text:'您就在姨妈那儿好好歇着。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-neutral-arrival-message',who:'外公',text:'晓得。到了发个消息。',portrait:'grandfather',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-neutral-next-time',who:'阿遥',text:'好，下次回来再陪您过早。',portrait:'player',time:'present',scope:'ending-branch'},
 ],
 endingRegret: [
  {id:'ending-regret-xu-question',who:'小许',text:'阿遥，社区这边你还过来吗？',portrait:'xu',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-regret-unfinished',who:'阿遥',text:'还没。我临时得走了，没顾上。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-regret-handover',who:'小许',text:'好，知道了。我另安排人。',portrait:'xu',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-regret-meal-message',who:'蔡姨',text:'还来吃饭不？你的豆皮留着呢。',portrait:'chef',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-regret-missed-meal',who:'阿遥',text:'蔡姨，我赶不上了。改天吧。',portrait:'player',time:'present',scope:'ending-branch'},
  {id:'ending-regret-goodbye',who:'蔡姨',text:'行。路上慢点。',portrait:'chef',time:'present',scope:'ending-branch',remote:true},
  {id:'ending-regret-left-meal',who:'阿遥',text:'好。……那份您吃了吧。',portrait:'player',time:'present',scope:'ending-branch'},
 ],
};
