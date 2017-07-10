import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";

interface ClaimerMemory extends MissionMemory {
    swamp: boolean;
}

export class ClaimMission extends Mission {

    private claimers: Agent[];
    private controller: StructureController;

    protected memory: ClaimerMemory;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public init() {
        if (this.state.hasVision && this.room.controller.my) {
            this.operation.removeMission(this);
        }
    }

    public update() {
        if (this.room) {
            this.controller = this.room.controller;
        }
    }

    private getMax = () => !this.state.hasVision || (this.controller && !this.controller.my) ? 1 : 0;
    private claimerBody = () => {
        if (this.memory.swamp) {
            return this.configBody({claim: 1, move: 5});
        } else {
            return [CLAIM, MOVE];
        }
    };

    public roleCall() {
        this.claimers = this.headCount("claimer", this.claimerBody, this.getMax, {
            blindSpawn: true,
        });
    }

    public actions() {

        for (let claimer of this.claimers) {
            this.claimerActions(claimer);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private claimerActions(claimer: Agent) {

        if (!this.controller) {
            claimer.travelTo(this.flag);
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        } else {
            claimer.travelTo(this.controller);
        }
    }
}
