interface ProcureEnergyOptions {
    getFromSpawnRoom?: boolean;
    nextDestination?: {pos: RoomPosition};
    highPriority?: boolean;
    getFromSource?: boolean;
    supply?: (StoreStructure|Creep)[];
}