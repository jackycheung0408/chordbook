// 從錄音抓和弦：在瀏覽器裡分析（不上傳），算出每小節最可能的大三／小三和弦與調性。
// 流程：解碼 → 轉單聲道 11025Hz → FFT → 12 音級能量（chroma）→ 依小節彙整 → 跟和弦樣板比對。
(function () {
  const SR = 11025, N = 4096, HOP = 1024;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  async function toMono(arrayBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(arrayBuffer);
    ctx.close?.();
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * SR), SR);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return { data: out.getChannelData(0), duration: buf.duration };
  }

  // 每個 FFT bin 對應到哪個音級（只用 65–2000Hz，避開低頻轟鳴與高頻泛音）
  const binPc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) {
    const f = k * SR / N;
    if (f >= 65 && f <= 2000) binPc[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
  }
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));

  async function chroma(data, onProgress) {
    const frames = Math.max(0, Math.floor((data.length - N) / HOP) + 1);
    const C = new Float32Array(frames * 12), E = new Float32Array(frames);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP; let e = 0;
      for (let i = 0; i < N; i++) { const v = data[o + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      E[f] = Math.sqrt(e / N);
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const pc = binPc[k]; if (pc < 0) continue;
        C[f * 12 + pc] += Math.log1p(100 * Math.hypot(re[k], im[k]));
      }
      if (f % 200 === 0) { onProgress?.(f / frames); await new Promise(r => setTimeout(r)); }
    }
    return { C, E, frames, frameSec: HOP / SR };
  }

  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) {
    const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(da * db || 1);
  }
  // 調性（Krumhansl–Schmuckler）
  function detectKey(total) {
    let best = { score: -2 };
    for (let r = 0; r < 12; r++) {
      const rot = i => total[(i + r) % 12];
      const t = Array.from({ length: 12 }, (_, i) => rot(i));
      const sM = corr(t, MAJ), sm = corr(t, MIN);
      if (sM > best.score) best = { score: sM, tonic: r, minor: false };
      if (sm > best.score) best = { score: sm, tonic: r, minor: true };
    }
    best.major = best.minor ? (best.tonic + 3) % 12 : best.tonic; // 小調換成關係大調，給「原調」用
    return best;
  }

  const TEMPL = [];
  for (let r = 0; r < 12; r++) {
    for (const [q, iv] of [['', [0, 4, 7]], ['m', [0, 3, 7]]]) {
      const t = new Array(12).fill(0); t[r] = 1; t[(r + iv[1]) % 12] = 0.8; t[(r + iv[2]) % 12] = 0.9;
      const n = Math.hypot(...t); TEMPL.push({ root: r, q, t: t.map(x => x / n) });
    }
  }
  const DIA_MAJ = { 0: '', 2: 'm', 4: 'm', 5: '', 7: '', 9: 'm' };

  // 依小節彙整並辨識
  function group(an, opt) {
    const { C, E, frames, frameSec } = an, seg = opt.segSec, start = opt.offset;
    const maxE = E.reduce((m, x) => Math.max(m, x), 0) || 1;
    const out = [];
    for (let t0 = start; t0 < an.duration - seg * 0.25; t0 += seg) {
      const a = Math.max(0, Math.floor(t0 / frameSec)), b = Math.min(frames, Math.floor((t0 + seg) / frameSec));
      const v = new Array(12).fill(0); let e = 0;
      for (let f = a; f < b; f++) { e += E[f]; for (let i = 0; i < 12; i++) v[i] += C[f * 12 + i]; }
      e /= Math.max(1, b - a);
      if (e < maxE * 0.06) { out.push({ t: t0, name: null, conf: 0 }); continue; }
      const mean = v.reduce((s, x) => s + x, 0) / 12;
      const w = v.map(x => Math.max(0, x - mean)); const n = Math.hypot(...w) || 1;
      const scores = TEMPL.map(T => {
        let s = 0; for (let i = 0; i < 12; i++) s += T.t[i] * w[i] / n;
        const d = ((T.root - opt.keyMajor) % 12 + 12) % 12;
        if (DIA_MAJ[d] === T.q) s += 0.04; // 調內和弦稍微加分
        return { T, s };
      }).sort((x, y) => y.s - x.s);
      out.push({ t: t0, root: scores[0].T.root, q: scores[0].T.q, conf: scores[0].s - scores[1].s });
    }
    // 去掉頭尾的安靜段
    while (out.length && out[0].root === undefined) out.shift();
    while (out.length && out[out.length - 1].root === undefined) out.pop();
    return out;
  }

  async function analyze(arrayBuffer, onProgress) {
    onProgress?.(0, '解碼音訊…');
    const { data, duration } = await toMono(arrayBuffer);
    const an = await chroma(data, p => onProgress?.(p, '分析中…'));
    an.duration = duration;
    const total = new Array(12).fill(0);
    for (let f = 0; f < an.frames; f++) for (let i = 0; i < 12; i++) total[i] += an.C[f * 12 + i] * an.E[f];
    an.key = detectKey(total);
    const maxE = an.E.reduce((m, x) => Math.max(m, x), 0);
    let first = 0; while (first < an.frames && an.E[first] < maxE * 0.12) first++;
    an.firstSound = first * an.frameSec;
    return an;
  }

  window.ChordDetect = { analyze, group };
})();
