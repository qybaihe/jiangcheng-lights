import json
from pathlib import Path
from PIL import Image
R=Path.cwd();O=R/'output/cinema-v3';P=R/'media/prompts';P.mkdir(exist_ok=True)
shots=[]
common='横屏16:9、720p视觉母版。精致明亮的中国生活动漫，细线与自然材质，暖米白、青玉、砖红，不加棕黄旧照滤镜。人物身份、服装、手指数和道具数量稳定，无穿模、变脸、变形、闪光特效、字幕、商标、水印；无音乐无对白。'
def crop(name,source,box=None):
 im=Image.open(R/source).convert('RGB')
 if box:im=im.crop(box)
 else:
  h=round(im.width*9/16);im=im.crop((0,0,im.width,min(h,im.height)))
 im=im.resize((2048,1152),Image.Resampling.LANCZOS);path=O/'frames'/f'{name}.png';im.save(path)
 return str(path.relative_to(R))
def add(id,scene,title,duration,request,first,video,refs=None,img=None,cg=None,reuse=None):
 name=f'cinema-v3-{scene}-{id.lower()}-v1';prompt=f'media/prompts/{name}-video.txt';(R/prompt).write_text(video+'\n'+common+'\n')
 s={'id':id,'scene':scene,'title':title,'name':name,'source':f'public/media/{name}.mp4','firstFrame':first,'prompt':prompt,'requestSeconds':request,'in':0,'usedSeconds':duration,'status':'planned','frameReview':'pending','visualReview':'pending','memoryCG':cg}
 if img:
  fn=f'cinema-v3-{scene}-{id.lower()}-start';s.update(frameName=fn,imageReferences=refs or [],firstFrame=f'output/imagegen/{fn}.png')
  (P/f'{fn}.txt').write_text('Use case: illustration-story\nAsset: 江城有灯 v3 电影首帧，2048×1152，横屏16:9。\n'+img+'\n风格：精致温暖都市动漫电影，细线和平涂动漫脸，自然材料，暖米白青玉砖红，光线清楚，不阴暗不棕黄。无标题、字幕、标志、水印、伪文字；所有主体与剧情物件完整留在画面内。\n')
 if reuse:s.update(source=reuse,frameReview='accepted',visualReview='accepted',status='accepted',reuse=True)
 shots.append(s)
source='output/imagegen/cinema-v3-prologue-ferry-start.png'
add('P01','prologue','汉口江面',5,8,source,'现有通过审查的首镜只使用前5秒。',reuse='public/media/cinema-v3-prologue-ferry-v1.mp4')
add('P02','prologue','回家的钥匙',4,8,None,'8秒。@Image1 的手和银色钥匙完全锁定。固定近景，干燥绿色船凳背景。一只手原本轻夹一把哑光银色钥匙，拇指实际接触钥匙柄，前3秒轻轻把它收进掌心，随后手自然放低离开近景，露出空凳。只一次收握，没有自主转动和腾空，没有任何金色闪光或刻字。',refs=[source],img='Image 1 是画风和船上光照参考，不复制远景钟楼。近景：干燥深玉绿木船凳上方，一只普通成年人的手从画面左下进入，拇指与食指轻轻夹住一把很小的哑光银色门钥匙的实心圆柄，另一只手不出现。钥匙只有一把，圆柄上无任何文字，套一个素色细圆圈。五指结构自然，钥匙与手有明确接触。只画裸露手腕和手，不画袖子、脸、头发或性别化服饰。下方是有细微磨损的绿凳板和柔和阳光，不要宝物光、不闪亮。')
shore=crop('prologue-shore-nearer',source,(100,0,1892,1008))
add('P03','prologue','同一岸线近一些',5,8,shore,'8秒。@Image1 是唯一岸线和建筑参考，保持所有楼群数量排列与钟楼比例。摄像机固定在船栏内，不推近、不变焦；船行只带来非常轻的水平视差，远方白蓝小船继续移动，江水自然起伏。钟楼塔冠始终完整在画面内，绝不新增左侧玻璃大楼，绝不生成大桥。')
add('P04','prologue','里分日常',10,10,None,'10秒，同一汉口里分巷口的两镜：0–5秒主观平视缓缓走过红砖门洞，右侧一位普通街坊把竹椅从通道边抬进门内，让出一条路。5–10秒硬切向前的主观步行镜头，走两三步，看见深绿木窗和一间修理铺的门，雨后只有路边潮湿，公共通道干燥。镜头不出现玩家身体、衣服或倒影，不虚构男性或女性背影。没有高楼地标突然近在屋后。',refs=['public/media/repair-facade.webp','output/imagegen/story-v2-cg-granny-table-r3.png'],img='Image 1 是修理铺深绿门窗和汉口红砖里分建筑参考。Image 2 是动漫光色参考，只参考环境画风，不复制两位剧情角色。主观平视，从宽敞的红砖门洞看进一条可以步行的汉口老巷，晴雨间隙，云间柔和金光；深玉绿木窗、灰砖铺地、青灰瓦、檐下竹椅。画右一位穿普通蓝灰短袖的邻居背侧身站在门槛里，一双手已握住一把空竹椅的两侧，准备从通道边收进门内。只有这一位成人，没有主角身体、没有人脸特写。通道开阔且地面平整，水迹只在墙脚。远处一扇旧绿双木门是陆记，但不画任何可读招牌。避免江汉关或桥塔塞在巷中。')
add('P05','prologue','门前的来电',7,8,None,'8秒。@Image1 这扇旧绿木门和主观机位保持不变。前4秒缓慢向门靠近一小步然后停下，木门始终关闭；第4秒只有一只普通成年手从下沿伸入，轻夹一把无字银色钥匙停在锁孔前，尚未插钥匙尚未开门。无另一只手、无手机界面、无可见玩家服装和身体；来电由后期音效和UI呈现。最后视线稳稳停在门锁高度，不开门、不穿门。',refs=['public/media/repair-facade.webp'],img='Image 1 为陆记修理铺建筑参考。生成同一类汉口里分修理铺的旧深玉绿木门的主观平视中近景，门闭着，有真实旧银色锁孔与黄铜小把手，门框一侧是红砖和灰色修补痕。柔和傍晚光从左侧照进，干燥公共台阶；木漆微磨损，气质温暖有生活。只拍门、门框、锁、少量墙面，画面无人物、无身体倒影、无招牌字、无手机。门的中缝与横档结构清晰稳定，为玩家回到3D接电话开门预留。')
gtable=crop('granny-table','output/imagegen/story-v2-cg-granny-table-r3.png')
bamboo=crop('granny-bamboo','output/imagegen/story-v2-cg-granny-bamboo.png')
add('G01','granny','面先吃，孩子我接',15,15,gtable,'15秒的两镜小场景。@Image1 外公在左穿灰玉绿衬衫，婆婆在右戴圆眼镜、梅灰上衣，面碗已有一小缺口朝婆婆。0–7秒固定双人中景，婆婆把碗沿桌面轻推一掌，外公看向她，手仍放腿上。7–15秒硬切外公侧后肩的中近景，婆婆自然说话手势并指一下院门，外公轻点头然后拿起一双筷子，碗始终在桌上。像真实交谈的一来一回，不夸张张嘴，不反复递碗；两人身份位置不互换。',cg='granny-table')
add('G02','granny','竹床上的午睡',10,10,bamboo,'10秒两镜。@Image1 的十岁短发孩子、婆婆、竹床和天井保持。0–5秒固定中景，婆婆缓缓摇两下蒲扇，孩子睡熟，作业本和铅笔位置稳定。5–10秒硬切桌沿近景：婆婆另一只手轻轻抽走孩子松握的一支铅笔，平放在作业本边。不是掰开孩子的手，不叫醒孩子。不能增加外公或其他人物。',cg='granny-bamboo')
add('G03','granny','先洗了手',7,8,None,'8秒，@Image1 的外公灰玉绿袖口、双手和水池保持一致。固定细节镜头，外公先摊开沾灰的手看一眼，再在细小水流下轻轻洗净双手，最后关紧水龙头。一次完整动作，水只流进池内。无电器、无火花，不新增孩子或人物脸。最后切点可用水停后的放松手势。',refs=['output/imagegen/story-v2-cg-granny-table-r3.png','output/imagegen/story-v2-cg-granny-bamboo.png'],img='Image 1 为外公灰玉绿工作衫和手部年龄参考；Image 2 为同一汉口小院竹床环境参考。特写一位约五十多岁修理匠的前臂与双手，灰玉绿棉衬衫袖口卷起，手上少量普通灰迹，双手悬在旧水泥洗手池里侧，准备打开一只老式金属水龙头。脸与身体都在画外，水池落地稳固，背后是清楚的红砖和玉绿百叶窗。夏日荫处明亮柔和，无血无伤、无电气设备。')
clamp=crop('chef-lamp','output/imagegen/story-v2-cg-chef-lamp.png')
food=crop('chef-food','output/imagegen/story-v2-cg-chef-extra-bowl.png')
box=crop('chef-lunchbox','output/imagegen/story-v2-cg-chef-extra-bowl.png',(240,425,1400,1024))
add('C01','chef','天亮前的灯',14,15,clamp,'15秒，@Image1 蔡姨在左杏橘短袖玉青围裙，外公在右灰玉绿衫；桌上的A绿边圆筒电池灯绝不变成台灯。0–6秒固定中景，外公把灯稳稳放好松手，蔡姨低头数桌边几枚零钱。6–11秒切蔡姨手边近景，灯光照清钱，她挑出两枚硬币在桌边放整齐。11–15秒切回双人中景，蔡姨抬眼笑一下，外公点头，手自然离开灯。只有一次放灯，灯光稳定不闪烁；不新增人物或任何字牌。',cg='chef-lamp')
add('C02','chef','小饭盒先留好',14,15,food,'15秒，同@Image1 的人物、红盖饭盒和豆皮，蔡姨在右外公在左。0–7秒固定中景，蔡姨把已经装好豆皮的小饭盒放到外公手边，外公从兜里摸出少量零钱，迟疑。7–15秒硬切蔡姨侧面中景，她轻轻摆一下手，转身洗一只锅盖；外公看向饭盒，慢慢把零钱放回衣兜。红盖一直在桌上，白色旧痕保留；不把饭盒漂浮着递过空中，不新加孩子。',cg='chef-extra-bowl')
add('C03','chef','红盖上的白点',5,8,box,'8秒，固定近景，@Image1 红盖饭盒和豆皮为唯一主角，白点保持在原位置。前4秒只有蔡姨的手从原方向伸来，拿起红盖对准盒口盖好，轻扣两侧；最后手离开，完整小饭盒留在桌上。无新饭盒、无文字无闪光，豆皮不是汤面；人物脸不进入本镜。',cg='chef-extra-bowl')
add('D01','dock','还没想好去哪儿',10,10,None,'10秒，@Image1 外公灰玉绿衫抱着纸箱停在干燥码头内侧，不走向水。0–5秒侧后中景，他看远处驶离的白蓝轮渡，手指略收紧箱边；5–10秒镜头切侧面，外公低头看工具箱，侧后画外周伯的招呼令他回一下头。周伯仅声音后配，本镜不新增第二个人。没有哭泣，没有洪水，没有额外地标。',refs=['output/imagegen/story-v2-cg-dock-shared-box.png'],img='Image 1 是码头、外公脸型灰玉绿衬衫、纸工具箱与动漫风格锚。重新构图为同一码头干燥安全内侧的一位修理匠：只保留外公，周伯不在画内。外公双手抱一只原参考相同的小纸工具箱，箱底靠近腰部，站在雨棚内的干燥地面，背侧三分之二身，望向远处白蓝渡船。灰蓝暮色有温暖亮光，背景可保留同一石塔钢桁架大桥的远轮廓，绝不加入江汉关。男人有疲惫但不濒危不哭泣，箱内普通旧工具无尖物朝外。',cg='dock-shared-box')
add('D02','dock','托住箱子另一边',10,10,None,'10秒固定双人中景。@Image1 外公在左抱纸箱、周伯在右双手尚未接触箱底；保留衣服和脸。0–4秒周伯用一只手示意纸箱另一边，外公看他并点头，把手挪开一点。4–8秒周伯再伸掌托住箱底，纸箱重量真实有支撑，箱口不变形，不抬得过高。8–10秒两人都握稳，外公转眼朝回巷方向。先征询再接触，一次接箱动作，镜头不移动。',refs=['output/imagegen/story-v2-cg-dock-shared-box.png'],img='Image 1 是两位人物和码头空间锚。保留外公在左灰玉绿衫、周伯在右蓝便帽蓝双袋工装。画成动作开始之前：外公双手仍抱着同一只纸工具箱，周伯隔半步站在旁边，双手自然垂在身前、尚未接触纸箱。两人面对面三分之二身站在干燥栏内通道，周伯在询问是否帮忙，外公稍微抬眼。箱子不悬空，不让两人已一起托住再提问。远景同样只有钢桁架桥和白蓝轮渡，没有江汉关。',cg='dock-shared-box')
walk=crop('dock-walk','output/imagegen/story-v2-cg-dock-shared-box.png')
add('D03','dock','一起回巷子',8,8,walk,'8秒，@Image1 两人已经一起稳托同一只纸箱，外公左灰玉绿、周伯右蓝帽蓝衫。固定略后退的跟拍，两人由站立开始转向同一个安全方向，沿干燥公共通道并肩走两三步，箱底始终近水平；经过一道砖缝一起抬高一点再放回自然高度。只向一个方向走，不交换人物位置、不掉箱、不靠水边。',cg='dock-shared-box')
add('E01','ending','书包边的重新开门',12,12,None,'12秒两镜。@Image1 四个人与书包固定：外公与周伯抬同一空木桌已到门槛，蔡姨抱饭盒，婆婆抱蓝布。0–3秒低处补丁书包近景，随后硬切4人中广景；3–10秒两位男人把桌子平稳抬过门槛并落在窗边，只落一次，二位女士让开通道。10–12秒外公按桌角确认稳固。没有孩子坐在移动的桌前，没有旧收音机或A绿灯回到店里。',refs=['output/imagegen/story-v2-cg-ending-reopen-r2.png','output/imagegen/story-v2-cg-ending-lamplit-child.png'],img='Image1 是四位成人、门、补丁书包的身份锚；Image2 是最终书桌角与B铜座细弯颈米色灯罩的锚。重新构图动作开始前：汉口里分修理铺宽门口，外公灰玉绿衫在左和周伯蓝帽蓝衫在中右，两人稳抬一张无物品的旧木工作台，桌腿刚离干燥地面几厘米，正在跨门槛。蔡姨杏橘衫玉青围裙站右边抱着一个盖好的饭盒，婆婆梅灰衣圆眼镜站门内靠左抱洗净的靛蓝布，所有人让出搬桌路径。门边地上放蓝灰补丁儿童书包。孩子暂不出镜；B小台灯暂放里侧另一个固定柜台，桌上不放灯、不放孩子、不放旧收音机。温暖傍晚有天光，四人神情日常。',cg='ending-reopen')
add('E02','ending','留饭，铺好桌角',10,10,None,'10秒，@Image1 工作台已经落地固定。0–5秒婆婆把蓝布摊平在靠窗的桌角并轻压两下，外公在一旁确认桌子不晃，不再移动整张桌。5–10秒切另一个柜台，蔡姨放下一只已装饭的盒子，朝外公点头，然后把手收回。门和灯位置固定，孩子尚未到桌边，无换脸、无桌子反复抬起。',refs=['output/imagegen/story-v2-cg-ending-reopen-r2.png','output/imagegen/story-v2-cg-ending-lamplit-child.png'],img='Image1 为四位成人和门口环境身份参考；Image2 为最终窗边工作台、蓝布、B铜座弯颈米色罩台灯参考。现在桌子已经在窗边落稳，空木桌干净。婆婆站桌旁把洗好的靛蓝布半摊在靠窗桌角，一只手还压着布；外公站旁边一手轻放桌角。B台灯已固定在这个写字角后侧。蔡姨在背景另一个柜台旁，双手持一只封好的普通饭盒，准备放下。周伯站在门边半侧，人数四位不变。孩子不入画，书包在门边。轻暖傍晚，所有家具真实落地，灯形不变，不出现A绿色圆筒灯和收音机。',cg='ending-reopen')
add('E03','ending','孩子坐到灯下',10,10,None,'10秒。@Image1 的空写字角、B台灯、蓝布与十岁短发孩子锁定。固定中景，0–5秒婆婆从門邊轻招手，孩子抱着作业本走两小步到椅边，把本子放上桌；5–10秒孩子坐下，放好手中的铅笔，转头抬眼看外公。桌子始终不动，孩子只坐一次。成人不围住孩子，无说教手势。',refs=['output/imagegen/story-v2-cg-ending-lamplit-child.png','output/imagegen/story-v2-cg-ending-reopen-r2.png'],img='Image1 是灯下孩子、B台灯和书桌布景的严格参考；Image2 是四成人与补丁书包参考。动作开始前，保持与Image1同一个镜头方向和屋内布局，但椅子上尚未坐人，蓝布已铺在桌角，B台灯已亮。十岁阿遥短栗发、米白T恤、灰蓝及膝短裤在离椅子两小步的里屋门边站着，双手抱一本作业本和一支铅笔，背侧三分之二身，不强调男女。门边外公灰玉绿衫、婆婆梅灰衣圆眼镜、蔡姨杏橘衣玉青围裙保持，只婆婆轻抬手招呼孩子。周伯留在外间不新增入镜。桌子稳固落地，书包仍在外门边不必出镜。',cg='ending-lamplit-child')
child=crop('ending-child','output/imagegen/story-v2-cg-ending-lamplit-child.png')
add('E04','ending','明天还在这里',8,10,child,'10秒两镜，@Image1 孩子已经坐稳，B台灯、蓝布、三位成人保持。0–6秒固定孩子背侧中景，孩子抬头看外公一下，再低头认真写完一个字，成人在门边放轻说话动作。6–10秒硬切近处外公手和空凳脚，他把一把空凳轻轻抬起挪近桌边再放下，不拖地，孩子继续写字。无镜头绕到孩子正脸、无新增人物、无大人消失成光影。',cg='ending-lamplit-child')
scenes=[]
for id,title,target in [('prologue','门还没修',31),('granny','一碗面，一张竹床',32),('chef','红盖子的饭盒',33),('dock','箱子的另一边',28),('ending','那天你也在',40)]:
 ss=[s for s in shots if s['scene']==id];c=0;timeline=[]
 for s in ss:timeline.append({'shotId':s['id'],'start':c,'end':c+s['usedSeconds'],'memoryCG':s['memoryCG']});c+=s['usedSeconds']
 scenes.append({'id':id,'title':title,'status':'planned','silentUrl':f'/media/cinema-v3-{id}.mp4','targetSeconds':target,'shots':[s['id'] for s in ss],'plannedTimeline':timeline,'aspect':'16:9','nativeResolution':'720p','dialogueAudioOwner':'root','scope':'silent visual master only'})
plan={'version':3,'state':'production_in_progress','model':'Ark Seedance 2.0, existing authorized endpoint','imageModel':'gpt-image-2 through existing tools/media.py and bundled imagegen CLI','audio':False,'scenes':scenes,'shots':shots}
path=R/'media/cinema/story-v3-production.json'
if path.exists():raise SystemExit('Plan already exists, preserve production state')
path.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
print(len(shots),'shots',len([s for s in shots if s.get('frameName')]),'new generated anchors; total',sum(s['targetSeconds'] for s in scenes),'seconds')
