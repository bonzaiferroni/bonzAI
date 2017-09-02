import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {PosHelper} from "../../helpers/PosHelper";

interface ClaimerMemory extends MissionMemory {
    swamp: boolean;
}
interface ClaimerState extends MissionState {
    controller: StructureController;
}

export class ClaimMission extends Mission {

    private claimers: Agent[];

    public memory: ClaimerMemory;
    public state: ClaimerState;
    private claimRoomName: string;

    constructor(operation: Operation, roomName?: string) {
        super(operation, "claimer");
        this.claimRoomName = roomName;
    }

    public init() {
    }

    public update() {
        let room = this.room;
        if (this.claimRoomName) {
            room = Game.rooms[this.claimRoomName];
        }
        if (room) {
            this.state.controller = room.controller;
        }

        if (this.state.controller && this.state.controller.my) {
            this.operation.removeMission(this);
        }
    }

    private getMax = () => !this.state.controller || !this.state.controller.my ? 1 : 0;
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

        let destination: {pos: RoomPosition } = this.flag;
        if (this.claimRoomName) {
            destination = {pos: PosHelper.pathablePosition(this.claimRoomName)};
        }

        if (!this.state.controller) {
            claimer.travelTo(destination);
            return; // early
        }

        if (claimer.pos.isNearTo(this.state.controller)) {
            claimer.claimController(this.state.controller);
        } else {
            claimer.travelTo(this.state.controller);
        }
    }
}
