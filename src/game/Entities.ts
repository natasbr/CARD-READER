import * as THREE from 'three';
import { BLOCK, BLOCK_COLORS } from './Blocks';
import type { World } from './World';
import type { GameEngine } from './Engine';

export class DroppedItem {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    type: number;
    active: boolean = true;

    constructor(x: number, y: number, z: number, type: number, scatter: boolean = false) {
        this.type = type;
        const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mat = new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[type] });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, y, z);
        this.mesh.castShadow = true;
        
        if (scatter) {
            this.velocity = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5);
        } else {
            this.velocity = new THREE.Vector3(0, 2, 0);
        }
    }

    update(dt: number, world: World) {
        if (!this.active) return;
        this.velocity.y -= 15 * dt; // gravity
        this.mesh.position.addScaledVector(this.velocity, dt);
        
        const groundY = world.getHighestBlock(this.mesh.position.x, this.mesh.position.z);
        if (this.mesh.position.y <= groundY + 1.15) { // 1 for block + 0.15 for half mesh height
            this.mesh.position.y = groundY + 1.15;
            this.velocity.set(0,0,0);
            this.mesh.rotation.y += dt; // slight spin when idle
        }
    }
}

export type Faction = 'red' | 'blue';

export class NPC {
    mesh: THREE.Group;
    faction: Faction;
    inventory: number[] = [];
    chestPos: THREE.Vector3 | null = null;
    state: 'INIT' | 'FIND_SPOT' | 'GATHER' | 'COLLECT' | 'BREAK_BLOCK' | 'RETURN' | 'BUILD' | 'COMBAT' = 'INIT';
    target: THREE.Vector3 | null = null;
    health: number = 100;
    hunger: number = 100;
    speed: number = 4.0;

    // Build tracking
    blueprint: THREE.Vector3[] = [];
    buildIndex: number = 0;

    constructor(x: number, y: number, z: number, faction: Faction) {
        this.faction = faction;
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, y, z);
        
        const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.9, 4, 8);
        const bodyMat = new THREE.MeshLambertMaterial({ color: faction === 'red' ? 0xff4444 : 0x4444ff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75; // total height 1.5
        body.castShadow = true;
        
        this.mesh.add(body);
        
        // Face/Eyes direction
        const eyeGeo = new THREE.BoxGeometry(0.2, 0.1, 0.1);
        const eyeMat = new THREE.MeshBasicMaterial({color: 0xffffff});
        const eyes = new THREE.Mesh(eyeGeo, eyeMat);
        eyes.position.set(0, 1.2, 0.3);
        this.mesh.add(eyes);
        
        // 10 initial items (start stash)
        for (let i = 0; i < 10; i++) this.inventory.push(BLOCK.WOOD);
    }

    private moveTowards(dest: THREE.Vector3, dt: number, world: World): boolean {
        const dx = dest.x - this.mesh.position.x;
        const dz = dest.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < 0.5) return true;
        
        const dir = new THREE.Vector3(dx/dist, 0, dz/dist);
        this.mesh.position.addScaledVector(dir, this.speed * dt);
        
        // look at target
        this.mesh.lookAt(this.mesh.position.x + dir.x, this.mesh.position.y, this.mesh.position.z + dir.z);
        
        // snap to ground
        const groundY = world.getHighestBlock(this.mesh.position.x, this.mesh.position.z);
        // smooth climbing
        const targetY = groundY + 1; 
        this.mesh.position.y += (targetY - this.mesh.position.y) * 10 * dt;
        
        return false;
    }

    private generateHouseBlueprint() {
        if (!this.chestPos) return;
        this.blueprint = [];
        // 10x10 outline around chest, 3 high. Door at (0, -5) relative
        for (let x = -5; x <= 4; x++) {
            for (let z = -5; z <= 4; z++) {
                if (x === -5 || x === 4 || z === -5 || z === 4) {
                    const wx = Math.floor(this.chestPos.x + x);
                    const wz = Math.floor(this.chestPos.z + z);
                    const wy = this.chestPos.y;
                    
                    // Door
                    if (x === 0 && z === -5) {
                        this.blueprint.push(new THREE.Vector3(wx, wy + 2, wz)); // only block above door
                        continue;
                    }
                    this.blueprint.push(new THREE.Vector3(wx, wy, wz));
                    this.blueprint.push(new THREE.Vector3(wx, wy + 1, wz));
                    this.blueprint.push(new THREE.Vector3(wx, wy + 2, wz));
                }
            }
        }
        // sort from bottom to top
        this.blueprint.sort((a, b) => a.y - b.y);
    }

    update(dt: number, world: World, engine: GameEngine) {
        if (this.health <= 0) return;
        this.hunger -= dt * 0.1; // Drops over time, scaffolding

        // Combat check (interrupt other tasks)
        if (this.state !== 'COMBAT') {
            const enemy = engine.npcs.find(n => n.faction !== this.faction && n.health > 0 && n.mesh.position.distanceTo(this.mesh.position) < 8);
            if (enemy) {
                this.state = 'COMBAT';
                this.target = enemy.mesh.position;
            }
        }

        switch (this.state) {
            case 'INIT':
                // Find a spot ~10-15 blocks away to build
                const ang = Math.random() * Math.PI * 2;
                const r = 10 + Math.random() * 5;
                this.target = new THREE.Vector3(this.mesh.position.x + Math.cos(ang)*r, 0, this.mesh.position.z + Math.sin(ang)*r);
                this.state = 'FIND_SPOT';
                break;
                
            case 'FIND_SPOT':
                if (this.target && this.moveTowards(this.target, dt, world)) {
                    // Place chest
                    const h = world.getHighestBlock(this.mesh.position.x, this.mesh.position.z);
                    const cx = Math.floor(this.mesh.position.x);
                    const cz = Math.floor(this.mesh.position.z);
                    world.setBlock(cx, h+1, cz, BLOCK.CHEST);
                    this.chestPos = new THREE.Vector3(cx, h+1, cz);
                    this.generateHouseBlueprint();
                    
                    // transfer start stash to "infinite chest storage" (conceptual, just clear inv for now)
                    engine.chestStorage[this.faction] += this.inventory.length;
                    this.inventory = [];
                    
                    this.state = 'BUILD';
                }
                break;

            case 'BUILD':
                if (engine.chestStorage[this.faction] <= 0) {
                    this.state = 'GATHER';
                    break;
                }
                if (this.buildIndex < this.blueprint.length) {
                    const nextB = this.blueprint[this.buildIndex];
                    if (world.getBlock(nextB.x, nextB.y, nextB.z) !== BLOCK.AIR) {
                        this.buildIndex++; // already built or obstructed
                        break;
                    }
                    this.target = nextB.clone();
                    
                    // move close enough to place block
                    const dist = new THREE.Vector2(this.mesh.position.x - this.target.x, this.mesh.position.z - this.target.z).length();
                    if (dist > 3) {
                        this.moveTowards(this.target, dt, world);
                    } else {
                        world.setBlock(this.target.x, this.target.y, this.target.z, BLOCK.WOOD);
                        engine.chestStorage[this.faction]--;
                        this.buildIndex++;
                    }
                } else {
                    // House done, check tribe wall
                    if (engine.tribeToggles[this.faction]) {
                        // find a wall piece to build
                        const wallBp = engine.getTribeWallBlueprint(this.faction);
                        const nextPiece = wallBp.find(pos => world.getBlock(pos.x, pos.y, pos.z) === BLOCK.AIR);
                        if (nextPiece) {
                            if (engine.chestStorage[this.faction] > 0) {
                                this.target = nextPiece;
                                const dist = new THREE.Vector2(this.mesh.position.x - this.target.x, this.mesh.position.z - this.target.z).length();
                                if (dist > 3) {
                                    this.moveTowards(this.target, dt, world);
                                } else {
                                    world.setBlock(this.target.x, this.target.y, this.target.z, BLOCK.STONE);
                                    engine.chestStorage[this.faction]--;
                                }
                            } else {
                                this.state = 'GATHER';
                            }
                        } else {
                            this.state = 'GATHER'; // Nothing to build
                        }
                    } else {
                        this.state = 'GATHER';
                    }
                }
                break;

            case 'GATHER':
                if (this.inventory.length >= 10) {
                    this.state = 'RETURN';
                    break;
                }
                // Prefer dropped items
                const nearestItem = engine.items.find(i => i.active && i.mesh.position.distanceTo(this.mesh.position) < 15);
                if (nearestItem) {
                    this.target = nearestItem.mesh.position;
                    this.state = 'COLLECT';
                } else {
                    // Find tree or grass
                    let found = null;
                    let minD = Infinity;
                    const px = Math.floor(this.mesh.position.x);
                    const pz = Math.floor(this.mesh.position.z);
                    for(let dx = -10; dx <= 10; dx++) {
                        for(let dz = -10; dz <= 10; dz++) {
                            const d = dx*dx + dz*dz;
                            if (d < minD) {
                                const h = world.getHighestBlock(px+dx, pz+dz);
                                const b = world.getBlock(px+dx, h, pz+dz);
                                if (b === BLOCK.WOOD || b === BLOCK.LEAVES || b === BLOCK.GRASS) {
                                    minD = d;
                                    found = new THREE.Vector3(px+dx, h, pz+dz);
                                }
                            }
                        }
                    }
                    if (found) {
                        this.target = found;
                        this.state = 'BREAK_BLOCK';
                    }
                }
                break;

            case 'COLLECT':
                if (this.target) {
                    if (this.moveTowards(this.target, dt, world)) {
                        // find the actual item to remove
                        const item = engine.items.find(i => i.active && i.mesh.position.distanceTo(this.mesh.position) < 1.5);
                        if (item) {
                            item.active = false;
                            engine.scene.remove(item.mesh);
                            this.inventory.push(item.type);
                        }
                        this.state = 'GATHER';
                    }
                } else {
                    this.state = 'GATHER';
                }
                break;

            case 'BREAK_BLOCK':
                if (this.target) {
                    // Check if block still there
                    const b = world.getBlock(this.target.x, this.target.y, this.target.z);
                    if (b === BLOCK.AIR) {
                        this.state = 'GATHER';
                        break;
                    }
                    // Move to within 2 blocks
                    const dist = new THREE.Vector2(this.mesh.position.x - this.target.x, this.mesh.position.z - this.target.z).length();
                    if (dist > 2) {
                        this.moveTowards(this.target, dt, world);
                    } else {
                        // Break it!
                        world.breakBlock(this.target.x, this.target.y, this.target.z);
                        this.state = 'GATHER';
                    }
                } else {
                    this.state = 'GATHER';
                }
                break;

            case 'RETURN':
                if (this.chestPos) {
                    if (this.moveTowards(this.chestPos, dt, world)) {
                        engine.chestStorage[this.faction] += this.inventory.length;
                        this.inventory = [];
                        this.state = 'BUILD';
                    }
                } else {
                    this.state = 'INIT';
                }
                break;

            case 'COMBAT':
                if (this.target) {
                    const enemy = engine.npcs.find(n => n.faction !== this.faction && n.health > 0 && n.mesh.position.distanceTo(this.target!) < 2);
                    if (!enemy) {
                        this.state = 'GATHER';
                        break;
                    }
                    const dist = this.mesh.position.distanceTo(enemy.mesh.position);
                    if (dist > 1.5) {
                        this.moveTowards(enemy.mesh.position, dt, world);
                    } else {
                        // Hit
                        enemy.health -= 25; // 4 hits to kill
                        if (enemy.health <= 0) {
                            this.state = 'GATHER';
                        }
                    }
                } else {
                    this.state = 'GATHER';
                }
                break;
        }
    }
}
