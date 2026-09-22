import * as THREE from 'three';

const canvases = new Map(), maps = new Map();
// Broad, hand-laid shapes keep the street legible at eye level. The original
// facade illustrations still provide shopfronts, signs and period joinery.
export function paintedSurface(name, source) {
  if (!source || typeof document === 'undefined') return source;
  const key = `${name}:${source.repeat.x}:${source.repeat.y}`;
  if (maps.has(key)) return maps.get(key);
  let canvas = canvases.get(name);
  if (!canvas) {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const g = canvas.getContext('2d');
    let seed = 214;
    const rand = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    const palettes = {
      brick: ['#c08b6b', '#c89574', '#cb9978', '#bf896b'],
      paving: ['#cad1c3', '#d1d6c8', '#d3d9cb', '#c6cebf'],
      roof: ['#637e79', '#6b8680', '#708983', '#5f7a74'],
    };
    const palette = palettes[name];
    if (palette) {
      g.fillStyle = name === 'brick' ? '#debea0' : name === 'roof' ? '#4c6663' : '#b1c1b3';
      g.fillRect(0, 0, 512, 512);
      const width = name === 'brick' ? 128 : name === 'roof' ? 64 : 128;
      const height = name === 'brick' ? 64 : 128;
      for (let y = 0; y < 512; y += height) for (let x = -width; x < 512; x += width) {
        const xx = x + (Math.floor(y / height) % 2) * width / 2;
        g.fillStyle = palette[Math.floor(rand() * palette.length)];
        g.beginPath();g.roundRect(xx + 2, y + 2, width - 4, height - 4, name === 'paving' ? 5 : 2);g.fill();
        g.fillStyle = '#ffffec16';g.fillRect(xx + 7, y + 5, width - 14, 3);
      }
    } else {
      const colors = {plaster:'#f0e6ce', wood:'#d0b184', 'painted-wood':'#98b6a2', iron:'#a3b8af', fabric:'#f0ecd8'};
      g.fillStyle = colors[name] ?? '#e5dbc0';g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 35; i++) {
        g.fillStyle = i % 2 ? '#ffffff0b' : '#725c4006';
        if (name.includes('wood')) g.fillRect(rand()*512, 0, 2+rand()*4, 512);
        else g.fillRect(rand()*512, rand()*512, 25+rand()*70, 15+rand()*40);
      }
    }
    canvases.set(name, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `Painted ${name}`;texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.copy(source.repeat);texture.offset.copy(source.offset);texture.anisotropy = 4;
  maps.set(key, texture);return texture;
}
