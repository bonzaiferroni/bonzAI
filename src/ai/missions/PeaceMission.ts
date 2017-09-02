import {Operation} from "../operations/Operation";
import {PeaceAgent} from "../agents/PeaceAgent";
import {PosHelper} from "../../helpers/PosHelper";
import {HostileAgent} from "../agents/HostileAgent";
import {HeadCountOptions} from "../../interfaces";
import {AgentManifest, AgentManifestItem, EasyMission} from "./EasyMission";
import {Profiler} from "../../Profiler";
import {MissionMemory} from "./Mission";
import {Notifier} from "../../notifier";

export interface PeaceMissionMemory extends MissionMemory {
    potency: number;
}

export abstract class PeaceMission extends EasyMission {

    protected targetName: string;
    public memory: PeaceMissionMemory;
    protected attackStructures = false;

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

    public adjustPotencyCallback = (roleName: string, earlyDeath: boolean) => {
        if (earlyDeath) {
            this.adjustPotency(1);
            Notifier.log(`${roleName} died in his prime in ${this.targetName}, increasing potency`, 4);
        } else {
            this.adjustPotency(-1);
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
    public peaceActions = (agent: PeaceAgent) => {
        let busy = agent.standardAttackActions(this.targetName, this.attackStructures);
        if (busy) { return; }

        this.idleActions(agent);
    };

    protected idleActions(agent: PeaceAgent) {
        agent.idleOffRoad();
    }
}
