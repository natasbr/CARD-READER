/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/Engine';
import type { Faction } from './game/Entities';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [faction, setFaction] = useState<Faction | null>(null);
  const [stats, setStats] = useState({ redNPCs: 0, blueNPCs: 0, redStorage: 0, blueStorage: 0, redTribe: false, blueTribe: false });

  useEffect(() => {
    if (!mountRef.current) return;
    const _engine = new GameEngine(mountRef.current);
    _engine.onUpdateUI = setStats;
    setEngine(_engine);
    
    return () => _engine.dispose();
  }, []);

  useEffect(() => {
    if (engine) engine.spawnFaction = faction;
  }, [faction, engine]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black select-none">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />
      
      {/* Top HUD */}
      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur text-white p-4 rounded-xl border border-white/10 pointer-events-none">
        <h1 className="font-bold text-xl text-yellow-400 mb-2">🏝️ Isle of Echoes</h1>
        <p className="text-sm text-gray-300">Left Click: Rotate | Right Click: Pan | Scroll: Zoom</p>
        <p className="text-sm text-gray-300">Select a faction below and click terrain to spawn NPCs!</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm font-medium">
            <div>
                <div className="text-red-400">Red Clan {stats.redTribe && '👑 (Tribe)'}</div>
                <div>NPCs: {stats.redNPCs}</div>
                <div>Storage: {stats.redStorage}</div>
            </div>
            <div>
                <div className="text-blue-400">Blue Clan {stats.blueTribe && '👑 (Tribe)'}</div>
                <div>NPCs: {stats.blueNPCs}</div>
                <div>Storage: {stats.blueStorage}</div>
            </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur p-4 rounded-2xl border border-white/10">
        <button
          onClick={() => setFaction(faction === 'red' ? null : 'red')}
          className={`px-6 py-3 rounded-xl font-bold transition-all ${
            faction === 'red' 
              ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] scale-105' 
              : 'bg-black/50 text-red-400 hover:bg-red-950 border border-red-500/30'
          }`}
        >
          {faction === 'red' ? 'Cancel Spawn' : 'Spawn Red NPC'}
        </button>
        
        <div className="w-px h-12 bg-white/10"></div>

        <button
          onClick={() => setFaction(faction === 'blue' ? null : 'blue')}
          className={`px-6 py-3 rounded-xl font-bold transition-all ${
            faction === 'blue' 
              ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] scale-105' 
              : 'bg-black/50 text-blue-400 hover:bg-blue-950 border border-blue-500/30'
          }`}
        >
          {faction === 'blue' ? 'Cancel Spawn' : 'Spawn Blue NPC'}
        </button>
      </div>
      
      {faction && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xl font-bold pointer-events-none animate-pulse">
              Click on the ground to spawn {faction} NPC
          </div>
      )}
    </div>
  );
}
