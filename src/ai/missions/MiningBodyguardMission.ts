import {BodyguardMission, BodyguardMissionMemory} from "./BodyguardMission";
import {InvaderGuru} from "./InvaderGuru";
import {Operation} from "../operations/Operation";
import {PeaceAgent} from "../agents/PeaceAgent";
import {CreepHelper} from "../../helpers/CreepHelper";
import {MissionMemory} from "./Mission";

interface MiningBodyguardMemory extends BodyguardMissionMemory {
    invasionStart: number;
}

export class MiningBodyguardMission extends BodyguardMission {
    private invaderGuru: InvaderGuru;

    public memory: MiningBodyguardMemory;

    constructor(operation: Operation, invaderGuru: InvaderGuru) {
        super(operation, operation.roomName);
        this.invaderGuru = invaderGuru;
    }

    protected maxBodyguards = () => {
        if (!this.state.hasVision) { return 1; }

        if (this.room.hostiles.length > 0) {
            return 1 + this.findAdditional();
        }

        if (this.invaderGuru && this.invaderGuru.invaderProbable) {
            return 1;
        } else {
            return 0;
        }
    };

    private findMaxFromHostiles(hostiles: Creep[]): number {
        let boostedRange = false;
        for (let hostile of hostiles) {
            let profile = CreepHelper.getProfile(hostile);
            let formidable = profile[RANGED_ATTACK].potential + profile[HEAL].potential > 100;
            if (formidable) { return 3; }
            if (profile[HEAL].isBoosted) {
                return 3;
            }
            if (profile[RANGED_ATTACK].isBoosted) {
                if (boostedRange) {
                    return 3;
                }
                boostedRange = true;
            }
        }

        if (boostedRange) {
            return 2;
        } else {
            return 1;
        }
    }

    private findAdditional() {
        let additional = 0;
        if (this.room.hostiles.length > 0) {
            if (this.memory.invasionStart) {
                let ticksSince = Game.time - this.memory.invasionStart;
                additional = Math.floor(ticksSince / 200);
            } else {
                this.memory.invasionStart = Game.time;
            }
        } else if (this.memory.invasionStart) {
            this.memory.invasionStart = undefined;
        }
        return additional;
    }

    protected idleActions(bodyguard: PeaceAgent) {
        let healing = this.medicActions(bodyguard);
        if (!healing && !this.invaderGuru.invaderProbable) {
            this.adjustPotency(-1);
            this.goFreelance(bodyguard, "ranger");
        }
    }
}
