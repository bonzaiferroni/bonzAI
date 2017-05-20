import {Mission} from "./Mission";
import {Agent} from "../agents/Agent";
export class ScoutMission extends Mission {

    private scouts: Agent[];

    constructor(operation) {
        super(operation, "scout");
    }

    public initMission() {
    }

    public roleCall() {
        let maxScouts = () => this.hasVision ? 0 : 1;
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    public missionActions() {
        for (let scout of this.scouts) {

            if (!scout.pos.isNearTo(this.flag)) {
                scout.avoidSK(this.flag);
            }
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }
}
