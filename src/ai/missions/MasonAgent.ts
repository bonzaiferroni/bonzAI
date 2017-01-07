import {Agent} from "./Agent";

export class MasonAgent extends Agent {

    getRampart(): StructureRampart {
        let findRampart = () => {
            let lowestHits = 100000;
            let lowestRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)).sortBy("hits").head();
            if (lowestRampart) {
                lowestHits = lowestRampart.hits;
            }
            let myRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART))
                .filter((s: StructureRampart) => s.hits < lowestHits + 100000)
                .sortBy((s: StructureRampart) => this.creep.pos.getRangeTo(s))
                .head();
            if (myRampart) return myRampart;
        };
        let forgetRampart = (s: Structure) => this.creep.ticksToLive % 500 === 0;
        return this.creep.rememberStructure<StructureRampart>(findRampart, forgetRampart, "rampartId");
    }

    getExtension(rampart: StructureRampart): StructureExtension | StructureStorage {
        let fullExtensions = _.filter(this.room.findStructures<StructureExtension>(STRUCTURE_EXTENSION),
            (e: StructureExtension) => e.energy > 0);
        let extension = rampart.pos.findClosestByRange<StructureExtension>(fullExtensions);
        return this.creep.pos.findClosestByRange([this.room.storage, extension])
    }

    repairRampart(rampart: StructureRampart) {
        this.creep.repair(rampart);
    }

    findConstruction(): ConstructionSite {
        return this.creep.pos.findClosestByRange<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }
}