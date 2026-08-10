import * as THREE from 'three';
import { BLOCK, BLOCK_COLORS, BLOCK_PROPERTIES } from './Blocks';
import { getHeight, getTreePositions } from './Noise';
import type { GameEngine } from './Engine';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 32;
export const WATER_LEVEL = 2;

export class Chunk {
    cx: number;
    cz: number;
    data: Uint8Array;
    group: THREE.Group;
    dirty: boolean = true;

    constructor(cx: number, cz: number, seed: number) {
        this.cx = cx;
        this.cz = cz;
        this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
        this.group = new THREE.Group();
        this.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        this.generate(seed);
    }

    private getIndex(x: number, y: number, z: number): number {
        return (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
    }

    getBlock(x: number, y: number, z: number): number {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return BLOCK.AIR;
        return this.data[this.getIndex(x, y, z)];
    }

    setBlock(x: number, y: number, z: number, mat: number) {
        if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
        this.data[this.getIndex(x, y, z)] = mat;
        this.dirty = true;
    }

    private generate(seed: number) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const wx = this.cx * CHUNK_SIZE + lx;
                const wz = this.cz * CHUNK_SIZE + lz;
                const h = getHeight(wx, wz, seed);
                const isWater = (wx * wx + wz * wz) < 20 * 20 && h < WATER_LEVEL;
                const topMat = isWater ? BLOCK.SAND : BLOCK.GRASS;

                for (let ly = 0; ly < Math.min(h, CHUNK_HEIGHT); ly++) {
                    let mat = BLOCK.STONE;
                    if (ly === h - 1) mat = topMat;
                    else if (ly >= h - 2) mat = BLOCK.DIRT;

                    if (isWater && ly <= WATER_LEVEL) mat = BLOCK.SAND;
                    this.setBlock(lx, ly, lz, mat);
                }
            }
        }

        const trees = getTreePositions(this.cx, this.cz, seed, CHUNK_SIZE);
        for (const tree of trees) {
            const lx = tree.x - this.cx * CHUNK_SIZE;
            const lz = tree.z - this.cz * CHUNK_SIZE;
            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
            
            const baseY = getHeight(tree.x, tree.z, seed);
            if (baseY < 1 || baseY >= CHUNK_HEIGHT - 6) continue;

            // Trunk
            for (let i = 0; i < 4; i++) {
                this.setBlock(lx, baseY + i, lz, BLOCK.WOOD);
            }

            // Leaves
            const leafBase = baseY + 3;
            for (let dy = 0; dy < 2; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dz === 0 && dy === 0) continue;
                        const ax = lx + dx;
                        const az = lz + dz;
                        if (ax >= 0 && ax < CHUNK_SIZE && az >= 0 && az < CHUNK_SIZE) {
                            if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && Math.random() > 0.6) continue;
                            this.setBlock(ax, leafBase + dy, az, BLOCK.LEAVES);
                        }
                    }
                }
            }
        }
    }

    rebuildMesh() {
        if (!this.dirty) return;
        
        // Clear existing meshes
        while (this.group.children.length > 0) {
            const child = this.group.children[0] as THREE.InstancedMesh;
            this.group.remove(child);
            child.dispose();
        }

        const voxelsByMat: Record<number, {x: number, y: number, z: number}[]> = {};
        for (let mat in BLOCK_COLORS) voxelsByMat[mat] = [];

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const mat = this.getBlock(lx, ly, lz);
                    if (mat !== BLOCK.AIR && voxelsByMat[mat]) {
                        voxelsByMat[mat].push({ x: lx, y: ly, z: lz });
                    }
                }
            }
        }

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();

        for (const matStr in voxelsByMat) {
            const matId = parseInt(matStr);
            const list = voxelsByMat[matId];
            if (list.length === 0) continue;

            const material = new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[matId] });
            const instancedMesh = new THREE.InstancedMesh(boxGeo, material, list.length);
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;

            list.forEach((v, idx) => {
                position.set(v.x + 0.5, v.y + 0.5, v.z + 0.5);
                matrix.setPosition(position);
                instancedMesh.setMatrixAt(idx, matrix);
            });
            
            this.group.add(instancedMesh);
        }

        this.dirty = false;
    }
}

export class World {
    chunks = new Map<string, Chunk>();
    scene: THREE.Scene;
    seed: number;
    engine: GameEngine;

    constructor(scene: THREE.Scene, seed: number, engine: GameEngine) {
        this.scene = scene;
        this.seed = seed;
        this.engine = engine;
    }

    getChunkKey(cx: number, cz: number) {
        return `${cx},${cz}`;
    }

    updateChunks(playerX: number, playerZ: number, viewDist: number) {
        const cx = Math.floor(playerX / CHUNK_SIZE);
        const cz = Math.floor(playerZ / CHUNK_SIZE);
        const needed = new Set<string>();

        for (let dx = -viewDist; dx <= viewDist; dx++) {
            for (let dz = -viewDist; dz <= viewDist; dz++) {
                // limit bounds for proto
                if (Math.abs(cx + dx) > 8 || Math.abs(cz + dz) > 8) continue;
                
                const key = this.getChunkKey(cx + dx, cz + dz);
                needed.add(key);
                if (!this.chunks.has(key)) {
                    const chunk = new Chunk(cx + dx, cz + dz, this.seed);
                    this.chunks.set(key, chunk);
                    this.scene.add(chunk.group);
                }
            }
        }

        // Unload far chunks
        for (const [key, chunk] of this.chunks.entries()) {
            if (!needed.has(key)) {
                this.scene.remove(chunk.group);
                this.chunks.delete(key);
            }
        }

        // Rebuild dirty
        for (const chunk of this.chunks.values()) {
            if (chunk.dirty) chunk.rebuildMesh();
        }
    }

    getBlock(wx: number, wy: number, wz: number): number {
        if (wy < 0 || wy >= CHUNK_HEIGHT) return BLOCK.AIR;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const chunk = this.chunks.get(this.getChunkKey(cx, cz));
        if (!chunk) return BLOCK.AIR;
        
        const lx = wx - cx * CHUNK_SIZE;
        const lz = wz - cz * CHUNK_SIZE;
        return chunk.getBlock(lx, wy, lz);
    }

    setBlock(wx: number, wy: number, wz: number, mat: number) {
        if (wy < 0 || wy >= CHUNK_HEIGHT) return;
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const chunk = this.chunks.get(this.getChunkKey(cx, cz));
        if (chunk) {
            const lx = wx - cx * CHUNK_SIZE;
            const lz = wz - cz * CHUNK_SIZE;
            chunk.setBlock(lx, wy, lz, mat);
        }
    }

    getHighestBlock(wx: number, wz: number): number {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            if (BLOCK_PROPERTIES[this.getBlock(wx, y, wz)]?.solid) {
                return y;
            }
        }
        return 0;
    }

    // Handles tree chopping cascade
    breakBlock(wx: number, wy: number, wz: number) {
        wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
        const b = this.getBlock(wx, wy, wz);
        if (b === BLOCK.AIR || b === BLOCK.CHEST) return; // Cant break chest or air easily

        this.setBlock(wx, wy, wz, BLOCK.AIR);
        this.engine.spawnItem(wx + 0.5, wy + 0.5, wz + 0.5, b);

        if (b === BLOCK.WOOD || b === BLOCK.LEAVES) {
            // Cascade break upwards (simple flood fill for tree collapse)
            const queue = [{x: wx, y: wy + 1, z: wz}];
            const visited = new Set<string>();
            
            while(queue.length > 0 && visited.size < 100) {
                const curr = queue.shift()!;
                const key = `${curr.x},${curr.y},${curr.z}`;
                if (visited.has(key)) continue;
                visited.add(key);

                const cb = this.getBlock(curr.x, curr.y, curr.z);
                if (cb === BLOCK.WOOD || cb === BLOCK.LEAVES) {
                    this.setBlock(curr.x, curr.y, curr.z, BLOCK.AIR);
                    // Spawn with slight upward/random velocity
                    this.engine.spawnItem(curr.x + 0.5, curr.y + 0.5, curr.z + 0.5, cb, true);

                    // Add neighbors (focusing mostly up)
                    queue.push({x: curr.x, y: curr.y+1, z: curr.z});
                    queue.push({x: curr.x+1, y: curr.y, z: curr.z});
                    queue.push({x: curr.x-1, y: curr.y, z: curr.z});
                    queue.push({x: curr.x, y: curr.y, z: curr.z+1});
                    queue.push({x: curr.x, y: curr.y, z: curr.z-1});
                }
            }
        }
    }
}
