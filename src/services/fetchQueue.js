// src/services/fetchQueue.js
// Hàng đợi fetch với concurrency limit + retry tự động

const MAX_CONCURRENT = 4;   // tối đa 4 request cùng lúc
const MAX_RETRIES = 2;      // retry 2 lần khi fail
const RETRY_DELAY_MS = 1000; // delay giữa các lần retry (nhân đôi mỗi lần)

let running = 0;
const queue = [];

function next() {
    while (running < MAX_CONCURRENT && queue.length > 0) {
        const { resolve, reject, url, options, retries } = queue.shift();
        running++;
        doFetch(url, options, retries)
            .then(resolve)
            .catch(reject)
            .finally(() => { running--; next(); });
    }
}

async function doFetch(url, options, retriesLeft) {
    try {
        const res = await fetch(url, options);
        if (!res.ok && res.status === 429 && retriesLeft > 0) {
            // Rate limited → chờ rồi retry
            await delay(RETRY_DELAY_MS * (MAX_RETRIES - retriesLeft + 1));
            return doFetch(url, options, retriesLeft - 1);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res;
    } catch (e) {
        if (retriesLeft > 0) {
            await delay(RETRY_DELAY_MS * (MAX_RETRIES - retriesLeft + 1));
            return doFetch(url, options, retriesLeft - 1);
        }
        throw e;
    }
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Drop-in replacement cho fetch() với:
 * - Tối đa MAX_CONCURRENT requests cùng lúc
 * - Tự động retry MAX_RETRIES lần khi fail/rate-limit
 */
export function queuedFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        queue.push({ resolve, reject, url, options, retries: MAX_RETRIES });
        next();
    });
}
