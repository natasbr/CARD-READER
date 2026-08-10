export const BLOCK = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    SAND: 6,
    CHEST: 7,
    FIRE: 8,
};

export const BLOCK_COLORS: Record<number, number> = {
    [BLOCK.GRASS]: 0x7cb342,
    [BLOCK.DIRT]: 0x8d6e63,
    [BLOCK.STONE]: 0x9e9e9e,
    [BLOCK.WOOD]: 0x5d4037, // Darker brown
    [BLOCK.LEAVES]: 0x2e7d32,
    [BLOCK.SAND]: 0xf5e6b8,
    [BLOCK.CHEST]: 0xffa000, // Golden/Wood chest
    [BLOCK.FIRE]: 0xff5722, // Orange/Red
};

export const BLOCK_PROPERTIES = {
    [BLOCK.AIR]: { solid: false, breakable: false, flammable: false },
    [BLOCK.GRASS]: { solid: true, breakable: true, flammable: false },
    [BLOCK.DIRT]: { solid: true, breakable: true, flammable: false },
    [BLOCK.STONE]: { solid: true, breakable: true, flammable: false },
    [BLOCK.WOOD]: { solid: true, breakable: true, flammable: true },
    [BLOCK.LEAVES]: { solid: true, breakable: true, flammable: true },
    [BLOCK.SAND]: { solid: true, breakable: true, flammable: false },
    [BLOCK.CHEST]: { solid: true, breakable: false, flammable: false },
    [BLOCK.FIRE]: { solid: false, breakable: true, flammable: false },
};
