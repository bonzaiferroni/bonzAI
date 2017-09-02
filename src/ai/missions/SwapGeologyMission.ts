import {GeologyMission} from "./GeologyMission";

export class SwapGeologyMission extends GeologyMission {

    protected findStore() {
        return this.room.terminal;
    }
}