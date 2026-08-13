import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:4173/?e2e=1&seed=4242');
await page.waitForFunction(() => window.__ui && window.__ui.ready);
console.log(JSON.stringify(await page.evaluate(async () => {
  const N=160, g=window.__game, c=document.getElementById('gl');
  const gl=c.getContext('webgl2')||c.getContext('webgl');
  const grab=()=>{const buf=new Uint8Array(N*N*4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.readPixels(Math.round(c.width/2-N/2),Math.round(c.height/2-N/2),N,N,gl.RGBA,gl.UNSIGNED_BYTE,buf);return buf;};
  const sat=(b)=>{let s=0,w=0;for(let i=0;i<N*N;i++){const r=b[i*4],g2=b[i*4+1],bl=b[i*4+2];
    const mx=Math.max(r,g2,bl),mn=Math.min(r,g2,bl); if(mx<50)continue; s+=(mx-mn)/mx;w++;} return w?s/w:0;};
  g.tap(0,0); for(let i=0;i<70;i++)g.update(1/60);
  await window.__ui.settle(3); const clear = sat(grab());
  for(let i=0;i<400;i++)g.turn(0.06,1/60); g.ringVel=0;
  const sats=[],deltas=[]; let prev=null;
  for(let k=0;k<=12;k++){ g.ringAngle=(k/12)*Math.PI; g.update(1/60); await window.__ui.settle(2);
    const buf=grab(); sats.push(+sat(buf).toFixed(3));
    if(prev){let d=0;for(let i=0;i<N*N;i++)d+=Math.abs(buf[i*4]-prev[i*4])+Math.abs(buf[i*4+1]-prev[i*4+1])+Math.abs(buf[i*4+2]-prev[i*4+2]);
      deltas.push(+(d/(N*N*3)).toFixed(1));}
    prev=buf; }
  return { clear:+clear.toFixed(3), sats, deltas };
})));
await b.close();
