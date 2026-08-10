// Deterministic hash-based noise
function hash(x: number, y: number): number {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >> 13), 1274126177);
    return (h ^ (h >> 16)) & 0x7fffffff;
}

function smoothNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = (hash(ix, iy) & 0xffff) / 65536;
    const b = (hash(ix + 1, iy) & 0xffff) / 65536;
    const c = (hash(ix, iy + 1) & 0xffff) / 65536;
    const d = (hash(ix + 1, iy + 1) & 0xffff) / 65536;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x: number, y: number, octaves: number = 3): number {
    let value = 0, amplitude = 1, frequency = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * smoothNoise(x * frequency, y * frequency);
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value / total;
}

export function getHeight(worldX: number, worldZ: number, seed: number): number {
    const seedOffset = seed * 0.001;
    const h = fbm(worldX * 0.04 + seedOffset, worldZ * 0.04 + seedOffset, 4);
    return Math.floor(h * 12 + 2); // height range ~2..14
}

// LCG random generator based on coordinates and seed
export function getTreePositions(chunkX: number, chunkZ: number, seed: number, chunkSize: number) {
    const positions: { x: number; z: number; y: number }[] = [];
    const resSeed = seed + chunkX * 31 + chunkZ * 71;
    let rng = resSeed;
    const rand = () => {
        rng = (Math.imul(rng, 1664525) + 1013904223) & 0xffffffff;
        return (rng >>> 0) / 4294967296;
    };
    
    const count = Math.floor(rand() * 4) + 2;
    for (let i = 0; i < count; i++) {
        const lx = Math.floor(rand() * (chunkSize - 2)) + 1;
        const lz = Math.floor(rand() * (chunkSize - 2)) + 1;
        const worldX = chunkX * chunkSize + lx;
        const worldZ = chunkZ * chunkSize + lz;
        const height = getHeight(worldX, worldZ, seed);
        positions.push({ x: worldX, z: worldZ, y: height });
    }
    return positions;
}
