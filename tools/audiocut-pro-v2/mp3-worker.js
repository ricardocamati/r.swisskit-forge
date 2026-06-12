/**
 * AudioCut Pro v2 — MP3 Encoding Web Worker
 * Off-main-thread encoding via lamejs, so large files don't freeze the UI.
 */

importScripts('vendor/lame.min.js');

let encoder = null;
let encState = {
    sampleRate: 0,
    channels: 0,
    blockSize: 1152,
    samplesProcessed: 0,
    totalSamples: 0,
    chunkCount: 0,
    aborted: false,
};

function resetState(sr, ch, total) {
    encoder = new lamejs.Mp3Encoder(ch, sr, 192);
    encState.sampleRate = sr;
    encState.channels = ch;
    encState.samplesProcessed = 0;
    encState.totalSamples = total;
    encState.chunkCount = 0;
    encState.aborted = false;
}

function postProgress(force = false) {
    if (encState.totalSamples === 0) return;
    const pct = Math.min(100, Math.floor((encState.samplesProcessed / encState.totalSamples) * 100));
    // Throttle: only post when pct changes or forced
    if (pct !== encState._lastPct || force) {
        encState._lastPct = pct;
        self.postMessage({ type: 'progress', pct });
    }
}

self.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'cancel') {
        encState.aborted = true;
        return;
    }

    if (msg.type === 'encode') {
        try {
            const { left, right, sampleRate, channels, totalSamples, kbps = 192 } = msg;
            encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
            encState.channels = channels;
            encState.sampleRate = sampleRate;
            encState.samplesProcessed = 0;
            encState.totalSamples = totalSamples;
            encState.chunkCount = 0;
            encState.aborted = false;
            encState._lastPct = -1;

            const chunks = [];
            const blockSize = 1152;

            for (let i = 0; i < totalSamples; i += blockSize) {
                if (encState.aborted) {
                    self.postMessage({ type: 'aborted' });
                    return;
                }
                const len = Math.min(blockSize, totalSamples - i);
                const l = new Int16Array(len);
                const r = new Int16Array(len);
                for (let j = 0; j < len; j++) {
                    l[j] = Math.max(-32768, Math.min(32767, (left[i + j] || 0) * 32767));
                    r[j] = channels > 1 ? Math.max(-32768, Math.min(32767, (right[i + j] || 0) * 32767)) : l[j];
                }
                const mp3buf = encoder.encodeBuffer(l, r);
                if (mp3buf.length > 0) chunks.push(mp3buf);

                encState.samplesProcessed += len;
                encState.chunkCount++;
                // Post progress every ~10 chunks (~11520 samples)
                if (encState.chunkCount % 10 === 0) postProgress();
            }

            const end = encoder.flush();
            if (end.length > 0) chunks.push(end);

            // Concatenate into a single ArrayBuffer (transferable)
            const totalLen = chunks.reduce((a, c) => a + c.length, 0);
            const merged = new Uint8Array(totalLen);
            let off = 0;
            for (const c of chunks) { merged.set(c, off); off += c.length; }

            postProgress(true);
            self.postMessage({ type: 'done', buffer: merged.buffer }, [merged.buffer]);
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message || String(err) });
        }
    }
});
