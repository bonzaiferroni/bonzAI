import {Guru} from "./Guru";
import {MasonMission} from "./MasonMission";
import {MasonAgent} from "./MasonAgent";
import {DefenseGuru} from "../operations/DefenseGuru";

const SANDBAG_THRESHOLD = 1000000;

export class MasonGuru extends Guru {

    _sandbags: RoomPosition[];
    defenseGuru: DefenseGuru;

    memory: {
        needMason: boolean;
        sandbags: string;
    };

    constructor(mission: MasonMission, defenseGuru: DefenseGuru) {
        super(mission);
        this.defenseGuru = defenseGuru;
    }

    get sandbags(): RoomPosition[] {
        if (!this._sandbags) {
            if (!this.memory.sandbags) {
                let sandbags = this.findSandbags();
                this.memory.sandbags = Guru.serializePositions(sandbags);
            }
            this._sandbags = Guru.deserializePositions(this.memory.sandbags, this.room.name);
        }
        return this._sandbags;
    }

    get needMason() {
        if (!this.memory.needMason) {
            if (this.room.controller.level < 8) {
                this.memory.needMason = false;
            }
            else {
                const MIN_RAMPART_HITS = 50000000;
                let lowestRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)).sortBy("hits").head();
                this.memory.needMason = lowestRampart && lowestRampart.hits < MIN_RAMPART_HITS;
            }
        }
        return this.memory.needMason;
    }

    getEmergencySandbag(agent: MasonAgent): Structure {

        let emergencyThreshold = SANDBAG_THRESHOLD / 10;

        let nextConstruction: RoomPosition[] = [];
        for (let sandbag of this.sandbags) {
            let rampart = sandbag.lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < emergencyThreshold) {
                return rampart;
            }
            if (!rampart) {
                nextConstruction.push(sandbag);
            }
        }

        if (this.room.find(FIND_CONSTRUCTION_SITES).length > 0) { return; }

        let bestPosition = agent.pos.findClosestByRange(this.defenseGuru.hostiles).pos.findClosestByRange(nextConstruction);
        if (bestPosition) {
            bestPosition.createConstructionSite(STRUCTURE_RAMPART);
        }
    }

    recheckMasonNeed() {
        this.memory.needMason = undefined;
    }

    private findSandbags(): RoomPosition[] {

        let leftBound = 50;
        let rightBound = 0;
        let topBound = 50;
        let bottomBound = 0;
        let wallRamparts = [];
        for (let rampart of this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)) {
            if (rampart.pos.lookForStructure(STRUCTURE_ROAD)) continue;
            if (rampart.pos.lookForStructure(STRUCTURE_EXTENSION)) continue;
            wallRamparts.push(rampart);
            if (rampart.pos.x < leftBound) { leftBound = rampart.pos.x; }
            if (rampart.pos.x > rightBound) { rightBound = rampart.pos.x; }
            if (rampart.pos.y < topBound) { topBound = rampart.pos.y; }
            if (rampart.pos.y > bottomBound) { bottomBound = rampart.pos.y; }
        }

        console.log(leftBound, rightBound, topBound, bottomBound);

        let sandbags = [];
        for (let structure of this.room.find<Structure>(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_RAMPART) continue;
            if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) continue;
            let nearbyRampart = structure.pos.findInRange(wallRamparts, 2)[0];
            if (!nearbyRampart) continue;
            if (structure.pos.x < leftBound || structure.pos.x > rightBound) continue;
            if (structure.pos.y < topBound || structure.pos.y > bottomBound) continue;
            sandbags.push(structure.pos);
        }

        return sandbags;
    }
}