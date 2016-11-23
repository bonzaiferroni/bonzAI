import {Mission} from "./Mission";
export class PaverMission extends Mission {

    pavers: Creep[];
    potency: number;

    constructor(operation) {
        super(operation, "paver");
    }

    initMission() {
        if (!this.hasVision) return; // early

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

    roleCall() {

        let needPaver = this.room && this.room.findStructures(STRUCTURE_ROAD).length > 0;
        let max = 0;
        if (needPaver) {
            max = 1;
        }
        let body = () => { return this.workerBody(this.potency, 3 * this.potency, 2 * this.potency); };
        this.pavers = this.headCount(this.name, body, max, {prespawn: 10} );
    }

    missionActions() {
        for (let paver of this.pavers) {
            this.paverActions(paver);
        }
    }

    finalizeMission() {
    }
    invalidateMissionCache() {
        if (Math.random() < .01) this.memory.potency = undefined;
    }

    private paverActions(paver: Creep) {

        let fleeing = paver.fleeHostiles();
        if (fleeing) return; // early

        let withinRoom = paver.pos.roomName === this.flag.pos.roomName;
        if (!withinRoom) {
            paver.blindMoveTo(this.flag);
            return;
        }

        // I'm in the room
        paver.memory.scavanger = RESOURCE_ENERGY;
        let hasLoad = this.hasLoad(paver);
        if (!hasLoad) {
            this.procureEnergy(paver);
            return;
        }

        // I'm in the room and I have energy
        let findRoad = () => { return _.filter(paver.room.findStructures(STRUCTURE_ROAD),
            (s: Structure) => s.hits < s.hitsMax - 1000)[0] as Structure;
        };
        let forget = (s: Structure) => s.hits === s.hitsMax;
        let target = paver.rememberStructure(findRoad, forget);
        if (!target) {
            let repairing = false;
            if (this.opType === "fort") {
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
            paver.blindMoveTo(target, {maxRooms: 1});
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

    private repairContainers(paver: Creep): boolean {
        let disrepairedContainer = paver.rememberStructure(() => {
            return _(this.room.findStructures(STRUCTURE_CONTAINER))
                .filter((c: StructureContainer) => {return c.hits < c.hitsMax * .9
                    && !c.pos.isNearTo(c.room.find<Mineral>(FIND_MINERALS)[0])})
                .head() as StructureContainer;
        }, (s: Structure) => {
            return s.hits === s.hitsMax;
        });

        if (disrepairedContainer) {
            if (paver.pos.isNearTo(disrepairedContainer)) {
                paver.repair(disrepairedContainer);
                paver.yieldRoad(disrepairedContainer);
            }
            else {
                paver.blindMoveTo(disrepairedContainer);
            }
            return true;
        }
        else {
            return false;
        }
    }
}
