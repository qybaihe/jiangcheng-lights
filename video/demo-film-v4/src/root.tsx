import React from 'react';
import {Composition} from 'remotion';
import {DemoFilm, FilmProps} from './film';
import proof from './proof-props.json';
import finalProps from './final-props.json';

const empty: FilmProps = {title:'江城有灯',kind:'proof',duration:30,shots:[],captions:[],voice:[],gameAudio:true};
export const FilmRoot: React.FC = () => <>
  <Composition id="CompetitionDemo" component={DemoFilm} width={1920} height={1080} fps={30} durationInFrames={3540} defaultProps={finalProps as FilmProps} calculateMetadata={({props})=>({durationInFrames:Math.round(props.duration*30)})}/>
</>;
