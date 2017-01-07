import {Guru} from "./Guru";
import {MasonMission} from "./MasonMission";
import {MasonAgent} from "./MasonAgent";

export class MasonGuru extends Guru {

    hostiles: Creep[];

    memory: {
        needMason: boolean;
        sandbags: RoomPosition;
    };

    constructor(mission: MasonMission) {
        super(mission);
    }

    getHostiles(): Creep[] {
        return _.filter(this.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Invader" && c.body.length >= 40 && _.filter(c.body, part => part.boost).length > 0;
        });
    }

    needMason() {
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

    getSandbags(): RoomPosition[] {
        return null;

    }

    getBestSandbag(agent: MasonAgent): StructureRampart {
        if (!this.memory.sandbags) {

        }
        return null;
    }

    recheckMasonNeed() {
        this.memory.needMason = undefined;
    }
}