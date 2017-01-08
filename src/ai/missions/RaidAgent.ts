import {Agent} from "./Agent";
import {Mission} from "./Mission";
import {RaidGuru} from "./RaidGuru";
export class RaidAgent extends Agent {

    guru: RaidGuru;

    constructor(creep: Creep, mission: Mission, guru: RaidGuru) {
        super(creep, mission);
        this.guru = guru;
    }

    massRangedAttackInRoom() {
        if (this.creep.room.name === this.guru.raidRoomName) {
            return this.creep.rangedMassAttack();
        }
    }

    isFullHealth(margin = 0) {
        return this.creep.hits >= this.creep.hitsMax - margin;
    }

    healWhenHurt(agent: Agent, margin = 0) {
        if (agent.creep.hits < agent.creep.hitsMax - margin) {
            return this.creep.heal(agent.creep);
        }
    }

    attack(target: Structure | Creep): number {
        if (target instanceof Structure && this.creep.partCount(WORK) > 0) {
            return this.creep.dismantle(target);
        }
        else {
            return this.creep.attack(target);
        }
    }
}