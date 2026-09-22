import React from 'react';
import {AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import './style.css';

export type Shot = {id:string; type:'cg'|'game'|'keyframe'|'evidence'; from:number; duration:number; src:string; sourceIn?:number; playbackRate?:number; title?:string; detail?:string; label?:string; chapter?:string; gameVolume?:number; closing?:boolean; secondary?:string; waveform?:number[]};
export type Cue = {from:number; duration:number; text:string; who?:string; presentation?:'title'|'subtitle'};
export type Voice = {from:number; duration:number; src:string; volume?:number};
export type FilmProps = {title:string; kind:'proof'|'final'; duration:number; shots:Shot[]; captions:Cue[]; voice:Voice[]; sounds?:Voice[]; gameAudio:boolean; music?:string; effects?:string; lockedMix?:string; logo?:string; annotations?:(Cue&{detail?:string})[]};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
function envelope(frame:number,length:number,fadeIn=.35,fadeOut=.45,fps=30){return Math.min(interpolate(frame,[0,fadeIn*fps],[0,1],clamp),interpolate(frame,[Math.max(1,length-fadeOut*fps),length],[1,0],clamp));}
function duckAt(time:number,voices:Voice[],floor=.43){let gain=1;for(const v of voices){const attack=interpolate(time,[v.from-.18,v.from],[0,1],clamp);const release=interpolate(time,[v.from+v.duration,v.from+v.duration+.28],[1,0],clamp);gain=Math.min(gain,1-(1-floor)*Math.min(attack,release));}return gain;}

const LightDust:React.FC=()=>{
 const frame=useCurrentFrame();
 return <div className="dust" aria-hidden>{Array.from({length:15},(_,i)=><i key={i} style={{left:`${4+(i*23.9)%93}%`,top:`${15+(i*37.7)%79}%`,width:2+i%3,height:2+i%3,opacity:.12+.11*Math.sin(frame/70+i)**2,transform:`translate(${Math.sin(frame/80+i)*7}px,${-((frame/9+i*13)%54)}px)`}}/>)}</div>;
};

const Evidence:React.FC<{shot:Shot}>=({shot})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig();
 const active=Math.min(2,Math.floor(f/(fps*2.65)));
 return <AbsoluteFill className="evidence-layout">
  <div className="evidence-heading"><div className="editorial-eyebrow"><span/>幕后 · AIGC 创作记录</div><h1>把武汉日常，做成一场相遇。</h1><p>生成素材，再编排成可游玩的故事。</p></div>
  <div className="evidence-cards">
   <div className={`evidence-card ${active===0?'active':''}`}><div className="evidence-picture"><Img src={staticFile(shot.src)} /></div><div className="evidence-card-copy"><small>01 / 风格与记忆</small><h2>GPT Image 2</h2><p>角色形象 · 记忆画页 · 宣传关键帧</p></div></div>
   <div className={`evidence-card ${active===1?'active':''}`}><div className="evidence-picture"><OffthreadVideo src={staticFile(shot.secondary!)} muted trimBefore={0}/><span className="evidence-badge">生成片段</span></div><div className="evidence-card-copy"><small>02 / 情绪与镜头</small><h2>Seedance</h2><p>静帧成镜头 · CG 串起街坊的故事</p></div></div>
   <div className={`evidence-card ${active===2?'active':''}`}><div className="audio-evidence"><div className="track-caption"><span>旁白分轨</span><span>VOICE</span></div><div className="wave-track">{(shot.waveform??[]).map((v,i)=><i key={i} style={{height:Math.max(3,v*67),background:i/(shot.waveform?.length??1)<f/(fps*8)?'#ae8445':'#708d7d'}}/>)}</div><div className="track-caption lower"><span>配乐 · 环境声</span><span>MIX</span></div><div className="mix-tracks"><span/><span/><span/></div><div className="audio-note">AI 生成声音 · 分轨剪辑与混音</div></div><div className="evidence-card-copy"><small>03 / 声音与呼吸</small><h2>AI 配音与配乐</h2><p>对白留白 · 环境声 · 旁白侧链</p></div></div>
  </div>
  <div className="evidence-footer"><span>剧情编排与关卡整合 · Three.js 实机</span><span>部分 CG 经 Real-ESRGAN 超分 · 1080P 输出</span></div>
 </AbsoluteFill>;
};

const ShotView:React.FC<{shot:Shot;props:FilmProps}>=({shot,props})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig(),n=Math.round(shot.duration*fps),final=props.kind==='final';
 const source=staticFile(shot.src);
 const annotation=props.annotations?.find(c=>shot.from+f/fps>=c.from&&shot.from+f/fps<c.from+c.duration);
 if(shot.type==='evidence')return <Evidence shot={shot}/>;
 if(shot.type==='game')return <AbsoluteFill className={`game-layout ${final?'final-game':''}`}>
   {final?<div className="final-game-header"><span className="chapter-number">{shot.chapter??'01'}</span><strong>{annotation?.text??shot.title}</strong><span className="header-detail">{annotation?.detail??shot.detail}</span><span className="header-record"><i/>实机录制</span></div>:<div className="game-kicker"><span className="record-dot"/>实机录制<span className="kicker-separator"/>《江城有灯》 · PC Demo</div>}
   <div className="game-window"><OffthreadVideo src={source} trimBefore={Math.round((shot.sourceIn??0)*fps)} playbackRate={shot.playbackRate??1} volume={props.gameAudio?f=>envelope(f,n,.10,.13,fps)*(shot.gameVolume??(final?.35:.95))*duckAt(shot.from+f/fps,props.voice,final?.18:.38):0} style={{width:'100%',height:'100%'}}/></div>
   {!final&&<div className="game-caption"><span className="chapter-number">01</span><span className="game-task">{annotation?.text??shot.title}</span><span className="game-detail">{annotation?.detail??shot.detail}</span></div>}
   {final&&<div className="film-side-rule"/>}
 </AbsoluteFill>;
 if(shot.type==='keyframe')return <AbsoluteFill className="keyframe">
   <Img src={source} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${interpolate(f,[0,n],[1.035,1.005],clamp)})`}}/>
   <div className="closing-shade"/><LightDust/>
   <div className="closing-copy" style={{opacity:interpolate(f,[15,52],[0,1],clamp),transform:`translateY(${interpolate(f,[15,52],[14,0],{...clamp,easing:Easing.out(Easing.cubic)})}px)`}}>
     <div className="editorial-eyebrow"><span/>一座江城 · 一盏为你留着的灯</div>
     {props.logo?<Img className="film-logo" src={staticFile(props.logo)}/>:<h1>江城有灯</h1>}
     <h2>总有人，<br/>替你留一盏灯。</h2><div className="closing-rule"/>
     <p>3D 街区探索 · 环境解谜 · 群像叙事</p><small>{props.kind==='proof'?'30 秒风格样片 · 118 秒完整片方案':'这一趟，不只是送东西。'}</small>
   </div><div className="source-tag">{props.kind==='proof'?'片尾关键帧意向 · Image2':'片尾意象 · GPT Image 2'}</div>
 </AbsoluteFill>;
 return <AbsoluteFill className={`cg-layout ${shot.closing?'cg-closing':''}`}>
   <OffthreadVideo src={source} trimBefore={Math.round((shot.sourceIn??0)*fps)} playbackRate={shot.playbackRate??1} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>
   <div className="cg-shade"/>
   {shot.closing?<><div className="closing-film-shade" style={{opacity:interpolate(f,[100,132],[0,1],clamp)}}/><LightDust/><div className="closing-film-copy" style={{opacity:interpolate(f,[110,135],[0,1],clamp),transform:`translateY(${interpolate(f,[110,135],[12,0],clamp)}px)`}}>
      <div className="editorial-eyebrow"><span/>这一趟，不只是送东西。</div>
      {props.logo&&<Img className="closing-film-logo" src={staticFile(props.logo)}/>}
      <h2>总有人，替你留一盏灯。</h2><p>3D 街区探索 · 环境解谜 · 群像叙事</p><small>《江城有灯》 · 小红花游戏赛道参赛 Demo</small>
    </div></>:<div className="cg-place" style={{opacity:interpolate(f,[10,28],[0,1],clamp)}}><span className="place-line"/><small>湖北 · 武汉</small><strong>{shot.title??'从江风里，回到街坊身边。'}</strong></div>}
   <div className="source-tag">剧情 CG · Seedance</div>
 </AbsoluteFill>;
};

const Subtitle:React.FC<{cue:Cue;onGame:boolean;onEvidence:boolean}>=({cue,onGame,onEvidence})=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig();
 return <div className="subtitle-safe" data-subtitle-text={cue.text} style={{opacity:envelope(f,cue.duration*fps,1/fps,1/fps,fps)}}><div className="subtitle-safe__plate">{cue.who&&<span className="subtitle-safe__speaker">{cue.who}</span>}<span className="subtitle-safe__text">{cue.text}</span></div></div>;
};

export const DemoFilm:React.FC<FilmProps>=(props)=>{
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),time=frame/fps,final=props.kind==='final';
 const current=props.shots.find(s=>time>=s.from&&time<s.from+s.duration),gameShot=current?.type==='game';
 if(props.shots.length===0)return <AbsoluteFill className="missing"><h1>等待录制素材</h1><p>这是空时间线，不是可交付成片。先运行 prepare.mjs 并审核素材。</p></AbsoluteFill>;
 return <AbsoluteFill className={`film-root ${final?'final-film':''}`}>
   {props.shots.map(shot=><Sequence key={shot.id} from={Math.round(shot.from*fps)} durationInFrames={Math.round(shot.duration*fps)} name={shot.id}><ShotView shot={shot} props={props}/></Sequence>)}
   {!final&&<div className={`proof-tag ${gameShot?'on-game':''}`}>视听风格样片 · 非最终参赛片</div>}
   {props.captions.filter(c=>c.presentation!=='title').map((cue,i)=><Sequence key={`caption-${i}`} from={Math.round(cue.from*fps)} durationInFrames={Math.round(cue.duration*fps)} name={`字幕 · ${cue.text}`}><Subtitle cue={cue} onGame={final&&gameShot} onEvidence={current?.type==='evidence'}/></Sequence>)}
   {props.lockedMix&&<Audio src={staticFile(props.lockedMix)} volume={1}/>}
   {!props.lockedMix&&props.voice.map((v,i)=><Sequence key={`voice-${i}`} from={Math.round(v.from*fps)} durationInFrames={Math.ceil(v.duration*fps)} name="旁白"><Audio src={staticFile(v.src)} volume={v.volume??.95}/></Sequence>)}
   {!props.lockedMix&&props.sounds?.map((v,i)=><Sequence key={`sfx-${i}`} from={Math.round(v.from*fps)} durationInFrames={Math.round(v.duration*fps)} name="设计音效"><Audio src={staticFile(v.src)} volume={f=>envelope(f,v.duration*fps,.03,.15,fps)*(v.volume??.4)}/></Sequence>)}
   {!props.lockedMix&&props.music&&<Audio src={staticFile(props.music)} volume={f=>{
    const t=f/fps,fade=envelope(f,props.duration*fps,.8,1.35,fps);
    if(final){const source=props.shots.find(s=>s.type==='game'&&t>=s.from&&t<s.from+s.duration);const voiceFloor=t>=63.5&&t<77.3?.35:.56;return fade*.85*duckAt(t,props.voice,voiceFloor)*(source&&(source.gameVolume??0)>.7?.35:1);}
    let gameBed=1;if(props.gameAudio)for(const s of props.shots.filter(s=>s.type==='game')){const enter=interpolate(t,[s.from-.25,s.from],[0,1],clamp),leave=interpolate(t,[s.from+s.duration,s.from+s.duration+.25],[1,0],clamp);gameBed=Math.min(gameBed,1-Math.min(enter,leave));}return fade*gameBed*.8*duckAt(t,props.voice,.54);
   }}/>} 
   {!props.lockedMix&&props.effects&&props.shots.filter(s=>s.type==='cg').map(s=><Sequence key={`fx-${s.id}`} from={Math.round(s.from*fps)} durationInFrames={Math.round(s.duration*fps)} name="江风环境"><Audio src={staticFile(props.effects!)} trimBefore={Math.round((s.sourceIn??0)*fps)} volume={f=>envelope(f,s.duration*fps,.2,.25,fps)*.20}/></Sequence>)}
 </AbsoluteFill>;
};
