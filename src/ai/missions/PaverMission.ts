import {Mission} from "./Mission";
import {Agent} from "../agents/Agent";
export class PaverMission extends Mission {

    private pavers: Agent[];
    private potency: number;

    constructor(operation, allowSpawn: boolean) {
        super(operation, "paver");
        this.allowSpawn = allowSpawn;
    }

    public init() {
        if (!this.hasVision) { return; }

        if (!this.memory.potency) {
            let roads = this.room.findStructures(STRUCTURE_ROAD) as StructureRoad[];
            let sum = 0;
            for (let road of roads) {
                sum += road.hitsMax;
            }
            this.memory.potency = Math.max(Math.ceil(sum / 500000), 1);
        }
        this.potency = this.memory.potency;
    }

    public refresh() {
    }

    public roleCall() {

        let max = () => this.room && this.room.findStructures(STRUCTURE_ROAD).length > 0 ? 1 : 0;
        let body = () => {
            if (this.spawnGroup.maxSpawnEnergy <= 550) {
                return this.bodyRatio(1, 3, 1, 1);
            } else {
                return this.workerBody(this.potency, 3 * this.potency, 2 * this.potency);
            }
        };
        this.pavers = this.headCount(this.name, body, max, {prespawn: 10} );
    }

    public actions() {
        for (let paver of this.pavers) {
            this.deprecatedPaverActions(paver);
        }
    }

    public finalize() {
    }
    public invalidateCache() {
        if (Math.random() < .01) { this.memory.potency = undefined; }
    }

    private deprecatedPaverActions(paver: Agent) {

        let fleeing = paver.fleeHostiles(4);
        if (fleeing) { return; } // early

        let withinRoom = paver.pos.roomName === this.flag.pos.roomName;
        if (!withinRoom) {
            paver.travelTo(this.flag);
            return;
        }

        // I'm in the missionRoom
        paver.memory.scavanger = RESOURCE_ENERGY;
        let hasLoad = paver.hasLoad();
        if (!hasLoad) {
            paver.procureEnergy();
            return;
        }

        // I'm in the missionRoom and I have energy
        let findRoad = () => { return _.filter(paver.room.findStructures(STRUCTURE_ROAD),
            (s: Structure) => s.hits < s.hitsMax - 1000)[0] as Structure;
        };
        let forget = (s: Structure) => s.hits === s.hitsMax;
        let target = paver.rememberStructure(findRoad, forget);
        if (!target) {
            let repairing = false;
            if (this.room.controller && this.room.controller.my) {
                repairing = this.repairContainers(paver);
            }
            if (!repairing) {
                paver.memory.hasLoad = paver.carry.energy === paver.carryCapacity;
                paver.idleOffRoad(this.flag);
            }
            return;
        }

        // and I have a target
        let range = paver.pos.getRangeTo(target);
        if (range > 3) {
            paver.travelTo(target);
            // repair any damaged road i'm standing on
            let road = paver.pos.lookForStructure(STRUCTURE_ROAD);
            if (road && road.hits < road.hitsMax - 100) {
                paver.repair(road);
            }
            return;
        }

        // and i'm in range
        paver.repair(target);
        paver.yieldRoad(target);
    }

    private repairContainers(paver: Agent): boolean {
        let disrepairedContainer = paver.rememberStructure(() => {
            return _(this.room.findStructures(STRUCTURE_CONTAINER))
                .filter((c: StructureContainer) => { return c.hits < c.hitsMax * .5
                    && !c.pos.isNearTo(c.room.find<Mineral>(FIND_MINERALS)[0]); })
                .head() as StructureContainer;
        }, (s: Structure) => {
            return s.hits === s.hitsMax;
        });

        if (disrepairedContainer) {
            if (paver.pos.isNearTo(disrepairedContainer)) {
                paver.repair(disrepairedContainer);
                paver.yieldRoad(disrepairedContainer);
            } else {
                paver.travelTo(disrepairedContainer);
            }
            return true;
        } else {
            return false;
        }
    }
}
