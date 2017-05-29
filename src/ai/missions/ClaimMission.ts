import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
export class ClaimMission extends Mission {

    private claimers: Agent[];
    private controller: StructureController;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public init() {
    }

    public refresh() {
        if (this.room) {
            this.controller = this.room.controller;
        }
    }

    private getMax = () => (this.controller && !this.controller.my) || !this.state.hasVision ? 1 : 0;

    public roleCall() {
        this.claimers = this.headCount("claimer", () => [CLAIM, MOVE], this.getMax, {
            blindSpawn: true,
            skipMoveToRoom: true,
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

        let waypoints = this.operation.findOperationWaypoints();
        let waypointsCovered = claimer.travelWaypoints(waypoints);
        if (!waypointsCovered) { return; }

        if (!this.controller) {
            claimer.idleOffRoad();
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        } else {
            claimer.travelTo(this.controller);
        }
    }
}
