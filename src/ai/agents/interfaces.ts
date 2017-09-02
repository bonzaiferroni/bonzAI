import {Agent} from "./Agent";

export interface ProcureEnergyOptions {
    getFromSpawnRoom?: boolean;
    nextDestination?: (agent: Agent) => {pos: RoomPosition};
    highPriority?: boolean;
    getFromSource?: boolean;
    supply?: (StoreStructure|Creep)[];
}