import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";

const MIN_RAMPART_HITS = 50000000;

export class MasonMission extends Mission {

    masons: Creep[];
    memory: {
        needMason: boolean
    };

    constructor(operation: Operation) {
        super(operation, "mason");
    }

    initMission() {
        if (!this.memory.needMason) {
            if (this.room.controller.level < 8) {
                this.memory.needMason = false;
            }
            else {
                let lowestRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)).sortBy("hits").head();
                this.memory.needMason = lowestRampart && lowestRampart.hits < MIN_RAMPART_HITS;
            }
        }
    }

    roleCall() {
        let max = 0;
        if (this.memory.needMason) {
            max = 1;
        }
        this.masons = this.headCount("mason", () => this.workerBody(16, 8, 12), max);
    }

    missionActions() {

        for (let mason of this.masons) {
            this.masonActions(mason);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        this.memory.needMason = undefined;
    }

    private masonActions(mason: Creep) {
        let rampart = this.findMasonTarget(mason);
        let range = mason.pos.getRangeTo(rampart);
        if (rampart && range <= 3) {
            mason.repair(rampart);
        }

        if (mason.carry.energy < mason.carryCapacity * .25) {
            mason.memory.hasLoad = false;
        }

        let hasLoad = this.masonHasLoad(mason);
        if (hasLoad) {
            if (rampart) {
                if (range > 3) {
                    mason.blindMoveTo(rampart);
                }
                else {
                    this.findMasonPosition(mason, rampart);
                }
            }
        }
        else {
            let extension = this.findFullExtension(mason);
            if (extension) {
                if (mason.pos.isNearTo(extension)) {
                    mason.withdraw(extension, RESOURCE_ENERGY);
                    delete mason.memory.extensionId;
                }
                else {
                    mason.blindMoveTo(extension);
                }
            }
            else {
                mason.idleOffRoad(this.flag);
            }
        }
    }

    private findMasonTarget(mason: Creep): StructureRampart {
        let findRampart = () => {
            let lowestHits = 100000;
            let lowestRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)).sortBy("hits").head();
            if (lowestRampart) {
                lowestHits = lowestRampart.hits;
            }
            let myRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART))
                .filter((s: StructureRampart) => s.hits < lowestHits + 100000)
                .sortBy((s: StructureRampart) => mason.pos.getRangeTo(s))
                .head();
            if (myRampart) return myRampart;
        };
        let forgetRampart = (s: Structure) => mason.ticksToLive % 500 === 0;
        return mason.rememberStructure<StructureRampart>(findRampart, forgetRampart, "rampartId");
    }

    private findFullExtension(mason: Creep): StructureExtension {
        let findExtension = () => {
            let fullExtensions = _.filter(this.room.findStructures<StructureExtension>(STRUCTURE_EXTENSION),
                (e: StructureExtension) => e.energy > 0);
            return mason.pos.findClosestByRange<StructureExtension>(fullExtensions);
        };
        let forgetExtension = (extension: StructureExtension) => extension.energy === 0;

        return mason.rememberStructure<StructureExtension>(findExtension, forgetExtension, "extensionId");
    }

    private findMasonPosition(mason: Creep, rampart: StructureRampart) {
        if (mason.pos.lookForStructure(STRUCTURE_ROAD)) {
            let position = rampart.pos;
            if (position.lookFor(LOOK_STRUCTURES).length > 1) {
                for (let direction = 1; direction <= 8; direction++) {
                    let testPosition = position.getPositionAtDirection(direction);
                    if (testPosition.isPassible() && !testPosition.lookForStructure(STRUCTURE_ROAD)) {
                        position = testPosition;
                        break;
                    }
                }
            }
            if (!mason.pos.inRangeTo(position, 0)) {
                mason.blindMoveTo(position);
            }
        }
    }

    private masonHasLoad(mason: Creep) {
        if (mason.memory.hasLoad && mason.carry.energy <= mason.carryCapacity * .25) {
            mason.memory.hasLoad = false;
        }
        else if (!mason.memory.hasLoad && mason.carry.energy >= mason.carryCapacity *.9) {
            mason.memory.hasLoad = true;
        }
        return mason.memory.hasLoad;
    }
}