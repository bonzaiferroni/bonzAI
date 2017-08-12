import {Mission} from "./Mission";
import {Agent} from "../agents/Agent";
import {helper} from "../../helpers/helper";
import {PosHelper} from "../../helpers/PosHelper";
export class ScoutMission extends Mission {

    private scouts: Agent[];
    private scoutRoomName: string;

    constructor(operation, roomName?: string) {
        super(operation, "scout");
        this.scoutRoomName = roomName;
    }

    public init() { }

    public update() {
    }

    public roleCall() {
        let maxScouts = () => this.state.hasVision || this.scoutRoomName ? 0 : 1;
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    public actions() {
        for (let scout of this.scouts) {
            let destination: {pos: RoomPosition} = this.flag;
            if (this.scoutRoomName) {
                destination = {pos: PosHelper.pathablePosition(this.scoutRoomName) };
            }

            if (!scout.pos.isNearTo(destination)) {
                scout.avoidSK(destination);
            }
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }
}
