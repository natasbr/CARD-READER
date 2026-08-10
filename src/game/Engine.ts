import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World, WATER_LEVEL } from './World';
import { NPC, DroppedItem, Faction } from './Entities';
import { BLOCK } from './Blocks';

export class GameEngine {
    container: HTMLElement;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    
    world: World;
    npcs: NPC[] = [];
    items: DroppedItem[] = [];
    
    // Globals
    sunLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    timeOfDay: number = 0;
    prevTime: number = 0;
    animationId: number = 0;

    chestStorage: Record<Faction, number> = { red: 0, blue: 0 };
    tribeToggles: Record<Faction, boolean> = { red: false, blue: false };

    // Hover marker
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    marker: THREE.Mesh;

    // React comms
    spawnFaction: Faction | null = null;
    onUpdateUI: ((data: any) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

        this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
        this.camera.position.set(8, 20, 14);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 5, 0);
        this.controls.enableDamping = true;
        
        // Lights
        this.ambientLight = new THREE.AmbientLight(0x404060, 0.3);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 150;
        this.sunLight.shadow.camera.left = -40;
        this.sunLight.shadow.camera.right = 40;
        this.sunLight.shadow.camera.top = 40;
        this.sunLight.shadow.camera.bottom = -40;
        this.sunLight.shadow.mapSize.width = 1024;
        this.sunLight.shadow.mapSize.height = 1024;
        this.scene.add(this.sunLight);

        this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x3a5f0b, 0.4));

        // World setup
        this.world = new World(this.scene, 42, this);
        this.world.updateChunks(0, 0, 4);

        // Water plane
        const waterGeo = new THREE.PlaneGeometry(400, 400);
        const waterMat = new THREE.MeshLambertMaterial({ color: 0x2a6f8f, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_LEVEL + 0.1;
        water.receiveShadow = true;
        this.scene.add(water);

        // Marker
        const markerGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        this.marker = new THREE.Mesh(markerGeo, markerMat);
        this.marker.visible = false;
        this.scene.add(this.marker);

        // Events
        window.addEventListener('resize', this.onResize);
        container.addEventListener('mousemove', this.onMouseMove);
        container.addEventListener('click', this.onClick);

        this.prevTime = performance.now();
        this.loop();
    }

    onResize = () => {
        if (!this.container) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    onMouseMove = (e: MouseEvent) => {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    onClick = () => {
        if (!this.marker.visible || !this.spawnFaction) return;
        const x = this.marker.position.x - 0.5;
        const y = this.marker.position.y + 0.5;
        const z = this.marker.position.z - 0.5;
        
        const npc = new NPC(x, y + 1, z, this.spawnFaction);
        this.npcs.push(npc);
        this.scene.add(npc.mesh);
    }

    spawnItem(x: number, y: number, z: number, type: number, scatter: boolean = false) {
        const item = new DroppedItem(x, y, z, type, scatter);
        this.items.push(item);
        this.scene.add(item.mesh);
    }

    getTribeWallBlueprint(faction: Faction): THREE.Vector3[] {
        const members = this.npcs.filter(n => n.faction === faction && n.chestPos);
        if (members.length === 0) return [];
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        members.forEach(m => {
            minX = Math.min(minX, m.chestPos!.x);
            maxX = Math.max(maxX, m.chestPos!.x);
            minZ = Math.min(minZ, m.chestPos!.z);
            maxZ = Math.max(maxZ, m.chestPos!.z);
        });

        const pad = 6;
        minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
        const bp = [];
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (x === minX || x === maxX || z === minZ || z === maxZ) {
                    const h = this.world.getHighestBlock(x, z);
                    for(let y=0; y<3; y++) {
                        bp.push(new THREE.Vector3(x, h+1+y, z));
                    }
                }
            }
        }
        return bp;
    }

    updateDayNight(dt: number) {
        const dayLength = 120;
        this.timeOfDay += dt / dayLength;
        if (this.timeOfDay > 1) this.timeOfDay -= 1;
        
        const angle = this.timeOfDay * Math.PI * 2;
        const sunHeight = Math.sin(angle);
        const radius = 60;
        this.sunLight.position.set(radius * Math.cos(angle), Math.max(radius * sunHeight, 5), radius * Math.cos(angle) * 0.5);
        
        const intensity = Math.max(0, Math.min(1, (sunHeight + 0.3) / 1.3));
        this.sunLight.intensity = intensity * 1.2;
        this.ambientLight.intensity = 0.2 + intensity * 0.3;
        
        const bgColor = new THREE.Color(0x87CEEB).lerp(new THREE.Color(0x050515), Math.max(0, 1 - intensity * 1.5));
        this.scene.background = bgColor;
        this.scene.fog!.color.copy(bgColor);
    }

    loop = () => {
        this.animationId = requestAnimationFrame(this.loop);
        const now = performance.now();
        const dt = Math.min((now - this.prevTime) / 1000, 0.05);
        this.prevTime = now;

        this.controls.update();
        this.updateDayNight(dt);

        // Update world relative to camera
        this.world.updateChunks(this.camera.position.x, this.camera.position.z, 3);

        // Marker raycast
        this.raycaster.setFromCamera(this.mouse, this.camera);
        let intersection = null;
        for (const chunk of this.world.chunks.values()) {
            const intersects = this.raycaster.intersectObject(chunk.group, true);
            if (intersects.length > 0 && (!intersection || intersects[0].distance < intersection.distance)) {
                intersection = intersects[0];
            }
        }

        if (intersection && this.spawnFaction) {
            this.marker.visible = true;
            const pt = intersection.point.add(intersection.face!.normal.clone().multiplyScalar(0.1));
            this.marker.position.set(Math.floor(pt.x) + 0.5, Math.floor(pt.y) + 0.5, Math.floor(pt.z) + 0.5);
        } else {
            this.marker.visible = false;
        }

        // Entities
        this.items.forEach(i => i.update(dt, this.world));
        this.items = this.items.filter(i => i.active);

        // Tribe check
        (['red', 'blue'] as Faction[]).forEach(fac => {
            const count = this.npcs.filter(n => n.faction === fac && n.health > 0).length;
            if (count >= 10 && !this.tribeToggles[fac]) {
                this.tribeToggles[fac] = true;
            }
        });

        // NPCs
        for(let i=this.npcs.length-1; i>=0; i--) {
            const n = this.npcs[i];
            if (n.health <= 0) {
                this.scene.remove(n.mesh);
                this.npcs.splice(i, 1);
                // Drop all items on death
                n.inventory.forEach(type => {
                    this.spawnItem(n.mesh.position.x, n.mesh.position.y, n.mesh.position.z, type, true);
                });
            } else {
                n.update(dt, this.world, this);
            }
        }
        
        if (this.onUpdateUI) {
            this.onUpdateUI({
                redNPCs: this.npcs.filter(n => n.faction==='red').length,
                blueNPCs: this.npcs.filter(n => n.faction==='blue').length,
                redStorage: this.chestStorage.red,
                blueStorage: this.chestStorage.blue,
                redTribe: this.tribeToggles.red,
                blueTribe: this.tribeToggles.blue,
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.container.removeEventListener('mousemove', this.onMouseMove);
        this.container.removeEventListener('click', this.onClick);
        this.renderer.dispose();
    }
}
