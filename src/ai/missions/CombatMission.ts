import {Operation} from "../operations/Operation";
import {CombatAgent} from "../agents/CombatAgent";
import {PosHelper} from "../../helpers/PosHelper";
import {HostileAgent} from "../agents/HostileAgent";
import {HeadCountOptions} from "../../interfaces";
import {AgentManifest, AgentManifestItem, EasyMission} from "./EasyMission";
import {Profiler} from "../../Profiler";
import {MissionMemory} from "./Mission";
import {Notifier} from "../../notifier";

export interface CombatMissionMemory extends MissionMemory {
    potency: number;
    nextSpawn: number;
}

export abstract class CombatMission extends EasyMission {

    protected targetName: string;
    public memory: CombatMissionMemory;
    protected attackStructures = false;
    protected deathDelay = 5000;
    protected boost = false;

    constructor(operation: Operation, name: string, targetName: string) {
        super(operation, name);
        this.targetName = targetName;
    }

    public updateTargetRoom(roomName: string) {
        this.targetName = roomName;
    }

    protected rangerBody(potency?: number) {
        let body = this.segmentBody([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, RANGED_ATTACK,
            RANGED_ATTACK, HEAL], potency);
        if (!body) {
            body = this.unitBody({[RANGED_ATTACK]: 3, [MOVE]: 4, [HEAL]: 1}, { limit: potency });
            if (!body) {
                body = this.unitBody({[RANGED_ATTACK]: 1, [MOVE]: 2, [HEAL]: 1});
                if (!body) {
                    body = [RANGED_ATTACK, MOVE];
                }
            }
        }
        return body;
    }

    protected demolisherBody(potency?: number) {
        let body;
        if (this.boost) {
            body = this.unitBody({[TOUGH]: 1, [WORK]: 3, [MOVE]: 1}, { limit: potency });
        } else {
            body = this.unitBody({[MOVE]: 1, [WORK]: 1}, { limit: potency });
        }
        return body;
    }

    protected healerBody(potency?: number) {
        let body;
        if (this.boost) {
            body = this.unitBody({[TOUGH]: 1, [HEAL]: 3, [MOVE]: 1}, { limit: potency });
        } else {
            body = this.unitBody({[MOVE]: 1, [WORK]: 1}, { limit: potency });
        }
        return body;
    }

    // DATA

    protected findDummies(colorId: number): Flag[] {
        let dummyCreeps: Flag[] = [];
        for (let i = 1; i < 100; i++) {
            let flagName = `Flag${i}`;
            let flag = Game.flags[flagName];
            if (flag && flag.color === colorId) {
                dummyCreeps.push(flag);
            }
        }
        return dummyCreeps;
    }

    protected adjustPotencyCallback = (roleName: string, earlyDeath: boolean) => {
        if (earlyDeath) {
            this.adjustPotency(1);
            Notifier.log(`${roleName} died in his prime in ${this.targetName}, increasing potency`, 4);
        } else {
            this.adjustPotency(-1);
        }
    };

    protected deathDelayCallback = (roleName: string, earlyDeath: boolean) => {
        if (earlyDeath) {
            this.memory.nextSpawn = Game.time + this.deathDelay;
            Notifier.log(`${roleName} died in his prime in ${this.targetName}, delaying next spawn`, 4);
        }
    };

    protected getPotency(min = 1): number {
        if (this.memory.potency === undefined) {
            this.memory.potency = min;
        }
        return Math.max(this.memory.potency, min);
    }

    protected adjustPotency(delta: number) {
        if (this.memory.potency === undefined) {
            this.memory.potency = 1;
        }

        this.memory.potency += delta;
        if (this.memory.potency < 1) {
            this.memory.potency = 1;
        }
    }

    // CREEP BEHAVIOR
    public combatActions = (agent: CombatAgent) => {
        let busy = agent.standardAttackActions(this.targetName, this.attackStructures);
        if (busy) { return; }

        this.idleActions(agent);
    };

    protected idleActions(agent: CombatAgent) {
        agent.idleOffRoad();
    }
}
