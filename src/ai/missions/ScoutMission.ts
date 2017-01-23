import {Mission} from "./Mission";
import {Agent} from "./Agent";
export class ScoutMission extends Mission {

    scouts: Agent[];

    constructor(operation) {
        super(operation, "scout");
    }

    initMission() {
    }

    roleCall() {
        let maxScouts = () => this.hasVision ? 0 : 1;
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    missionActions() {
        for (let scout of this.scouts) {

            if (!scout.pos.isNearTo(this.flag)) {
                scout.avoidSK(this.flag);
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}