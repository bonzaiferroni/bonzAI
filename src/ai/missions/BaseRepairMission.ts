import {Mission, MissionMemory} from "./Mission";
import {ControllerOperation} from "../operations/ControllerOperation";
import {Layout} from "../layouts/Layout";
import {Scheduler} from "../../Scheduler";

export class BaseRepairMission extends Mission {

    private layout: Layout;
    private towers: StructureTower[];
    private repairMax: number;
    public memory: BaseRepairMemory;

    constructor(operation: ControllerOperation) {
        super(operation, "repair");
        this.layout = operation.layout;
    }

    protected init() {
        if (!this.memory.rampartOrders) { this.memory.rampartOrders = {}; }
        if (!this.memory.roadOrders) { this.memory.roadOrders = {}; }
        this.repairMax = TOWER_REPAIR_MAX_RAMPART;
        if (this.room.controller.level < 8) {
            this.repairMax = 200000;
        }
        this.initRampartMemory();
    }

    public update() {
        this.towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);
        this.findRepairTargets();
    }

    public roleCall() {
    }

    public actions() {
        if (this.room.hostiles.length > 0) { return; }

        for (let tower of this. towers) {
            this.towerActions(tower);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private towerActions(tower: StructureTower) {
        if (tower.energy < tower.energyCapacity * .6
            && this.spawnGroup.currentSpawnEnergy < this.spawnGroup.maxSpawnEnergy) {
            return;
        }

        if (this.memory.roadOrders[tower.id]) {
            let target = Game.getObjectById<Structure>(this.memory.roadOrders[tower.id]);
            if (target && target.hits < target.hitsMax) {
                tower.repair(target);
                return;
            } else {
                delete this.memory.roadOrders[tower.id];
            }
        }

        if (this.memory.rampartOrders[tower.id]) {
            let target = Game.getObjectById<Structure>(this.memory.rampartOrders[tower.id]);
            if (target && target.hits < this.repairMax) {
                // tower.repair(target);
                return;
            } else {
                delete this.memory.rampartOrders[tower.id];
            }
        }
    }

    private findRepairTargets() {
        if (!this.layout) { return; }
        if (Game.time % 2 === 0) {
            this.findRamparts();
        } else {
            this.findRoads();
        }
    }

    private findRamparts() {
        let rampartPositions = this.layout.map[STRUCTURE_RAMPART];
        if (rampartPositions.length === 0 || this.towers.length === 0) { return; }
        if (this.memory.rampartIndex >= rampartPositions.length) {
            this.memory.rampartIndex = 0;
            this.memory.hitsThreshold = _.round(this.memory.minHits * 1.5);
            this.memory.minHits = TOWER_REPAIR_MAX_RAMPART;
        }
        let position = rampartPositions[this.memory.rampartIndex++];
        let rampart = position.lookForStructure(STRUCTURE_RAMPART);
        if (!rampart) { return; }
        if (rampart.hits < this.memory.minHits) {
            this.memory.minHits = rampart.hits;
        }
        if (rampart.hits > this.memory.hitsThreshold) { return; }
        let towers = rampart.pos.findInRange(this.towers, 5);
        if (!towers) {
            towers = [rampart.pos.findClosestByRange(this.towers)];
        }

        towers.forEach(x => this.memory.rampartOrders[x.id] = rampart.id);
    }

    private initRampartMemory() {
        if (this.memory.rampartIndex !== undefined) { return; }
        this.memory.rampartIndex = 0;
        this.memory.minHits = TOWER_REPAIR_MAX_RAMPART;
        this.memory.hitsThreshold = 100000;
    }

    private findRoads() {
        if (!this.layout.map) { return; }
        let roadPositions = this.layout.map[STRUCTURE_ROAD];
        if (roadPositions.length === 0 || this.towers.length === 0) { return; }
        if (this.memory.roadIndex === undefined || this.memory.roadIndex >= roadPositions.length) {
            this.memory.roadIndex = 0;
        }

        let position = roadPositions[this.memory.roadIndex++];
        let road = position.lookForStructure(STRUCTURE_ROAD);
        if (!road || road.hits > road.hitsMax - 2000) { return; }
        let towers = road.pos.findInRange(this.towers, 5);
        if (!towers) {
            towers = [road.pos.findClosestByRange(this.towers)];
        }

        towers.forEach(x => this.memory.roadOrders[x.id] = road.id);
    }
}

export const TOWER_REPAIR_IDEAL = 5;
export const TOWER_REPAIR_MAX_RAMPART = 50000000;

interface BaseRepairMemory extends MissionMemory {
    roadOrders: {[towerId: string]: string};
    roadIndex: number;
    rampartOrders: {[towerId: string]: string};
    rampartIndex: number;
    hitsThreshold: number;
    minHits: number;
}
