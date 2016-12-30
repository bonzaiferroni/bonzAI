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
            if (mason.memory.hasLoad) {
                mason.memory.hasLoad = false;
                delete mason.memory.extensionId;
            }
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
                }
                else {
                    mason.blindMoveTo(extension);
                }
            }
            else {
                if (mason.name === "vigo5_mason_61") console.log("none");
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

    findFullExtension(mason: Creep): Structure {
        let findExtension = () => {
            let fullExtensions = _.filter(this.room.findStructures<StructureExtension>(STRUCTURE_EXTENSION),
                (e: StructureExtension) => e.energy > 0);
            return mason.pos.findClosestByRange<StructureExtension>(fullExtensions);
        };
        let forgetExtension = (extension: StructureExtension) => extension.energy === 0;
        let extension = mason.rememberStructure<StructureExtension>(findExtension, forgetExtension, "extensionId", true);
        return mason.pos.findClosestByRange([this.room.storage, extension])
    }

    private findMasonPosition(mason: Creep, rampart: StructureRampart) {
        if (mason.pos.lookForStructure(STRUCTURE_ROAD)) {
            let position = rampart.pos;
            if (position.lookFor(LOOK_STRUCTURES).length > 1) {
                let testPosition = mason.pos.findClosestByRange(_.filter(position.openAdjacentSpots(),
                    (p: RoomPosition) => !p.lookForStructure(STRUCTURE_ROAD)));
                if (testPosition) {
                    position = testPosition;
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