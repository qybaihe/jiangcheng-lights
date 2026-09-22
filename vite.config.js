import {defineConfig} from 'vite';
export default defineConfig(({mode})=>({build:{
  // Cloud releases stage only the audited runtime asset closure, not all drafts.
  copyPublicDir:mode!=='edgeone',
  sourcemap:false,
  rollupOptions:{output:{manualChunks:{three:['three','three/addons/controls/OrbitControls.js','three/addons/utils/BufferGeometryUtils.js']}}},
  chunkSizeWarningLimit:650,
}}));
