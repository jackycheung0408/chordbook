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
  // 低音（50–250Hz）另外記一份，通常就是和弦根音
  const binPc = new Int8Array(N / 2).fill(-1), binBass = new Uint8Array(N / 2);
  for (let k = 1; k < N / 2; k++) {
    const f = k * SR / N;
    if (f >= 50 && f <= 2000) binPc[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
    if (f >= 50 && f <= 250) binBass[k] = 1;
  }
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));

  async function chroma(data, onProgress) {
    const frames = Math.max(0, Math.floor((data.length - N) / HOP) + 1);
    const C = new Float32Array(frames * 12), B = new Float32Array(frames * 12), E = new Float32Array(frames);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP; let e = 0;
      for (let i = 0; i < N; i++) { const v = data[o + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      E[f] = Math.sqrt(e / N);
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const pc = binPc[k]; if (pc < 0) continue;
        const m = Math.sqrt(Math.hypot(re[k], im[k]));
        C[f * 12 + pc] += m;
        if (binBass[k]) B[f * 12 + pc] += m;
      }
      if (f % 200 === 0) { onProgress?.(f / frames); await new Promise(r => setTimeout(r)); }
    }
    return { C, B, E, frames, frameSec: HOP / SR };
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
      // 樣板含泛音：每個音的第 2–6 泛音落在 同音、五度、同音、大三度、五度
      const t = new Array(12).fill(0);
      iv.forEach(x => [[0, 1], [0, .6], [7, .36], [0, .22], [4, .13], [7, .08]].forEach(([o, w]) => { t[(r + x + o) % 12] += w; }));
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
      const v = new Array(12).fill(0), bass = new Array(12).fill(0); let e = 0;
      for (let f = a; f < b; f++) { e += E[f]; for (let i = 0; i < 12; i++) { v[i] += C[f * 12 + i]; bass[i] += an.B[f * 12 + i]; } }
      const bassPc = bass.indexOf(Math.max(...bass)), bassStrong = Math.max(...bass) > 1.5 * (bass.reduce((s, x) => s + x, 0) / 12);
      e /= Math.max(1, b - a);
      if (e < maxE * 0.06) { out.push({ t: t0, name: null, conf: 0 }); continue; }
      const mean = v.reduce((s, x) => s + x, 0) / 12;
      const w = v.map(x => Math.max(0, x - mean)); const n = Math.hypot(...w) || 1;
      const raw = TEMPL.map(T => {
        let s = 0; for (let i = 0; i < 12; i++) s += T.t[i] * w[i] / n;
        const d = ((T.root - opt.keyMajor) % 12 + 12) % 12;
        if (DIA_MAJ[d] === T.q) s += 0.04; // 調內和弦稍微加分
        if (bassStrong && T.root === bassPc) s += 0.08; // 低音是根音
        return { T, s };
      });
      const scores = raw.slice().sort((x, y) => y.s - x.s);
      out.push({ t: t0, root: scores[0].T.root, q: scores[0].T.q, conf: scores[0].s - scores[1].s, sc: Float32Array.from(raw, x => x.s) });
    }
    // 去掉頭尾的安靜段
    while (out.length && out[0].root === undefined) out.shift();
    while (out.length && out[out.length - 1].root === undefined) out.pop();
    return out;
  }

  // 速度：用音量起伏（onset）做自相關，找 70–180 BPM 中最明顯的週期
  function estimateTempo(data) {
    const hop = 256, frames = Math.floor(data.length / hop), env = new Float32Array(frames);
    let prev = 0;
    for (let f = 0; f < frames; f++) {
      let e = 0; for (let i = 0; i < hop; i++) { const v = data[f * hop + i]; e += v * v; }
      e = Math.log1p(1000 * e); env[f] = Math.max(0, e - prev); prev = e;
    }
    const fps = SR / hop; let best = 0, bestBpm = 0;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) {
      const lag = fps * 60 / bpm, l0 = Math.floor(lag), fr = lag - l0; let s = 0;
      for (let f = 0; f + l0 + 1 < frames; f++) s += env[f] * (env[f + l0] * (1 - fr) + env[f + l0 + 1] * fr);
      s *= Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2); // 稍微偏好常見速度
      if (s > best) { best = s; bestBpm = bpm; }
    }
    return Math.round(bestBpm);
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
    an.bpm = estimateTempo(data);
    return an;
  }

  // 用辨識出的和弦決定調性：哪個大調能涵蓋最多和弦，主和弦出現多、開頭結尾是主和弦再加分
  function keyFromChords(res) {
    const ch = res.filter(r => r.root !== undefined);
    if (!ch.length) return null;
    let best = null;
    for (let k = 0; k < 12; k++) {
      let s = 0, tonic = 0, rel = 0;
      ch.forEach(r => { const d = ((r.root - k) % 12 + 12) % 12; if (DIA_MAJ[d] === r.q) s++; if (d === 0 && r.q === '') tonic++; if (d === 9 && r.q === 'm') rel++; });
      const ends = [ch[0], ch[ch.length - 1]];
      const endT = ends.filter(r => r.root === k && r.q === '').length, endR = ends.filter(r => r.root === (k + 9) % 12 && r.q === 'm').length;
      const score = s + 0.3 * (tonic + rel) + endT + endR;
      if (!best || score > best.score) best = { score, major: k, tonic: k, minor: false, tonicN: tonic, relN: rel, endT, endR };
    }
    if (best.relN + best.endR > best.tonicN + best.endT) { best.minor = true; best.tonic = (best.major + 9) % 12; }
    return best;
  }

  // 平滑：用 Viterbi 找「整體最合理、不會一直換」的和弦序列。penalty 越大越少換和弦，outPen 是調外和弦的額外成本
  function smooth(res, { penalty = 0.12, outPen = 0.06, keyMajor = 0 } = {}) {
    const idx = res.map((r, i) => r.sc ? i : -1).filter(i => i >= 0);
    if (!idx.length) return res;
    const S = TEMPL.length, back = [];
    const local = (r, k) => { const T = TEMPL[k], d = ((T.root - keyMajor) % 12 + 12) % 12; return -r.sc[k] + (DIA_MAJ[d] === T.q ? 0 : outPen); };
    let cost = new Float64Array(S);
    idx.forEach((i, n) => {
      const r = res[i], nc = new Float64Array(S), bp = new Uint8Array(S);
      let pMin = Infinity, pArg = 0;
      if (n) for (let j = 0; j < S; j++) if (cost[j] < pMin) { pMin = cost[j]; pArg = j; }
      for (let k = 0; k < S; k++) {
        if (!n) { nc[k] = local(r, k); continue; }
        const stay = cost[k], move = pMin + penalty;
        if (stay <= move) { nc[k] = stay + local(r, k); bp[k] = k; } else { nc[k] = move + local(r, k); bp[k] = pArg; }
      }
      cost = nc; back.push(bp);
    });
    let k = 0; for (let j = 1; j < S; j++) if (cost[j] < cost[k]) k = j;
    const out = res.map(r => ({ ...r }));
    for (let n = idx.length - 1; n >= 0; n--) { out[idx[n]].root = TEMPL[k].root; out[idx[n]].q = TEMPL[k].q; if (n) k = back[n][k]; }
    return out;
  }

  window.ChordDetect = { analyze, group, keyFromChords, smooth };
})();
